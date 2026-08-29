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

import { DEFAULT_PLATES_KG } from '../lib/plates';
import type { UnitSystem } from '../types/models';

export interface Settings {
  /**
   * The user's own bodyweight, in kilograms. UNSET BY DEFAULT, and unset means
   * unset — see `clampBodyweightKg`.
   *
   * It is here rather than derived because nothing else in the app can know it,
   * and it is optional because guessing it would be worse than not having it: it
   * is the multiplier on every bodyweight and assisted set the user has ever
   * logged, so a made-up 80 kg would quietly invent a year of volume figures. The
   * only thing that reads it is `effectiveLoadKg`.
   */
  bodyweightKg?: number;
  /**
   * Rest after a set — for every exercise that has no rest of its own.
   *
   * SETTING IT CLEARS THOSE TOO. The write goes through `state/restSync.ts`, not
   * through `setNumber` alone, because this number is a claim about every set in
   * the app and an override the user has forgotten about makes it a false one.
   * That is the bug the whole of `lib/rest.ts` is about.
   */
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
  /**
   * EVERY rep-counted exercise runs a rep ladder.
   *
   * The ladder (`lib/repLadder.ts`) is a per-exercise fact — it derives a whole
   * session's reps from one max, and the max belongs to the lifter and the
   * movement. This setting does not change that; it is a BULK EDITOR with a memory.
   * Switching it on puts an `auto` ladder on every rep-counted exercise that hasn't
   * got one and makes new ones default to having a ladder; switching it off takes
   * back exactly the ladders it gave and nothing else — see `RepLadder.auto`.
   *
   * So it is a flag about the LIBRARY, kept here rather than derived, for one
   * reason: without it, "should the exercise I create tomorrow have a ladder?" has
   * no answer, and the setting would be a button that quietly stopped applying.
   */
  ladderAllExercises: boolean;
  unitSystem: UnitSystem;
  /**
   * The plates this gym has, in kilograms.
   *
   * A fact about the gym rather than about any one lift, which is why it is here
   * and `Exercise.barWeightKg` is not: the bar you are holding changes between
   * exercises, the rack of plates behind you does not. Read only by
   * `platesFor`, and only for an exercise that declares a bar weight.
   */
  availablePlatesKg: number[];
}

export const DEFAULT_SETTINGS: Settings = {
  /*
   * Listed, and `undefined`. Rule 2 of this store is that it rehydrates TOTAL —
   * `merge` fills every key from here — so a key that is absent from this object is
   * a key a device that upgraded never gets filled. `undefined` IS the default for
   * a bodyweight: see `clampBodyweightKg` for why there is no number to fall back
   * to.
   */
  bodyweightKg: undefined,
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
  ladderAllExercises: false,
  unitSystem: 'metric',
  availablePlatesKg: [...DEFAULT_PLATES_KG],
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
 * The believable range for a human bodyweight, in kilograms.
 *
 * Wide on purpose — it is a guard against a typo and a corrupt blob, not an
 * opinion about anybody's body. 20 kg is a small child and 300 kg is past the
 * heaviest person who has ever trained; anything outside that reached the field by
 * accident.
 */
export const BODYWEIGHT_LIMITS = { min: 20, max: 300 } as const;

/**
 * A believable bodyweight in kilograms, or `undefined` for "not set".
 *
 * NOT `clampSetting`: that function's contract is that every setting has a
 * default, and this one deliberately has none. `undefined` here is a fact the app
 * acts on — `effectiveLoadKg` returns null for the three bodyweight-dependent
 * load modes, session volume leaves those sets out, and the history totals line
 * drops its volume clause rather than printing a figure that undercounts. Falling
 * back to a number would turn all of that into a silent wrong answer.
 *
 * One decimal place: a lifter knows their weight to the half-kilo and nothing
 * downstream needs more, while a raw float round-tripped through lb would print
 * 82.30000000000001 in a 40 px numeral.
 */
export function clampBodyweightKg(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const { min, max } = BODYWEIGHT_LIMITS;
  return Number(Math.min(max, Math.max(min, n)).toFixed(1));
}

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
 * A usable plate list: positive, finite, deduplicated, heaviest first.
 *
 * Sorted here rather than in `platesFor`, so the greedy walk gets a canonical list
 * however the value reached disk — and deduplicated because two 20s in the list is
 * not two 20 kg plates in the gym, it is one entry written twice. An empty or
 * unusable list falls back to the default rather than to nothing: `[]` means every
 * target is unreachable, so every plate label silently disappears, which looks
 * exactly like the feature being broken.
 *
 * Capped at sixteen entries. A real gym has seven sizes; sixteen is room to be
 * unusual, and a blob with four thousand of them is corrupt.
 */
export function clampPlates(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_PLATES_KG];
  const usable = [
    ...new Set(
      value.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 16);
  return usable.length > 0 ? usable : [...DEFAULT_PLATES_KG];
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
    // Named here like every other key, and `undefined` is a legal result: see
    // `clampBodyweightKg`. `JSON.stringify` drops it, so an unset bodyweight
    // costs no bytes on disk and reads back as unset.
    bodyweightKg: clampBodyweightKg(raw.bodyweightKg),
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
    // The one flag that defaults OFF, so `!== false` would be the wrong test: an
    // upgraded device with no such key must not wake up having rewritten its
    // whole library.
    ladderAllExercises: raw.ladderAllExercises === true,
    unitSystem: raw.unitSystem === 'imperial' ? 'imperial' : 'metric',
    availablePlatesKg: clampPlates(raw.availablePlatesKg),
  };
}

interface SettingsState extends Settings {
  setNumber: (key: NumericSetting, value: number) => void;
  /** Relative nudge, for the ± controls on the settings rows. */
  bumpNumber: (key: NumericSetting, delta: number) => void;
  setFlag: (
    key:
      | 'autoStartRest'
      | 'soundEnabled'
      | 'hapticsEnabled'
      | 'keepAwakeEnabled'
      | 'notifyOnTimerEnd'
      | 'ladderAllExercises',
    value: boolean,
  ) => void;
  setUnitSystem: (unitSystem: UnitSystem) => void;
  /**
   * Set or clear the bodyweight. `undefined` clears it, which is a real choice —
   * "I would rather the app said nothing than guessed".
   */
  setBodyweightKg: (kg: number | undefined) => void;
  /**
   * Add or remove one plate size. Removing the last one is a no-op: an empty list
   * makes every target unreachable, so every plate label silently disappears —
   * which looks exactly like the feature being broken.
   */
  togglePlate: (kg: number) => void;
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

      setBodyweightKg: (kg) => set({ bodyweightKg: clampBodyweightKg(kg) }),

      togglePlate: (kg) => {
        const current = get().availablePlatesKg;
        const next = current.includes(kg) ? current.filter((p) => p !== kg) : [...current, kg];
        // `clampPlates` falls back to the default on an empty list, which would
        // read as "removing my last plate restored all of them". Refuse instead.
        if (next.length === 0) return;
        set({ availablePlatesKg: clampPlates(next) });
      },

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
