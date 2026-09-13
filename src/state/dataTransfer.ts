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
 *
 * ── AND ONE SECTION AT A TIME ──────────────────────────────────────────────
 *
 * `exportSectionText` / `applySection` are the same two directions with a smaller
 * blast radius: the training log, the daily tasks or the money, alone. The app is
 * three logs that fail and get rebuilt independently, and "put my expenses back,
 * leave my training alone" is not something a whole-phone restore can express.
 * The envelope those travel in is `lib/sectionBackup.ts`.
 */

import { serializeBackup, type BackupCounts, type BackupPayload } from '../lib/backup';
import type { CsvImportPlan } from '../lib/csvImport';
import {
  countSection,
  serializeSection,
  type SectionCounts,
  type SectionName,
} from '../lib/sectionBackup';
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
 * One section's value, straight out of the store that owns it.
 *
 * The TRAINING section is the whole backup minus the settings — every duration
 * and switch in the app is a preference about how the phone behaves, not part of
 * the training log, and a file called `training` that silently reset somebody's
 * rest timer would be the one surprise this feature cannot afford.
 */
export function sectionSnapshot(section: SectionName): unknown {
  if (section === 'tasks') return sanitizeTasks(useTasks.getState());
  if (section === 'money') return sanitizeMoney(useMoney.getState());

  const library = useLibrary.getState();
  const history = useWorkoutHistory.getState();
  return {
    exercises: library.exercises,
    routines: library.routines,
    sequence: library.sequence,
    workouts: history.workouts,
    numbering: history.numbering,
  };
}

/**
 * One section's file text, ready to write.
 *
 * Refuses a TRAINING export for exactly the reason `exportBackupText` does: an
 * unreadable log would be written out as `"workouts": []`, and that file will
 * later be restored over a database that was fine. The other two sections live in
 * AsyncStorage and have no equivalent failure — a store that could not be read is
 * a store that is still seeded, which the user can see on the screen they are
 * standing on.
 */
export function exportSectionText(section: SectionName, now?: Date): string {
  if (section === 'training' && useWorkoutHistory.getState().loadFailed) {
    throw new UnreadableLogError();
  }
  return serializeSection(section, sectionSnapshot(section), now);
}

/**
 * Replace ONE section from a parsed file, and report what landed.
 *
 * REPLACES, like `applyBackup` and unlike `mergeBackupWorkouts` — that asymmetry
 * is argued in this file's header and none of it changes per section. What does
 * change is the blast radius, which is the whole point: restoring the money
 * cannot touch a single set.
 *
 * The counts come back from the STORES, after their own validators have run, so
 * a file claiming forty amounts of which eleven are malformed reports twenty-nine.
 */
export function applySection(section: SectionName, data: unknown): SectionCounts {
  if (section === 'tasks') {
    useTasks.getState().importTasks(data);
    return countSection('tasks', sanitizeTasks(useTasks.getState()));
  }

  if (section === 'money') {
    useMoney.getState().importMoney(data);
    return countSection('money', sanitizeMoney(useMoney.getState()));
  }

  const source = (data ?? {}) as Record<string, unknown>;
  // Library first, then the log — `libraryStore` rule 1: the log must never refer
  // to an exercise that does not exist, not even for one statement.
  useLibrary.getState().importLibrary({
    exercises: Array.isArray(source.exercises) ? source.exercises : [],
    routines: Array.isArray(source.routines) ? source.routines : [],
    sequence: source.sequence,
  });
  useWorkoutHistory
    .getState()
    .importWorkouts(Array.isArray(source.workouts) ? source.workouts : [], source.numbering);

  const library = useLibrary.getState();
  const history = useWorkoutHistory.getState();
  return countSection('training', {
    exercises: library.exercises,
    routines: library.routines,
    workouts: history.workouts,
  });
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
 * Apply a planned CSV import: the exercises it needs, then the workouts.
 *
 * IN THAT ORDER, and it is the whole reason this lives here rather than in the
 * screen. `libraryStore` rule 1 is that the log must never refer to an exercise that
 * does not exist; writing the workouts first would leave every imported row pointing
 * at nothing for as long as it took the next statement to run, and a crash in
 * between would leave it that way permanently.
 *
 * Exercises are added only where the id is genuinely new, so re-running the same
 * file — which produces the same ids by design (see `planCsvImport`) — adds nothing
 * twice.
 */
export function applyCsvImport(plan: CsvImportPlan): MergedCounts & { exercisesAdded: number } {
  const library = useLibrary.getState();
  const known = new Set(library.exercises.map((e) => e.id));

  let exercisesAdded = 0;
  for (const exercise of plan.newExercises) {
    if (known.has(exercise.id)) continue;
    library.addExercise(exercise);
    known.add(exercise.id);
    exercisesAdded += 1;
  }

  const merged = mergeBackupWorkouts({ workouts: plan.workouts });
  return { ...merged, exercisesAdded };
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
