/**
 * UP NEXT — the one set in the whole session that glows.
 *
 *   Weighted pull-ups   1 ✓  2 ✓  3 ✓
 *   Wide pull-ups       1 ✓  2 ←── the glow is here
 *   Plank               1    2
 *
 * The rule, in one sentence: THE SET AFTER THE ONE YOU LAST LOGGED.
 *
 * ── WHY THIS IS NOT THE CURSOR ──────────────────────────────────────────────
 *
 * The glow used to be "the first unlogged set of the exercise `activeEntryId`
 * points at", and `activeEntryId` moves when you TAP A CARD — because tapping a
 * card is also how you say "I'm doing this now". Those two meanings are fine
 * together until you open a card to read it: reaching down the list to check what
 * weight you used on face pulls moved the glow onto face pulls, and the set you
 * were actually about to do stopped being marked. The mark that answers "where was
 * I" cannot be moved by looking around.
 *
 * So the glow is derived from the LOG instead of from the view. Nothing the user
 * can tap changes it except a ✓, and that is the whole point: it is a fact about
 * the session, not a piece of navigation state. The cursor still exists and still
 * decides which card is open and what the auto-scroll chases — see
 * `ActiveWorkoutScreen`.
 *
 * ── LAST LOGGED IS CHRONOLOGICAL; NEXT IS POSITIONAL ────────────────────────
 *
 * Two different orders, deliberately, and both halves are load-bearing:
 *
 *   • WHICH set was last is a question about time — `completedAt`. Go back and fix
 *     up a set you skipped earlier and the glow follows you there, because that
 *     genuinely is where you are now.
 *   • WHAT comes next is a question about the list as it now reads. So reordering
 *     the cards moves the glow, and an exercise dragged in ABOVE the glow takes
 *     it: its first set really is the next set after the one you last logged. That
 *     is the behaviour the list is promising by letting you drag at all.
 *
 * If the last logged set is the last one in the list and something earlier is still
 * unlogged, the scan WRAPS to it — a session with a skipped set in the middle
 * should point at the skipped set rather than at nothing.
 *
 * Warm-ups count. A warm-up is out of the volume and out of every verdict, but it
 * is still a set you walk to the bar to do, so it can be the thing up next and it
 * can be the thing you last logged.
 */

import type { DraftSession } from './draft';
import type { ID } from '../types/models';

export interface UpNext {
  entryId: ID;
  setId: ID;
}

/**
 * The set to do next, or null when there is nothing left (or no session).
 *
 * Null on a finished session is what turns every glow off — the work is done, and
 * a mark pointing at the last logged set would read as "do this again".
 */
export function upNextSet(session: DraftSession | null): UpNext | null {
  if (!session) return null;

  /* The session flattened into list order — the order a thumb moves down it. */
  const flat: { entryId: ID; setId: ID; isCompleted: boolean; completedAt: string | null }[] = [];
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      flat.push({
        entryId: entry.localId,
        setId: set.localId,
        isCompleted: set.isCompleted,
        completedAt: set.completedAt,
      });
    }
  }

  /*
   * The most recently logged set. Ties, and rows old enough to have no
   * `completedAt` at all, fall back to position: later in the list wins, which is
   * the order they were almost certainly done in.
   */
  let lastDone = -1;
  let lastAt: string | null = null;
  flat.forEach((row, index) => {
    if (!row.isCompleted) return;
    if (lastDone === -1) {
      lastDone = index;
      lastAt = row.completedAt;
      return;
    }
    if (row.completedAt == null) {
      if (lastAt == null) lastDone = index;
      return;
    }
    if (lastAt == null || row.completedAt >= lastAt) {
      lastDone = index;
      lastAt = row.completedAt;
    }
  });

  /* Forward from the last ✓, then round again for anything skipped above it. */
  for (let i = lastDone + 1; i < flat.length; i += 1) {
    if (!flat[i].isCompleted) return { entryId: flat[i].entryId, setId: flat[i].setId };
  }
  for (let i = 0; i <= lastDone && i < flat.length; i += 1) {
    if (!flat[i].isCompleted) return { entryId: flat[i].entryId, setId: flat[i].setId };
  }

  return null;
}
