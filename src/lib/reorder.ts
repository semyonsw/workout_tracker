/**
 * Where a dragged card lands.
 *
 * The trickiest arithmetic in the app, and it used to live inside
 * `ActiveWorkoutScreen` — whose own header calls the reorder the genuinely awkward
 * part. `vitest.config.ts` says decisions live in `lib/`, and this is a decision
 * with four edge cases and no way to reach any of them from a test that has to
 * render a screen.
 *
 * ── MIDPOINTS, NEVER A ROW HEIGHT ──────────────────────────────────────────
 *
 * The expanded card is four times the height of a collapsed one — a header, a
 * nudge, eighteen set rows and a footer against one name and one line of
 * shorthand. So anything that divides a travelled distance by a constant row
 * height lands on the wrong exercise, and lands further wrong the further you
 * drag. The only honest measure is "how many cards has the lifted card's own
 * CENTRE passed", which is a comparison against each card's midpoint and needs no
 * assumption about any card's size.
 *
 * ── THE INDEX IT RETURNS ───────────────────────────────────────────────────
 *
 * A position in the list WITHOUT the lifted card — which is what a drop position on
 * screen actually is, and what `moveEntry` and the routine editor's `drop` both
 * already take. That is why there is no off-by-one correction anywhere: dropping a
 * card back where it came from returns its own index and is a no-op.
 *
 * ── UNMEASURED CARDS ARE SKIPPED, NOT TREATED AS ZERO ──────────────────────
 *
 * `onLayout` has not run for a card that has never been on screen. Reading a
 * missing layout as `y = 0` would put every unmeasured card at the top of the list
 * and drag every drop target up with it; skipping it means the drop index is
 * computed from what is actually known, which is also what the user can see.
 *
 * Pure, and over layouts and a finger offset rather than over a component — so the
 * expanded-card case, the ends of the list, the unmeasured card and the
 * single-card list are four assertions instead of four sessions in a gym.
 */

/** Where one card sits and how tall it is, as `onLayout` reports it. */
export interface CardLayout {
  y: number;
  height: number;
}

export interface DropIndexParams {
  /** Every card, in list order. */
  ids: readonly string[];
  /** The card being dragged. */
  liftedId: string;
  /** Layouts captured on layout, keyed by id. Missing entries are unmeasured. */
  layouts: Readonly<Record<string, CardLayout | undefined>>;
  /** How far the finger has travelled since the lift, in the same units. */
  dy: number;
  /**
   * Where the card would land if nothing can be computed — the index it was
   * lifted from, so an unmeasured drag is a no-op rather than a jump to the top.
   */
  fallbackIndex: number;
}

/**
 * The index the lifted card should be inserted at, in the list without it.
 *
 * Counts the cards whose midpoint the lifted card's own midpoint has passed. The
 * lifted card is excluded from that count — it is the thing being placed, not a
 * thing to place it relative to.
 */
export function dropIndex(params: DropIndexParams): number {
  const { ids, liftedId, layouts, dy, fallbackIndex } = params;

  const own = layouts[liftedId];
  // The card being dragged has no measured position, so there is no centre to
  // compare with. Leaving it where it was is the only answer that cannot be wrong.
  if (!own) return fallbackIndex;

  const center = own.y + own.height / 2 + dy;

  let index = 0;
  for (const id of ids) {
    if (id === liftedId) continue;
    const layout = layouts[id];
    if (!layout) continue; // unmeasured — see the file header
    if (layout.y + layout.height / 2 < center) index += 1;
  }
  return index;
}

/**
 * The list with `id` moved to `toIndex`, closing the gap it left behind.
 *
 * ── THE OTHER HALF OF THE REORDER, AND THE HALF BOTH SCREENS SHARE ─────────
 *
 * `dropIndex` above does not fit the routine editor: that screen's reorder has no
 * drag geometry at all — a row is lifted and then a TAP on another row chooses
 * where it lands, so there is no finger offset and no midpoint to compare. The
 * SPLICE is the part the two have in common, and it was written out twice: once in
 * `activeWorkoutStore.moveEntry` and once in `RoutineEditorScreen.drop`.
 *
 * `toIndex` is a position in the list WITHOUT the moved item, which is what a drop
 * position on screen is — so no off-by-one correction is needed and dropping
 * something back where it came from is a no-op. Out-of-range indices are clamped
 * rather than refused: a drag that ends past the last card means the last position,
 * which is what the finger said.
 *
 * Returns a new array. An id that is not in the list comes back as a copy of the
 * list, because "move a thing that is not here" has no other sensible answer.
 */
export function moveToIndex<T>(
  items: readonly T[],
  isMatch: (item: T) => boolean,
  toIndex: number,
): T[] {
  const from = items.findIndex(isMatch);
  if (from === -1) return [...items];

  const without = items.filter((_, i) => i !== from);
  const target = Math.min(Math.max(0, Math.round(toIndex)), without.length);
  return [...without.slice(0, target), items[from], ...without.slice(target)];
}

/**
 * The index a card sits at now, for the moment it is lifted.
 *
 * Trivial, and here rather than inlined because it is the other half of the same
 * contract: `dropIndex`'s `fallbackIndex` and a lift's starting target are the same
 * number, and a card that is somehow not in the list starts at 0 rather than at
 * −1, which would be an insert position no splice can honour.
 */
export function liftIndex(ids: readonly string[], entryId: string): number {
  return Math.max(0, ids.indexOf(entryId));
}
