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

import { AUTO_BACKUP_INTERVAL_LIMITS, rotateBackups } from '../lib/autoBackup';
import {
  BODYWEIGHT_LIMITS,
  clampBodyweightKg,
  recordBodyweight,
  sanitizeBodyweightLog,
  type BodyweightEntry,
} from '../lib/bodyweightLog';
import { DEFAULT_PLATES_KG } from '../lib/plates';
import {
  activeGymPlates,
  addGym as addGymTo,
  clampPlates,
  DEFAULT_GYM_ID,
  gymsFromLegacyPlates,
  removeGym as removeGymFrom,
  resolveActiveGymId,
  sanitizeGyms,
  toggleGymPlate,
  updateGym,
  type Gym,
} from '../lib/gyms';
import type { MuscleCluster, UnitSystem } from '../types/models';

/*
 * Re-exported, because they used to live here and the range is still a settings
 * concern from the outside — `lib/bodyweightLog.ts` owns them now so that the
 * series and the scalar cannot disagree about what a believable weight is, and a
 * store importing a lib is the direction that does not cycle.
 */
export { BODYWEIGHT_LIMITS, clampBodyweightKg };

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
   * EVERY bodyweight the user has typed, newest first — and the reason
   * `bodyweightKg` above is the HEAD of this list rather than a second opinion.
   *
   * `effectiveLoadKg` multiplies a bodyweight into every pull-up, dip and assisted
   * set in the log, and the right multiplier is different for every session. One
   * scalar answered that question with today's number, which repriced old sessions
   * on edit and hid real progress. `lib/bodyweightLog.ts` has the whole argument.
   *
   * The scalar stays because everything that only wants "what do I weigh now" reads
   * it, and `setBodyweightKg` writes both — so the two cannot drift.
   */
  bodyweightLog: BodyweightEntry[];
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
   * THE GYMS, each with the plates on its rack.
   *
   * A fact about the room rather than about any one lift, which is why it is here
   * and `Exercise.barWeightKg` is not: the bar you are holding changes between
   * exercises, the rack of plates behind you does not — it changes when you change
   * buildings. This was a single `availablePlatesKg` list, which is right until you
   * train anywhere else; `lib/gyms.ts` has the argument and the migration.
   *
   * Read through `activeGymPlates`, never directly, so everything below this line
   * still sees one plate list.
   */
  gyms: Gym[];
  activeGymId: string;
  /**
   * WEEKLY SET TARGETS PER MUSCLE CLUSTER, and every one of them is optional.
   *
   * `lib/balance.ts` counts sets per cluster and refuses to score them — "a count,
   * not a score" — and that refusal is right about someone else's model of your
   * recovery. It is not right about a number YOU chose: a target you typed is a
   * fact about your plan, and comparing this week against it is arithmetic you
   * would otherwise do in your head.
   *
   * So: absent means no target and the count renders exactly as it always has. A
   * number means the row says `14 / 16` and nothing more — no colour, no warning,
   * no ratio the app invented.
   */
  weeklySetTargets: Partial<Record<MuscleCluster, number>>;

  /* --- automatic backup: see `lib/autoBackup.ts` --------------------- */
  /**
   * Write a backup without being asked.
   *
   * ON by default, and inert until a folder is granted — see `autoBackupFolderUri`.
   * The default is on because the alternative default is a year of training
   * protected by the user remembering a menu item.
   */
  autoBackupEnabled: boolean;
  /**
   * The SAF tree URI the copies are written into, or absent.
   *
   * Absent is the normal state on a fresh install and it means automatic backup
   * cannot run: Android's only writable-and-durable destination is a folder the
   * user grants, and the app's own sandbox dies with the app — which is one of the
   * events a backup exists to survive.
   */
  autoBackupFolderUri?: string;
  /** How often, in days. */
  autoBackupIntervalDays: number;
  /** When the last backup — automatic or manual — actually landed. */
  lastBackupAt?: string;
  /**
   * Write a finished workout to Health Connect, so the rest of the phone knows.
   *
   * OFF by default, and it stays off until the user turns it on and grants the
   * permission — sending training data to another app is not something to opt
   * somebody into. Write-only, and the record carries a start, an end and a title
   * and nothing else; `lib/healthConnect.ts` has the argument.
   */
  shareToHealthConnect: boolean;
  /**
   * The copies written so far, newest first, so the oldest can be deleted.
   *
   * SAF cannot overwrite a file, so without this an unattended weekly write leaves
   * fifty files a year in the user's Download folder. `rotateBackups` decides which
   * ones go.
   */
  autoBackupUris: string[];
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
  bodyweightLog: [],
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
  gyms: gymsFromLegacyPlates(DEFAULT_PLATES_KG),
  activeGymId: DEFAULT_GYM_ID,
  weeklySetTargets: {},
  autoBackupEnabled: true,
  autoBackupFolderUri: undefined,
  autoBackupIntervalDays: 7,
  shareToHealthConnect: false,
  lastBackupAt: undefined,
  autoBackupUris: [],
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
  autoBackupIntervalDays: AUTO_BACKUP_INTERVAL_LIMITS,
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

/*
 * `clampPlates` moved to `lib/gyms.ts` with the rest of the plate concern, and is
 * re-exported because it is still what the settings screen validates a plate row
 * with. One list per gym now; the sanitizer is unchanged.
 */
export { clampPlates };

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

  /*
   * THE GYM MIGRATION. A blob written by 1.0.x has `availablePlatesKg` and no
   * `gyms`, and that list is the plates of the one place the user trains — so it
   * becomes their first gym, named generically, and the plate labels on the day
   * after the update are the labels on the day before it. A blob that has both is
   * a device that has already migrated, and the legacy key is ignored.
   */
  const legacy = (input ?? {}) as { availablePlatesKg?: unknown; gyms?: unknown };
  const gyms =
    legacy.gyms == null && legacy.availablePlatesKg != null
      ? gymsFromLegacyPlates(legacy.availablePlatesKg)
      : sanitizeGyms(raw.gyms);

  /*
   * The bodyweight log and the scalar are one fact in two shapes, and the LOG wins:
   * a scalar with no matching entry is a device upgrading from a build that only
   * had the scalar, so it is seeded as the first reading. Without that seeding, the
   * first thing the new bodyweight chart would show a long-time user is an empty
   * screen, and `bodyweightAt` would return null for their whole history.
   */
  const scalar = clampBodyweightKg(raw.bodyweightKg);
  const storedLog = sanitizeBodyweightLog(raw.bodyweightLog);
  const bodyweightLog =
    storedLog.length === 0 && scalar != null ? recordBodyweight([], scalar) : storedLog;

  return {
    // Named here like every other key, and `undefined` is a legal result: see
    // `clampBodyweightKg`. `JSON.stringify` drops it, so an unset bodyweight
    // costs no bytes on disk and reads back as unset.
    bodyweightKg: scalar,
    bodyweightLog,
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
    gyms,
    // Resolved rather than trusted: deleting the active gym leaves a dangling
    // pointer, and a plate label that goes blank reads as a broken feature.
    activeGymId: resolveActiveGymId(gyms, raw.activeGymId),
    weeklySetTargets: sanitizeWeeklyTargets(raw.weeklySetTargets),
    autoBackupEnabled: raw.autoBackupEnabled !== false,
    autoBackupFolderUri: usableFolderUri(raw.autoBackupFolderUri),
    autoBackupIntervalDays: clampSetting('autoBackupIntervalDays', raw.autoBackupIntervalDays),
    // `=== true`, not `!== false`: this one defaults OFF, so a device upgrading
    // from a build without the key must not wake up sharing its training data.
    shareToHealthConnect: raw.shareToHealthConnect === true,
    lastBackupAt: usableInstant(raw.lastBackupAt),
    autoBackupUris: usableUriList(raw.autoBackupUris),
  };
}

/**
 * Weekly per-cluster targets: a whole number of sets, or the key is absent.
 *
 * Absent rather than zero, because zero is a real target ("I am not training legs
 * this block") and "no opinion" has to be distinguishable from it. Capped at 60 —
 * past any published maximum recoverable volume, so a number above it is a typo.
 */
export const WEEKLY_TARGET_LIMITS = { min: 0, max: 60, step: 1 } as const;

function sanitizeWeeklyTargets(value: unknown): Partial<Record<MuscleCluster, number>> {
  if (typeof value !== 'object' || value == null) return {};
  const out: Partial<Record<MuscleCluster, number>> = {};
  for (const cluster of CLUSTER_KEYS) {
    const raw = (value as Record<string, unknown>)[cluster];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const { min, max } = WEEKLY_TARGET_LIMITS;
    out[cluster] = Math.min(max, Math.max(min, Math.round(raw)));
  }
  return out;
}

/**
 * The clusters, listed here rather than imported from `lib/muscles.ts`.
 *
 * `muscles.ts` imports nothing and is the compile-time proof that the muscle→cluster
 * mapping is total; this store already imports two libs and does not need a third
 * for five string literals. The `satisfies` is what keeps the two in step: a new
 * cluster added to the type stops compiling here.
 */
const CLUSTER_KEYS = [
  'push',
  'pull',
  'legs',
  'core',
  'cardio',
] as const satisfies readonly MuscleCluster[];

/** A folder URI that could plausibly have been granted, or undefined. */
function usableFolderUri(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A parseable instant, or undefined — a `NaN` date would make every backup due. */
function usableInstant(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** The rotation list: strings only, and capped so a corrupt blob cannot grow. */
function usableUriList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((uri): uri is string => typeof uri === 'string' && uri !== '').slice(0, 16);
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
   * Add or remove one plate size ON THE ACTIVE GYM. Removing the last one is a
   * no-op: an empty list makes every target unreachable, so every plate label
   * silently disappears — which looks exactly like the feature being broken.
   */
  togglePlate: (kg: number) => void;

  /* --- gyms: see `lib/gyms.ts` --------------------------------------- */
  /** Switch which gym's plates are in force. */
  setActiveGym: (gymId: string) => void;
  /** A new gym, seeded from the active one's plates. Capped at `MAX_GYMS`. */
  addGym: (name: string) => void;
  renameGym: (gymId: string, name: string) => void;
  /** Remove one. The last gym cannot go — there is always somewhere you train. */
  removeGym: (gymId: string) => void;

  /** A weekly set target for one cluster. `undefined` clears it. */
  setWeeklyTarget: (cluster: MuscleCluster, sets: number | undefined) => void;

  /* --- automatic backup: see `lib/autoBackup.ts` --------------------- */
  setAutoBackupEnabled: (enabled: boolean) => void;
  /** Share finished workouts with Health Connect. Off unless granted. */
  setShareToHealthConnect: (enabled: boolean) => void;
  /** Remember the granted folder. `undefined` forgets it, which turns backup off. */
  setAutoBackupFolder: (folderUri: string | undefined) => void;
  /**
   * Record that a backup landed, and rotate the copies.
   *
   * Called by BOTH paths — the automatic write and the manual `Export data` — so
   * "last backup" means the last time the log actually left the phone, whoever
   * asked for it. The manual export passes no URI because it goes wherever the user
   * pointed the picker, which is not a folder this app rotates.
   */
  recordBackup: (at: string, uri?: string) => { drop: string[] };

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

      /*
       * BOTH, always. The scalar is what "what do I weigh now" reads and the log is
       * what "what did I weigh in June" reads; writing one without the other is how
       * two homes for one number becomes one of them being stale (`Settings.bodyweightKg`).
       * Clearing it leaves the log alone — "stop guessing my load" is not "forget
       * every weigh-in I ever recorded", and the log is what a restored history needs.
       */
      setBodyweightKg: (kg) => {
        const clamped = clampBodyweightKg(kg);
        set({
          bodyweightKg: clamped,
          bodyweightLog:
            clamped == null ? get().bodyweightLog : recordBodyweight(get().bodyweightLog, clamped),
        });
      },

      togglePlate: (kg) => {
        const { gyms, activeGymId } = get();
        set({ gyms: toggleGymPlate(gyms, resolveActiveGymId(gyms, activeGymId), kg) });
      },

      setActiveGym: (gymId) => set({ activeGymId: resolveActiveGymId(get().gyms, gymId) }),

      addGym: (name) => {
        const { gyms, activeGymId } = get();
        const id = `gym_${Date.now().toString(36)}`;
        const next = addGymTo(gyms, name, activeGymId, id);
        // At the cap nothing was added, so nothing becomes active either.
        set({ gyms: next, activeGymId: next.some((g) => g.id === id) ? id : activeGymId });
      },

      renameGym: (gymId, name) => set({ gyms: updateGym(get().gyms, gymId, { name }) }),

      removeGym: (gymId) => {
        const gyms = removeGymFrom(get().gyms, gymId);
        set({ gyms, activeGymId: resolveActiveGymId(gyms, get().activeGymId) });
      },

      setWeeklyTarget: (cluster, sets) => {
        const current = { ...get().weeklySetTargets };
        if (sets == null) delete current[cluster];
        else current[cluster] = sets;
        set({ weeklySetTargets: sanitizeWeeklyTargets(current) });
      },

      setAutoBackupEnabled: (autoBackupEnabled) => set({ autoBackupEnabled }),

      setShareToHealthConnect: (shareToHealthConnect) => set({ shareToHealthConnect }),

      setAutoBackupFolder: (folderUri) =>
        set({
          autoBackupFolderUri: usableFolderUri(folderUri),
          // The rotation list belongs to a folder. Pointing somewhere else makes
          // those URIs somebody else's files, and deleting them would be wrong.
          autoBackupUris: [],
        }),

      recordBackup: (at, uri) => {
        const stamp = usableInstant(at) ?? new Date().toISOString();
        if (!uri) {
          set({ lastBackupAt: stamp });
          return { drop: [] };
        }
        const { keep, drop } = rotateBackups(get().autoBackupUris, uri);
        set({ lastBackupAt: stamp, autoBackupUris: keep });
        return { drop };
      },

      resetToDefaults: () =>
        /*
         * The gyms, the bodyweight log and the granted folder are NOT settings in
         * the sense this button means. "Reset settings to defaults" is about the
         * durations and the toggles; it is not about deleting the plate lists of
         * three buildings, a year of weigh-ins, or a folder permission the user
         * would then have to grant again. `Delete all workout history` is the
         * button that destroys data, and it says so.
         */
        set({
          ...DEFAULT_SETTINGS,
          bodyweightKg: get().bodyweightKg,
          bodyweightLog: get().bodyweightLog,
          gyms: get().gyms,
          activeGymId: get().activeGymId,
          autoBackupFolderUri: get().autoBackupFolderUri,
          lastBackupAt: get().lastBackupAt,
          autoBackupUris: get().autoBackupUris,
        }),

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

/**
 * The plates in force, wherever the user says they are training.
 *
 * THE one read path for plates. Everything that used to reach for
 * `Settings.availablePlatesKg` calls this instead, which is what keeps gyms
 * invisible below this line: `platesFor` still receives one list.
 *
 * A plain function over a settings object rather than a hook, so the two callers
 * that are not components (`currentSettings` consumers) can use it too. Components
 * select `gyms` and `activeGymId` and call it — both are stable references out of
 * the store, which is what keeps `SetRow`'s memo working.
 */
export function platesInForce(settings: Pick<Settings, 'gyms' | 'activeGymId'>): number[] {
  return activeGymPlates(settings.gyms, settings.activeGymId);
}
