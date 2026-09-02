import { describe, expect, it } from 'vitest';

import { describeWarmup, loadableAtOrBelow, supportsWarmup, warmupSets } from './warmup';
import { platesFor } from './plates';
import type { Exercise } from '../types/models';

/**
 * Warm-up generation.
 *
 * The rule that matters, and the reason this feature belongs in THIS app: a
 * generated weight must be one the equipment can actually make. `SetRow`'s header
 * is explicit that a plate label is never a lie about the equipment — an
 * unreachable target renders no line at all — so a generator that produced 62.5 kg
 * in a gym whose smallest plate is 5 would be printing a plan you cannot load.
 */

const barbell: Exercise = {
  id: 'ex_squat',
  ownerId: null,
  name: 'Back squat',
  muscleGroups: ['quads'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  incrementKg: 2.5,
  barWeightKg: 20,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const machine: Exercise = { ...barbell, id: 'ex_machine', barWeightKg: undefined, incrementKg: 5 };
const pushups: Exercise = {
  ...barbell,
  id: 'ex_pushups',
  requiresWeight: false,
  loadMode: 'none',
  barWeightKg: undefined,
};
const plank: Exercise = { ...pushups, id: 'ex_plank', countUnit: 'seconds' };

const FULL = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('which exercises get a warm-up at all', () => {
  it('is weighted rep work, and nothing else', () => {
    expect(supportsWarmup(barbell)).toBe(true);
    expect(supportsWarmup(machine)).toBe(true);
    // There is no 40% of a push-up, and 40% of a 2:00 plank is a shorter plank.
    expect(supportsWarmup(pushups)).toBe(false);
    expect(supportsWarmup(plank)).toBe(false);
  });

  it('generates nothing for the shapes it does not support', () => {
    expect(warmupSets({ workingWeightKg: 100, exercise: pushups })).toEqual([]);
    expect(warmupSets({ workingWeightKg: 120, exercise: plank })).toEqual([]);
  });

  it('generates nothing without a working weight to be a fraction of', () => {
    for (const bad of [null, undefined, 0, -20, NaN]) {
      expect(warmupSets({ workingWeightKg: bad as number, exercise: barbell })).toEqual([]);
    }
  });
});

describe('a barbell lift', () => {
  it('produces the ordinary three rungs, lightest first', () => {
    const sets = warmupSets({
      workingWeightKg: 100,
      exercise: barbell,
      availablePlatesKg: FULL,
    });
    expect(sets).toEqual([
      { weightKg: 40, count: 5 },
      { weightKg: 60, count: 5 },
      { weightKg: 80, count: 3 },
    ]);
  });

  it('only ever produces weights these plates can load', () => {
    /*
     * The whole point. A gym with nothing below 5 kg cannot make 42.5, and the
     * generator must snap rather than print it — every rung is checked against the
     * same function that draws the plate label.
     */
    const coarse = [20, 10, 5];
    const sets = warmupSets({
      workingWeightKg: 107.5,
      exercise: barbell,
      availablePlatesKg: coarse,
    });
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      expect(platesFor(set.weightKg, 20, coarse)).not.toBeNull();
    }
  });

  it('rounds DOWN, never up', () => {
    // Heavier than intended is the one direction that costs you the working set.
    const sets = warmupSets({
      workingWeightKg: 107.5,
      exercise: barbell,
      availablePlatesKg: [20, 10, 5],
    });
    for (const [i, set] of sets.entries()) {
      const intended = 107.5 * [0.4, 0.6, 0.8][i];
      expect(set.weightKg).toBeLessThanOrEqual(intended);
    }
  });

  it('drops a rung that collapses onto another one', () => {
    /*
     * A light working weight on a 20 kg bar with only 20s: 40% and 60% both snap to
     * the bare bar. Two identical warm-up sets is one warm-up set and a mistake.
     */
    const sets = warmupSets({ workingWeightKg: 60, exercise: barbell, availablePlatesKg: [20] });
    const weights = sets.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it('never offers a rung at or above the working weight', () => {
    const sets = warmupSets({ workingWeightKg: 25, exercise: barbell, availablePlatesKg: FULL });
    for (const set of sets) expect(set.weightKg).toBeLessThan(25);
  });

  it('offers nothing at all when the bar already outweighs every rung', () => {
    // 80% of 22.5 kg is 18 — under the bar. There is nothing to warm up with.
    expect(
      warmupSets({ workingWeightKg: 22.5, exercise: barbell, availablePlatesKg: FULL }),
    ).toEqual([]);
  });
});

describe('a machine or a dumbbell', () => {
  it('rounds down onto the movement’s own increment instead of onto plates', () => {
    // A pin stack that steps by 5 cannot be set to 32.
    const sets = warmupSets({ workingWeightKg: 80, exercise: machine });
    expect(sets).toEqual([
      { weightKg: 30, count: 5 },
      { weightKg: 45, count: 5 },
      { weightKg: 60, count: 3 },
    ]);
  });

  it('falls back to a 2.5 step when the exercise declares no increment', () => {
    const sets = warmupSets({
      workingWeightKg: 100,
      exercise: { ...machine, incrementKg: undefined },
    });
    for (const set of sets) expect(set.weightKg % 2.5).toBeCloseTo(0, 5);
  });
});

describe('the heaviest loadable weight at or below a target', () => {
  it('is the target itself when the plates can make it', () => {
    expect(loadableAtOrBelow(100, 20, FULL)).toBe(100);
  });

  it('walks down to the nearest thing these plates can make', () => {
    expect(loadableAtOrBelow(42.5, 20, [20, 10, 5])).toBe(40);
  });

  it('is the bare bar when nothing lighter fits', () => {
    expect(loadableAtOrBelow(24, 20, [20, 10, 5])).toBe(20);
  });

  it('is null below the bar, and for inputs that are not numbers', () => {
    expect(loadableAtOrBelow(15, 20, FULL)).toBeNull();
    expect(loadableAtOrBelow(NaN, 20, FULL)).toBeNull();
    expect(loadableAtOrBelow(100, NaN, FULL)).toBeNull();
  });

  it('terminates on a plate list that cannot make anything', () => {
    // A corrupt list must not spin: the walk is bounded.
    expect(loadableAtOrBelow(1000, 20, [])).not.toBeUndefined();
  });
});

describe('the summary on the button', () => {
  it('reads like the shorthand everywhere else in the app', () => {
    const sets = warmupSets({ workingWeightKg: 100, exercise: barbell, availablePlatesKg: FULL });
    expect(describeWarmup(sets)).toBe('40 × 5 · 60 × 5 · 80 × 3');
  });

  it('is null when there is nothing to add, so the row can be hidden', () => {
    expect(describeWarmup([])).toBeNull();
  });

  it('trims a half-kilo without printing 42.50', () => {
    expect(describeWarmup([{ weightKg: 42.5, count: 5 }])).toBe('42.5 × 5');
  });
});
