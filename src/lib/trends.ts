/**
 * Trends — the numbers behind "is this going up or down".
 *
 *   reps per workout      142  ●───●╱  ╲●───●   ← is the volume of work growing
 *   weight per workout   4 720 kg                (kg lifted, reps × load)
 *   reps per session       34  for ONE exercise
 *   top weight per session 80 kg  for ONE exercise
 *
 * All four are ONE POINT PER SESSION, oldest first, and all four are pure
 * functions over rows that are already on disk. That is the whole file: the charts
 * that render them own no arithmetic, and the arithmetic is testable without a
 * phone.
 *
 * ── WHY PER SESSION AND NEVER PER SET ──────────────────────────────────────
 *
 * A real session ramps and drops inside one exercise ("80 × 7, then 75 × 7 7 6").
 * Plotting sets would draw a sawtooth and invent a plateau out of a warm-up. One
 * number per session is the honest signal, and it is the same granularity the
 * overload engine judges — so a chart can never disagree with a nudge.
 *
 * ── WHAT COUNTS ────────────────────────────────────────────────────────────
 *
 * Warm-ups and unlogged sets are excluded everywhere (they are excluded from the
 * stored rows too, but the guard is repeated because these functions also read
 * imported files). Reps means REPS: a 2:00 plank contributes to neither series,
 * because adding seconds to reps produces a number that means nothing. Weight
 * means volume — reps × kg — for weighted rep work only, which is the same rule
 * `totalVolumeKg` applies to a live session.
 */

import type { CompletedWorkout } from './completedWorkout';
import type { ID, SetHistory } from '../types/models';

/** One session's worth of one number. */
export interface TrendPoint {
  /** ISO instant of the session, for the axis label. */
  at: string;
  value: number;
}

/** True for a row that actually happened and is worth counting. */
function counts(row: SetHistory): boolean {
  return !row.isWarmup && row.isCompleted !== false && Number.isFinite(row.count) && row.count > 0;
}

/**
 * Oldest-first, one point per workout: every rep of every rep-counted exercise.
 *
 * Workouts arrive newest-first (the store's order), so this reverses. A workout
 * with no rep-counted work at all is dropped rather than plotted as a zero — a
 * swim day is not a day with no reps, it is a day the question doesn't apply to,
 * and a zero in the middle of a line reads as a collapse.
 */
export function workoutRepsSeries(workouts: readonly CompletedWorkout[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const workout of workouts) {
    let reps = 0;
    for (const row of workout.sets) {
      if (row.countUnit !== 'reps' || !counts(row)) continue;
      reps += row.count;
    }
    if (reps > 0) points.push({ at: workout.startedAt, value: reps });
  }
  return points.reverse();
}

/**
 * Oldest-first, one point per workout: kilograms actually moved.
 *
 * READ FROM THE RECORD, NOT RECOMPUTED. `totalVolumeKg` is the figure the store
 * wrote when the workout was finished, through `effectiveLoadKg` — which is what
 * makes a weighted pull-up count as bodyweight plus the belt rather than as the
 * belt alone. Recomputing `weightKg × count` here would be a second, simpler rule
 * for the same quantity, and the chart would quietly disagree with the History row
 * above it on every set of dips, chin-ups or push-ups in the log.
 *
 * A PARTIAL TOTAL IS NOT PLOTTED. `volumeIsPartial` means at least one set's load
 * would not resolve — bodyweight work logged before the user ever typed a
 * bodyweight — so the stored figure omits part of the session. History drops its
 * volume clause in that case rather than printing a number that is quietly too
 * small, and the same fact matters more on a line: a short bar reads as "I trained
 * less that day", which is a finding, and a false one. The point is left out so the
 * gap is visible instead.
 *
 * A bodyweight-only day has no volume to plot either, and falls out the same way.
 */
export function workoutVolumeSeries(workouts: readonly CompletedWorkout[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const workout of workouts) {
    if (workout.volumeIsPartial) continue;
    if (workout.totalVolumeKg > 0) {
      points.push({ at: workout.startedAt, value: Math.round(workout.totalVolumeKg) });
    }
  }
  return points.reverse();
}

/** One exercise's rows grouped into sessions, oldest first. */
function bySession(history: readonly SetHistory[], exerciseId: ID): SetHistory[][] {
  const groups = new Map<ID, SetHistory[]>();
  for (const row of history) {
    if (row.exerciseId !== exerciseId || !counts(row)) continue;
    const bucket = groups.get(row.sessionId);
    if (bucket) bucket.push(row);
    else groups.set(row.sessionId, [row]);
  }
  return [...groups.values()].sort(
    (a, b) => new Date(a[0].performedAt).getTime() - new Date(b[0].performedAt).getTime(),
  );
}

/**
 * Oldest-first: how much of this exercise was done each session.
 *
 * The unit is the exercise's own — reps for reps, seconds for a plank, metres for
 * a swim — because the sum of a session's counts is the honest "how much" in
 * every one of those cases. The caller states the unit; this only adds up.
 */
export function exerciseCountSeries(history: readonly SetHistory[], exerciseId: ID): TrendPoint[] {
  return bySession(history, exerciseId).map((sets) => ({
    at: sets[0].performedAt,
    value: sets.reduce((sum, row) => sum + row.count, 0),
  }));
}

/**
 * Oldest-first: the TOP working weight of each session.
 *
 * Top, not average and not last: it is the number you decide the next session
 * against, and it is what the overload engine judges. Sessions with no weight on
 * them (bodyweight work) contribute nothing.
 */
export function exerciseTopWeightSeries(
  history: readonly SetHistory[],
  exerciseId: ID,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const sets of bySession(history, exerciseId)) {
    const weights = sets.map((row) => row.weightKg).filter((w): w is number => w != null);
    if (weights.length === 0) continue;
    points.push({ at: sets[0].performedAt, value: Math.max(...weights) });
  }
  return points;
}

export interface TrendSummary {
  first: number;
  last: number;
  /** `last − first`. Positive is up; the sign is the whole point of the screen. */
  delta: number;
  /** Percent change against the first point, rounded. Null when it started at 0. */
  percent: number | null;
  sessions: number;
}

/**
 * First to last, as a fact rather than a verdict.
 *
 * Null under two points, because a trend needs two: one session is a
 * measurement, and calling it a direction would be the chart lying about what it
 * knows. Deliberately the FIRST and LAST point of what is plotted rather than a
 * fitted slope — the user can see the shape; what they cannot do at a glance is
 * subtract.
 */
export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return {
    first,
    last,
    delta: Math.round((last - first) * 100) / 100,
    percent: first === 0 ? null : Math.round(((last - first) / first) * 100),
    sessions: points.length,
  };
}
