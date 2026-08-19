import { describe, expect, it } from 'vitest';

import {
  WEIGHT_STEP_COARSE_KG,
  WEIGHT_STEP_FINE_KG,
  resolveIncrementKg,
  weightSteps,
} from './units';

/**
 * Every weight control in the app nudges by the same two amounts.
 *
 * The chips used to be derived from the exercise's `incrementKg`, which offered ±5
 * on a machine and made every half-kilo unreachable — so a dumbbell session could
 * not log the 0.5 kg disc that was actually on the bar. These two numbers are now
 * the app's answer everywhere: the set row's `QuickAdjust` and the create screen's
 * weight well.
 */
describe('the app-wide weight steps', () => {
  it('is 0.5 and 2 in kilograms', () => {
    expect(weightSteps('metric')).toEqual({ fine: 0.5, coarse: 2 });
    expect([WEIGHT_STEP_FINE_KG, WEIGHT_STEP_COARSE_KG]).toEqual([0.5, 2]);
  });

  it('is 1 and 5 in pounds, because 0.5 kg is not a number on any plate', () => {
    expect(weightSteps('imperial')).toEqual({ fine: 1, coarse: 5 });
  });

  it('leaves the PROGRESSION increment alone — it answers a different question', () => {
    // What the overload engine may add to a working weight is still the exercise's
    // own loadable step. A thumb nudge and a plan are not the same number.
    expect(resolveIncrementKg(5, 2.5, 'metric')).toBe(5);
    expect(resolveIncrementKg(undefined, 2.5, 'metric')).toBe(2.5);
  });
});
