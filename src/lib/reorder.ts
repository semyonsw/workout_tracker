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

/* ------------------------------------------------------------------ */
/* Making room                                                         */
/* ------------------------------------------------------------------ */

export interface RowShiftParams {
  /** Every card, in list order — the order still on screen. */
  ids: readonly string[];
  /** The card in the air. */
  liftedId: string;
  /** Where it would land, as `dropIndex` reports it. */
  targetIndex: number;
  /** The card being asked about. */
  id: string;
}

/**
 * Which way a card has to move so the lifted one can land where it is pointing.
 *
 * ── WHY THE LIST HAS TO ANSWER THIS AT ALL ─────────────────────────────────
 *
 * The drag used to move exactly one thing: the card under the finger. Everything
 * else held still until the finger came up, at which point the list rearranged
 * itself — so the only way to find out which two exercises you were dropping
 * between was to drop and look. That is a guess, and undoing a guess is another
 * long press. The gap has to open WHILE the finger is over it.
 *
 * Returns −1 (move up a slot), 0 (stay) or +1 (move down a slot). A DIRECTION and
 * not a distance, because the distance is the lifted card's own slot height —
 * every card the lifted one passes moves by exactly the space it vacated, whatever
 * that card's own height is. `liftedSlotHeight` measures it; this decides who.
 *
 * The arithmetic, once, so it is not re-derived at each call site: a card's slot
 * today is its index shifted by one if it sits after the lifted card, and its slot
 * after the drop is the same thing measured against `targetIndex`. The difference
 * is the shift, and it is ±1 or nothing.
 */
export function rowShift(params: RowShiftParams): -1 | 0 | 1 {
  const { ids, liftedId, targetIndex, id } = params;
  if (id === liftedId) return 0;

  const from = ids.indexOf(liftedId);
  if (from === -1) return 0;

  const here = ids.indexOf(id);
  if (here === -1) return 0;

  // The card's index in the list WITHOUT the lifted one, which is the space
  // `targetIndex` is measured in.
  const without = here > from ? here - 1 : here;

  if (without >= targetIndex && without < from) return 1;
  if (without >= from && without < targetIndex) return -1;
  return 0;
}

/**
 * How far a displaced card travels: the lifted card's height plus the gap to its
 * neighbour.
 *
 * Measured rather than assumed, for the same reason `dropIndex` compares midpoints
 * — an expanded card is four times the height of a collapsed one, and a constant
 * here would open a gap of the wrong size under every drag. The gap is read off the
 * nearest measured neighbour (the separator, the card margin, whatever the list
 * actually puts between two rows) and is zero when there is nobody to measure
 * against, which is the single-card list where nothing moves anyway.
 */
export function liftedSlotHeight(
  ids: readonly string[],
  liftedId: string,
  layouts: Readonly<Record<string, CardLayout | undefined>>,
): number {
  const own = layouts[liftedId];
  if (!own) return 0;

  const from = ids.indexOf(liftedId);
  const below = layouts[ids[from + 1] ?? ''];
  if (below) return below.y - own.y;

  const above = layouts[ids[from - 1] ?? ''];
  if (above) return own.y - above.y;

  return own.height;
}

/* ------------------------------------------------------------------ */
/* Putting the rows back                                               */
/* ------------------------------------------------------------------ */

/**
 * What a row's vertical offset is, right now: the finger, a slot, or NOTHING.
 *
 * Three words for a two-branch ternary, in `lib/` and with a test on it, because
 * the third one is a bug the app shipped. A row that is only getting out of the
 * way is moved by a native spring, and a drop resets that spring's value — so
 * for a while the row with nothing lifted still CARRIED the animated offset, and
 * a reset that lost its race with the spring's last frame left the row drawn a
 * slot away from where the list had laid it out. On screen: a permanent hole in
 * the routine, and the last exercise sitting on top of `Add exercise`, in the
 * editor, in the session and in the list, until the screen was left and reopened.
 *
 * `none` is the fix and it is not an optimisation: with nothing in the air the
 * row has no transform at all, so there is no value left anywhere that could
 * still be displacing it. The reset stays as the tidy path; this is the one that
 * cannot be raced.
 */
export function rowOffsetMode(lifted: boolean, dragging: boolean): 'finger' | 'slot' | 'none' {
  if (lifted) return 'finger';
  return dragging ? 'slot' : 'none';
}
