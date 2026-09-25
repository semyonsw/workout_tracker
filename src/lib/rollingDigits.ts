/**
 * ROLLING DIGITS — how a number is cut into columns that can each slide.
 *
 *   "9,020"  →  [9] [,] [0] [2] [0]
 *                p5  p4c p3  p2  p1      ← keys, counted from the RIGHT
 *
 * Each digit is a clipped column of 0–9 translated to its value, so a change is
 * every column that moved sliding to its new place at once. That only reads as a
 * number changing if a column keeps its identity across renders — and the trap
 * is which end identity is counted from.
 *
 * ── WHY THE KEYS COUNT FROM THE RIGHT ─────────────────────────────────────
 *
 * Keyed from the left, `9 → 10` makes the column that held the 9 hold the 1 of
 * ten, and a brand-new column appear on the right for the 0: the ones digit
 * seems to jump to the tens and a zero pops in from nowhere. Keyed from the
 * right, the ones column goes 9 → 0 in place and the new tens digit is the one
 * that appears, on the left — which is what a number gaining a digit is.
 *
 * A non-digit keeps its position key AND its character in the key, so `1:05 →
 * 10:05` does not animate the colon as though it were a digit that changed.
 */

export type DigitCell =
  { kind: 'digit'; key: string; digit: number } | { kind: 'glyph'; key: string; char: string };

export function digitCells(value: string): DigitCell[] {
  const chars = Array.from(value);
  return chars.map((char, index) => {
    const position = `p${chars.length - index}`;
    if (char >= '0' && char <= '9') return { kind: 'digit', key: position, digit: Number(char) };
    return { kind: 'glyph', key: `${position}${char}`, char };
  });
}
