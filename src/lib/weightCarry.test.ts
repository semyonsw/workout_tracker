/**
 * The weight carry — the rule that a logged set sets the weight of the ones under
 * it.
 *
 * What is actually being protected here is the list of things it MUST NOT touch. A
 * carry that ran over a logged set rewrites history; one that ran over a warm-up
 * flattens the ramp `lib/warmup.ts` just built; one that ran upwards edits the plan
 * behind the user. Each of those is one line in the implementation and one `it`
 * here.
 */

import { describe, expect, it } from 'vitest';

import { carriesWeight, carryWeightForward, defaultWeightUpdate } from './weightCarry';
import type { DraftSet } from './draft';

function set(localId: string, weightKg: number | null, extra: Partial<DraftSet> = {}): DraftSet {
  return {
    localId,
    weightKg,
    count: 8,
    isWarmup: false,
    isCompleted: false,
    completedAt: null,
    isPrefilled: true,
    ...extra,
  };
}

const weighted = { requiresWeight: true } as const;

describe('carriesWeight', () => {
  it('is the requiresWeight flag, so push-ups have nothing to carry', () => {
    expect(carriesWeight({ requiresWeight: true })).toBe(true);
    expect(carriesWeight({ requiresWeight: false })).toBe(false);
  });
});

describe('carryWeightForward', () => {
  it('takes the logged weight down every set below it', () => {
    const sets = [
      set('s1', 60, { isCompleted: true }),
      set('s2', 70),
      set('s3', 70),
      set('s4', 70),
    ];

    expect(carryWeightForward(sets, 's1').map((s) => s.weightKg)).toEqual([60, 60, 60, 60]);
  });

  it('stops being a guess: carried rows lose the prefill ghost', () => {
    const sets = [set('s1', 60, { isCompleted: true }), set('s2', 70)];

    expect(carryWeightForward(sets, 's1')[1].isPrefilled).toBe(false);
  });

  it('never rewrites a set that has already been logged', () => {
    const sets = [
      set('s1', 80, { isCompleted: true }),
      set('s2', 60, { isCompleted: true }),
      set('s3', 80),
    ];

    const after = carryWeightForward(sets, 's2');
    expect(after[0].weightKg).toBe(80); // history, not a plan
    expect(after[2].weightKg).toBe(60);
  });

  it('leaves warm-ups alone — a ramp is not a plan to flatten', () => {
    const sets = [
      set('w1', 40, { isWarmup: true }),
      set('s1', 60, { isCompleted: true }),
      set('w2', 45, { isWarmup: true }),
      set('s2', 70),
    ];

    const after = carryWeightForward(sets, 's1');
    expect(after.map((s) => s.weightKg)).toEqual([40, 60, 45, 60]);
  });

  it('runs downwards only', () => {
    const sets = [set('s1', 70), set('s2', 60, { isCompleted: true }), set('s3', 70)];

    expect(carryWeightForward(sets, 's2').map((s) => s.weightKg)).toEqual([70, 60, 60]);
  });

  it('hands the same array back when nothing moved', () => {
    const sets = [
      set('s1', 60, { isCompleted: true }),
      set('s2', 60, { isPrefilled: false }),
      set('s3', 60, { isPrefilled: false }),
    ];

    expect(carryWeightForward(sets, 's1')).toBe(sets);
  });

  it('still clears the ghost on a row that already holds the right number', () => {
    // Same weight, but rendered faint as "carried over from last session". After a
    // ✓ at that weight it is today's fact, so the ink has to change even though
    // the number does not.
    const sets = [set('s1', 60, { isCompleted: true }), set('s2', 60)];

    const after = carryWeightForward(sets, 's1');
    expect(after).not.toBe(sets);
    expect(after[1].isPrefilled).toBe(false);
  });

  it('does nothing for a set with no weight in it', () => {
    const sets = [set('s1', null, { isCompleted: true }), set('s2', 70)];

    expect(carryWeightForward(sets, 's1')).toBe(sets);
  });

  it('does nothing for a set that is not in the list', () => {
    const sets = [set('s1', 60), set('s2', 70)];

    expect(carryWeightForward(sets, 'nope')).toBe(sets);
  });

  it('is a no-op on the last set', () => {
    const sets = [set('s1', 70), set('s2', 60, { isCompleted: true })];

    expect(carryWeightForward(sets, 's2')).toBe(sets);
  });
});

describe('defaultWeightUpdate', () => {
  it('is the logged weight, for a weighted movement that does not already say so', () => {
    expect(defaultWeightUpdate({ ...weighted, defaultWeightKg: 70 }, 60)).toBe(60);
  });

  it('is null when the library already holds that number', () => {
    expect(defaultWeightUpdate({ ...weighted, defaultWeightKg: 60 }, 60)).toBeNull();
  });

  it('is null for an unweighted movement, whatever it is handed', () => {
    expect(defaultWeightUpdate({ requiresWeight: false }, 60)).toBeNull();
  });

  it('refuses a blank, a zero and a NaN', () => {
    expect(defaultWeightUpdate(weighted, null)).toBeNull();
    expect(defaultWeightUpdate(weighted, 0)).toBeNull();
    expect(defaultWeightUpdate(weighted, Number.NaN)).toBeNull();
  });

  it('accepts a negative-free assisted number, since the flag is the only gate', () => {
    expect(defaultWeightUpdate({ ...weighted, defaultWeightKg: undefined }, 25)).toBe(25);
  });
});

/**
 * The warm-up case is split across two files on purpose: the ROWS are protected
 * here (`carryWeightForward` skips them), and the ✓ on a warm-up row is protected
 * in `completeSet`, which is where the weight it names would otherwise reach the
 * library. The store suite covers that half.
 */
describe('a warm-up never becomes the starting weight', () => {
  it('is not this function’s job to refuse — it is asked about a number', () => {
    // Stated so the split is deliberate rather than an omission someone closes
    // twice: handed 40 kg, this says 40 kg. The caller knows whose 40 it was.
    expect(defaultWeightUpdate({ ...weighted, defaultWeightKg: 70 }, 40)).toBe(40);
  });
});
