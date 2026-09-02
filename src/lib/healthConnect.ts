/**
 * Health Connect — telling the rest of the phone that a workout happened.
 *
 *   Finish  ──►  ExerciseSession { STRENGTH_TRAINING, start, end, title }  ──►  Health Connect
 *                                                                                │
 *                          Samsung Health / Fitbit / Pixel Watch / anything else ┘
 *
 * ── WRITE ONLY, AND THAT IS A DECISION RATHER THAN A LIMITATION ────────────
 *
 * This app reads nothing. Not steps, not heart rate, not sleep, not another app's
 * workouts. The whole point of the local-only design (see `lib/backup.ts`) is that
 * the training log lives on this phone and leaves it when the user says so — and a
 * tracker that started reading a health graph would be making decisions from data
 * the user cannot see in it.
 *
 * What it writes is the thinnest honest record of a session: a strength-training
 * block with a start, an end and a title. NOT the sets, NOT the weights, NOT the
 * volume. Health Connect has no schema that can hold "80 kg × 8 6 5 5" — there is no
 * per-set record type — so anything more would mean flattening the log into
 * calories-shaped fields it does not fit, and inventing an energy figure from a set
 * count is exactly the kind of made-up number this codebase deletes on sight.
 *
 * So other apps learn THAT you trained and for how long, which is what they can
 * actually use (recovery, rings, daily activity), and the log stays here.
 *
 * ── EVERY CALL CAN FAIL, AND FAILING IS ORDINARY ───────────────────────────
 *
 * Health Connect is a separate app. On a given phone it may be absent, out of date,
 * present-but-unauthorised, or disabled by the user in Settings; the permission
 * dialog can be dismissed; the provider can go away between two calls. NONE of that
 * is an error this app reports, because none of it affects the log: `saveSession`
 * has already written to SQLite by the time any of this runs.
 *
 * The module is therefore loaded lazily and defensively. `require` rather than a
 * static import, inside a `try`, because a native module that is not in the binary
 * throws at import time — and a throw at module scope is a launch crash with no
 * screen to report it on. That also means the whole feature can be removed by
 * deleting one dependency: nothing else in the app imports it.
 */

import type { CompletedWorkout } from './completedWorkout';

/**
 * Health Connect's own code for strength training.
 *
 * Hard-coded rather than imported from the library's `ExerciseType` constant, so
 * this file's types do not depend on a native module that may not be installed.
 * 70 is `EXERCISE_TYPE_STRENGTH_TRAINING` in the platform enum, and the value is
 * part of Health Connect's wire format — it cannot change without breaking every
 * app that has ever written one.
 */
const EXERCISE_TYPE_STRENGTH_TRAINING = 70;

/** What `getSdkStatus` returns when Health Connect is installed and usable. */
const SDK_AVAILABLE = 3;

/** The one permission this app asks for. Write, and only for exercise sessions. */
const WRITE_EXERCISE = { accessType: 'write', recordType: 'ExerciseSession' } as const;

/** The shape this file uses. Deliberately not the library's types — see the header. */
interface HealthConnectModule {
  initialize: () => Promise<boolean>;
  getSdkStatus: () => Promise<number>;
  requestPermission: (
    permissions: readonly { accessType: string; recordType: string }[],
  ) => Promise<unknown[]>;
  getGrantedPermissions: () => Promise<{ accessType: string; recordType: string }[]>;
  insertRecords: (records: readonly Record<string, unknown>[]) => Promise<string[]>;
}

let cached: HealthConnectModule | null | undefined;

/**
 * The native module, or null on any phone or build where it is not usable.
 *
 * Cached including the null, so a build without the dependency does not retry a
 * failing `require` once per finished workout.
 */
function moduleOrNull(): HealthConnectModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('react-native-health-connect') as HealthConnectModule;
    cached = typeof loaded?.insertRecords === 'function' ? loaded : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Is there anything to talk to? Cheap, and safe to call from a render. */
export function healthConnectPossible(): boolean {
  return moduleOrNull() != null;
}

export type HealthConnectState = 'unavailable' | 'needs-permission' | 'ready';

/**
 * What Health Connect can do on this phone right now.
 *
 * Three states because the Settings row has three sentences to say, and "off" is
 * not one of them: an app that reports "off" when Health Connect is not installed
 * sends the user looking for a switch that does not exist.
 */
export async function healthConnectState(): Promise<HealthConnectState> {
  const hc = moduleOrNull();
  if (!hc) return 'unavailable';
  try {
    if ((await hc.getSdkStatus()) !== SDK_AVAILABLE) return 'unavailable';
    if (!(await hc.initialize())) return 'unavailable';
    const granted = await hc.getGrantedPermissions();
    const has = granted.some(
      (p) =>
        p.recordType === WRITE_EXERCISE.recordType && p.accessType === WRITE_EXERCISE.accessType,
    );
    return has ? 'ready' : 'needs-permission';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask for the write permission. Returns whether it ended up granted.
 *
 * ASKED FOR EXPLICITLY, FROM SETTINGS, and never on launch or at `Finish`. A
 * permission dialog in front of somebody who has just finished a workout is the app
 * interrupting the one moment it should be getting out of the way — and a dialog on
 * first launch, before the user has any idea what it is for, is how a permission
 * gets denied permanently.
 */
export async function requestHealthConnect(): Promise<boolean> {
  const hc = moduleOrNull();
  if (!hc) return false;
  try {
    if ((await hc.getSdkStatus()) !== SDK_AVAILABLE) return false;
    if (!(await hc.initialize())) return false;
    await hc.requestPermission([WRITE_EXERCISE]);
    return (await healthConnectState()) === 'ready';
  } catch {
    return false;
  }
}

/**
 * One finished workout, as an exercise session. Never throws.
 *
 * `endTime` is nudged to at least a minute after `startTime`: Health Connect rejects
 * a zero-length interval, and `durationMinutes` already floors at 1 for the same
 * reason — a workout that happened took at least a minute.
 *
 * Returns whether anything was written, which the caller uses for nothing except a
 * test. Nothing on screen depends on it: the log is already on disk.
 */
export async function writeWorkoutToHealthConnect(workout: CompletedWorkout): Promise<boolean> {
  const hc = moduleOrNull();
  if (!hc) return false;

  const record = exerciseSessionFor(workout);
  if (!record) return false;

  try {
    if ((await healthConnectState()) !== 'ready') return false;
    await hc.insertRecords([record]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The record, or null when the workout has no usable interval.
 *
 * Pure and exported so the mapping is testable without a native module — which is
 * the only part of this file that can be wrong in a way anybody notices.
 */
export function exerciseSessionFor(workout: CompletedWorkout): Record<string, unknown> | null {
  const start = Date.parse(workout.startedAt);
  if (!Number.isFinite(start)) return null;

  const parsedEnd = Date.parse(workout.endedAt);
  const minimum = start + 60_000;
  const end = Number.isFinite(parsedEnd) && parsedEnd >= minimum ? parsedEnd : minimum;

  return {
    recordType: 'ExerciseSession',
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    exerciseType: EXERCISE_TYPE_STRENGTH_TRAINING,
    // The routine's name, which is the only human-readable thing worth exporting.
    // Trimmed because Health Connect's title is shown in other apps' UIs.
    title: workout.title.trim().slice(0, 80) || 'Workout',
  };
}
