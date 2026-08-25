/**
 * Draft session builders — pure functions that turn a Routine + history into
 * the in-memory shape the Active Workout screen edits, and back into
 * `SetHistory` rows for persistence.
 *
 * This is where "zero friction" is actually implemented: every set row is
 * PRE-FILLED from the last time this exercise was performed, so the common case
 * — repeating last session — costs exactly one tap per set. The user types a
 * number only when reality differs from last time.
 */

import type {
  Exercise,
  ID,
  OverloadPolicy,
  RepLadder,
  Routine,
  SetHistory,
  UnitSystem,
} from '../types/models';
import { countUnitLabel, effectiveLoadKg, formatDuration } from './units';
import { resolveItemRest } from './routinePlan';
import { summarizeSessionSets } from './history';
import { evaluateOverload, type OverloadVerdict } from './progressiveOverload';
import { LADDER_SETS, describeLadder, ladderOf, ladderTargets } from './repLadder';

/* ------------------------------------------------------------------ */
/* Draft shapes (in-memory, screen-local)                              */
/* ------------------------------------------------------------------ */

export interface DraftSet {
  localId: ID;
  weightKg: number | null;
  count: number;
  isWarmup: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  /** True until the user edits it — drives the faint "ghost" styling. */
  isPrefilled: boolean;
  /**
   * Seconds of rest actually taken BEFORE this set, measured by `completeSet`.
   *
   * Absent, not zero, when no rest was running: "I did not use the timer" and "I
   * rested zero seconds" are different facts, and the median in
   * `lib/restHistory.ts` would be dragged to nothing by a log full of the second
   * one standing in for the first.
   */
  restTakenSeconds?: number;
}

export interface DraftEntry {
  localId: ID;
  exercise: Exercise;
  targetSets: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  /**
   * The two rest lengths this session was BUILT with, in seconds.
   *
   * Recorded, not obeyed. Rest is started by `completeSet`, and what it runs is
   * `restSecondsOverride ?? the live Settings value` — so changing a setting
   * mid-workout takes effect on the very next set rather than on the next session.
   * These two are what the session began with: useful in a log or a test, and the
   * shape older persisted sessions already have.
   */
  restSeconds: number;
  transitionRestSeconds: number;
  /**
   * The superset this exercise belongs to, carried straight off the routine item.
   *
   * Same string = same superset, and the behaviour is `completeSet`'s: no rest
   * between members, one rest after the last member of a round. `lib/superset.ts`
   * owns the "whose turn is it" decision.
   *
   * Absent on an exercise added mid-session, for the same reason
   * `restSecondsOverride` is: there is no routine item behind it. Joining a
   * superset mid-workout is a plan change, and the place to make one is the
   * routine editor.
   */
  supersetGroup?: string;
  /**
   * THIS EXERCISE'S OWN between-sets rest, if the routine item set one.
   *
   * The difference between "an override of 2:00" and "following Settings, which
   * currently says 2:00" is not visible in a number, and it is the whole
   * distinction the routine editor now exposes: an item with no override tracks
   * the setting as it changes, an item with one does not. `completeSet` needs to
   * know which, so it is carried separately rather than folded into
   * `restSeconds` — a single field could not tell the two apart.
   *
   * Absent on an exercise added mid-session: there is no routine item behind it,
   * so there is nothing it could be overriding.
   */
  restSecondsOverride?: number;
  /**
   * The rep ladder this exercise is running, copied off the library row at build
   * time. Absent = it isn't running one, which is every exercise until somebody
   * switches it on.
   *
   * A COPY, deliberately, and the same decision `supersetGroup` above is: the live
   * session is what the cards and `completeSet` read, and a store action reaching
   * back into the library to ask what the max is would tie today's plan to a row
   * the user may have edited since — including the row this very session is about
   * to advance on `Finish`.
   *
   * The per-set targets are NOT stored beside it. They are `ladderTargets(ladder,
   * working set count)`, derived wherever they are needed, because a stored copy is
   * a second answer that goes stale the moment a set is added or removed.
   */
  ladder?: RepLadder;
  sets: DraftSet[];
  /** Computed once at session start — history doesn't change mid-workout. */
  overload: OverloadVerdict;
  /** Set when the user accepts the nudge, so we don't nag twice. */
  overloadAccepted: boolean;
  /** Human summary of last session for the collapsed card: "+25 kg · 12 12 12". */
  lastSessionSummary: string | null;
  /** Terser variant for the expanded header, which already states the target. */
  lastSessionShort: string | null;
}

export interface DraftSession {
  localId: ID;
  routineId?: ID;
  title: string;
  /**
   * When the workout actually STARTED, or null while it hasn't.
   *
   * Opening a routine is not training: the session is built so the exercises can
   * be read, and nothing is timed or dated until `Start` is pressed (or the first
   * set is logged, which says the same thing with a thumb). Everything downstream
   * reads this one instant — the header's minutes, every set's `performedAt`, the
   * date the workout lands under in history — so leaving it null is what makes
   * "get in, look, get out" leave no trace.
   */
  startedAt: string | null;
  entries: DraftEntry[];
}

let counter = 0;
/** Local-only id. Real ids are assigned by the DB on persist. */
export function uid(prefix = 'd'): ID {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * A usable positive number, or null.
 *
 * Used on the exercise's optional starting numbers, which come from a persisted
 * library row: `undefined`, `null` and a `NaN` that survived a JSON round-trip must
 * all read as "not set" rather than reaching a set row as a weight.
 */
function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/* ------------------------------------------------------------------ */
/* History lookup                                                      */
/* ------------------------------------------------------------------ */

/**
 * WORKING sets of the most recent session for an exercise, in set order.
 *
 * `!s.isWarmup` in the filter is what makes prefills correct now that warm-ups
 * are reachable: without it, a light warm-up single would be copied into the
 * first row of the next session as though it were the working weight, and the
 * one-tap promise would hand the user a set they never meant to do. It was
 * already there — this note is here so a future edit knows it is load-bearing
 * rather than defensive.
 */
export function lastSessionSets(history: SetHistory[], exerciseId: ID): SetHistory[] {
  const relevant = history.filter(
    (s) => s.exerciseId === exerciseId && s.isCompleted && !s.isWarmup,
  );
  if (relevant.length === 0) return [];

  const latestAt = relevant.reduce(
    (max, s) => (new Date(s.performedAt) > new Date(max) ? s.performedAt : max),
    relevant[0].performedAt,
  );

  return relevant.filter((s) => s.performedAt === latestAt).sort((a, b) => a.setIndex - b.setIndex);
}

/**
 * The one line of history worth showing mid-workout.
 *
 *   reps    "+25 kg · 12 12 12"              · every set's reps, they all fit
 *   drops   "+40 kg · 4 4 · +30 kg · 6 6"    · the top weight leads
 *   rounds  "12 rounds · 3 min"              · twelve identical rows is noise
 *   time    "50 min"                         · one set, one duration
 *   metres  "1500 m"                         · the total is the achievement
 *
 * `variant: 'short'` keeps only the TOP WORKING WEIGHT and its reps, for the
 * expanded header — "4 × 4–6 reps · last: +40 kg · 4 4". That is the same rule
 * the chart and the overload engine use: the drop sets happened, but the number
 * you are deciding against is what you worked at, not what you finished on.
 */
export function summarizeLastSession(
  sets: SetHistory[],
  exercise: Exercise,
  variant: 'full' | 'short' = 'full',
): string | null {
  if (sets.length === 0) return null;
  const { lead, drops } = summarizeSessionSets(sets, exercise);
  return variant === 'short' || !drops ? lead : `${lead}${drops}`;
}

/**
 * "4 × 4–6 reps" / "12 × 3 min" / "16 + 10 + 8 + 8 + 6" — the target line under
 * an exercise name.
 *
 * Time-based work states the per-set duration rather than a rep range, because
 * "12 × 180 reps" is not a thing anyone has ever said about a boxing round.
 *
 * A LADDER STATES EVERY SET, because that is what a ladder is: five different
 * numbers, and "5 × 16 reps" would be a lie about four of them. It is also exactly
 * how the user writes the session down themselves, which is the strongest argument
 * a format ever gets. The count comes from the rows the session actually has, so
 * adding or removing a set reshapes the line under the thumb that did it.
 */
export function formatTarget(entry: {
  targetSets: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  exercise: Exercise;
  ladder?: RepLadder;
  /** The session's own rows, when there are any — see the ladder note above. */
  sets?: readonly Pick<DraftSet, 'isWarmup'>[];
}): string {
  const { targetSets, targetRepsMin, targetRepsMax, exercise } = entry;
  const unit = exercise.countUnit;

  const ladder = entry.ladder ? ladderOf({ ...exercise, ladder: entry.ladder }) : null;
  if (ladder) {
    const working = entry.sets?.filter((s) => !s.isWarmup).length;
    return describeLadder(ladderTargets(ladder, working && working > 0 ? working : targetSets));
  }

  if (unit === 'seconds' || unit === 'rounds') {
    const perSet = targetRepsMax ?? targetRepsMin ?? 0;
    return `${targetSets} × ${formatDuration(perSet)}`;
  }

  const range =
    targetRepsMin && targetRepsMax && targetRepsMin !== targetRepsMax
      ? `${targetRepsMin}–${targetRepsMax}`
      : String(targetRepsMax ?? targetRepsMin ?? '');
  return `${targetSets} × ${range} ${countUnitLabel(unit)}`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * The per-set target a brand-new entry starts at, in the exercise's OWN count unit.
 *
 * The exercise's own number wins where it has one — that is what the create screen
 * was told this movement is ("target reps 12", "2:00 plank"), and inventing a
 * different one is the create screen quietly not meaning it. The fallbacks are per
 * unit rather than a shared 10, because `targetRepsMax` holds SECONDS for
 * time-counted work: one constant would plan a ten-second plank and a ten-second
 * boxing round, and on a timed exercise that number is what the clock counts down.
 */
export function defaultTargetCount(exercise: Pick<Exercise, 'countUnit' | 'defaultCount'>): number {
  const own = finiteOrNull(exercise.defaultCount);
  if (own != null) return Math.round(own);
  if (exercise.countUnit === 'rounds') return 180;
  if (exercise.countUnit === 'seconds') return 60;
  if (exercise.countUnit === 'meters') return 500;
  return 10;
}

/**
 * How many sets a brand-new routine item plans, by count unit.
 *
 * `appendToRoutine` used to write a bare `4` here (12 for rounds), and because
 * nothing else in the app could write `targetSets`, that 4 was not a starting
 * point — it was the answer, on every routine, forever. The editor can change it
 * now, so this is a starting point again, and it lives here beside
 * `defaultTargetCount` as a per-unit decision rather than a literal inside a store
 * action.
 *
 * Deliberately NOT read from a new `Exercise.defaultSets` field: nothing would
 * write one. The create screen asks for a starting weight and a target count, not
 * a set count, and a model field with no writer is the thing Phase 1 spent a
 * commit deleting five of.
 *
 * Per unit, because "four" means different things: four sets of reps, twelve
 * rounds on a bag, three holds of a plank (nobody plans four two-minute planks),
 * and one swim — a distance is done once.
 *
 * A LADDER ASKS FOR FIVE, because five is the scheme: it is what every published
 * version of that table is written for, and it is what makes the session total
 * come out at three times the max. The routine can still plan four or six and the
 * ladder will shape them (`ladderForMax` generalises), but a ladder that starts
 * life at four sets starts life as a different program.
 */
export function defaultTargetSets(
  exercise: Pick<Exercise, 'countUnit'> & { ladder?: RepLadder },
): number {
  if (ladderOf(exercise)) return LADDER_SETS;
  if (exercise.countUnit === 'rounds') return 12;
  if (exercise.countUnit === 'seconds') return 3;
  if (exercise.countUnit === 'meters') return 1;
  return 4;
}

export interface BuildDraftParams {
  routine: Routine;
  /** Exercise library rows keyed by id, for the routine's items. */
  exercisesById: Record<ID, Exercise>;
  /** Completed history for every exercise in the routine. */
  historyByExerciseId: Record<ID, SetHistory[]>;
  policy: OverloadPolicy;
  unitSystem: UnitSystem;
  /**
   * Rest between sets, from Settings. THE value, not a fallback — see the note on
   * rest in `buildDraftSession`.
   */
  defaultRestSeconds: number;
  /**
   * Rest after the last set of an exercise. A separate setting rather than
   * `defaultRestSeconds + 30`: the walk to the next machine is its own length,
   * and the user owns both numbers.
   */
  defaultTransitionRestSeconds?: number;
  /**
   * When the workout began. Null — the default — is a session that is only being
   * looked at; see `DraftSession.startedAt`.
   */
  startedAt?: string | null;
  now?: Date;
}

/**
 * One exercise's worth of a draft session: the prefilled rows, the overload
 * verdict, and the two lines of last-session context.
 *
 * Extracted from `buildDraftSession` when exercises became addable MID-WORKOUT
 * ("start pull day, then decide to do neck"). An entry appended to a running
 * session has to be built exactly like one the routine planned — same prefill
 * rules, same verdict, same summaries — and the only honest way to guarantee that
 * is for both paths to call the same function. The one difference is
 * `plannedSetCount`: a routine plans its target, an exercise added mid-workout
 * starts at one row and grows with `Add set`.
 */
export interface BuildEntryParams {
  exercise: Exercise;
  /** Completed history for THIS exercise. */
  history: SetHistory[];
  policy: OverloadPolicy;
  unitSystem: UnitSystem;
  restSeconds: number;
  transitionRestSeconds: number;
  /** The routine item's own rest, if it has one. See `DraftEntry`. */
  restSecondsOverride?: number;
  /** The routine item's superset group, if it is in one. See `DraftEntry`. */
  supersetGroup?: string;
  /** What the header states — "4 × 8–10". */
  targetSets: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  /**
   * How many rows to actually build. Defaults to the target, widened to whatever
   * last session did — five sets last time means five prefilled rows this time.
   */
  plannedSetCount?: number;
  now?: Date;
}

export function buildDraftEntry(params: BuildEntryParams): DraftEntry {
  const {
    exercise,
    history,
    policy,
    unitSystem,
    restSeconds,
    transitionRestSeconds,
    targetSets,
    targetRepsMin,
    targetRepsMax,
    now = new Date(),
  } = params;

  const previous = lastSessionSets(history, exercise.id);
  const overload = evaluateOverload({ exercise, history, policy, unitSystem, now });

  /*
   * Prefill strategy, in priority order:
   *  1. the same set index from last session (most accurate),
   *  2. the last set that DID exist last session (for added sets),
   *  3. the EXERCISE's own starting numbers — what the create screen was told
   *     this movement starts at,
   *  4. the routine's target, and a bare 10 as the last resort.
   *
   * 3 is what makes "default kg 30" on the create screen mean something. Before
   * it, a movement with no history opened its first session with an empty weight
   * cell — so the first set of anything new was always typed from scratch, which
   * is the one case the one-tap promise cannot cover any other way.
   */
  const startingWeightKg = finiteOrNull(exercise.defaultWeightKg);
  const startingCount = finiteOrNull(exercise.defaultCount);

  /*
   * A LADDER OVERRIDES THE PREFILL, and it is the one thing that does.
   *
   * Every other row in this app is prefilled from last session, because repeating
   * last session is the common case and it costs one tap. A ladder is the opposite
   * claim: the whole point of switching one on is that the app will NOT hand you
   * last session back — it hands you last session plus one rep, on the set the
   * scheme says earns it. Copying history over that would quietly delete the
   * progression the user turned on.
   *
   * The set COUNT is the plan's too, not widened to whatever last session did. On
   * every other exercise that widening is a kindness (five sets last time means
   * five prefilled rows this time); here it would silently reshape the ladder,
   * because a five-set ladder and a six-set ladder are different numbers.
   *
   * WEIGHT still comes from history. The ladder owns reps and nothing else, so
   * weighted pull-ups keep the belt they were loaded with last time.
   */
  const ladder = ladderOf(exercise);
  const plannedSets = Math.max(
    1,
    params.plannedSetCount ?? (ladder ? targetSets : Math.max(targetSets, previous.length)),
  );
  const ladderPlan = ladder ? ladderTargets(ladder, plannedSets) : null;

  const sets: DraftSet[] = Array.from({ length: plannedSets }, (_, i) => {
    const reference = previous[i] ?? previous[previous.length - 1];
    return {
      localId: uid('set'),
      weightKg: exercise.requiresWeight ? (reference?.weightKg ?? startingWeightKg) : null,
      count:
        ladderPlan?.[i] ??
        reference?.count ??
        targetRepsMax ??
        targetRepsMin ??
        startingCount ??
        10,
      isWarmup: false,
      isCompleted: false,
      completedAt: null,
      isPrefilled: true,
    };
  });

  return {
    localId: uid('entry'),
    exercise,
    targetSets,
    targetRepsMin,
    targetRepsMax,
    ...(ladder ? { ladder } : {}),
    restSeconds,
    transitionRestSeconds,
    ...(params.restSecondsOverride != null
      ? { restSecondsOverride: params.restSecondsOverride }
      : {}),
    ...(params.supersetGroup ? { supersetGroup: params.supersetGroup } : {}),
    sets,
    overload,
    overloadAccepted: false,
    lastSessionSummary: summarizeLastSession(previous, exercise),
    lastSessionShort: summarizeLastSession(previous, exercise, 'short'),
  };
}

export function buildDraftSession(params: BuildDraftParams): DraftSession {
  const {
    routine,
    exercisesById,
    historyByExerciseId,
    policy,
    unitSystem,
    defaultRestSeconds,
    defaultTransitionRestSeconds = defaultRestSeconds + 30,
    startedAt = null,
    now = new Date(),
  } = params;

  const entries = [...routine.items]
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const exercise = exercisesById[item.exerciseId];
      if (!exercise) return null;

      const rest = resolveItemRest(item, defaultRestSeconds);

      return buildDraftEntry({
        exercise,
        history: historyByExerciseId[exercise.id] ?? [],
        policy,
        unitSystem,
        /*
         * REST: THE ITEM'S OVERRIDE IF IT HAS ONE, OTHERWISE SETTINGS.
         *
         * That day arrived. This used to be `defaultRestSeconds` and nothing else,
         * with a note saying per-exercise rest could come back once the routine
         * editor let someone SET it — because the cascade it replaced went through
         * `exercise.defaultRestSeconds`, which nearly every shipped exercise
         * carries and nobody could see or change. The two numbers in Settings were
         * the only rest controls in the app, and they were shadowed on almost
         * every exercise: setting "Between sets" to 1:30 and then watching a 3:00
         * countdown is indistinguishable from a broken setting.
         *
         * The editor sets `item.restSeconds` now, shows which of the two is in
         * force on the row, and can clear it back to "follow Settings". So an
         * override is a choice the user made and can see, which is the whole
         * condition that was missing. `resolveItemRest` is the one place the
         * cascade lives, and it is two levels — the exercise's own default is
         * still not in it, for exactly the reason above. It seeds an override in
         * `appendToRoutine`, where it becomes visible and clearable, and reaches a
         * session no other way.
         *
         * NO OVERRIDE STILL MEANS LIVE. `completeSet` re-reads Settings every time
         * it starts a rest, so an item that is following Settings tracks the
         * setting as it changes mid-workout. The value recorded here is what the
         * session was BUILT with — see the note on `DraftEntry.restSeconds`.
         *
         * `transitionRestSeconds` deliberately still comes from Settings alone.
         * `RoutineItem` declares one, and nothing sets it and no control edits it
         * — so honouring it would recreate the original bug for the
         * between-exercises setting, on a number nobody can reach.
         */
        restSeconds: rest.seconds,
        transitionRestSeconds: defaultTransitionRestSeconds,
        ...(rest.source === 'item' ? { restSecondsOverride: rest.seconds } : {}),
        /*
         * Carried onto the entry rather than looked up later. The session is what
         * `completeSet` and the cards read, and a store action reaching back into
         * the routine store to ask which group an exercise is in would tie the
         * live session to a template the user may have edited since.
         */
        ...(item.supersetGroup ? { supersetGroup: item.supersetGroup } : {}),
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
        now,
      });
    })
    .filter((e): e is DraftEntry => e !== null);

  return {
    localId: uid('session'),
    routineId: routine.id,
    title: routine.name,
    startedAt,
    entries,
  };
}

/**
 * What each row's index column reads: the WORKING-set number, or null for a
 * warm-up.
 *
 * A warm-up is a set that does not count — it is out of the volume, out of the
 * set count, out of the shorthand and out of every overload verdict — so
 * numbering it as one would make every number below it wrong. Three working sets
 * with a warm-up on top read W, 1, 2, 3, and "set 2 of 3" means what it says.
 *
 * Here rather than in the card because it is arithmetic over a list, which is
 * exactly the kind of thing a screen should not be doing: a component that
 * subtracts a running count from an index is a component with a state machine in
 * it.
 */
export function workingSetLabels(sets: readonly Pick<DraftSet, 'isWarmup'>[]): (number | null)[] {
  let working = 0;
  return sets.map((set) => {
    if (set.isWarmup) return null;
    working += 1;
    return working;
  });
}

/* ------------------------------------------------------------------ */
/* Persist                                                             */
/* ------------------------------------------------------------------ */

/**
 * Flatten a draft into `SetHistory` rows. Only COMPLETED sets are written —
 * an untouched planned row is an intention, not history, and letting it into
 * the table would poison every future overload verdict.
 */
export function draftToSetHistory(session: DraftSession): SetHistory[] {
  const rows: SetHistory[] = [];
  const performedAt = sessionPerformedAt(session);

  for (const entry of session.entries) {
    entry.sets.forEach((set, index) => {
      if (!set.isCompleted) return;
      rows.push({
        id: uid('sh'),
        sessionId: session.localId,
        exerciseId: entry.exercise.id,
        performedAt, // denormalized: enables the fast history scan
        setIndex: index,
        weightKg: entry.exercise.requiresWeight ? set.weightKg : null,
        count: set.count,
        countUnit: entry.exercise.countUnit,
        loadMode: entry.exercise.loadMode,
        isWarmup: set.isWarmup,
        isCompleted: true,
        // Absent rather than zero — see `DraftSet.restTakenSeconds`.
        ...(set.restTakenSeconds != null ? { restTakenSeconds: set.restTakenSeconds } : {}),
      });
    });
  }

  return rows;
}

/**
 * When the session happened, for the rows it writes.
 *
 * `startedAt` normally answers this, and does whenever a set was logged — the
 * first ✓ starts the clock if `Start` didn't. The fallbacks exist so a row can
 * never carry `null` as its date: the earliest set that was actually completed,
 * and failing that now.
 */
export function sessionPerformedAt(session: DraftSession): string {
  if (session.startedAt) return session.startedAt;

  let earliest: string | null = null;
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      if (!set.isCompleted || !set.completedAt) continue;
      if (earliest == null || set.completedAt < earliest) earliest = set.completedAt;
    }
  }
  return earliest ?? new Date().toISOString();
}

/**
 * Kilograms moved this session, and whether that figure is the whole story.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 *
 * This used to skip every exercise with `requiresWeight === false`, which is
 * most of the seed library: push-ups, planks, boxing and swimming all scored
 * zero, and a session of nothing but bodyweight work reported no volume at all.
 * For the two modes it did count it counted the wrong number — a +40 kg dip
 * scored 40 × reps rather than (bodyweight + 40) × reps, and an assisted pull-up
 * ADDED the assistance, so a −20 kg set scored +20 kg a rep and asking the
 * machine for more help made the number go up.
 *
 * `effectiveLoadKg` owns that arithmetic now, and it is the only place it lives.
 *
 * ── THE TWO RULES ──────────────────────────────────────────────────────────
 *
 *  1. REPS ONLY, whatever `requiresWeight` says. A rep-counted set has a load and
 *     a number of times it was moved, and that multiplies. Seconds, metres and
 *     rounds do not: kilograms × seconds is not a unit, and a 50-minute swim
 *     dressed up as a volume figure would swamp every real number in the log.
 *  2. A SET WHOSE LOAD WILL NOT RESOLVE IS LEFT OUT AND COUNTED AS LEFT OUT.
 *     Without a bodyweight in Settings, the three bodyweight-dependent modes
 *     return null — so `kg` is exactly what the old function would have produced
 *     (the honest fallback: external work only) and `unweighable` is how many sets
 *     the total is missing. Callers that print the figure use that to drop the
 *     clause rather than show a number that undercounts. Nothing is guessed and
 *     no bodyweight is invented.
 */
export interface SessionVolume {
  /** Kilograms of resolvable load × reps, rounded. */
  kg: number;
  /**
   * Completed rep-counted sets whose load could not be resolved — bodyweight or
   * assisted work with no bodyweight set. Non-zero means `kg` undercounts.
   */
  unweighable: number;
}

export function sessionVolume(session: DraftSession, bodyweightKg?: number | null): SessionVolume {
  let kg = 0;
  let unweighable = 0;

  for (const entry of session.entries) {
    if (entry.exercise.countUnit !== 'reps') continue;
    for (const set of entry.sets) {
      // Warm-ups are excluded here exactly as they are from the overload engine
      // and the shorthand: a warm-up is a set that does not count.
      if (!set.isCompleted || set.isWarmup) continue;
      const load = effectiveLoadKg(set.weightKg, entry.exercise.loadMode, bodyweightKg);
      if (load == null) {
        unweighable += 1;
        continue;
      }
      kg += load * set.count;
    }
  }

  return { kg: Math.round(kg), unweighable };
}

/** Just the kilograms — the shape `CompletedWorkout.totalVolumeKg` stores. */
export function totalVolumeKg(session: DraftSession, bodyweightKg?: number | null): number {
  return sessionVolume(session, bodyweightKg).kg;
}
