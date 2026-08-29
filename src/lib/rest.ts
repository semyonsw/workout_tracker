/**
 * How long a rest is — the whole cascade, in one file.
 *
 * There are exactly TWO levels, and the order is:
 *
 *   1. THE EXERCISE'S OWN REST (`Exercise.defaultRestSeconds`), when it has one.
 *   2. THE SETTING (`restSecondsBetweenSets`), for every exercise that does not.
 *
 * ── WHY THIS IS A REWRITE AND NOT A TWEAK ──────────────────────────────────
 *
 * Rest used to cascade through a THIRD level — `RoutineItem.restSeconds`, an
 * override stored per routine row — and both of the levels above the setting were
 * populated by things the user never did. The shipped routines carried item rests,
 * `appendToRoutine` copied the exercise's default into a fresh item, and the
 * exercise editor stamped whatever Settings said at the time onto
 * `defaultRestSeconds` every time an exercise was saved. So the number the user
 * set in Settings was shadowed almost everywhere it mattered: `Between sets 1:30`
 * and then a 3:00 countdown, which is indistinguishable from a broken setting.
 *
 * Two things fix that, and both are load-bearing:
 *
 *   • ONE OVERRIDE, NOT TWO. Rest is a fact about the MOVEMENT — how long you
 *     need before you can pull again — not about the row of a template that
 *     happens to contain it. One exercise, one rest, edited in the exercise editor
 *     or on the routine row (which now writes to the same place), read everywhere.
 *   • AN OVERRIDE ONLY EXISTS WHERE THE USER PUT ONE. Nothing seeds it, nothing
 *     copies into it, and setting the global rest CLEARS every one of them —
 *     see `state/restSync.ts`. That is what makes "Between sets" mean between
 *     every set, which is the only thing it can honestly say.
 *
 * NO OVERRIDE MEANS LIVE, not "a copy of the setting made at build time":
 * `completeSet` resolves the rest at the moment it starts one, so an exercise
 * following the setting follows it as it changes, mid-workout included.
 */

import type { Exercise } from '../types/models';

/**
 * The legal range for a rest, and the step every ± control nudges it by.
 *
 * The same numbers as `SETTING_LIMITS.restSecondsBetweenSets`, deliberately: the
 * per-exercise rest and the setting are the same quantity, and a control that
 * could push an exercise to a value the setting cannot reach would make "set the
 * global rest" unable to undo it.
 */
export const REST_LIMITS = { min: 0, max: 900, step: 15 } as const;

export interface ResolvedRest {
  seconds: number;
  /**
   * Which level is in force. Every control that shows a rest states this, because
   * `3:00` alone cannot tell "this exercise wants three minutes" from "your
   * setting is three minutes" — and when it was the former, the setting looked
   * broken. See the file header.
   */
  source: 'exercise' | 'settings';
}

/** Whole seconds inside the legal range. Exported: every ± chip needs it. */
export function clampRest(seconds: number): number {
  return Math.min(REST_LIMITS.max, Math.max(REST_LIMITS.min, Math.round(seconds)));
}

/**
 * This exercise's own rest, or `null` when it is following the setting.
 *
 * `null` and `0` are different answers and both are legal: zero is "no rest
 * between these sets", which a circuit or a warm-up movement genuinely wants.
 */
export function ownRestSeconds(exercise: Pick<Exercise, 'defaultRestSeconds'>): number | null {
  const own = exercise.defaultRestSeconds;
  if (typeof own !== 'number' || !Number.isFinite(own) || own < 0) return null;
  return clampRest(own);
}

/** The rest this exercise will actually run between its sets. */
export function resolveRest(
  exercise: Pick<Exercise, 'defaultRestSeconds'>,
  settingsRestSeconds: number,
): ResolvedRest {
  const own = ownRestSeconds(exercise);
  if (own != null) return { seconds: own, source: 'exercise' };
  return { seconds: clampRest(settingsRestSeconds), source: 'settings' };
}

/**
 * Nudge this exercise's rest, CREATING an override from the value currently in
 * force — so the first tap moves the number the row is showing rather than
 * jumping to somewhere else.
 *
 * `settingsRestSeconds` is only the starting point. Once an override exists it is
 * a fact about the exercise, and the setting no longer reaches it until the user
 * sets the global rest again.
 */
export function bumpExerciseRest<T extends Pick<Exercise, 'defaultRestSeconds'>>(
  exercise: T,
  delta: number,
  settingsRestSeconds: number,
): T {
  const current = resolveRest(exercise, settingsRestSeconds).seconds;
  return { ...exercise, defaultRestSeconds: clampRest(current + delta) };
}

/**
 * Drop the override, so this exercise follows the setting again — LIVE, not as a
 * copy of whatever the setting says today. That distinction is the whole reason
 * there is a clear action at all: an exercise with no override tracks the setting
 * as it changes, and an exercise whose override happens to equal it does not.
 *
 * The key is DELETED rather than set to `undefined`: a persisted
 * `"defaultRestSeconds": null` is a claim about the format that isn't true, and
 * the two read the same way everywhere except on disk.
 */
export function clearExerciseRest<T extends Pick<Exercise, 'defaultRestSeconds'>>(exercise: T): T {
  if (!('defaultRestSeconds' in exercise)) return exercise;
  const { defaultRestSeconds: _dropped, ...rest } = exercise;
  return rest as T;
}
