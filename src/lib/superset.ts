/**
 * Supersets — whose turn is it next, and when does rest actually fire.
 *
 * `RoutineItem.supersetGroup` has been in the model since the first release with
 * its behaviour written down beside it — "Same string = same superset; rest only
 * fires after the last member" — and until 0.11.0 the identifier appeared in
 * exactly one file in the repo: the model that declared it. `completeSet` never
 * consulted it. This module is the decision it needed.
 *
 * ── WHAT A SUPERSET IS, MECHANICALLY ────────────────────────────────────────
 *
 * Two or more exercises done back to back with no rest between them, then one
 * rest before going round again. So the only two questions are:
 *
 *   1. after this ✓, is there another member of the group with work left in THIS
 *      round? → go there, and start no rest
 *   2. otherwise → the round is over: rest as normal
 *
 * "This round" is the load-bearing idea. A superset's round index is the number of
 * sets already logged FOR THAT MEMBER, not a position in a list — which is what
 * makes the awkward cases fall out rather than needing special-casing:
 *
 *   • UNEQUAL SET COUNTS. Dips × 4 supersetted with push-ups × 3. Round 4 has one
 *     member in it, so the fourth ✓ on dips rests immediately instead of looking
 *     for a partner that has nothing left to do.
 *   • A MEMBER REMOVED MID-SESSION. It is gone from `entries`, so it is gone from
 *     the group, and the remaining member behaves like an exercise with no group
 *     at all. No orphaned cursor, because the cursor is computed from the entries
 *     that exist rather than remembered.
 *   • A MEMBER WHOSE SETS ARE ALL DONE. It has no unlogged set at this round
 *     index — or any index — so it is never chosen.
 *   • OUT-OF-ORDER LOGGING. Somebody logs dips 1, dips 2, then push-ups 1. Push-up
 *     round 1 is complete, so the next unlogged push-up is round 2 and the group
 *     converges rather than deadlocking.
 *
 * Pure, and over the DRAFT rather than over the store, so every one of those
 * cases is a test instead of a session in a gym.
 */

import type { DraftEntry, DraftSession } from './draft';
import type { ID } from '../types/models';

/** The members of `entry`'s superset group, in session order, including itself. */
export function supersetMembers(
  entries: readonly DraftEntry[],
  entryId: ID,
): readonly DraftEntry[] {
  const entry = entries.find((e) => e.localId === entryId);
  const group = entry?.supersetGroup;
  if (!entry || !group) return entry ? [entry] : [];
  return entries.filter((e) => e.supersetGroup === group);
}

/**
 * How many of this entry's sets are already logged — which is the round it is on.
 *
 * Completed rather than "index of the set that was just ticked", because a set
 * completed out of order still moves the count and the count is what pairs the
 * members up. Warm-ups count here, deliberately: a warm-up is still a trip to the
 * bar, and the two exercises alternate physically whether or not the set counts
 * towards anything.
 */
function loggedCount(entry: DraftEntry): number {
  return entry.sets.filter((s) => s.isCompleted).length;
}

/** The first unlogged set of an entry, or null when it has none left. */
function nextUnloggedSet(entry: DraftEntry): { entryId: ID; setId: ID } | null {
  const set = entry.sets.find((s) => !s.isCompleted);
  return set ? { entryId: entry.localId, setId: set.localId } : null;
}

export interface SupersetNext {
  entryId: ID;
  setId: ID;
}

/**
 * The next set in this superset round, or null when the round is over.
 *
 * Null is the answer for everything that is not "another member owes a set in
 * this round": an exercise with no group, a group of one, a partner that has
 * finished, an unequal tail. The caller reads null as "rest as normal", which is
 * exactly the behaviour of an exercise that was never in a superset.
 *
 * `justCompletedEntryId` is the entry whose set was just ticked. Members are
 * searched in SESSION ORDER starting after it and wrapping — so a three-way
 * superset goes A → B → C → rest → A, and a partner ABOVE the one just logged is
 * still found when the ones below it are done.
 */
export function nextInSupersetRound(
  session: DraftSession | null,
  justCompletedEntryId: ID,
): SupersetNext | null {
  if (!session) return null;

  const members = supersetMembers(session.entries, justCompletedEntryId);
  if (members.length < 2) return null;

  const selfIndex = members.findIndex((e) => e.localId === justCompletedEntryId);
  if (selfIndex === -1) return null;

  /*
   * The round the group is on: the number of sets the exercise just logged has
   * done. Its partner owes a set in this round if it has logged FEWER — one
   * behind means "you have not done yours yet".
   */
  const round = loggedCount(members[selfIndex]);

  for (let step = 1; step < members.length; step += 1) {
    const candidate = members[(selfIndex + step) % members.length];
    if (loggedCount(candidate) >= round) continue; // already done this round
    const next = nextUnloggedSet(candidate);
    if (next) return next;
  }

  return null;
}

/**
 * Does this entry share a bracket with the one above it in the session?
 *
 * Drives the rule down the left edge of a card: `green-dim`, the same vocabulary
 * the routine editor's drop target uses, because both mean "these belong
 * together" rather than "something is wrong". A group's first member opens the
 * bracket and the rest continue it, so a card only needs to know about its
 * immediate neighbour.
 */
export function supersetPosition(
  entries: readonly DraftEntry[],
  index: number,
): 'none' | 'start' | 'continue' {
  const entry = entries[index];
  if (!entry?.supersetGroup) return 'none';

  // A group of one is not a superset. The routine editor can produce one by
  // ungrouping a partner, and a bracket around a single exercise says nothing.
  const members = entries.filter((e) => e.supersetGroup === entry.supersetGroup);
  if (members.length < 2) return 'none';

  return entries[index - 1]?.supersetGroup === entry.supersetGroup ? 'continue' : 'start';
}
