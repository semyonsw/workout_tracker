/**
 * The weight you just used is the weight of the rest of the exercise.
 *
 *   plan      70 · 70 · 70 · 70        ← four sets, prefilled from last session
 *   you do    60 ✓                     ← it was not a 70 kg day
 *   after     60 ✓ · 60 · 60 · 60      ← and it is not going to become one
 *
 * ── WHY THIS IS A RULE AND NOT A NUDGE ──────────────────────────────────────
 *
 * Dropping the weight mid-exercise is the single most common edit in a real
 * session, and before this it cost one edit PER REMAINING SET: the prefill came
 * from last session, so every row under the one you had just corrected still said
 * the number you had already decided was wrong. Three sets left meant three trips
 * through the weight cell and the ± chips to say one thing once.
 *
 * So a ✓ carries its weight down. It is the same promise the prefill makes — "the
 * app already knows what you are about to do" — applied to the information that
 * arrived thirty seconds ago rather than a week ago.
 *
 * THREE THINGS IT WILL NOT TOUCH, and each is a fact rather than a plan:
 *
 *  1. A SET THAT IS ALREADY LOGGED. History is history; a set you did at 70 does
 *     not retroactively become a set at 60 because the next one was lighter.
 *  2. A WARM-UP. The whole point of a warm-up row is that it is a fraction of the
 *     working weight, and flattening the ramp to the top set is the opposite of
 *     what `lib/warmup.ts` just built.
 *  3. A SET ABOVE THE ONE YOU LOGGED. Carrying runs DOWN the card only — the rows
 *     above are either done or deliberately skipped, and rewriting a row you have
 *     already walked past is the app editing your plan behind you.
 *
 * The carried rows come back with `isPrefilled: false`, because they are no longer
 * a guess from last session: they are what you are lifting today, and the ghost
 * styling would say the opposite.
 *
 * WHAT IT RETURNS. The SAME array reference when nothing changed — an unweighted
 * exercise, a last set, a card that already agrees. `completeSet` builds a new
 * session object on every ✓ and a fresh sets array that is element-for-element
 * identical would repaint every row of the card for nothing.
 */

import type { DraftSet } from './draft';
import type { Exercise, ID } from '../types/models';

/**
 * Does this movement carry a weight at all?
 *
 * The gate is `requiresWeight`, not `loadMode`: an assisted machine and a belt are
 * both numbers that go down when the day is bad, and a push-up has no number to
 * carry. Exported so the store can ask before doing any work.
 */
export function carriesWeight(exercise: Pick<Exercise, 'requiresWeight'>): boolean {
  return exercise.requiresWeight;
}

/**
 * Every unlogged working set below `fromSetId` takes its weight.
 *
 * Pure, and deliberately unaware of which set was just completed — the caller
 * names the row and this walks down from it. That is what lets the same function
 * serve the ✓, the bell at the end of a timed set, and any future control that
 * means "this is the weight now".
 */
export function carryWeightForward(sets: readonly DraftSet[], fromSetId: ID): DraftSet[] {
  const index = sets.findIndex((s) => s.localId === fromSetId);
  if (index === -1) return sets as DraftSet[];

  const weightKg = sets[index].weightKg;
  if (weightKg == null || !Number.isFinite(weightKg)) return sets as DraftSet[];

  let changed = false;
  const next = sets.map((set, i) => {
    if (i <= index || set.isCompleted || set.isWarmup) return set;
    if (set.weightKg === weightKg && !set.isPrefilled) return set;
    changed = true;
    return { ...set, weightKg, isPrefilled: false };
  });

  return changed ? next : (sets as DraftSet[]);
}

/**
 * The weight to remember as this movement's new starting point, or null.
 *
 * `Exercise.defaultWeightKg` is "where to start the first time this is ever
 * performed", and the user's ask is that it follows the same rule the rows do: set
 * 60 today and 60 is what the exercise says it starts at. Null means leave the
 * library alone — an unweighted movement, an empty cell, or a number that is
 * already what the row says.
 *
 * Separate from `carryWeightForward` because the two have different blast radii:
 * one edits a session that will be thrown away tonight, the other writes to a
 * library row that outlives it. A caller that wants only the first can take only
 * the first.
 */
export function defaultWeightUpdate(
  exercise: Pick<Exercise, 'requiresWeight' | 'defaultWeightKg'>,
  weightKg: number | null,
): number | null {
  if (!carriesWeight(exercise)) return null;
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (exercise.defaultWeightKg === weightKg) return null;
  return weightKg;
}
