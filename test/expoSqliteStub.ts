/**
 * `expo-sqlite`, for the test runner.
 *
 * The one alias in this project backed by a REAL SQL ENGINE rather than by a
 * hand-written fake. Node 22 ships `node:sqlite`, which is the same library the
 * phone runs, so the schema, the constraints, the index and every query in
 * `historyDb.ts` are exercised exactly as written — an in-memory imitation of a
 * database is precisely the wrong tool for testing a migration whose failure mode
 * is losing somebody's training log.
 *
 * What this file is, then, is an adapter: expo's synchronous surface
 * (`openDatabaseSync`, `execSync`, `runSync`, `getAllSync`, `getFirstSync`,
 * `withTransactionSync`) mapped onto `node:sqlite`'s (`exec`, `prepare`, `run`,
 * `all`, `get`). Only the methods `historyDb.ts` actually calls are here, on
 * purpose: an adapter that implements more than the code under test uses is an
 * adapter with untested surface area.
 *
 * ── THEY ARE FILES, NOT `:memory:`, AND THAT IS THE POINT ──────────────────
 *
 * They used to be `:memory:`, which quietly made the suite unable to test the one
 * thing this store exists for: SURVIVING THE PROCESS ENDING. An in-memory database
 * dies with the handle, so "write a workout, drop the handle, read it back" — which
 * is exactly what happens when Android kills the app and the user opens it again —
 * passed by accident whatever the code did, because there was nothing on disk
 * either way.
 *
 * Each database is now a real file in a temp directory, keyed by name, so
 * `__closeDb()` in `historyDb.ts` followed by a fresh read is a genuine cold
 * start. `__resetDatabases()` deletes them, which is what keeps suites isolated.
 */

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface StubDatabase {
  execSync(source: string): void;
  runSync(source: string, ...params: unknown[]): { changes: number; lastInsertRowId: number };
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  withTransactionSync(task: () => void): void;
  closeSync(): void;
}

const open = new Map<string, { db: DatabaseSync; wrapper: StubDatabase }>();

/**
 * Where the database files live for this run — one directory per process, wiped by
 * `__resetDatabases()`. A path rather than `:memory:` so a closed handle leaves
 * bytes behind, exactly as the phone does.
 */
let directory: string | null = null;

function fileFor(databaseName: string): string {
  directory ??= mkdtempSync(join(tmpdir(), 'workout-tracker-db-'));
  return join(directory, databaseName);
}

/**
 * `node:sqlite` binds parameters positionally from a spread, like expo does, but
 * it rejects `undefined` where expo tolerates it. Normalising to `null` here keeps
 * the code under test free of defensive coercion that the phone would not need.
 */
function bind(params: unknown[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : p)) as SQLInputValue[];
}

function wrap(db: DatabaseSync): StubDatabase {
  return {
    execSync: (source) => {
      db.exec(source);
    },
    runSync: (source, ...params) => {
      const result = db.prepare(source).run(...bind(params));
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowId: Number(result.lastInsertRowid ?? 0),
      };
    },
    getAllSync: <T>(source: string, ...params: unknown[]) =>
      db.prepare(source).all(...bind(params)) as T[],
    getFirstSync: <T>(source: string, ...params: unknown[]) =>
      (db.prepare(source).get(...bind(params)) as T | undefined) ?? null,
    /*
     * Real BEGIN/COMMIT, and a real ROLLBACK on a throw. The migration relies on
     * this: a partial insert of somebody's history is the one outcome worse than a
     * failed migration, because it is indistinguishable from a complete one.
     */
    withTransactionSync: (task) => {
      db.exec('BEGIN');
      try {
        task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    closeSync: () => db.close(),
  };
}

export function openDatabaseSync(databaseName: string): StubDatabase {
  const existing = open.get(databaseName);
  if (existing) return existing.wrapper;

  const db = new DatabaseSync(fileFor(databaseName));
  const wrapper = wrap(db);
  open.set(databaseName, { db, wrapper });
  return wrapper;
}

/**
 * Drop every open database AND delete its file. Call this in `beforeEach` for a
 * clean schema.
 *
 * The files have to go, not just the handles: they are what a cold start reads, so
 * leaving them would carry one suite's workouts into the next.
 */
export function __resetDatabases(): void {
  for (const { db } of open.values()) {
    try {
      db.close();
    } catch {
      // Already closed by the test. Nothing to do.
    }
  }
  open.clear();
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = null;
  }
}

/**
 * Close the handles but KEEP the files — the app's process ending.
 *
 * Paired with `historyDb.__closeDb()`, this is a cold start: the next
 * `openDatabaseSync` opens the same bytes with a new handle, which is what the
 * phone does every time Android kills the app.
 */
export function __simulateProcessRestart(): void {
  for (const { db } of open.values()) {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  }
  open.clear();
}
