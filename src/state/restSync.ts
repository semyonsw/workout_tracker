/**
 * Setting the global rest, everywhere it has to land.
 *
 * `Between sets` is not just a number in a store — it is a claim about every set
 * in the app, and three places have to agree with it for that claim to be true:
 *
 *   1. THE SETTING itself, which every exercise without a rest of its own reads.
 *   2. THE LIBRARY, whose per-exercise overrides are cleared, so an exercise that
 *      had its own rest goes back to following. This is the half that makes the
 *      user's sentence — "when I set the general rest, all the exercises get it" —
 *      literally true rather than nearly true.
 *   3. THE LIVE SESSION, which carries its own copy of each exercise. Skip this and
 *      changing the rest mid-workout appears to do nothing until the next workout,
 *      which is the same symptom, one layer down.
 *
 * It is a module rather than a store action because it spans all three stores and
 * something has to own the order. `settingsStore` cannot: `activeWorkoutStore`
 * imports it, so importing back would be a cycle. `activeWorkoutStore` should not:
 * it is a state machine for the live session, and "what a setting means for the
 * library" is not its business. So the policy lives here, and the three stores stay
 * ignorant of each other — the same shape as `SettingsScreen` calling
 * `setLadderOnAllExercises` beside `setFlag`, which is the precedent.
 *
 * WHO CALLS THIS: the Settings rows, and the ± on the rest pill. The pill is the
 * one that makes this more than tidiness — cutting a 2:00 rest to 1:30 mid-workout
 * means "1:30 from now on", not "1:30 this once", and the only way to keep that
 * promise for the sets that follow is to write it where they will read it.
 */

import { clampSetting, useSettings } from './settingsStore';
import { useLibrary } from './libraryStore';
import { useActiveWorkout } from './activeWorkoutStore';

/**
 * The between-sets rest is now `seconds`, for every set of every exercise.
 *
 * Clamped through `clampSetting` first so the three stores are given the same
 * number the setting will actually hold — a rest of 20 minutes typed by a runaway
 * `+15` must not survive in the library after the setting has refused it.
 */
export function setRestBetweenSets(seconds: number): void {
  const value = clampSetting('restSecondsBetweenSets', seconds);
  useSettings.getState().setNumber('restSecondsBetweenSets', value);
  useLibrary.getState().followGlobalRestOnAllExercises();
  useActiveWorkout.getState().followGlobalRest();
}

/** Nudge it by a step, from wherever it is now. Same three landings. */
export function bumpRestBetweenSets(delta: number): void {
  setRestBetweenSets(useSettings.getState().restSecondsBetweenSets + delta);
}

/**
 * The between-exercises rest. No overrides exist for it — nothing anywhere edits
 * `RoutineItem.transitionRestSeconds` — so this is only the setting, and it is
 * here so that the pill has ONE place to send an adjustment and one rule for
 * reading it.
 */
export function setRestBetweenExercises(seconds: number): void {
  useSettings.getState().setNumber('restSecondsBetweenExercises', seconds);
}
