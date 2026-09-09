import { describe, expect, it } from 'vitest';

import { nudgeSet, nudgeSteps } from './setNudge';

/**
 * The ± chips, now that two screens share them.
 *
 * Every expectation here is a rule `QuickAdjust`'s header states in prose and
 * nothing could check: that the steps are the app's own and not the exercise's
 * increment, that an imperial chip is pounds, that nothing is snapped to a
 * loadable weight, and that zero is the floor.
 */

const set = (weightKg: number | null, count: number) => ({ weightKg, count });

describe('nudgeSteps', () => {
  it('is ±0.5 / ±2 for weight in kilograms, whatever the exercise increments by', () => {
    expect(nudgeSteps('weight', 'reps', 'metric')).toEqual({ fine: 0.5, coarse: 2 });
  });

  it('is the imperial pair for an imperial lifter', () => {
    const { fine, coarse } = nudgeSteps('weight', 'reps', 'imperial');
    expect(fine).toBeLessThan(coarse);
    expect(coarse).toBeGreaterThan(2); // pounds, not kilograms
  });

  it('doubles the count unit s own step for the coarse chip', () => {
    expect(nudgeSteps('count', 'reps', 'metric')).toEqual({ fine: 1, coarse: 2 });
    expect(nudgeSteps('count', 'seconds', 'metric')).toEqual({ fine: 15, coarse: 30 });
    expect(nudgeSteps('count', 'meters', 'metric')).toEqual({ fine: 25, coarse: 50 });
  });
});

describe('nudgeSet', () => {
  it('adds the delta to the count, and stops at zero', () => {
    expect(nudgeSet(set(40, 5), 'count', 1, 'metric')).toEqual({ count: 6 });
    expect(nudgeSet(set(40, 1), 'count', -2, 'metric')).toEqual({ count: 0 });
  });

  it('adds the delta to the weight without snapping it to anything', () => {
    expect(nudgeSet(set(16, 5), 'weight', 0.5, 'metric')).toEqual({ weightKg: 16.5 });
    // Float drift kept out of a 56 dp numeral, and nothing rounded to a "loadable"
    // step by a machine the app has never seen.
    expect(nudgeSet(set(0.1, 5), 'weight', 0.2, 'metric')).toEqual({ weightKg: 0.3 });
  });

  it('never goes below zero on the weight either', () => {
    expect(nudgeSet(set(1, 5), 'weight', -2, 'metric')).toEqual({ weightKg: 0 });
  });

  it('nudges an empty weight cell from zero', () => {
    expect(nudgeSet(set(null, 5), 'weight', 2, 'metric')).toEqual({ weightKg: 2 });
  });

  it('treats an imperial delta as pounds and stores kilograms', () => {
    const patch = nudgeSet(set(null, 5), 'weight', 5, 'imperial');
    // 5 lb, back in kg — about 2.27, and definitely not 5.
    expect(patch.weightKg).toBeGreaterThan(2.2);
    expect(patch.weightKg).toBeLessThan(2.3);
  });

  it('round-trips through the display unit, so a chip does not drift the value', () => {
    // +5 lb then −5 lb on an imperial row lands back where it started.
    const up = nudgeSet(set(45, 5), 'weight', 5, 'imperial');
    const down = nudgeSet(set(up.weightKg ?? 0, 5), 'weight', -5, 'imperial');
    expect(down.weightKg).toBeCloseTo(45, 2);
  });
});
