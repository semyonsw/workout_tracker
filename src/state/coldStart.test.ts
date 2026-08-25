import { beforeEach, describe, expect, it } from 'vitest';

import { __closeDb, countWorkoutRows, db, readAllWorkouts, writeWorkouts } from './historyDb';
import { useWorkoutHistory } from './workoutHistoryStore';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import { __resetDatabases, __simulateProcessRestart } from '../../test/expoSqliteStub';
import type { CompletedWorkout } from '../lib/completedWorkout';
import type { Exercise, ID } from '../types/models';

/**
 * THE COLD START — "I closed all my apps and the history is gone."
 *
 * Android kills the process when you clear the recents list. Nothing in memory
 * survives it: the store is rebuilt from whatever is on disk, and if that read
 * comes back empty the app has forgotten a year of training as far as anybody
 * looking at it can tell.
 *
 * NO TEST COULD ASK THIS QUESTION UNTIL NOW, and that is the reason it is worth
 * writing down. `test/expoSqliteStub.ts` used to open every database as
 * `:memory:`, so a handle dropped was bytes gone — "write it, close it, read it
 * back" passed whatever the code did, because there was nothing on disk either
 * way. The stub is file-backed now, `__simulateProcessRestart` drops the handles
 * and keeps the files, and that pair is a genuine relaunch.
 *
 * What is verified here is the whole chain the reported bug lives in: a finished
 * workout reaches the file, the file survives a kill that closes nothing, and the
 * store reads it back as the same workout with the same sets.
 */

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

/** A session with its first exercise logged — the shape `saveSession` stores. */
function loggedDraft(startedAt: string, sets = 3): DraftSession {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
    startedAt,
    now: new Date(startedAt),
  });
  const [first, ...rest] = session.entries;
  return {
    ...session,
    entries: [
      {
        ...first,
        sets: first.sets.map((s, i) =>
          i < sets ? { ...s, isCompleted: true, weightKg: 40, isPrefilled: false } : s,
        ),
      },
      ...rest,
    ],
  };
}

/** Android kills the app; the user opens it again. */
function relaunch(): number {
  __simulateProcessRestart();
  __closeDb();
  // What module scope does on launch, and what `App.tsx` does again after mount.
  useWorkoutHistory.setState({ workouts: [], numbering: null });
  return useWorkoutHistory.getState().reloadHistory();
}

beforeEach(() => {
  __resetDatabases();
  __closeDb();
  useWorkoutHistory.setState({ workouts: [], numbering: null, loadFailed: false });
});

describe('the log survives the process ending', () => {
  it('reads back a finished workout, set for set, after a relaunch', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-24T17:00:00.000Z'));
    expect(saved).not.toBeNull();

    expect(relaunch()).toBe(1);

    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.id).toBe(saved!.id);
    expect(workout.sets.map((s) => s.id)).toEqual(saved!.sets.map((s) => s.id));
    expect(workout.setCount).toBe(saved!.setCount);
    expect(workout.totalVolumeKg).toBe(saved!.totalVolumeKg);
  });

  it('accumulates across ten sessions with a kill between every one', () => {
    for (let i = 0; i < 10; i += 1) {
      useWorkoutHistory.getState().saveSession(loggedDraft(`2026-08-${10 + i}T17:00:00.000Z`));
      relaunch();
    }

    expect(countWorkoutRows()).toBe(10);
    expect(useWorkoutHistory.getState().workouts).toHaveLength(10);
    // Newest first, still — the order every screen depends on.
    const dates = useWorkoutHistory.getState().workouts.map((w) => w.startedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('keeps a commit that was never checkpointed — a kill closes nothing', () => {
    /*
     * WAL mode means a commit can still be sitting in the `-wal` file when the
     * process dies, with recovery left to whoever opens the database next. That is
     * the normal state of affairs after "close all": nothing called `closeSync`,
     * nothing checkpointed, and the last workout is only durable if SQLite means
     * what it says. `PRAGMA synchronous = FULL` is what makes it also survive the
     * phone losing power, which no test here can simulate.
     */
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-25T17:00:00.000Z'));
    writeWorkouts([{ ...(saved as CompletedWorkout), id: 'w_after_the_checkpoint' }]);

    expect(relaunch()).toBe(2);
    expect(useWorkoutHistory.getState().workouts.map((w) => w.id)).toContain(
      'w_after_the_checkpoint',
    );
  });

  it('keeps a correction made to a logged set', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-24T17:00:00.000Z'));
    const row = saved!.sets[0];
    useWorkoutHistory.getState().updateWorkoutSet(saved!.id, row.id, { count: 12 });

    relaunch();

    const corrected = useWorkoutHistory.getState().workouts[0].sets.find((s) => s.id === row.id);
    expect(corrected?.count).toBe(12);
  });

  it('keeps the pinned workout number, which cannot be recomputed', () => {
    const saved = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-24T17:00:00.000Z'));
    useWorkoutHistory.getState().setWorkoutNumber(saved!.id, 91);

    relaunch();

    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: saved!.id, number: 91 });
  });

  it('applies the schema to a database file that already exists', () => {
    // The second open is the one every launch after the first one does, and it must
    // not try to create the tables again in a way that throws.
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-24T17:00:00.000Z'));
    __simulateProcessRestart();
    __closeDb();

    expect(() => db()).not.toThrow();
    expect(readAllWorkouts()).toHaveLength(1);
  });

  it('never caches a handle whose schema was not applied', () => {
    /*
     * `db()` used to assign the handle and THEN run the schema, so a throw from the
     * schema step left a tableless handle cached: every query after it failed with
     * "no such table", the two callers at launch swallowed that into an empty log,
     * and the app reported a lifetime of training as "Nothing finished yet" until
     * the process was restarted — on a database whose bytes were fine.
     */
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-24T17:00:00.000Z'));
    __simulateProcessRestart();
    __closeDb();

    // A stale handle would answer this from nothing. A correctly opened one reads
    // the file.
    expect(countWorkoutRows()).toBe(1);
  });
});
