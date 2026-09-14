/**
 * The arithmetic behind a rolling wheel: where a drag lands.
 *
 * This is here rather than inside `components/TimeWheel.tsx` because it is the
 * only part of that control that can be WRONG rather than merely ugly, and it is
 * the part nobody can check by looking at the screen — an off-by-one in the
 * direction, or a flick that overshoots the end of the column and lands on
 * `undefined`, both look like "the time picker is broken" and neither is visible
 * in a screenshot. The wheel this replaced was broken for a whole release, so
 * its replacement gets its decision pinned in a test.
 */

/**
 * Where a drag of `dy` pixels released at velocity `vy` lands, from `index`.
 *
 * Dragging DOWN moves toward EARLIER values, which is why the rows are
 * subtracted: the strip follows the finger, so pulling it down brings what was
 * above into the window, exactly like a physical wheel. Getting this backwards
 * is the single most likely mistake in the file and the reason it is stated here.
 *
 * The velocity term is what makes sixty minutes reachable. Without it the wheel
 * only ever travels as far as the finger did, and crossing a column takes a
 * dozen separate drags; with it, a flick coasts.
 *
 * Always lands inside the column, so the caller can index straight into its
 * values with no bounds check of its own.
 */
export function landing(options: {
  index: number;
  dy: number;
  vy: number;
  rowHeight: number;
  flickRows: number;
  length: number;
}): number {
  const { index, dy, vy, rowHeight, flickRows, length } = options;
  if (length <= 0) return 0;
  const travelled = finite(dy) / rowHeight + finite(vy) * flickRows;
  return clamp(Math.round(index - travelled), 0, length - 1);
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
