/**
 * THE BEAT BETWEEN FINISHING AN EXERCISE AND THE NEXT ONE OPENING.
 *
 * The last ✓ of an exercise used to shut its card and open the next in the same
 * frame — so the ✓ you had just pressed, its pop and its flash, vanished under
 * your thumb before you saw them land, and the list jumped. Now the finished
 * card stays open for 650 ms, long enough to see the set logged, and THEN it
 * closes and the next card with work in it opens.
 *
 * The one thing to get right is WHEN that beat applies. The cursor also moves
 * when a card is tapped, and holding the old card open after a tap would be the
 * app arguing with the user. So it applies only to a card that is finished AND
 * whose last set was logged a moment ago — which is what "the ✓ just moved the
 * cursor" looks like from outside the store.
 */

import type { DraftEntry } from './draft';

/** How long a just-finished card stays open. */
export const ADVANCE_HOLD_MS = 650;

/** How recent the last ✓ must be for a cursor move to have been caused by it. */
export const ADVANCE_RECENT_MS = 1500;

export function holdsAfterFinishing(entry: DraftEntry | undefined, nowMs: number): boolean {
  if (!entry || entry.sets.length === 0) return false;
  if (!entry.sets.every((set) => set.isCompleted)) return false;
  let latest = -Infinity;
  for (const set of entry.sets) {
    const at = set.completedAt ? Date.parse(set.completedAt) : Number.NaN;
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return Number.isFinite(latest) && nowMs - latest >= 0 && nowMs - latest <= ADVANCE_RECENT_MS;
}
