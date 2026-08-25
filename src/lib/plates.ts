/**
 * What goes on the bar.
 *
 *   20 + 2×10 + 2×2.5    a 45 kg lift on a 20 kg bar
 *   20                   the bar on its own
 *   —                    62 kg, which this plate set cannot make
 *
 * Everything this needs was already known at the moment a weight cell renders:
 * the target, the exercise's bar weight, and the plates in Settings. The
 * arithmetic is the bit somebody does in their head between sets, twice, to check.
 *
 * ── IT INFORMS, IT NEVER ROUNDS ────────────────────────────────────────────
 *
 * `QuickAdjust`'s header is explicit that nothing in this app gets snapped to a
 * grid "by a machine the app has never seen", and a plate calculator is the most
 * tempting place in the codebase to break that. So an unreachable target returns
 * NULL and the label simply does not render. It does not round to 62.5, it does
 * not suggest 62.5, and it never touches the number the user typed. A missing
 * line is a question somebody can ask; a silently adjusted weight is a log that
 * disagrees with the bar.
 *
 * GREEDY DESCENDING IS CORRECT HERE, and that is worth stating because greedy
 * change-making is wrong in general. It works because a real plate set is
 * canonical: every plate divides the sum of the smaller ones plus a remainder that
 * the smaller ones can express. Taking the heaviest plate that still fits can
 * therefore never paint you into a corner that a lighter start would have avoided.
 * Give it an invented set — [25, 7] — and greedy can fail where a search would
 * succeed; the answer is still null rather than wrong, which is the failure mode
 * this function is allowed to have.
 *
 * PER SIDE, because that is how a bar is loaded and how anybody says it. The
 * total is `barWeightKg + 2 × sum(perSide)`.
 */

/** The plates most gyms have, heaviest first. Overridable in Settings. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/** An Olympic bar. The default for an exercise that says it uses one. */
export const DEFAULT_BAR_WEIGHT_KG = 20;

/**
 * Float tolerance for the remainder.
 *
 * 1.25 kg plates and a 2.5 kg step round-trip through `/ 2` and `- plate`
 * repeatedly, and 0.9999999999999996 kg left over is zero. A hundredth of a
 * kilogram is well below the lightest plate anybody owns, so nothing real is
 * accepted by mistake.
 */
const EPSILON = 0.005;

/**
 * The plates for ONE SIDE, heaviest first — or null when this set cannot make the
 * target.
 *
 * Null in four distinct cases, and the caller renders nothing in all of them:
 *  • the target is below the bar (a 15 kg "squat" on a 20 kg bar);
 *  • the target minus the bar is odd in a way no pair of plates can halve;
 *  • the plates run out before the remainder does;
 *  • the inputs are not numbers this can work with.
 *
 * An exact bar — target equals bar weight — returns an EMPTY ARRAY, which is not
 * the same as null: "the bar, nothing on it" is a real and common answer, and a
 * caller that treats `[]` as failure would hide it.
 */
export function platesFor(
  targetKg: number,
  barWeightKg: number,
  availablePlatesKg: readonly number[] = DEFAULT_PLATES_KG,
): number[] | null {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barWeightKg)) return null;
  if (barWeightKg < 0 || targetKg < barWeightKg) return null;

  // Per side, so the loop works in the units a plate is actually stamped with.
  let remaining = (targetKg - barWeightKg) / 2;
  if (remaining < EPSILON) return [];

  const plates = [...availablePlatesKg]
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => b - a);

  const used: number[] = [];
  for (const plate of plates) {
    // Not a division: a `while` here is what puts two 10s on before reaching the
    // 5, and `Math.floor(remaining / plate)` would need the same epsilon guard
    // one level less legibly.
    while (remaining - plate > -EPSILON) {
      used.push(plate);
      remaining -= plate;
      // A pair of plates cannot be loaded 40 deep. This is a corrupt-input guard,
      // not a real limit: a 500 kg target with 1.25s would otherwise loop 200
      // times before failing.
      if (used.length > 40) return null;
    }
  }

  return Math.abs(remaining) < EPSILON ? used : null;
}

/**
 * "20 + 2×10 + 2×2.5" — the micro-label under a weight cell.
 *
 * The bar leads because it is the thing already on the rack, then the pairs in the
 * order they go on. `2×` rather than "2 x" or "2 ×10": the multiplication sign is
 * the one character everybody reads as "two of these", and it is tight because the
 * label is 11 px.
 *
 * Null when there is nothing to say, so the caller can drop the row rather than
 * render an empty one.
 */
export function describePlates(
  barWeightKg: number,
  perSide: readonly number[] | null,
): string | null {
  if (perSide == null) return null;
  const bar = trim(barWeightKg);
  if (perSide.length === 0) return bar;

  // Grouped in load order, which is already heaviest-first from `platesFor`.
  const groups: { plate: number; count: number }[] = [];
  for (const plate of perSide) {
    const last = groups[groups.length - 1];
    if (last && last.plate === plate) last.count += 1;
    else groups.push({ plate, count: 1 });
  }

  return [bar, ...groups.map((g) => `${g.count * 2}×${trim(g.plate)}`)].join(' + ');
}

/** 20 rather than "20.0", 2.5 rather than "2.50". */
function trim(kg: number): string {
  return String(Number(kg.toFixed(2)));
}
