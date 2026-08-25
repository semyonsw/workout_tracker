/**
 * The training log, on disk, in SQLite.
 *
 * ── WHY IT MOVED ───────────────────────────────────────────────────────────
 *
 * `App.tsx` has promised since the first release that the stores are the seam:
 * "Swap those for SQLite queries and neither this file nor any screen below it
 * changes." `src/types/models.ts` opens with the exact indexed range scan the
 * schema was designed for. This is that promise cashed in, for the ONE store that
 * needed it.
 *
 * AsyncStorage is one string per key. Every `Finish` re-serialised the entire
 * history — every workout, every set row — and wrote it back as one blob, which is
 * why there was a `MAX_WORKOUTS` cap at all: the cap was not a product decision
 * about how much training is worth keeping, it was a guess at where that string
 * gets too big to write. The cap is gone with the blob.
 *
 * ONLY THIS STORE MOVED. `libraryStore` and `settingsStore` are a few dozen rows
 * between them, they are read in full on every launch, and the comment on
 * `libraryStore` saying AsyncStorage is right for them is still right. A database
 * for eleven settings would be a database to migrate for no reason.
 *
 * ── THE SHAPE ──────────────────────────────────────────────────────────────
 *
 * Two tables, mirroring the two types. `workouts` holds the record and its
 * exercise SNAPSHOTS as JSON — they are a denormalised copy on purpose (see
 * `completedWorkout.ts`: a log that re-renders itself against today's library is no
 * longer a log), they are only ever read whole, and a third table for them would
 * buy a join and nothing else. `set_history` holds one row per set, columns for
 * every field, and the index `models.ts` describes:
 *
 *   CREATE INDEX set_history_exercise_at ON set_history(exercise_id, performed_at)
 *
 * ── SYNCHRONOUS, AND WHY THAT MATTERS ──────────────────────────────────────
 *
 * `expo-sqlite`'s sync API means the log is READ BEFORE THE FIRST RENDER. Under
 * AsyncStorage, History was empty for a frame and then filled in, which is a real
 * flicker on a screen whose whole job is to show a list. Nothing about the store's
 * public interface changes; it just no longer starts empty.
 *
 * The ONE thing that cannot be synchronous is the migration off AsyncStorage,
 * because AsyncStorage is async. So first launch after upgrading behaves exactly
 * as every launch used to: empty, then filled. Every launch after that is
 * immediate.
 *
 * ── THE MIGRATION IS THE DANGEROUS PART ────────────────────────────────────
 *
 * It is somebody's training log, so it is written to be paranoid rather than
 * clever:
 *
 *  1. The insert runs in ONE TRANSACTION. A partially migrated log is worse than a
 *     failed migration, because it looks like a complete one.
 *  2. The rows are READ BACK AND COUNTED before the migration is recorded as done.
 *     If the count disagrees, nothing is recorded and the next launch tries again
 *     from the old key, which is still there.
 *  3. THE OLD KEY IS NEVER DELETED BY THIS CODE. Not on success, not later. It is a
 *     few hundred kilobytes and it is the only copy of anything that goes wrong in
 *     a way nobody notices for a month. A future release can drop it once the
 *     migration has been in the wild long enough to be boring.
 *  4. Every row still goes through `sanitizeWorkouts` on the way out, exactly as it
 *     did coming off the old key. There is one guard per shape in this app and
 *     moving the bytes does not add a second.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseSync } from 'expo-sqlite';

import type { CompletedWorkout } from '../lib/completedWorkout';
import type { SetHistory } from '../types/models';

/** The database file. Named for what it holds, not for the app. */
export const DB_NAME = 'workout-history.db';

/**
 * The AsyncStorage key the log used to live under — zustand's `persist` name.
 *
 * Read once, on the first launch after upgrading, and never written or deleted.
 * See rule 3 in the header.
 */
export const LEGACY_STORAGE_KEY = 'workout-history';

/** A `meta` row recording that the AsyncStorage log has been brought across. */
const MIGRATED_FLAG = 'migrated_from_async_storage';

/**
 * A `meta` row recording that the USER has removed workouts from this log.
 *
 * Written by every deliberate deletion — one workout, the whole log, or a restore
 * that replaced it — and read by exactly one thing: the migration's decision about
 * whether an EMPTY database means "I never received the log" or "the log is empty
 * because that is what was asked for".
 *
 * Without it the recovery below cannot tell those apart, and the friendly reading
 * of an empty log is the wrong one half the time: somebody who taps
 * `Delete all workout history` and relaunches would watch every workout come back.
 * A log that resurrects what you deleted is worse than one that needs a manual
 * import, because you cannot tell it to stop.
 */
export const USER_CLEARED_FLAG = 'history_cleared_by_user';

/** Remember that a deletion was a decision, not a failure. Never throws. */
function recordUserDeletion(): void {
  try {
    writeMeta(USER_CLEARED_FLAG, new Date().toISOString());
  } catch {
    // A marker that could not be written costs a resurrected log at worst, and
    // throwing here would cost the deletion itself.
  }
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

/**
 * The whole schema, idempotent, applied on every open.
 *
 * `IF NOT EXISTS` throughout rather than a version counter: there is exactly one
 * version of this schema so far, and a migration table for a schema that has never
 * changed is scaffolding for a problem nobody has. When the second version
 * arrives, `meta` is already here to hold its number.
 *
 * `ON DELETE CASCADE` is why deleting a workout does not need two statements — and
 * `foreign_keys = ON` is why the cascade actually happens, since SQLite has it off
 * by default and a foreign key nobody enforces is a comment.
 */
const SCHEMA = `
PRAGMA journal_mode = WAL;
/*
 * FULL, not WAL's default NORMAL.
 *
 * NORMAL does not fsync on commit: the write is in the OS page cache, which
 * survives the app being killed — "close all", a swipe away, an out-of-memory
 * kill — but not the phone losing power or being force-rebooted mid-write. That
 * is a small window and this app writes once per Finish, so the cost is one fsync
 * a workout and the thing being protected is a training log.
 */
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id                TEXT PRIMARY KEY NOT NULL,
  title             TEXT NOT NULL,
  routine_id        TEXT,
  started_at        TEXT NOT NULL,
  ended_at          TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  set_count         INTEGER NOT NULL,
  total_volume_kg   INTEGER NOT NULL,
  volume_is_partial INTEGER NOT NULL,
  exercises_json    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_history (
  id                 TEXT PRIMARY KEY NOT NULL,
  session_id         TEXT NOT NULL,
  exercise_id        TEXT NOT NULL,
  performed_at       TEXT NOT NULL,
  set_index          INTEGER NOT NULL,
  weight_kg          REAL,
  count              REAL NOT NULL,
  count_unit         TEXT NOT NULL,
  load_mode          TEXT NOT NULL,
  is_warmup          INTEGER NOT NULL,
  rest_taken_seconds INTEGER,
  FOREIGN KEY (session_id) REFERENCES workouts(id) ON DELETE CASCADE
);

-- THE index from models.ts. Progressive-overload analysis is one range scan over
-- it, which is the entire reason SetHistory is denormalised the way it is.
CREATE INDEX IF NOT EXISTS set_history_exercise_at
  ON set_history (exercise_id, performed_at);

-- Newest-first is how the list is always read, so the sort is an index walk.
CREATE INDEX IF NOT EXISTS workouts_started_at ON workouts (started_at DESC);
`;

type Db = ReturnType<typeof openDatabaseSync>;

let handle: Db | null = null;

/**
 * The open database, opened and schema'd on first use.
 *
 * Lazy rather than at module scope so importing this file — which the tests and
 * the type checker both do — is not itself a native call.
 *
 * ── A HALF-OPENED DATABASE IS NEVER CACHED ─────────────────────────────────
 *
 * This used to assign `handle` and THEN apply the schema, which meant a throw from
 * `execSync` left a handle cached that no table had been created in. Every call
 * after it returned that handle happily and every query against it failed with
 * "no such table: workouts" — and because the two callers at launch swallow their
 * errors into an empty log, the app would report a lifetime of training as
 * "Nothing finished yet" until the process was restarted, on a database whose
 * bytes were fine the whole time.
 *
 * A local until both steps are done. A failed open now throws, is not remembered,
 * and the NEXT call tries again from nothing — which is what makes
 * `reloadHistory` able to recover a launch where the native module was not ready
 * yet.
 */
export function db(): Db {
  if (handle) return handle;
  const opened = openDatabaseSync(DB_NAME);
  opened.execSync(SCHEMA);
  handle = opened;
  return handle;
}

/** Drop the cached handle. For tests, and for a hard reset that never happens. */
export function __closeDb(): void {
  handle = null;
}

/* ------------------------------------------------------------------ */
/* Rows in, rows out                                                   */
/* ------------------------------------------------------------------ */

interface WorkoutRow {
  id: string;
  title: string;
  routine_id: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  set_count: number;
  total_volume_kg: number;
  volume_is_partial: number;
  exercises_json: string;
}

interface SetRow {
  id: string;
  session_id: string;
  exercise_id: string;
  performed_at: string;
  set_index: number;
  weight_kg: number | null;
  count: number;
  count_unit: string;
  load_mode: string;
  is_warmup: number;
  rest_taken_seconds: number | null;
}

/**
 * Every workout, newest first, with its sets attached.
 *
 * Two queries and a group-by in memory rather than one join: a join would repeat
 * every workout column once per set row, and the whole log is a few thousand rows
 * that the store holds in memory anyway.
 *
 * The rows come back as loose JSON-ish objects and go straight into
 * `sanitizeWorkouts` in the store — the same guard the AsyncStorage blob went
 * through, because a column can hold nonsense just as a blob can and there is one
 * validator per shape.
 */
export function readAllWorkouts(): unknown[] {
  const database = db();
  const workouts = database.getAllSync<WorkoutRow>(
    'SELECT * FROM workouts ORDER BY started_at DESC',
  );
  const sets = database.getAllSync<SetRow>(
    'SELECT * FROM set_history ORDER BY session_id, set_index',
  );

  const bySession = new Map<string, unknown[]>();
  for (const row of sets) {
    const bucket = bySession.get(row.session_id);
    const set = toSetHistory(row);
    if (bucket) bucket.push(set);
    else bySession.set(row.session_id, [set]);
  }

  return workouts.map((row) => ({
    id: row.id,
    title: row.title,
    ...(row.routine_id ? { routineId: row.routine_id } : {}),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes: row.duration_minutes,
    setCount: row.set_count,
    totalVolumeKg: row.total_volume_kg,
    volumeIsPartial: row.volume_is_partial === 1,
    exercises: parseExercises(row.exercises_json),
    sets: bySession.get(row.id) ?? [],
  }));
}

function toSetHistory(row: SetRow): Record<string, unknown> {
  return {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    performedAt: row.performed_at,
    setIndex: row.set_index,
    weightKg: row.weight_kg,
    count: row.count,
    countUnit: row.count_unit,
    loadMode: row.load_mode,
    isWarmup: row.is_warmup === 1,
    isCompleted: true,
    ...(row.rest_taken_seconds != null ? { restTakenSeconds: row.rest_taken_seconds } : {}),
  };
}

/**
 * The exercise snapshots, out of their JSON column.
 *
 * A malformed column becomes an empty list rather than throwing: the workout's own
 * rows are the record, and `sanitizeWorkout` will accept a workout with no exercise
 * lines and repair `totalCount` from the rows. Losing the summary lines of one
 * session is a cosmetic loss; refusing to open the log is not.
 */
function parseExercises(json: string): unknown {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function insertSet(database: Db, sessionId: string, row: SetHistory): void {
  database.runSync(
    `INSERT OR REPLACE INTO set_history
       (id, session_id, exercise_id, performed_at, set_index, weight_kg,
        count, count_unit, load_mode, is_warmup, rest_taken_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    // The workout's id, not the row's claimed `sessionId`: they are the same thing
    // by construction, and the foreign key has to point at a workout that exists.
    sessionId,
    row.exerciseId,
    row.performedAt,
    row.setIndex,
    row.weightKg ?? null,
    row.count,
    row.countUnit,
    row.loadMode,
    row.isWarmup ? 1 : 0,
    row.restTakenSeconds ?? null,
  );
}

/**
 * Drop one workout and its sets.
 *
 * `ON DELETE CASCADE` already does the second half, and the set rows are deleted
 * explicitly anyway. That is not distrust of SQLite, it is distrust of the PRAGMA:
 * foreign keys are OFF by default in SQLite, they are enabled per CONNECTION rather
 * than per database, and a build where that pragma silently failed would leave
 * orphaned rows behind every delete for the life of the install. Two statements in
 * one transaction is a cheap price for a log that cannot quietly accumulate sets
 * belonging to workouts nobody can see.
 */
export function deleteWorkoutRow(id: string): void {
  const database = db();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM set_history WHERE session_id = ?', id);
    database.runSync('DELETE FROM workouts WHERE id = ?', id);
  });
  recordUserDeletion();
}

/** Everything, gone. The Settings action, and nothing else. */
export function clearAllWorkouts(): void {
  const database = db();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM set_history');
    database.runSync('DELETE FROM workouts');
  });
  recordUserDeletion();
}

/**
 * Replace the whole log with this one — a restore.
 *
 * One transaction, so a restore that throws halfway leaves the previous log intact
 * rather than half of each.
 */
export function replaceAllWorkouts(workouts: readonly CompletedWorkout[]): void {
  const database = db();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM set_history');
    database.runSync('DELETE FROM workouts');
    for (const workout of workouts) writeWorkoutIn(database, workout);
  });
  // A restore is a decision about what the log is, including when the file was
  // empty. See `USER_CLEARED_FLAG`.
  recordUserDeletion();
}

/**
 * Insert or replace workouts and their sets, in one transaction.
 *
 * `INSERT OR REPLACE` on the workout, then delete-and-reinsert its rows: rule 3 of
 * the store is that finishing twice is one workout, and a correction rewrites the
 * row list wholesale. Both are "this workout is now exactly this", which is one
 * statement pair rather than a diff nobody can audit.
 */
export function writeWorkouts(workouts: readonly CompletedWorkout[]): void {
  if (workouts.length === 0) return;
  const database = db();
  database.withTransactionSync(() => {
    for (const workout of workouts) writeWorkoutIn(database, workout);
  });
}

/** The body of `writeWorkouts`, without opening a transaction of its own. */
function writeWorkoutIn(database: Db, workout: CompletedWorkout): void {
  database.runSync(
    `INSERT OR REPLACE INTO workouts
       (id, title, routine_id, started_at, ended_at, duration_minutes,
        set_count, total_volume_kg, volume_is_partial, exercises_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    workout.id,
    workout.title,
    workout.routineId ?? null,
    workout.startedAt,
    workout.endedAt,
    workout.durationMinutes,
    workout.setCount,
    workout.totalVolumeKg,
    workout.volumeIsPartial ? 1 : 0,
    JSON.stringify(workout.exercises),
  );
  database.runSync('DELETE FROM set_history WHERE session_id = ?', workout.id);
  for (const row of workout.sets) insertSet(database, workout.id, row);
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export function readMeta(key: string): string | null {
  return (
    db().getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null
  );
}

export function writeMeta(key: string, value: string): void {
  db().runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}

/** How many set rows are in the database. The migration's own check. */
export function countSetRows(): number {
  return db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM set_history')?.n ?? 0;
}

/**
 * How many workouts are on disk, whatever the store currently holds in memory.
 *
 * Declared here since the move to SQLite and read by nothing until now, which is
 * the one kind of dead code worth keeping honest about: it is the number Settings
 * states. An app saying "Nothing finished yet" when the database holds 94 workouts
 * looks exactly like an app that lost them, and this is the fastest way to know it
 * did not.
 */
export function countWorkoutRows(): number {
  return db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workouts')?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

export interface MigrationOutcome {
  /** 'already-done' | 'nothing-to-move' | 'migrated' | 'failed' */
  status: 'already-done' | 'nothing-to-move' | 'migrated' | 'failed';
  /** Workouts written, when the status is 'migrated'. */
  workouts: number;
  sets: number;
  /**
   * Whatever the legacy blob held under `numbering`, RAW and unvalidated.
   *
   * Handed back rather than stored, for the same reason `sanitize` is passed in:
   * this module knows nothing about the shape of what it is moving, and the store
   * keeps its single validator. Undefined whenever there was no blob to read.
   *
   * It exists because the pinned workout number shipped in a build that persisted
   * the whole store through AsyncStorage. Migrating the workouts and silently
   * dropping the pin would renumber that user's entire log on first launch — and
   * the pin is the one fact in the app that cannot be recomputed from the sessions.
   */
  legacyNumbering?: unknown;
}

/**
 * Bring the AsyncStorage log across, once.
 *
 * The paranoid part, and the rules are in the file header. In short: one
 * transaction, read back and counted before anything is recorded as done, the old
 * key never deleted, and every row through the store's own guard.
 *
 * `sanitize` is passed in rather than imported, so this module knows nothing about
 * the store and the store keeps its single validator. That also makes the failure
 * mode testable: hand it a sanitizer that returns fewer rows than it was given and
 * the verification has to refuse.
 */
export async function migrateFromAsyncStorage(
  sanitize: (raw: unknown) => CompletedWorkout[],
): Promise<MigrationOutcome> {
  const none: MigrationOutcome = { status: 'nothing-to-move', workouts: 0, sets: 0 };

  /*
   * ── THE FLAG IS NOT PROOF, AND THAT IS THE POINT ─────────────────────────
   *
   * "Already done" used to end this function, and it is the right answer nearly
   * always: the log came across, the DB has it, asking AsyncStorage again every
   * launch forever is a cost with no upside.
   *
   * It is the wrong answer in exactly one situation, and it is the situation
   * somebody only ever hits after losing a year of training: the flag is set and
   * the database is EMPTY. That can happen if the file was replaced, if a
   * reinstall left the flag in a restored `meta` table without its rows, or if
   * anything else got between the log and the disk. Trusting the flag there means
   * the legacy key — which this code has never deleted, deliberately, for exactly
   * this — sits on the phone holding the only copy of the log while the app shows
   * an empty History for good.
   *
   * So the flag is believed when the database agrees with it — OR when the user has
   * deleted workouts themselves, which is the other honest reason for an empty log
   * and the one thing this recovery must never override (see `USER_CLEARED_FLAG`).
   * Zero workouts, nothing deleted, and a legacy key still on disk is worth one
   * more attempt; the attempt is additive and idempotent (see `writeWorkouts`
   * below), so the cost of being wrong about it is nothing.
   *
   * The price of the recovery is one `getItem` per launch on a phone that has a
   * flag, an empty log and no deletions — a fresh install, until its first workout.
   * That is a null read of a key that is not there, once, against never abandoning
   * somebody's log on the strength of a boolean.
   */
  const flagged = readMeta(MIGRATED_FLAG) != null;
  if (flagged && (countWorkoutRows() > 0 || readMeta(USER_CLEARED_FLAG) != null)) {
    return { ...none, status: 'already-done' };
  }

  let blob: string | null = null;
  try {
    blob = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    /*
     * Unreadable storage. NOT recorded as migrated: a fresh install and a broken
     * read look identical from here, and recording the first would silently
     * abandon the second's log forever. The next launch tries again.
     */
    return { ...none, status: 'failed' };
  }

  if (blob == null) {
    /*
     * A fresh install. Recorded as done, because there is nothing to bring across
     * and asking AsyncStorage on every launch forever is a cost with no upside.
     */
    writeMeta(MIGRATED_FLAG, new Date().toISOString());
    return none;
  }

  let workouts: CompletedWorkout[] = [];
  let legacyNumbering: unknown;
  try {
    const parsed = JSON.parse(blob) as { state?: { workouts?: unknown; numbering?: unknown } };
    workouts = sanitize(parsed?.state?.workouts);
    legacyNumbering = parsed?.state?.numbering;
  } catch {
    // A corrupt blob. Recorded as done: there is nothing in it to lose, and the
    // key stays on disk for anybody who wants to look at it.
    writeMeta(MIGRATED_FLAG, new Date().toISOString());
    return { ...none, status: 'failed' };
  }

  if (workouts.length === 0) {
    writeMeta(MIGRATED_FLAG, new Date().toISOString());
    return none;
  }

  const expectedSets = workouts.reduce((n, w) => n + w.sets.length, 0);

  try {
    /*
     * ADDITIVE, and it matters: this used to be `replaceAllWorkouts`, which begins
     * `DELETE FROM workouts`.
     *
     * The migration runs on every launch until it manages to record success, so it
     * is not guaranteed to be looking at an empty database — a launch where the
     * legacy read failed, then a week of training, then a launch where it works,
     * and the delete would take that week with it. `writeWorkouts` is one
     * transaction of `INSERT OR REPLACE`, so a workout that came across before is
     * rewritten rather than duplicated, and one that never lived in AsyncStorage is
     * left alone.
     */
    writeWorkouts(workouts);
  } catch {
    // The transaction rolled back, so the database is as it was. Nothing recorded.
    return { ...none, status: 'failed' };
  }

  /*
   * READ BACK AND COUNT before recording. A partially written log is the one
   * outcome worse than a failed migration, because it is indistinguishable from a
   * complete one — so the migration is only "done" once the database agrees about
   * how much is in it.
   */
  if (countWorkoutRows() !== workouts.length || countSetRows() !== expectedSets) {
    return { status: 'failed', workouts: countWorkoutRows(), sets: countSetRows() };
  }

  writeMeta(MIGRATED_FLAG, new Date().toISOString());
  return { status: 'migrated', workouts: workouts.length, sets: expectedSets, legacyNumbering };
}
