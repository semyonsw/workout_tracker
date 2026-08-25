/**
 * Sets per muscle cluster, over the last few weeks.
 *
 *   pull    42  ████████████████████
 *   push    31  ███████████████
 *   core    18  ████████
 *   legs     8  ███
 *   cardio   0
 *
 * The highest ratio of new insight to new code anywhere in this app, and it is
 * all made of data that was already here. `lib/muscles.ts` files every exercise
 * under exactly one cluster and proves the mapping total at compile time. Every
 * set row carries its `exerciseId`. Nothing had ever joined the two across
 * history — so the one thing a lifter could not see was the one thing this data
 * answers for free: that legs quietly stopped happening six weeks ago.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * It states counts. There is no target, no ratio anyone is supposed to hit, no
 * cluster coloured as neglected, no "you should train legs". A cluster with zero
 * sets shows zero, and that IS the feature: the number is a fact about what the
 * user did, and what to do about it is theirs to decide. `HistoryScreen`'s header
 * says the same thing about its totals line, and this row sits directly above it.
 *
 * ── COUNTING RULES ─────────────────────────────────────────────────────────
 *
 *  1. COMPLETED WORKING SETS ONLY. Warm-ups are out, exactly as they are out of
 *     the volume, the shorthand and every overload verdict. A set that does not
 *     count towards progress does not count towards balance either.
 *  2. THE PRIMARY MUSCLE DECIDES THE CLUSTER, via `clusterOf`. A face pull is
 *     pull work and a lateral raise is push work, which is the whole point of
 *     `muscleGroups` being ordered — see `lib/muscles.ts`.
 *  3. AN EXERCISE DELETED SINCE STILL COUNTS. `libraryStore` promises that
 *     deleting an exercise never touches its history, so the rows are still
 *     there and the work still happened. Iterating the LIBRARY and asking what
 *     each exercise did would silently drop all of it; this iterates the
 *     WORKOUTS. What cannot be filed — because the library row that knew its
 *     muscles is gone — is counted under `unfiled` rather than discarded, because
 *     a total that quietly omits six weeks of squats is worse than one that says
 *     it cannot place them.
 *  4. THE WINDOW IS CALENDAR DAYS BACK FROM `now`, injectable. `null` means all
 *     of it.
 */

import type { CompletedWorkout } from './completedWorkout';
import { clusterOf, CLUSTERS } from './muscles';
import { daysBetween } from './units';
import type { CountUnit, Exercise, ID, MuscleCluster } from '../types/models';

/** One row of the balance list. */
export interface ClusterCount {
  cluster: MuscleCluster;
  /** Completed working sets in the window. The headline number and the bar. */
  sets: number;
  /**
   * Everything those sets counted, split BY UNIT.
   *
   * Split rather than summed, because one cluster holds more than one kind of
   * number: `core` is sit-ups in reps and planks in seconds, and adding 90 reps to
   * 480 seconds produces 570 of nothing. For time-counted work this is the time —
   * which is what makes "core: 12 sets · 8:00" a sentence rather than a puzzle.
   */
  totals: Partial<Record<CountUnit, number>>;
}

export interface ClusterBalance {
  /** Every cluster, always, in `CLUSTERS` order — a zero is the point. */
  clusters: ClusterCount[];
  /**
   * Sets whose exercise is no longer in the library, so its cluster is unknowable.
   * Zero for everybody who has not deleted an exercise they had trained.
   */
  unfiled: number;
  /** The largest `sets` across the clusters — what the bars are scaled to. */
  maxSets: number;
  /** Total working sets counted, unfiled included. Zero = nothing to render. */
  totalSets: number;
}

export interface ClusterBalanceParams {
  workouts: readonly CompletedWorkout[];
  /** The library, for the muscles. Rows it no longer has land in `unfiled`. */
  exercisesById: Record<ID, Pick<Exercise, 'muscleGroups'>>;
  /** Calendar days back from `now`, or null for the whole log. */
  windowDays: number | null;
  now?: Date;
}

export function clusterBalance(params: ClusterBalanceParams): ClusterBalance {
  const { workouts, exercisesById, windowDays, now = new Date() } = params;

  const sets = new Map<MuscleCluster, number>();
  const totals = new Map<MuscleCluster, Map<CountUnit, number>>();
  let unfiled = 0;
  let totalSets = 0;

  for (const workout of workouts) {
    /*
     * Dated by the workout, not by the row. Every row in a workout carries the
     * same `performedAt` (it is copied from the session's start), so asking once
     * per workout is the same answer for less work — and it is the workout's date
     * the user sees in the list.
     */
    if (windowDays != null && daysBetween(workout.startedAt, now) > windowDays) continue;

    for (const row of workout.sets) {
      if (row.isWarmup || !row.isCompleted) continue;

      const cluster = clusterOf(exercisesById[row.exerciseId] ?? { muscleGroups: [] });
      totalSets += 1;

      if (!cluster) {
        unfiled += 1;
        continue;
      }

      sets.set(cluster, (sets.get(cluster) ?? 0) + 1);

      const perUnit = totals.get(cluster) ?? new Map<CountUnit, number>();
      const count = Number.isFinite(row.count) ? row.count : 0;
      perUnit.set(row.countUnit, (perUnit.get(row.countUnit) ?? 0) + count);
      totals.set(cluster, perUnit);
    }
  }

  const clusters: ClusterCount[] = CLUSTERS.map((cluster) => ({
    cluster,
    sets: sets.get(cluster) ?? 0,
    totals: Object.fromEntries(totals.get(cluster) ?? []),
  }));

  return {
    clusters,
    unfiled,
    maxSets: clusters.reduce((max, c) => Math.max(max, c.sets), 0),
    totalSets,
  };
}

/**
 * "380 reps · 8:00" — what a cluster's sets actually added up to.
 *
 * Reps first because they are the most common, then time, then distance, then
 * rounds; empty string when there is nothing, so the caller can drop the clause
 * rather than print a separator with nothing after it.
 *
 * `formatDuration` for time rather than `formatClock`, because this is a total
 * rather than a countdown: "8 min" of plank across four weeks, not "8:00".
 */
export function describeClusterTotals(
  totals: Partial<Record<CountUnit, number>>,
  formatSeconds: (seconds: number) => string,
): string {
  const parts: string[] = [];
  if (totals.reps) parts.push(`${totals.reps} reps`);
  if (totals.seconds) parts.push(formatSeconds(totals.seconds));
  if (totals.rounds) parts.push(formatSeconds(totals.rounds));
  if (totals.meters) parts.push(`${totals.meters} m`);
  return parts.join(' · ');
}

/** The windows the History screen offers. `null` days = the whole log. */
export const BALANCE_WINDOWS = [
  { value: '4w' as const, label: '4 weeks', days: 28 },
  { value: '12w' as const, label: '12 weeks', days: 84 },
  { value: 'all' as const, label: 'All', days: null },
];

export type BalanceWindow = (typeof BALANCE_WINDOWS)[number]['value'];

export function balanceWindowDays(value: BalanceWindow): number | null {
  return BALANCE_WINDOWS.find((w) => w.value === value)?.days ?? null;
}
