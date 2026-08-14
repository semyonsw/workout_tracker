/**
 * Progressive-overload engine.
 *
 * Pure, synchronous, dependency-free: takes rows of `SetHistory` and returns a
 * verdict. No React, no DB, no clock of its own (`now` is injectable) — so it is
 * trivially testable and can run inside a worker or on a server later.
 *
 * ── The model ──────────────────────────────────────────────────────────────
 * Progress is judged on the TOP WORKING WEIGHT PER SESSION, not per set. Real
 * sessions ramp and drop within an exercise ("15kg 5, 10kg 12 9 8"), so a
 * per-set view would see phantom plateaus. One number per session per exercise
 * is the honest signal.
 *
 * A "plateau run" is the streak of most-recent sessions that all share the same
 * top working weight. The nudge fires when that run is both LONG ENOUGH IN DAYS
 * (calendar staleness — the spec's "2 weeks") and DEEP ENOUGH IN SESSIONS
 * (so a 2-week holiday between two sessions isn't mistaken for stagnation).
 *
 * Two refinements over a naive "same weight for 14 days → +2.5 kg":
 *
 *  1. REPS BEFORE WEIGHT. If the user hasn't hit the rep target at the current
 *     weight, the correct progression is one more rep, not more load. The
 *     verdict says `add_reps` instead of `add_weight`.
 *  2. REGRESSION GUARD. If the user recently handled MORE than they're using
 *     now (deload, injury, fatigue), they are already working back up — a nudge
 *     there is noise, and worse, it's wrong. Verdict: `regressing`, stay quiet.
 */

import type { Exercise, OverloadPolicy, SetHistory, UnitSystem } from '../types/models';
import { daysBetween, resolveIncrementKg, roundToStep } from './units';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type OverloadStatus =
  /** Not enough logged history to say anything. */
  | 'insufficient_data'
  /** Weight went up in the most recent session — already progressing. */
  | 'progressing'
  /** Plateau detected but still inside the policy window — watching. */
  | 'building'
  /** Working back up from a heavier recent weight. Stay silent. */
  | 'regressing'
  /** Plateaued long enough, but reps aren't there yet → chase a rep. */
  | 'due_reps'
  /** Plateaued long enough and reps are owned → add load. */
  | 'due_weight';

export interface OverloadVerdict {
  status: OverloadStatus;
  /** True only for the two `due_*` statuses — the single flag the UI checks. */
  shouldNudge: boolean;

  /** Top working weight of the most recent session (kg), null if unweighted. */
  currentWeightKg: number | null;
  /** Suggested next weight (kg), rounded to a loadable step. Null for `due_reps`. */
  suggestedWeightKg: number | null;
  /** Suggested next rep count. Set for `due_reps`, null otherwise. */
  suggestedReps: number | null;

  /** Calendar days spanned by the current plateau run. */
  plateauDays: number;
  /** Number of sessions in the plateau run. */
  sessionsAtWeight: number;
  /** Best reps achieved at the current top weight in the latest session. */
  bestRepsAtWeight: number;
  /** ISO date the current weight was first used as a top set. */
  since: string | null;

  /** One short line, already written for the UI. Never longer than ~40 chars. */
  message: string;
}

/** One session, reduced to the only facts the engine cares about. */
interface SessionSummary {
  sessionId: string;
  performedAt: string;
  topWeightKg: number | null;
  /** Best reps achieved AT the top weight (not the best reps overall). */
  bestRepsAtTop: number;
}

export const DEFAULT_OVERLOAD_POLICY: OverloadPolicy = {
  stalenessDays: 14,
  minSessions: 3,
  incrementKg: 2.5,
  requireRepTargetMet: true,
  repTarget: 8,
  regressionLookbackDays: 60,
};

/* ------------------------------------------------------------------ */
/* Step 1 — history → one summary row per session                      */
/* ------------------------------------------------------------------ */

/**
 * Collapse raw sets into one row per session, newest first.
 * Warm-ups, incomplete sets and other exercises are dropped here so every
 * downstream step can assume clean input.
 */
export function summarizeSessions(history: SetHistory[], exerciseId: string): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();

  for (const set of history) {
    if (set.exerciseId !== exerciseId) continue;
    if (set.isWarmup || !set.isCompleted) continue;
    if (set.count <= 0) continue;

    const existing = bySession.get(set.sessionId);
    const weight = set.weightKg ?? null;

    if (!existing) {
      bySession.set(set.sessionId, {
        sessionId: set.sessionId,
        performedAt: set.performedAt,
        topWeightKg: weight,
        bestRepsAtTop: set.count,
      });
      continue;
    }

    if (weight != null && (existing.topWeightKg == null || weight > existing.topWeightKg)) {
      // Heavier set found → it defines the session's top weight, and its reps
      // reset the rep tally (reps at a lighter weight tell us nothing about it).
      existing.topWeightKg = weight;
      existing.bestRepsAtTop = set.count;
    } else if (weight === existing.topWeightKg) {
      existing.bestRepsAtTop = Math.max(existing.bestRepsAtTop, set.count);
    }
  }

  return [...bySession.values()].sort(
    (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — the verdict                                                */
/* ------------------------------------------------------------------ */

export interface EvaluateOverloadParams {
  exercise: Pick<Exercise, 'id' | 'requiresWeight' | 'incrementKg' | 'countUnit'>;
  /** Completed sets for this exercise. Order doesn't matter; extras are filtered. */
  history: SetHistory[];
  policy?: OverloadPolicy;
  unitSystem?: UnitSystem;
  /** Injectable clock — keeps this function deterministic under test. */
  now?: Date;
}

export function evaluateOverload(params: EvaluateOverloadParams): OverloadVerdict {
  const {
    exercise,
    history,
    policy = DEFAULT_OVERLOAD_POLICY,
    unitSystem = 'metric',
    now = new Date(),
  } = params;

  const empty = emptyVerdict();

  // Bodyweight / cardio work has no load axis to progress. Rep- and time-based
  // progression is handled by the routine's target, not by this engine.
  if (!exercise.requiresWeight) return empty;

  const sessions = summarizeSessions(history, exercise.id);
  if (sessions.length === 0) return empty;

  const latest = sessions[0];
  if (latest.topWeightKg == null) return empty;

  const currentWeight = latest.topWeightKg;

  /* --- the plateau run: consecutive recent sessions at the same top weight --- */
  let run = 1;
  let oldestInRun = latest;
  for (let i = 1; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (s.topWeightKg == null || !nearlyEqual(s.topWeightKg, currentWeight)) break;
    run += 1;
    oldestInRun = s;
  }

  const plateauDays = daysBetween(oldestInRun.performedAt, now);
  const sinceDate = oldestInRun.performedAt;
  const bestReps = latest.bestRepsAtTop;

  /* --- guard 1: regression --------------------------------------------- */
  // Look past the run for a heavier top weight in the recent past. If the user
  // was heavier lately, they're rebuilding — never nudge into a deload.
  const heavierRecently = sessions.slice(run).some(
    (s) =>
      s.topWeightKg != null &&
      s.topWeightKg > currentWeight &&
      daysBetween(s.performedAt, now) <= policy.regressionLookbackDays,
  );
  if (heavierRecently) {
    return {
      ...empty,
      status: 'regressing',
      currentWeightKg: currentWeight,
      plateauDays,
      sessionsAtWeight: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: 'Working back up — hold here',
    };
  }

  /* --- guard 2: already progressing ------------------------------------ */
  // The run is 1 session long and there is a lighter session behind it → the
  // most recent thing that happened was an increase. Let them enjoy it.
  if (run === 1 && sessions.length > 1) {
    const previous = sessions[1];
    if (previous.topWeightKg != null && currentWeight > previous.topWeightKg) {
      return {
        ...empty,
        status: 'progressing',
        currentWeightKg: currentWeight,
        plateauDays,
        sessionsAtWeight: 1,
        bestRepsAtWeight: bestReps,
        since: sinceDate,
        message: 'Moved up last session',
      };
    }
  }

  /* --- the actual staleness test --------------------------------------- */
  const stale = plateauDays >= policy.stalenessDays && run >= policy.minSessions;
  if (!stale) {
    return {
      ...empty,
      status: 'building',
      currentWeightKg: currentWeight,
      plateauDays,
      sessionsAtWeight: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: `${run}× at this weight`,
    };
  }

  /* --- reps before weight ---------------------------------------------- */
  if (policy.requireRepTargetMet && bestReps < policy.repTarget) {
    return {
      ...empty,
      status: 'due_reps',
      shouldNudge: true,
      currentWeightKg: currentWeight,
      suggestedReps: bestReps + 1,
      plateauDays,
      sessionsAtWeight: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: `${plateauDays}d here — chase ${bestReps + 1} reps`,
    };
  }

  /* --- add load --------------------------------------------------------- */
  const increment = resolveIncrementKg(exercise.incrementKg, policy.incrementKg, unitSystem);
  const suggested = roundToStep(currentWeight + increment, increment);

  return {
    ...empty,
    status: 'due_weight',
    shouldNudge: true,
    currentWeightKg: currentWeight,
    suggestedWeightKg: suggested,
    plateauDays,
    sessionsAtWeight: run,
    bestRepsAtWeight: bestReps,
    since: sinceDate,
    message: `Same weight ${plateauDays}d — try heavier`,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function emptyVerdict(): OverloadVerdict {
  return {
    status: 'insufficient_data',
    shouldNudge: false,
    currentWeightKg: null,
    suggestedWeightKg: null,
    suggestedReps: null,
    plateauDays: 0,
    sessionsAtWeight: 0,
    bestRepsAtWeight: 0,
    since: null,
    message: '',
  };
}

/** Float-safe comparison — 22.5 kg round-tripped through lb must still match. */
function nearlyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Batch helper for list screens: evaluate many exercises in one pass so the
 * routine view can render badges without N queries.
 */
export function evaluateOverloadBatch(
  exercises: EvaluateOverloadParams['exercise'][],
  historyByExerciseId: Record<string, SetHistory[]>,
  options: Omit<EvaluateOverloadParams, 'exercise' | 'history'> = {},
): Record<string, OverloadVerdict> {
  const out: Record<string, OverloadVerdict> = {};
  for (const exercise of exercises) {
    out[exercise.id] = evaluateOverload({
      exercise,
      history: historyByExerciseId[exercise.id] ?? [],
      ...options,
    });
  }
  return out;
}
