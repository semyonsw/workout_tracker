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

/** The file's text, ready to write or share. */
export function exportBackupText(now?: Date): string {
  return serializeBackup(currentSnapshot(), now);
}

/** What a restore actually put on the phone — validated rows, not claimed ones. */
export interface AppliedCounts extends BackupCounts {
  settingsApplied: boolean;
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
