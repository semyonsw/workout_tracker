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
import { countUnitLabel, estimate1RM, formatDuration } from './units';
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
  partials?: number;
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
   * Recorded, not obeyed: rest is started by `completeSet`, which reads the live
   * Settings values at the moment it starts one, so changing a rest length
   * mid-workout takes effect on the next set instead of the next session. These
   * fields are what the session began with — useful in a log or a test, and the
   * shape older persisted sessions already have.
   */
  restSeconds: number;
  transitionRestSeconds: number;
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

  return relevant
    .filter((s) => s.performedAt === latestAt)
    .sort((a, b) => a.setIndex - b.setIndex);
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

      return buildDraftEntry({
        exercise,
        history: historyByExerciseId[exercise.id] ?? [],
        policy,
        unitSystem,
        /*
         * REST COMES FROM SETTINGS, NOT FROM THE ROUTINE.
         *
         * This used to read `item.restSeconds ?? exercise.defaultRestSeconds ??
         * defaultRestSeconds`, which sounds like a sensible cascade and is, in
         * practice, a bug: nearly every shipped routine item and exercise carries
         * its own rest, so the two numbers in Settings — the only rest controls
         * anywhere in the app the user can actually reach — were shadowed on
         * almost every exercise. Setting "Between sets" to 1:30 and then watching
         * a 3:00 countdown is indistinguishable from a broken setting.
         *
         * Per-exercise rest can come back the day the routine editor lets someone
         * SET it, at which point an override is a choice the user made and can
         * see. Until then the honest rule is that the setting wins. It is also
         * live: `completeSet` re-reads it each time rest starts.
         */
        restSeconds: defaultRestSeconds,
        transitionRestSeconds: defaultTransitionRestSeconds,
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
        partials: set.partials,
        isWarmup: set.isWarmup,
        isCompleted: true,
        estimated1RM:
          entry.exercise.countUnit === 'reps' ? estimate1RM(set.weightKg, set.count) : null,
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

/** Session volume in kg — only meaningful for rep-based, weighted work. */
export function totalVolumeKg(session: DraftSession): number {
  let total = 0;
  for (const entry of session.entries) {
    if (!entry.exercise.requiresWeight || entry.exercise.countUnit !== 'reps') continue;
    for (const set of entry.sets) {
      if (set.isCompleted && set.weightKg != null) total += set.weightKg * set.count;
    }
  }
  return Math.round(total);
}
