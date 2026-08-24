/**
 * How long you actually rest, as opposed to how long you told the app to.
 *
 * `SetHistory.restTakenSeconds` has been in the model from the start with nothing
 * writing it, and the number was free the whole time: the store knows the instant
 * a rest began and the instant the next ✓ landed. `completeSet` records it now,
 * and this is what reads it back.
 *
 * ── MEDIAN, NOT MEAN ───────────────────────────────────────────────────────
 *
 * One workout interrupted by a phone call is a twelve-minute "rest" among fifty
 * two-minute ones, and a mean would move for it. A median does not notice. That
 * is the entire reason this file computes a median, and it is why the suggestion
 * it feeds can be offered as a fact rather than hedged.
 *
 * ── WHERE THE SOURCE COMES FROM ────────────────────────────────────────────
 *
 * Rest between sets and rest between exercises are two different lengths — they
 * are two separate settings — so the median has to be per source. Nothing on the
 * row says which it was, and rather than add a field, it is DERIVED from the one
 * that is already there: `setIndex`.
 *
 * A rest recorded on set index 0 of an exercise is the rest that was taken before
 * that exercise began, which is a between-exercises rest. A rest recorded on any
 * later index is a rest between two sets of the same exercise. That follows from
 * `completeSet`, which starts the transition rest when an exercise finishes and
 * records the elapsed rest against the NEXT set completed.
 *
 * It is an approximation in exactly one direction: a set added mid-exercise, or
 * sets ticked out of order, can put a between-sets rest on index 0. That costs one
 * sample out of dozens and the median absorbs it — which is a better trade than a
 * sixth field on the atom of the whole app, for a number that is already implied
 * by the two beside it.
 */

import type { CompletedWorkout } from './completedWorkout';

export type RestSourceKind = 'set' | 'transition';

/**
 * The longest gap this file is willing to call a rest.
 *
 * Thirty minutes, and beyond it the sample is thrown away rather than clamped: a
 * two-hour "rest" is a phone that sat in a locker with the app open, not a
 * decision anybody made, and a clamped 30:00 would be a number the app invented.
 * The same reasoning as `SETTING_LIMITS` — a rest longer than fifteen minutes is a
 * different workout — with the ceiling doubled because this measures reality
 * rather than bounding a control.
 */
export const MAX_PLAUSIBLE_REST_SECONDS = 1800;

/**
 * How many samples before the app is willing to say anything.
 *
 * Ten is roughly two sessions' worth. Below it the median swings on one
 * interruption, and a suggestion that changes every workout is a suggestion
 * nobody trusts twice.
 */
export const MIN_REST_SAMPLES = 10;

export interface RestMedians {
  /** Median seconds rested between sets, or null below the sample threshold. */
  betweenSets: number | null;
  /** Median seconds rested between exercises, same threshold. */
  betweenExercises: number | null;
  /** How many usable samples each is based on — for the copy, and for the tests. */
  sampleCounts: { betweenSets: number; betweenExercises: number };
}

/**
 * Median rest actually taken, per source, across the log.
 *
 * `limit` caps how far back it reads: rest habits change, and a median over three
 * years is a fact about somebody else. Newest first is the order the store keeps,
 * so this is a slice rather than a sort.
 */
export function restMedians(workouts: readonly CompletedWorkout[], limit = 40): RestMedians {
  const betweenSets: number[] = [];
  const betweenExercises: number[] = [];

  for (const workout of workouts.slice(0, Math.max(0, limit))) {
    for (const row of workout.sets) {
      const taken = row.restTakenSeconds;
      if (typeof taken !== 'number' || !Number.isFinite(taken)) continue;
      // A recorded zero is not a rest: `completeSet` records nothing rather than
      // zero precisely so "I did not use the timer" stays distinguishable.
      if (taken <= 0 || taken > MAX_PLAUSIBLE_REST_SECONDS) continue;

      if (row.setIndex === 0) betweenExercises.push(taken);
      else betweenSets.push(taken);
    }
  }

  return {
    betweenSets: medianOrNull(betweenSets),
    betweenExercises: medianOrNull(betweenExercises),
    sampleCounts: {
      betweenSets: betweenSets.length,
      betweenExercises: betweenExercises.length,
    },
  };
}

/**
 * The median of `values`, rounded to a whole second — or null below the sample
 * threshold, which is the caller's cue to say nothing at all rather than to hedge.
 *
 * An even-length list averages the middle two, then rounds. Whole seconds because
 * the number is offered as a rest SETTING, and the settings are whole seconds.
 */
function medianOrNull(values: number[]): number | null {
  if (values.length < MIN_REST_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median);
}
