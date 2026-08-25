/**
 * The two directions a backup moves, and the only place all three stores are read
 * and written together.
 *
 *   stores ──currentSnapshot──► payload ──serializeBackup──► the file
 *   the file ──parseBackup──► envelope ──applyBackup──► stores
 *
 * It lives in `state/` rather than in `lib/` because it touches every store, and
 * outside React on purpose: an export is triggered by a button and a restore
 * replaces the state the buttons are rendered from, so neither belongs to a
 * component's lifecycle. `lib/backup.ts` stays pure and knows nothing about zustand.
 *
 * WHAT IS NOT IN A BACKUP: the workout in progress. It is persisted (that is what
 * makes a mid-set crash cost nothing), but it is a live thing with a running clock
 * and a rest deadline in epoch milliseconds — restoring one onto another phone,
 * hours later, would drop the user into a session with a two-hour rest timer and a
 * plank that "ended" while the file was on an SD card. Finish the workout, then back
 * up; the screen says so.
 *
 * ORDER MATTERS ON THE WAY IN. Settings first (they are what every duration is read
 * from), then the library, then the log — so that if anything throws, what is left
 * on the phone is a prefix of a valid restore rather than a log referring to
 * exercises that were never written.
 *
 * ── TWO WAYS IN, AND THEY ARE NOT THE SAME OPERATION ───────────────────────
 *
 * `applyBackup` REPLACES: exercises, routines, the sequence, the log and the
 * settings all become what the file says. That is what a restore is.
 *
 * `mergeBackupWorkouts` ADDS: the WORKOUTS in the file that this phone does not
 * already have, and nothing else. It exists because a replaced phone and a second
 * device were unserviceable — the only way to get a workout off one and onto the
 * other was to replace everything, which loses whatever the destination had.
 *
 * Only workouts merge. A merged LIBRARY resurrects every exercise the user has
 * deleted, silently and with no way to tell which is which, and merged SETTINGS
 * are not a thing anybody can describe — two numbers cannot be unioned. That
 * asymmetry is not a limitation to fix later; it is the reason merging the log is
 * safe: a workout carries the session's own id, so rule 3 of `workoutHistoryStore`
 * ("finishing twice is one workout") makes a union by id exact.
 */

import { serializeBackup, type BackupCounts, type BackupPayload } from '../lib/backup';
import { useLibrary } from './libraryStore';
import { sanitizeSettings, useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';

/** Everything on this phone that a backup carries, straight out of the stores. */
export function currentSnapshot(): BackupPayload {
  const library = useLibrary.getState();
  return {
    // Sanitized rather than spread: the live store carries its action functions
    // alongside its values, and a JSON file with `setNumber: undefined` in it is a
    // file that says something untrue about the format.
    settings: sanitizeSettings(useSettings.getState()),
    exercises: library.exercises,
    routines: library.routines,
    sequence: library.sequence,
    workouts: useWorkoutHistory.getState().workouts,
    numbering: useWorkoutHistory.getState().numbering,
  };
}

/**
 * Thrown by `exportBackupText` rather than writing a backup that is missing the
 * log. Carried as a class so the screen can tell it from a file-system error and
 * say something true about it.
 */
export class UnreadableLogError extends Error {
  constructor() {
    /*
     * Reaches the user verbatim through `describeError`, so it is written as the
     * sentence they need: what happened, that nothing is lost, and the one thing
     * that fixes it.
     */
    super(
      'The log could not be read, so a backup would be missing it. Nothing is lost — close the app and open it again.',
    );
    this.name = 'UnreadableLogError';
  }
}

/**
 * The file's text, ready to write or share.
 *
 * ── IT REFUSES TO WRITE A BACKUP WITH THE LOG MISSING ──────────────────────
 *
 * `currentSnapshot` reads the stores, and the history store's array is empty in two
 * very different situations: nothing has been logged, and the log could not be READ
 * (see `workoutHistoryStore.loadFailed`). Exporting is what a careful person does
 * FIRST when the app looks wrong, and in the second case that would hand them a
 * file with `"workouts": []` in it — which `Replace everything from a file` will
 * then faithfully restore over a database that was fine.
 *
 * That is the one path in this app that can turn a failed read into permanent loss,
 * so it is closed here rather than warned about: a backup nobody can trust is worse
 * than no backup, because the whole point of one is being trusted later.
 */
export function exportBackupText(now?: Date): string {
  if (useWorkoutHistory.getState().loadFailed) throw new UnreadableLogError();
  return serializeBackup(currentSnapshot(), now);
}

/** What a restore actually put on the phone — validated rows, not claimed ones. */
export interface AppliedCounts extends BackupCounts {
  settingsApplied: boolean;
}

/** What a merge actually added. Both numbers are additions — a merge never removes. */
export interface MergedCounts {
  /** Workouts that were not already on this phone. */
  workoutsAdded: number;
  /** Set rows inside those workouts — the number that makes the count feel real. */
  setsAdded: number;
}

/**
 * Add the file's workouts to this phone's log, leaving everything else alone.
 *
 * Reports what LANDED, not what the file claimed: rows that fail the store's guard
 * are dropped on the way in, and a merge that says "42 added" when eleven were
 * malformed is how somebody learns not to trust the feature.
 *
 * The set count is read back from the store rather than counted in the file, for
 * the same reason.
 */
export function mergeBackupWorkouts(payload: Pick<BackupPayload, 'workouts'>): MergedCounts {
  const history = useWorkoutHistory.getState();
  const before = new Set(history.workouts.map((w) => w.id));
  const workoutsAdded = history.mergeWorkouts(payload.workouts);

  let setsAdded = 0;
  for (const workout of useWorkoutHistory.getState().workouts) {
    if (!before.has(workout.id)) setsAdded += workout.sets.length;
  }

  return { workoutsAdded, setsAdded };
}

/**
 * Write a parsed backup into the stores, replacing what is there.
 *
 * Returns what survived each store's own validation. The counts a file states in its
 * envelope are what the exporting phone had; these are what this phone now has, and
 * when the two differ the screen reports THESE — a restore that quietly drops eleven
 * malformed workouts and says "42 restored" is how a user learns not to trust the
 * feature.
 */
export function applyBackup(payload: BackupPayload): AppliedCounts {
  const settingsApplied = payload.settings != null;
  if (settingsApplied) useSettings.getState().importSettings(payload.settings);

  const library = useLibrary.getState().importLibrary({
    exercises: payload.exercises,
    routines: payload.routines,
    sequence: payload.sequence,
  });
  const workouts = useWorkoutHistory.getState().importWorkouts(payload.workouts, payload.numbering);

  let sets = 0;
  for (const workout of useWorkoutHistory.getState().workouts) sets += workout.sets.length;

  return {
    exercises: library.exercises,
    routines: library.routines,
    workouts,
    sets,
    settingsApplied,
  };
}
