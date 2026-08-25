import { describe, expect, it } from 'vitest';

import { DEFAULT_BAR_WEIGHT_KG, DEFAULT_PLATES_KG, describePlates, platesFor } from './plates';

/**
 * What goes on the bar.
 *
 * The one rule that matters more than the arithmetic: it INFORMS AND NEVER
 * ROUNDS. `QuickAdjust`'s header says nothing in this app is snapped to a grid by
 * a machine it has never seen, and a plate calculator is the most tempting place
 * in the codebase to break that — so an unreachable target is null, not the
 * nearest loadable weight.
 */

const BAR = DEFAULT_BAR_WEIGHT_KG;
const plates = (target: number, bar = BAR, set: readonly number[] = DEFAULT_PLATES_KG) =>
  platesFor(target, bar, set);

describe('platesFor', () => {
  it('loads an exact target, heaviest first', () => {
    // 45 = 20 + 2×(10 + 2.5)
    expect(plates(45)).toEqual([10, 2.5]);
    // 100 = 20 + 2×(25 + 15)
    expect(plates(100)).toEqual([25, 15]);
    // 140 = 20 + 2×(25 + 25 + 10)
    expect(plates(140)).toEqual([25, 25, 10]);
  });

  it('returns an EMPTY list for the bare bar, which is not the same as null', () => {
    // "The bar, nothing on it" is a real and common answer. A caller treating []
    // as failure would hide it.
    expect(plates(BAR)).toEqual([]);
    expect(plates(BAR)).not.toBeNull();
  });

  it('is null below the bar', () => {
    // A 15 kg "squat" on a 20 kg bar is not a loading question.
    expect(plates(15)).toBeNull();
    expect(plates(0)).toBeNull();
  });

  it('is null for a target this plate set cannot make', () => {
    // 62 needs 21 a side, and nothing here adds to 21.
    expect(plates(62)).toBeNull();
    // ...and it does NOT quietly answer 62.5.
    expect(plates(62.5)).toEqual([20, 1.25]);
  });

  it('never rounds — a near miss is a missing line, not a nearest weight', () => {
    for (const target of [61, 62, 63, 64]) {
      const result = plates(target);
      if (result == null) continue;
      const total = BAR + 2 * result.reduce((n, p) => n + p, 0);
      // Whatever it returns is EXACTLY the target, or it returns nothing.
      expect(total).toBeCloseTo(target, 5);
    }
  });

  it('survives the float drift that 1.25 kg plates produce', () => {
    // 1.25 halved and subtracted repeatedly is where a naive remainder check
    // leaves 0.9999999999999996 kg and calls the target unreachable.
    expect(plates(22.5)).toEqual([1.25]);
    expect(plates(25)).toEqual([2.5]);
    expect(plates(27.5)).toEqual([2.5, 1.25]);
    expect(plates(122.5)).toEqual([25, 25, 1.25]);
  });

  it('works off a bar that is not 20', () => {
    // A women's bar, and a trap bar somebody weighed.
    expect(platesFor(55, 15)).toEqual([20]);
    expect(platesFor(45, 25)).toEqual([10]);
  });

  it('uses only the plates it is given', () => {
    // A gym with nothing lighter than 5s cannot make 65 from a 20 bar... it can:
    // 20 + 2×(20 + 2.5) needs a 2.5. Without one, 62.5 is unreachable.
    expect(platesFor(62.5, 20, [20, 10, 5])).toBeNull();
    expect(platesFor(60, 20, [20, 10, 5])).toEqual([20]);
    expect(platesFor(70, 20, [20, 10, 5])).toEqual([20, 5]);
  });

  it('is null rather than wrong on an invented, non-canonical plate set', () => {
    // Greedy descending is correct for a real plate set because every plate can be
    // expressed by the smaller ones plus a remainder they can reach. Give it
    // [25, 7] and greedy paints itself into a corner — and the answer is null,
    // which is the failure mode this function is allowed to have.
    expect(platesFor(20 + 2 * 28, 20, [25, 7])).toBeNull();
    // The same set still handles what it genuinely can.
    expect(platesFor(20 + 2 * 32, 20, [25, 7])).toEqual([25, 7]);
  });

  it('refuses nonsense inputs instead of looping', () => {
    expect(platesFor(NaN, 20)).toBeNull();
    expect(platesFor(100, NaN)).toBeNull();
    expect(platesFor(100, -20)).toBeNull();
    // 5000 kg of 1.25s would be 2000 plates a side.
    expect(platesFor(5000, 20, [1.25])).toBeNull();
  });

  it('ignores unusable entries in the plate list', () => {
    expect(platesFor(60, 20, [20, 0, -5, NaN])).toEqual([20]);
  });

  it('does not care what order the plate list is in', () => {
    // Sorted on the way in by `clampPlates`, and again here, so a hand-edited
    // backup cannot make the greedy walk pick up a 1.25 before a 25.
    expect(platesFor(45, 20, [2.5, 25, 10, 15, 5, 20, 1.25])).toEqual([10, 2.5]);
  });
});

/* ------------------------------------------------------------------ */

describe('describePlates', () => {
  it('leads with the bar, then the pairs in load order', () => {
    expect(describePlates(20, [10, 2.5])).toBe('20 + 2×10 + 2×2.5');
  });

  it('counts a pair per plate a side', () => {
    // Two 25s a side is four plates on the bar.
    expect(describePlates(20, [25, 25, 10])).toBe('20 + 4×25 + 2×10');
  });

  it('is just the bar when there is nothing on it', () => {
    expect(describePlates(20, [])).toBe('20');
  });

  it('is null when there is nothing to say, so the row can disappear', () => {
    expect(describePlates(20, null)).toBeNull();
  });

  it('trims a whole number and keeps a half', () => {
    expect(describePlates(20, [2.5])).toBe('20 + 2×2.5');
    expect(describePlates(15, [20])).toBe('15 + 2×20');
  });
});
