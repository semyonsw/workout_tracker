/**
 * Settings store — every duration the app counts, in one place.
 *
 * These used to be constants scattered across `seedUser`, `lib/setTimer` and the
 * rest-timer pill. They are settings now for one reason: the correct length of a
 * rest is a fact about the lifter, not about the app, and the only person who
 * knows it is holding the phone.
 *
 * Three rules this store follows:
 *
 *  1. EVERY NUMBER HERE IS CLAMPED ON THE WAY IN (`sanitize`). A persisted blob
 *     from an older build, a half-finished write, or a NaN out of a text field
 *     must never reach the timer maths — a rest of `NaN` seconds is a deadline of
 *     `NaN`, which is a countdown that never ends and a pill that never leaves.
 *  2. IT REHYDRATES TOTAL. `merge` fills every key from `DEFAULT_SETTINGS`, so a
 *     setting added in a later version is never `undefined` on a device that
 *     upgraded rather than installed fresh.
 *  3. Nothing in here is read during a tick. Timers capture their lengths when
 *     they START, so dragging a setting mid-rest can't move a deadline the user
 *     is already watching.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UnitSystem } from '../types/models';

export interface Settings {
  /** Rest after a set, when the routine doesn't override it. */
  restSecondsBetweenSets: number;
  /** Rest after the LAST set of an exercise, before the next one. */
  restSecondsBetweenExercises: number;
  /** Get-ready countdown before a timed set's clock starts. 0 = straight to work. */
  prepareSeconds: number;
  /**
   * How many seconds of a countdown get an audible tick. The final second gets a
   * distinct, longer tone instead. 0 turns the count-in off entirely.
   */
  beepSeconds: number;
  /** The ± step on the rest pill and the set-timer pill. */
  adjustStepSeconds: number;
  /** Completing a set starts rest automatically. Off = rest is manual. */
  autoStartRest: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** Hold the screen on while a timer runs. */
  keepAwakeEnabled: boolean;
  /** Fire a local notification when a timer ends, for a phone in a pocket. */
  notifyOnTimerEnd: boolean;
  unitSystem: UnitSystem;
}

export const DEFAULT_SETTINGS: Settings = {
  restSecondsBetweenSets: 120,
  restSecondsBetweenExercises: 150,
  prepareSeconds: 5,
  beepSeconds: 5,
  adjustStepSeconds: 15,
  autoStartRest: true,
  soundEnabled: true,
  hapticsEnabled: true,
  keepAwakeEnabled: true,
  notifyOnTimerEnd: true,
  unitSystem: 'metric',
};

/**
 * Allowed range per numeric setting, and the step the settings screen nudges by.
 * The ceilings are not arbitrary: a rest longer than 15 minutes is a different
 * workout, and a get-ready longer than a minute is a nap.
 */
export const SETTING_LIMITS = {
  restSecondsBetweenSets: { min: 0, max: 900, step: 15 },
  restSecondsBetweenExercises: { min: 0, max: 900, step: 15 },
  prepareSeconds: { min: 0, max: 60, step: 1 },
  beepSeconds: { min: 0, max: 30, step: 1 },
  adjustStepSeconds: { min: 5, max: 60, step: 5 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

export type NumericSetting = keyof typeof SETTING_LIMITS;

/**
 * Whole seconds inside the setting's own range. Anything unusable → the default.
 *
 * Note what is NOT accepted: `null`, `undefined`, `[]`, `''` and `false` all pass
 * through `Number()` as a finite `0`, so a blanket `Number(value)` would turn a
 * missing rest length into "no rest" and call it valid. A number is a number; a
 * numeric string is allowed because a text field hands one over; everything else
 * is missing data and takes the default.
 */
export function clampSetting(key: NumericSetting, value: unknown): number {
  const { min, max } = SETTING_LIMITS[key];

  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  if (!Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * A complete, in-range `Settings` from anything at all — including `undefined`.
 *
 * Every field is named explicitly rather than spread through. This function is
 * also `partialize`, so it is handed the LIVE STORE STATE, which carries the
 * action functions alongside the values: a spread would put `setNumber` and
 * friends into the object written to disk and returned by `currentSettings`.
 * Listing the keys keeps the result exactly `Settings`, and makes a field added to
 * the interface without being sanitized a type error rather than an unchecked
 * number reaching a deadline.
 */
export function sanitizeSettings(input: Partial<Settings> | undefined | null): Settings {
  const raw: Settings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    restSecondsBetweenSets: clampSetting('restSecondsBetweenSets', raw.restSecondsBetweenSets),
    restSecondsBetweenExercises: clampSetting(
      'restSecondsBetweenExercises',
      raw.restSecondsBetweenExercises,
    ),
    prepareSeconds: clampSetting('prepareSeconds', raw.prepareSeconds),
    beepSeconds: clampSetting('beepSeconds', raw.beepSeconds),
    adjustStepSeconds: clampSetting('adjustStepSeconds', raw.adjustStepSeconds),
    autoStartRest: raw.autoStartRest !== false,
    soundEnabled: raw.soundEnabled !== false,
    hapticsEnabled: raw.hapticsEnabled !== false,
    keepAwakeEnabled: raw.keepAwakeEnabled !== false,
    notifyOnTimerEnd: raw.notifyOnTimerEnd !== false,
    unitSystem: raw.unitSystem === 'imperial' ? 'imperial' : 'metric',
  };
}

interface SettingsState extends Settings {
  setNumber: (key: NumericSetting, value: number) => void;
  /** Relative nudge, for the ± controls on the settings rows. */
  bumpNumber: (key: NumericSetting, delta: number) => void;
  setFlag: (
    key:
      'autoStartRest' | 'soundEnabled' | 'hapticsEnabled' | 'keepAwakeEnabled' | 'notifyOnTimerEnd',
    value: boolean,
  ) => void;
  setUnitSystem: (unitSystem: UnitSystem) => void;
  resetToDefaults: () => void;
  /**
   * Replace every setting from a restored backup.
   *
   * Takes `unknown` and leans on `sanitizeSettings`, which is total: a backup
   * missing a field added in a later build gets that field's default rather than an
   * `undefined` that would reach a deadline as `NaN`.
   */
  importSettings: (raw: unknown) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setNumber: (key, value) => set({ [key]: clampSetting(key, value) } as Partial<Settings>),

      bumpNumber: (key, delta) =>
        set({ [key]: clampSetting(key, get()[key] + delta) } as Partial<Settings>),

      setFlag: (key, value) => set({ [key]: value } as Partial<Settings>),

      setUnitSystem: (unitSystem) => set({ unitSystem }),

      resetToDefaults: () => set({ ...DEFAULT_SETTINGS }),

      importSettings: (raw) =>
        set({ ...sanitizeSettings(raw as Partial<Settings> | undefined | null) }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      /*
       * Actions are recreated by the initializer on every launch; only the values
       * are worth writing to disk, and writing the functions would break the
       * JSON round-trip.
       */
      partialize: (state) => sanitizeSettings(state),
      /*
       * Rehydration is where a bad blob would otherwise become a NaN deadline.
       * Everything from disk goes through `sanitizeSettings` first, and the
       * actions come from the freshly-built store rather than from storage.
       */
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeSettings(persisted as Partial<Settings> | undefined),
      }),
    },
  ),
);

/**
 * The settings a session needs, as a plain object.
 *
 * Read OUTSIDE React (`useSettings.getState()`) on purpose: this is called from
 * store actions and from timer callbacks, not from render, and subscribing there
 * would tie a lifter's rest length to a component's lifecycle.
 */
export function currentSettings(): Settings {
  return sanitizeSettings(useSettings.getState());
}
