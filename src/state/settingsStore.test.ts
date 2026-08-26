import { afterEach, describe, expect, it } from 'vitest';

import {
  BODYWEIGHT_LIMITS,
  DEFAULT_SETTINGS,
  SETTING_LIMITS,
  clampBodyweightKg,
  clampPlates,
  clampSetting,
  currentSettings,
  sanitizeSettings,
  useSettings,
  type Settings,
} from './settingsStore';

afterEach(() => {
  useSettings.getState().resetToDefaults();
});

/*
 * These are all guarding one thing: a duration that reaches a timer must be a
 * usable whole number of seconds. `endsAt = Date.now() + NaN * 1000` is a
 * countdown that never ends and a pill that never leaves, and it can arrive from a
 * half-written persisted blob just as easily as from a text field.
 */

describe('clampSetting', () => {
  it('holds each setting inside its own range', () => {
    for (const key of Object.keys(SETTING_LIMITS) as (keyof typeof SETTING_LIMITS)[]) {
      const { min, max } = SETTING_LIMITS[key];
      expect(clampSetting(key, -9999)).toBe(min);
      expect(clampSetting(key, 9999)).toBe(max);
    }
  });

  it('rounds to whole seconds', () => {
    expect(clampSetting('prepareSeconds', 5.6)).toBe(6);
    expect(clampSetting('beepSeconds', 4.2)).toBe(4);
  });

  it('falls back to the default for anything unusable', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'abc', {}, []]) {
      expect(clampSetting('restSecondsBetweenSets', bad)).toBe(
        DEFAULT_SETTINGS.restSecondsBetweenSets,
      );
    }
  });
});

describe('sanitizeSettings', () => {
  it('returns a complete object from nothing at all', () => {
    for (const input of [undefined, null, {}]) {
      expect(sanitizeSettings(input)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('fills keys a persisted blob from an older build would not have', () => {
    const old = { restSecondsBetweenSets: 90 } as never;
    const result = sanitizeSettings(old);

    expect(result.restSecondsBetweenSets).toBe(90);
    expect(result.beepSeconds).toBe(DEFAULT_SETTINGS.beepSeconds);
    expect(result.adjustStepSeconds).toBe(DEFAULT_SETTINGS.adjustStepSeconds);
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('repairs a corrupt blob rather than passing it through', () => {
    const result = sanitizeSettings({
      restSecondsBetweenSets: NaN,
      prepareSeconds: -40,
      beepSeconds: 9999,
      unitSystem: 'furlongs',
    } as never);

    expect(result.restSecondsBetweenSets).toBe(DEFAULT_SETTINGS.restSecondsBetweenSets);
    expect(result.prepareSeconds).toBe(SETTING_LIMITS.prepareSeconds.min);
    expect(result.beepSeconds).toBe(SETTING_LIMITS.beepSeconds.max);
    expect(result.unitSystem).toBe('metric');
  });

  it('keeps booleans, treating only an explicit false as off', () => {
    expect(sanitizeSettings({ soundEnabled: false } as never).soundEnabled).toBe(false);
    expect(sanitizeSettings({ soundEnabled: undefined } as never).soundEnabled).toBe(true);
  });
});

describe('the store', () => {
  it("bumps by the setting's own step and stops at the ceiling", () => {
    const { bumpNumber } = useSettings.getState();
    const step = SETTING_LIMITS.restSecondsBetweenSets.step;
    const start = useSettings.getState().restSecondsBetweenSets;

    bumpNumber('restSecondsBetweenSets', step);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(start + step);

    for (let i = 0; i < 200; i += 1) bumpNumber('restSecondsBetweenSets', step);
    expect(useSettings.getState().restSecondsBetweenSets).toBe(
      SETTING_LIMITS.restSecondsBetweenSets.max,
    );
  });

  it('cannot be nudged below its floor', () => {
    const { bumpNumber } = useSettings.getState();
    for (let i = 0; i < 200; i += 1) bumpNumber('beepSeconds', -1);
    expect(useSettings.getState().beepSeconds).toBe(SETTING_LIMITS.beepSeconds.min);
  });

  it('rejects a bad direct set', () => {
    useSettings.getState().setNumber('prepareSeconds', NaN);
    expect(useSettings.getState().prepareSeconds).toBe(DEFAULT_SETTINGS.prepareSeconds);
  });

  it('currentSettings reads the live values outside React', () => {
    useSettings.getState().setNumber('restSecondsBetweenSets', 45);
    expect(currentSettings().restSecondsBetweenSets).toBe(45);
  });

  it('resets everything, not just the numbers', () => {
    const s = useSettings.getState();
    s.setNumber('beepSeconds', 1);
    s.setFlag('soundEnabled', false);
    s.setUnitSystem('imperial');

    s.resetToDefaults();
    expect(currentSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

/* ------------------------------------------------------------------ */

/**
 * The bodyweight is the one setting with no default, and that is the point.
 *
 * It is the multiplier on every bodyweight and assisted set the user has ever
 * logged, so a fallback number would quietly invent a year of volume figures.
 * `undefined` is a fact the app acts on: `effectiveLoadKg` returns null, session
 * volume leaves those sets out, and the history line drops its volume clause.
 */
describe('the bodyweight', () => {
  it('is unset by default, and stays unset through a sanitize', () => {
    expect(DEFAULT_SETTINGS.bodyweightKg).toBeUndefined();
    expect(sanitizeSettings(undefined).bodyweightKg).toBeUndefined();
    expect(sanitizeSettings({}).bodyweightKg).toBeUndefined();
  });

  it('is a declared key, so a device that upgraded gets it filled', () => {
    // Rule 2 of this store: it rehydrates TOTAL. A key missing from
    // DEFAULT_SETTINGS is a key `merge` never fills.
    expect(Object.keys(DEFAULT_SETTINGS)).toContain('bodyweightKg');
  });

  it('holds a real weight inside a believable range', () => {
    expect(clampBodyweightKg(82)).toBe(82);
    expect(clampBodyweightKg(82.4)).toBe(82.4);
    expect(clampBodyweightKg(1)).toBe(BODYWEIGHT_LIMITS.min);
    expect(clampBodyweightKg(5000)).toBe(BODYWEIGHT_LIMITS.max);
  });

  it('reads one decimal place, so a pound round-trip is not a paragraph', () => {
    expect(clampBodyweightKg(82.34567)).toBe(82.3);
  });

  it('takes a numeric string, because a text field hands one over', () => {
    expect(clampBodyweightKg('82.5')).toBe(82.5);
  });

  it('is UNSET rather than defaulted for anything unusable', () => {
    // Unlike `clampSetting`, which has a number to fall back to. Every one of
    // these would pass through `Number()` as a finite 0.
    for (const bad of [undefined, null, NaN, 0, -5, '', '  ', [], false, {}]) {
      expect(clampBodyweightKg(bad)).toBeUndefined();
    }
  });

  it('can be set and cleared through the store', () => {
    useSettings.getState().setBodyweightKg(82);
    expect(currentSettings().bodyweightKg).toBe(82);

    // Clearing is a real choice: "I would rather the app said nothing than guessed".
    useSettings.getState().setBodyweightKg(undefined);
    expect(currentSettings().bodyweightKg).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

/**
 * The gym's plates.
 *
 * A fact about the gym rather than about any one lift — which is why the bar
 * weight is on the exercise and this is here. Read only by `platesFor`, and only
 * for an exercise that declares a bar.
 */
describe('the plate list', () => {
  it('defaults to what most gyms have, heaviest first', () => {
    expect(DEFAULT_SETTINGS.availablePlatesKg).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  it('sorts and deduplicates whatever comes off disk', () => {
    // Sorted here so the greedy walk in `platesFor` always gets a canonical list,
    // and deduplicated because two 20s in the list is one entry written twice, not
    // two plates in the gym.
    expect(clampPlates([2.5, 25, 25, 10])).toEqual([25, 10, 2.5]);
  });

  it('drops entries that are not usable plates', () => {
    expect(clampPlates([20, 0, -5, NaN, 'heavy', null, 10])).toEqual([20, 10]);
  });

  it('falls back to the default rather than to an empty list', () => {
    // `[]` means every target is unreachable, so every plate label silently
    // disappears — which looks exactly like the feature being broken.
    for (const bad of [[], undefined, null, 'plates', [0, -1], {}]) {
      expect(clampPlates(bad)).toEqual(DEFAULT_SETTINGS.availablePlatesKg);
    }
  });

  it('caps a corrupt blob at a believable number of sizes', () => {
    const absurd = Array.from({ length: 500 }, (_, i) => i + 1);
    expect(clampPlates(absurd)).toHaveLength(16);
  });

  it('survives a round trip through sanitizeSettings', () => {
    expect(sanitizeSettings({ availablePlatesKg: [10, 20] }).availablePlatesKg).toEqual([20, 10]);
    expect(sanitizeSettings(undefined).availablePlatesKg).toEqual(
      DEFAULT_SETTINGS.availablePlatesKg,
    );
  });
});

/*
 * The one flag that defaults OFF, which makes `!== false` — the test every other
 * flag in `sanitizeSettings` uses — exactly the wrong one for it. A device that
 * upgraded has no such key, and reading that absence as "on" would have it rewrite
 * its whole exercise library on first launch.
 */
describe('make every exercise a rep ladder', () => {
  it('is off by default and off when the key is missing', () => {
    expect(DEFAULT_SETTINGS.ladderAllExercises).toBe(false);
    expect(sanitizeSettings({}).ladderAllExercises).toBe(false);
    expect(sanitizeSettings(undefined).ladderAllExercises).toBe(false);
  });

  it('is on only for a literal true', () => {
    expect(sanitizeSettings({ ladderAllExercises: true }).ladderAllExercises).toBe(true);
    for (const value of [1, 'true', {}, []]) {
      expect(
        sanitizeSettings({ ladderAllExercises: value } as unknown as Partial<Settings>)
          .ladderAllExercises,
      ).toBe(false);
    }
  });

  it('round-trips through the store', () => {
    useSettings.getState().setFlag('ladderAllExercises', true);
    expect(currentSettings().ladderAllExercises).toBe(true);

    useSettings.getState().setFlag('ladderAllExercises', false);
    expect(currentSettings().ladderAllExercises).toBe(false);
  });
});
