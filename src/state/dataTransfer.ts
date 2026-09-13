/**
 * The two directions a backup moves, and the only place every store is read and
 * written together.
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
 * ── ONE WAY OUT AND ONE WAY IN ─────────────────────────────────────────────
 *
 * `applyBackup` REPLACES: exercises, routines, the sequence, both other logs and
 * the settings all become what the file says. That is what a restore is, and it
 * is now the only restore there is.
 *
 * There used to be four more: a merge that added only the workouts this phone did
 * not have, a CSV reader for training that predated the app, and a per-section
 * export and import for each of the three logs. Eight rows, seven of which were
 * answering a question nobody was asking twice — and eight rows of export and
 * import are worse than two, because the one that matters (the whole phone, out
 * to a file you can read) stops being obvious among them. One file holds
 * everything; putting it back puts everything back.
 */

import { serializeBackup, type BackupCounts, type BackupPayload } from '../lib/backup';
import { useLibrary } from './libraryStore';
import { sanitizeMoney, useMoney } from './moneyStore';
import { sanitizeSettings, useSettings } from './settingsStore';
import { sanitizeTasks, useTasks } from './tasksStore';
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
    // Sanitized for the same reason `settings` is: the live stores carry their
    // action functions beside their values, and a backup with `addTask: null` in
    // it says something untrue about the format.
    tasks: sanitizeTasks(useTasks.getState()),
    money: sanitizeMoney(useMoney.getState()),
  };
}

/* ------------------------------------------------------------------ */
/* One section at a time                                               */
/* ------------------------------------------------------------------ */

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

  /*
   * ABSENT IS NOT EMPTY. A version-1 file carries neither log, and importing one
   * must leave the tasks and the amounts exactly where they are — replacing them
   * with nothing would turn "restore my training from last year's backup" into
   * deleting a year of answered days, silently, in the same tap.
   */
  const tasksApplied = payload.tasks != null;
  if (tasksApplied) useTasks.getState().importTasks(payload.tasks);
  const moneyApplied = payload.money != null;
  if (moneyApplied) useMoney.getState().importMoney(payload.money);

  let sets = 0;
  for (const workout of useWorkoutHistory.getState().workouts) sets += workout.sets.length;

  return {
    exercises: library.exercises,
    routines: library.routines,
    workouts,
    sets,
    tasks: tasksApplied ? useTasks.getState().tasks.length : undefined,
    amounts: moneyApplied ? useMoney.getState().amounts.length : undefined,
    settingsApplied,
  };
}
