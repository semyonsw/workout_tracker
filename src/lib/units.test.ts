import { describe, expect, it } from 'vitest';

import {
  WEIGHT_STEP_COARSE_KG,
  WEIGHT_STEP_FINE_KG,
  effectiveLoadKg,
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

/* ------------------------------------------------------------------ */

/**
 * The load a set actually put on the body, per load mode.
 *
 * This is the function session volume was missing. Three of the four modes need a
 * bodyweight, and the app is only ever told one if the user types it — so the
 * important assertions here are the null ones: what the app does when it has not
 * been told.
 */
describe('effectiveLoadKg', () => {
  it('is the number itself for external work', () => {
    // A bar is a bar with or without a bodyweight on file.
    expect(effectiveLoadKg(80, 'external', 82)).toBe(80);
    expect(effectiveLoadKg(80, 'external', undefined)).toBe(80);
  });

  it('adds the belt to the body', () => {
    expect(effectiveLoadKg(40, 'added_bodyweight', 82)).toBe(122);
  });

  it('SUBTRACTS the assistance, which is the case that used to be inverted', () => {
    // A −20 kg assisted pull-up is a 62 kg set for an 82 kg lifter. Volume used to
    // ADD it, so taking more help scored higher — the opposite of the truth.
    expect(effectiveLoadKg(20, 'assisted', 82)).toBe(62);
    expect(effectiveLoadKg(40, 'assisted', 82)).toBe(42);
    // More help is always a lighter set, never a heavier one.
    expect(effectiveLoadKg(40, 'assisted', 82)).toBeLessThan(
      effectiveLoadKg(20, 'assisted', 82) as number,
    );
  });

  it('never goes negative, however much help was taken', () => {
    // A machine cannot take more off you than you weigh.
    expect(effectiveLoadKg(200, 'assisted', 82)).toBe(0);
  });

  it('is the bare bodyweight for a push-up', () => {
    expect(effectiveLoadKg(null, 'none', 82)).toBe(82);
    // `none` ignores whatever is in the weight cell — there is no weight input.
    expect(effectiveLoadKg(5, 'none', 82)).toBe(82);
  });

  it('reads a missing belt and a missing pin as the bare bodyweight', () => {
    expect(effectiveLoadKg(null, 'added_bodyweight', 82)).toBe(82);
    expect(effectiveLoadKg(null, 'assisted', 82)).toBe(82);
  });

  it('returns null for all three bodyweight modes when no bodyweight is set', () => {
    // The whole point. Null is "I cannot say", and every caller leaves the set out
    // rather than guessing — see `sessionVolume`.
    for (const mode of ['added_bodyweight', 'assisted', 'none'] as const) {
      expect(effectiveLoadKg(40, mode, undefined)).toBeNull();
      expect(effectiveLoadKg(40, mode, null)).toBeNull();
      expect(effectiveLoadKg(40, mode, 0)).toBeNull();
      expect(effectiveLoadKg(40, mode, NaN)).toBeNull();
    }
  });

  it('leaves an external set with no weight on it unweighable too', () => {
    expect(effectiveLoadKg(null, 'external', 82)).toBeNull();
  });
});
