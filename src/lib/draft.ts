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
  Routine,
  SetHistory,
  UnitSystem,
} from '../types/models';
import { countUnitLabel, effectiveLoadKg, formatDuration } from './units';
import { resolveItemRest } from './routinePlan';
import { summarizeSessionSets } from './history';
import { evaluateOverload, type OverloadVerdict } from './progressiveOverload';

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

/** Working sets of the most recent session for an exercise, in set order. */
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
 * "4 × 4–6 reps" / "12 × 3 min" — the target line under an exercise name.
 *
 * Time-based work states the per-set duration rather than a rep range, because
 * "12 × 180 reps" is not a thing anyone has ever said about a boxing round.
 */
export function formatTarget(entry: {
  targetSets: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  exercise: Exercise;
}): string {
  const { targetSets, targetRepsMin, targetRepsMax, exercise } = entry;
  const unit = exercise.countUnit;

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
 */
export function defaultTargetSets(exercise: Pick<Exercise, 'countUnit'>): number {
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
  const plannedSets = Math.max(1, params.plannedSetCount ?? Math.max(targetSets, previous.length));
  const sets: DraftSet[] = Array.from({ length: plannedSets }, (_, i) => {
    const reference = previous[i] ?? previous[previous.length - 1];
    return {
      localId: uid('set'),
      weightKg: exercise.requiresWeight ? (reference?.weightKg ?? startingWeightKg) : null,
      count: reference?.count ?? targetRepsMax ?? targetRepsMin ?? startingCount ?? 10,
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
    restSeconds,
    transitionRestSeconds,
    ...(params.restSecondsOverride != null
      ? { restSecondsOverride: params.restSecondsOverride }
      : {}),
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
