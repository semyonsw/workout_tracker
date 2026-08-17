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
  startedAt: string;
  entries: DraftEntry[];
}

let counter = 0;
/** Local-only id. Real ids are assigned by the DB on persist. */
export function uid(prefix = 'd'): ID {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
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

export interface BuildDraftParams {
  routine: Routine;
  /** Exercise library rows keyed by id, for the routine's items. */
  exercisesById: Record<ID, Exercise>;
  /** Completed history for every exercise in the routine. */
  historyByExerciseId: Record<ID, SetHistory[]>;
  policy: OverloadPolicy;
  unitSystem: UnitSystem;
  /** Rest between sets when neither the routine item nor the exercise says. */
  defaultRestSeconds: number;
  /**
   * Rest after the last set of an exercise when the routine item doesn't
   * override it. A separate setting rather than `defaultRestSeconds + 30`: the
   * walk to the next machine is its own length, and the user owns both numbers.
   */
  defaultTransitionRestSeconds?: number;
  now?: Date;
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
    now = new Date(),
  } = params;

  const entries = [...routine.items]
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const exercise = exercisesById[item.exerciseId];
      if (!exercise) return null;

      const history = historyByExerciseId[exercise.id] ?? [];
      const previous = lastSessionSets(history, exercise.id);
      const overload = evaluateOverload({ exercise, history, policy, unitSystem, now });

      /*
       * Prefill strategy, in priority order:
       *  1. the same set index from last session (most accurate),
       *  2. the last set that DID exist last session (for added sets),
       *  3. the routine's target reps at no weight (first ever performance).
       */
      const plannedSets = Math.max(item.targetSets, previous.length);
      const sets: DraftSet[] = Array.from({ length: plannedSets }, (_, i) => {
        const reference = previous[i] ?? previous[previous.length - 1];
        return {
          localId: uid('set'),
          weightKg: exercise.requiresWeight ? (reference?.weightKg ?? null) : null,
          count: reference?.count ?? item.targetRepsMax ?? item.targetRepsMin ?? 10,
          isWarmup: false,
          isCompleted: false,
          completedAt: null,
          isPrefilled: true,
        };
      });

      const entry: DraftEntry = {
        localId: uid('entry'),
        exercise,
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
        restSeconds: item.restSeconds ?? exercise.defaultRestSeconds ?? defaultRestSeconds,
        transitionRestSeconds: item.transitionRestSeconds ?? defaultTransitionRestSeconds,
        sets,
        overload,
        overloadAccepted: false,
        lastSessionSummary: summarizeLastSession(previous, exercise),
        lastSessionShort: summarizeLastSession(previous, exercise, 'short'),
      };
      return entry;
    })
    .filter((e): e is DraftEntry => e !== null);

  return {
    localId: uid('session'),
    routineId: routine.id,
    title: routine.name,
    startedAt: now.toISOString(),
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

  for (const entry of session.entries) {
    entry.sets.forEach((set, index) => {
      if (!set.isCompleted) return;
      rows.push({
        id: uid('sh'),
        sessionId: session.localId,
        exerciseId: entry.exercise.id,
        performedAt: session.startedAt, // denormalized: enables the fast history scan
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
