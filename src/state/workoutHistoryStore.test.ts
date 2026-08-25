import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  historyTotals,
  migrateHistoryIfNeeded,
  recentSummaries,
  useWorkoutHistory,
} from './workoutHistoryStore';
import {
  LEGACY_STORAGE_KEY,
  __closeDb,
  countSetRows,
  db,
  migrateFromAsyncStorage,
  readAllWorkouts,
} from './historyDb';
import { __resetDatabases } from '../../test/expoSqliteStub';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { historyByExerciseId, type CompletedWorkout } from '../lib/completedWorkout';
import { evaluateOverload } from '../lib/progressiveOverload';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

/** A draft with its first `count` sets logged, at a known weight. */
function loggedDraft(startedAt: string, count = 2, weightKg = 40): DraftSession {
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
          i < count ? { ...s, isCompleted: true, weightKg, isPrefilled: false } : s,
        ),
      },
      ...rest,
    ],
  };
}

/*
 * A clean database AND a clean AsyncStorage between tests.
 *
 * `__resetDatabases` drops the in-memory SQLite file so the schema — and the `meta`
 * row recording that the migration has run — starts fresh; `__closeDb` drops the
 * cached handle so the next `db()` opens the new one. Without both, the migration
 * suite would see "already done" from whichever test ran first.
 */
beforeEach(async () => {
  __resetDatabases();
  __closeDb();
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  useWorkoutHistory.getState().clearHistory();
});

/* ------------------------------------------------------------------ */

describe('saving a finished session', () => {
  it('stores it and returns what was stored', () => {
    const stored = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z'), new Date('2026-08-17T18:00:00.000Z'));

    expect(stored).not.toBeNull();
    expect(useWorkoutHistory.getState().workouts).toHaveLength(1);
    expect(useWorkoutHistory.getState().workouts[0].id).toBe(stored?.id);
    expect(stored?.durationMinutes).toBe(60);
  });

  it('stores nothing for a session with no logged sets', () => {
    const empty = loggedDraft('2026-08-17T17:00:00.000Z', 0);

    expect(useWorkoutHistory.getState().saveSession(empty)).toBeNull();
    expect(useWorkoutHistory.getState().workouts).toEqual([]);
  });

  it('saving the same session twice is one workout, not two', () => {
    const session = loggedDraft('2026-08-17T17:00:00.000Z');
    // A double-tap on Finish, or a finish that raced a rehydration.
    useWorkoutHistory.getState().saveSession(session);
    useWorkoutHistory.getState().saveSession(session);

    expect(useWorkoutHistory.getState().workouts).toHaveLength(1);
  });

  it('keeps the list newest first, whatever order things arrive in', () => {
    const { saveSession } = useWorkoutHistory.getState();
    saveSession(loggedDraft('2026-08-10T17:00:00.000Z'));
    saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    saveSession(loggedDraft('2026-08-14T17:00:00.000Z'));

    const dates = useWorkoutHistory.getState().workouts.map((w) => w.startedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('deletes one workout without touching the others', () => {
    const { saveSession } = useWorkoutHistory.getState();
    const a = saveSession(loggedDraft('2026-08-10T17:00:00.000Z'));
    saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));

    useWorkoutHistory.getState().deleteWorkout(a?.id ?? '');
    expect(useWorkoutHistory.getState().workouts).toHaveLength(1);
    expect(useWorkoutHistory.getState().workouts[0].id).not.toBe(a?.id);
  });
});

/* ------------------------------------------------------------------ */

/**
 * WHAT COMES OFF DISK IS VALIDATED, NOT TRUSTED — rule 4, still.
 *
 * These were `persist.rehydrate()` tests against an AsyncStorage blob. The log
 * moved into SQLite in 0.12.0 and the GUARD did not change, because a column can
 * hold nonsense exactly as a JSON blob can — so they are the same tests pointed at
 * the seam that survived.
 *
 * `importWorkouts` is that seam. It takes `unknown`, runs it through the one
 * validator, and is the same call the launch read and a restored backup both make;
 * the database round-trip has its own describe block below. Going in this way is
 * also the only way to ask these questions at all: the schema itself refuses a row
 * with no title or no date, so a workout that malformed cannot be written to the
 * database to be read back.
 */
describe('what comes off disk is validated, not trusted', () => {
  /** Push raw rows through the one guard, exactly as a launch read does. */
  function validate(raw: unknown) {
    useWorkoutHistory.getState().importWorkouts(raw);
    return useWorkoutHistory.getState().workouts;
  }

  it('restores well-formed workouts', async () => {
    const stored = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    const workouts = validate([stored]);

    expect(workouts).toHaveLength(1);
    expect(workouts[0].id).toBe(stored?.id);
    expect(workouts[0].sets).toHaveLength(stored?.sets.length ?? 0);
  });

  it.each([
    ['a string', 'not history'],
    ['a number', 7],
    ['null', null],
    ['a workouts field that is not an array', { workouts: 'nope' }],
  ])('survives %s', async (_label, blob) => {
    const workouts = validate(blob);
    expect(Array.isArray(workouts)).toBe(true);
  });

  it('drops a workout with no id, title or date', async () => {
    const workouts = validate([
      { title: 'No id', startedAt: '2026-08-17T17:00:00.000Z' },
      { id: 'w1', startedAt: '2026-08-17T17:00:00.000Z' },
      { id: 'w2', title: 'No date' },
      { id: 'w3', title: 'Bad date', startedAt: 'yesterday-ish' },
    ]);

    expect(workouts).toEqual([]);
  });

  it('repairs a workout whose numbers are junk rather than losing it', async () => {
    const workouts = validate([
      {
        id: 'w1',
        title: 'Pull',
        startedAt: '2026-08-17T17:00:00.000Z',
        durationMinutes: null,
        setCount: NaN,
        totalVolumeKg: 'lots',
        exercises: [],
        sets: [],
      },
    ]);

    // The session happened. A missing duration is a number, not a reason to
    // forget it.
    expect(workouts).toHaveLength(1);
    expect(workouts[0].durationMinutes).toBe(1);
    expect(workouts[0].setCount).toBe(0);
    expect(workouts[0].totalVolumeKg).toBe(0);
    expect(workouts[0].endedAt).toBe('2026-08-17T17:00:00.000Z');
  });

  it('drops malformed SET ROWS, which feed every future suggestion', async () => {
    const good = {
      id: 'sh1',
      sessionId: 'w1',
      exerciseId: 'ex_pullup_90',
      performedAt: '2026-08-17T17:00:00.000Z',
      setIndex: 0,
      weightKg: 40,
      count: 4,
      countUnit: 'reps',
      loadMode: 'added_bodyweight',
      isWarmup: false,
      isCompleted: true,
    };

    const workouts = validate([
      {
        id: 'w1',
        title: 'Pull',
        startedAt: '2026-08-17T17:00:00.000Z',
        exercises: [],
        sets: [
          good,
          { ...good, id: 'sh2', count: null }, // a NaN count would poison a verdict
          { ...good, id: 'sh3', countUnit: 'furlongs' },
          { ...good, id: 'sh4', performedAt: 'sometime' },
          { ...good, id: 'sh5', exerciseId: 42 },
        ],
      },
    ]);

    expect(workouts[0].sets.map((s) => s.id)).toEqual(['sh1']);
  });

  /*
   * 0.12.0 deleted five fields from `SetHistory`: `estimated1RM`, `rpe`, `notes`,
   * `side` and `partials`. Every blob already on a phone, and every backup file
   * already exported, still carries them.
   *
   * This is the test that made the guard change: it used to be a PREDICATE feeding
   * `{ ...row, isCompleted: true }`, which validated the fields it knew about and
   * copied the rest straight through — so a deleted field would have survived
   * rehydration in memory and been written back out on the next save, for the life
   * of the install. `sanitizeSetRow` names every key instead, which is the same
   * argument `sanitizeSettings` makes about `partialize`.
   */
  it('drops fields that are no longer part of a set row', async () => {
    const workouts = validate([
      {
        id: 'w1',
        title: 'Pull',
        startedAt: '2026-08-17T17:00:00.000Z',
        exercises: [],
        sets: [
          {
            id: 'sh1',
            sessionId: 'w1',
            exerciseId: 'ex_pullup_90',
            performedAt: '2026-08-17T17:00:00.000Z',
            setIndex: 0,
            weightKg: 40,
            count: 4,
            countUnit: 'reps',
            loadMode: 'added_bodyweight',
            isWarmup: false,
            isCompleted: true,
            // Everything below this line was declared on `SetHistory` in 0.10.0.
            estimated1RM: 45.33,
            rpe: 8,
            notes: 'felt heavy',
            side: 'both',
            partials: 1,
            // ...and one field nothing has ever declared, for good measure.
            somethingNobodyWrote: true,
          },
        ],
      },
    ]);

    const [row] = workouts[0].sets;
    expect(row.id).toBe('sh1');
    expect(Object.keys(row).sort()).toEqual([
      'count',
      'countUnit',
      'exerciseId',
      'id',
      'isCompleted',
      'isWarmup',
      'loadMode',
      'performedAt',
      'sessionId',
      'setIndex',
      'weightKg',
    ]);
  });

  /*
   * `volumeIsPartial` arrived in 0.12.0 as well, and unlike the five deletions it
   * has to be RECOVERED rather than dropped: a pre-0.11 workout's volume figure
   * skipped every bodyweight and assisted set, which is exactly what the flag now
   * means. Derived from the rows rather than defaulted, so an old all-barbell
   * session keeps showing its volume.
   */
  it('recovers whether an older workout could weigh everything in it', async () => {
    const row = (id: string, loadMode: string, countUnit = 'reps') => ({
      id,
      sessionId: 'w1',
      exerciseId: 'ex_x',
      performedAt: '2026-08-17T17:00:00.000Z',
      setIndex: 0,
      weightKg: 40,
      count: 8,
      countUnit,
      loadMode,
      isWarmup: false,
      isCompleted: true,
    });

    const workouts = validate([
      {
        id: 'w1',
        title: 'Barbell only',
        startedAt: '2026-08-17T17:00:00.000Z',
        totalVolumeKg: 2560,
        exercises: [],
        sets: [row('a', 'external')],
      },
      {
        id: 'w2',
        title: 'Dips',
        startedAt: '2026-08-16T17:00:00.000Z',
        totalVolumeKg: 320,
        exercises: [],
        sets: [row('b', 'external'), row('c', 'added_bodyweight')],
      },
      {
        id: 'w3',
        title: 'Boxing',
        startedAt: '2026-08-15T17:00:00.000Z',
        exercises: [],
        // Time-counted work has no weight volume to be missing.
        sets: [row('d', 'none', 'rounds')],
      },
    ]);

    const byId = Object.fromEntries(workouts.map((w) => [w.id, w.volumeIsPartial]));
    expect(byId).toEqual({ w1: false, w2: true, w3: false });
  });

  /*
   * This asserted a cap: `expect(workouts).toHaveLength(MAX_WORKOUTS)`, at 250.
   * The cap's own comment was honest that it was a STORAGE decision — AsyncStorage
   * is one string per key and every Finish re-serialised the whole log — and
   * `historyDb.ts` removed the blob it was protecting. So the assertion is now the
   * opposite one, which is rule 6: nothing falls off the end.
   */
  it('keeps every workout — there is no cap once the blob is gone', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      id: `w${i}`,
      title: 'Pull',
      // Descending dates: index 0 is the newest.
      startedAt: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
      exercises: [],
      sets: [],
    }));

    const workouts = validate(many);
    expect(workouts).toHaveLength(400);
    expect(workouts[0].id).toBe('w0');
    expect(workouts[399].id).toBe('w399');
  });

  it('sorts newest first however the rows arrive', () => {
    const workouts = validate([
      {
        id: 'w_mid',
        title: 'Pull',
        startedAt: '2026-08-10T17:00:00.000Z',
        exercises: [],
        sets: [],
      },
      {
        id: 'w_new',
        title: 'Pull',
        startedAt: '2026-08-17T17:00:00.000Z',
        exercises: [],
        sets: [],
      },
      {
        id: 'w_old',
        title: 'Pull',
        startedAt: '2026-08-01T17:00:00.000Z',
        exercises: [],
        sets: [],
      },
    ]);

    expect(workouts.map((w) => w.id)).toEqual(['w_new', 'w_mid', 'w_old']);
  });
});

/* ------------------------------------------------------------------ */

describe('derived', () => {
  it('totals workouts, sets and volume', () => {
    const { saveSession } = useWorkoutHistory.getState();
    saveSession(loggedDraft('2026-08-10T17:00:00.000Z', 2));
    saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3));

    const { workouts } = useWorkoutHistory.getState();
    const totals = historyTotals(workouts);

    expect(totals.workouts).toBe(2);
    expect(totals.sets).toBe(5);
    expect(totals.volumeKg).toBe(workouts.reduce((n, w) => n + w.totalVolumeKg, 0));
  });

  it('recentSummaries takes the newest few, in four fields', () => {
    const { saveSession } = useWorkoutHistory.getState();
    for (let day = 1; day <= 6; day += 1) {
      saveSession(loggedDraft(`2026-08-0${day}T17:00:00.000Z`));
    }

    const recent = recentSummaries(useWorkoutHistory.getState().workouts, 4);
    expect(recent).toHaveLength(4);
    expect(recent[0].performedAt).toBe('2026-08-06T17:00:00.000Z');
    expect(Object.keys(recent[0]).sort()).toEqual([
      'durationMinutes',
      'id',
      'performedAt',
      'title',
    ]);
  });

  it('is empty, not undefined, before anything has been finished', () => {
    expect(historyTotals([])).toEqual({
      workouts: 0,
      sets: 0,
      volumeKg: 0,
      volumeIsPartial: false,
    });
    expect(recentSummaries([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

/**
 * Correcting one logged set — the ONE exception to "nothing in here is rewritten".
 *
 * 40 kg typed where 4 was meant used to cost the whole session: deleting the
 * workout and re-entering it was the only route, and it also took those sets out of
 * what the prefills and the suggestions read. The app still never rewrites a row on
 * its own; the user can correct one.
 */
describe('correcting a logged set', () => {
  /** A saved workout whose first exercise has `count` sets at `weightKg`. */
  function saved(count = 3, weightKg = 40) {
    useWorkoutHistory.getState().clearHistory();
    const stored = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z', count, weightKg));
    if (!stored) throw new Error('nothing was saved');
    return stored;
  }

  const current = (id: string) => useWorkoutHistory.getState().workouts.find((w) => w.id === id);

  it('rewrites the row and recomputes the summary and the volume', () => {
    const before = saved(3, 40);
    const [first] = before.sets;

    expect(
      useWorkoutHistory.getState().updateWorkoutSet(before.id, first.id, { weightKg: 4 }),
    ).toBe(true);

    const after = current(before.id);
    expect(after?.sets.find((r) => r.id === first.id)?.weightKg).toBe(4);
    // Regenerated through the shared shorthand, not patched.
    expect(after?.exercises[0].summary).toContain('+4 kg');
    expect(after?.exercises[0].summary).not.toBe(before.exercises[0].summary);
  });

  it('recomputes the exercise total from a corrected count', () => {
    const before = saved(3, 40);
    const [first] = before.sets;

    useWorkoutHistory.getState().updateWorkoutSet(before.id, first.id, { count: first.count + 4 });

    expect(current(before.id)?.exercises[0].totalCount).toBe(before.exercises[0].totalCount + 4);
  });

  it('changes what a later overload verdict sees', () => {
    /*
     * The reason a correction has to reach the ROWS and not just the rendered
     * summary: those rows are what every future suggestion reads. A 4 kg typo left
     * in the log is a plateau the engine can see and the user cannot explain.
     */
    const before = saved(3, 40);
    const exerciseId = before.sets[0].exerciseId;
    const exercise = { id: exerciseId, requiresWeight: true, countUnit: 'reps' as const };

    const topBefore = evaluateOverload({
      exercise,
      history: historyByExerciseId(useWorkoutHistory.getState().workouts)[exerciseId] ?? [],
      now: new Date('2026-08-18T12:00:00.000Z'),
    }).currentWeightKg;
    expect(topBefore).toBe(40);

    // Every set of that session was typed a decimal place out.
    for (const row of before.sets) {
      useWorkoutHistory.getState().updateWorkoutSet(before.id, row.id, { weightKg: 4 });
    }

    const topAfter = evaluateOverload({
      exercise,
      history: historyByExerciseId(useWorkoutHistory.getState().workouts)[exerciseId] ?? [],
      now: new Date('2026-08-18T12:00:00.000Z'),
    }).currentWeightKg;
    expect(topAfter).toBe(4);
  });

  it('removes a single set and recomputes around it', () => {
    const before = saved(3, 40);
    const [first] = before.sets;

    expect(useWorkoutHistory.getState().deleteWorkoutSet(before.id, first.id)).toBe(true);

    const after = current(before.id);
    expect(after?.sets.some((r) => r.id === first.id)).toBe(false);
    expect(after?.setCount).toBe(before.setCount - 1);
    expect(after?.exercises[0].setCount).toBe(before.exercises[0].setCount - 1);
  });

  it('refuses to delete the LAST set — that is deleting the workout', () => {
    const before = saved(1, 40);
    expect(before.sets).toHaveLength(1);

    expect(useWorkoutHistory.getState().deleteWorkoutSet(before.id, before.sets[0].id)).toBe(false);
    // The workout is untouched, and `deleteWorkout` — which asks first — still
    // exists for somebody who means it.
    expect(current(before.id)?.sets).toHaveLength(1);
  });

  it('is a no-op for a workout or a set that is not there', () => {
    const before = saved(2, 40);

    expect(
      useWorkoutHistory.getState().updateWorkoutSet('w_nope', before.sets[0].id, { count: 1 }),
    ).toBe(false);
    expect(useWorkoutHistory.getState().updateWorkoutSet(before.id, 'sh_nope', { count: 1 })).toBe(
      false,
    );
    expect(useWorkoutHistory.getState().deleteWorkoutSet(before.id, 'sh_nope')).toBe(false);
    expect(current(before.id)?.sets).toHaveLength(before.sets.length);
  });

  it('can null a weight out, which is a real value and not "no change"', () => {
    const before = saved(2, 40);
    useWorkoutHistory.getState().updateWorkoutSet(before.id, before.sets[0].id, {
      weightKg: null,
    });

    expect(current(before.id)?.sets[0].weightKg).toBeNull();
  });

  it('leaves the workout’s identity and dates alone', () => {
    const before = saved(2, 40);
    useWorkoutHistory.getState().updateWorkoutSet(before.id, before.sets[0].id, { count: 1 });
    const after = current(before.id);

    expect(after?.title).toBe(before.title);
    expect(after?.startedAt).toBe(before.startedAt);
    expect(after?.endedAt).toBe(before.endedAt);
    expect(after?.durationMinutes).toBe(before.durationMinutes);
  });
});

/* ------------------------------------------------------------------ */

/**
 * MERGING a log in, rather than replacing this one.
 *
 * Safe for a reason already written down: rule 3 of this store says finishing twice
 * is one workout, because the id is the session's own. So a union keyed on id
 * cannot produce two rows for one workout, which is the failure mode that makes
 * merging a LIBRARY unauditable — and why only workouts merge.
 */
describe('mergeWorkouts', () => {
  function stored(id: string, startedAt: string): CompletedWorkout {
    const saved = useWorkoutHistory
      .getState()
      .saveSession({ ...loggedDraft(startedAt), localId: id });
    if (!saved) throw new Error('nothing was saved');
    return saved;
  }

  it('adds a disjoint log and re-sorts newest first', () => {
    useWorkoutHistory.getState().clearHistory();
    const local = stored('w_local', '2026-08-10T17:00:00.000Z');

    useWorkoutHistory.getState().clearHistory();
    const incoming = [
      stored('w_new', '2026-08-17T17:00:00.000Z'),
      stored('w_old', '2026-08-01T17:00:00.000Z'),
    ];

    useWorkoutHistory.getState().importWorkouts([local]);
    expect(useWorkoutHistory.getState().mergeWorkouts(incoming)).toBe(2);

    expect(useWorkoutHistory.getState().workouts.map((w) => w.id)).toEqual([
      'w_new',
      'w_local',
      'w_old',
    ]);
  });

  it('keeps the LOCAL copy on an id collision', () => {
    // The row on this phone is the one whose corrections were made here. "The file
    // is authoritative" is what `importWorkouts` is for.
    useWorkoutHistory.getState().clearHistory();
    const mine = stored('w_same', '2026-08-10T17:00:00.000Z');
    const edited: CompletedWorkout = { ...mine, title: 'Renamed on the other phone' };

    expect(useWorkoutHistory.getState().mergeWorkouts([edited])).toBe(0);
    expect(useWorkoutHistory.getState().workouts[0].title).toBe(mine.title);
  });

  it('changes no local row when the file adds nothing', () => {
    useWorkoutHistory.getState().clearHistory();
    stored('w_a', '2026-08-10T17:00:00.000Z');
    const before = useWorkoutHistory.getState().workouts;

    expect(useWorkoutHistory.getState().mergeWorkouts(before)).toBe(0);
    // Same array contents AND the same objects: a no-op merge must not rewrite a
    // single row.
    expect(useWorkoutHistory.getState().workouts).toEqual(before);
  });

  it('adds only the ids this phone is missing from an overlapping file', () => {
    useWorkoutHistory.getState().clearHistory();
    const shared = stored('w_shared', '2026-08-10T17:00:00.000Z');
    useWorkoutHistory.getState().clearHistory();
    const theirs = stored('w_theirs', '2026-08-12T17:00:00.000Z');

    useWorkoutHistory.getState().importWorkouts([shared]);
    expect(useWorkoutHistory.getState().mergeWorkouts([shared, theirs])).toBe(1);
    expect(
      useWorkoutHistory
        .getState()
        .workouts.map((w) => w.id)
        .sort(),
    ).toEqual(['w_shared', 'w_theirs']);
  });

  it('validates the incoming rows with the same guard as everything else', () => {
    useWorkoutHistory.getState().clearHistory();
    expect(
      useWorkoutHistory.getState().mergeWorkouts([{ id: 'w_bad' }, 'not even an object', null]),
    ).toBe(0);
    expect(useWorkoutHistory.getState().workouts).toEqual([]);
  });

  it('is zero for anything that is not a list of workouts', () => {
    useWorkoutHistory.getState().clearHistory();
    for (const bad of [null, undefined, 'nope', 7, {}, []]) {
      expect(useWorkoutHistory.getState().mergeWorkouts(bad)).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */

/**
 * THE DATABASE ROUND-TRIP — rule 6.
 *
 * Everything above is about the guard. This is about the bytes: does what the store
 * writes come back out of SQLite as the same workout, with its sets, in the right
 * order, and does deleting one take its rows with it.
 *
 * Read through `readAllWorkouts` rather than by restarting the store, because the
 * store's own initializer is the same call — this is what a launch does.
 */
describe('the log survives a round trip through SQLite', () => {
  const readIds = () => (readAllWorkouts() as CompletedWorkout[]).map((w) => w.id);

  it('writes a finished workout and reads it back whole', () => {
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3, 40));
    if (!saved) throw new Error('nothing was saved');

    const [read] = readAllWorkouts() as CompletedWorkout[];

    expect(read.id).toBe(saved.id);
    expect(read.title).toBe(saved.title);
    expect(read.startedAt).toBe(saved.startedAt);
    expect(read.endedAt).toBe(saved.endedAt);
    expect(read.durationMinutes).toBe(saved.durationMinutes);
    expect(read.setCount).toBe(saved.setCount);
    expect(read.totalVolumeKg).toBe(saved.totalVolumeKg);
    expect(read.volumeIsPartial).toBe(saved.volumeIsPartial);
    // The exercise snapshots ride in their JSON column, whole.
    expect(read.exercises).toEqual(saved.exercises);
    // And the rows come back attached to the right workout, in set order.
    expect(read.sets.map((r) => r.id)).toEqual(saved.sets.map((r) => r.id));
  });

  it('round-trips every field of a set row, including the optional ones', () => {
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 2, 40));
    if (!saved) throw new Error('nothing was saved');

    // A warm-up, a measured rest, and an unweighted row — the three shapes a
    // column could get wrong.
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, saved.sets[0].id, { isWarmup: true });
    useWorkoutHistory.getState().updateWorkoutSet(saved.id, saved.sets[1].id, { weightKg: null });

    const [read] = readAllWorkouts() as CompletedWorkout[];
    expect(read.sets[0].isWarmup).toBe(true);
    expect(read.sets[1].isWarmup).toBe(false);
    expect(read.sets[1].weightKg).toBeNull();
    // `isCompleted` is not a column: only completed sets are ever written, so it
    // is reconstructed as true rather than stored.
    expect(read.sets.every((r) => r.isCompleted)).toBe(true);
  });

  it('reads newest first, which is how every screen wants it', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-01T17:00:00.000Z'));
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-10T17:00:00.000Z'));

    const dates = (readAllWorkouts() as CompletedWorkout[]).map((w) => w.startedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('takes a workout’s sets with it when the workout goes', () => {
    // `ON DELETE CASCADE`, and `PRAGMA foreign_keys = ON` is what makes it happen —
    // SQLite has it off by default and a foreign key nobody enforces is a comment.
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3, 40));
    if (!saved) throw new Error('nothing was saved');
    expect(countSetRows()).toBe(saved.sets.length);

    useWorkoutHistory.getState().deleteWorkout(saved.id);

    expect(readIds()).toEqual([]);
    expect(countSetRows()).toBe(0);
  });

  it('replaces rather than duplicating when the same workout is saved twice', () => {
    // Rule 3: finishing twice is one workout. `INSERT OR REPLACE` is how the
    // database says the same thing.
    const draft = loggedDraft('2026-08-17T17:00:00.000Z', 3, 40);
    const first = useWorkoutHistory.getState().saveSession(draft);
    const second = useWorkoutHistory.getState().saveSession(draft);

    expect(first?.id).toBe(second?.id);
    expect(readIds()).toHaveLength(1);
    expect(countSetRows()).toBe(second?.sets.length);
  });

  it('leaves no orphaned set rows behind a correction', () => {
    // A correction rewrites the row list wholesale — delete-then-reinsert — so a
    // removed set must not survive in the table.
    const saved = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3, 40));
    if (!saved) throw new Error('nothing was saved');

    useWorkoutHistory.getState().deleteWorkoutSet(saved.id, saved.sets[0].id);

    expect(countSetRows()).toBe(saved.sets.length - 1);
    const [read] = readAllWorkouts() as CompletedWorkout[];
    expect(read.sets.some((r) => r.id === saved.sets[0].id)).toBe(false);
  });

  it('clears both tables together', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3, 40));
    useWorkoutHistory.getState().clearHistory();

    expect(readIds()).toEqual([]);
    expect(countSetRows()).toBe(0);
  });

  it('has the index models.ts describes', () => {
    /*
     * `src/types/models.ts` opens by saying progressive-overload analysis is ONE
     * indexed range scan over `(exercise_id, performed_at)`, and that is the whole
     * reason `SetHistory` is denormalised the way it is. The index existing is the
     * part of that claim this test can check; that it is USED is the query planner's
     * business, so the plan is asked for too.
     */
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 3, 40));

    const indexes = db().getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'set_history'",
    );
    expect(indexes.map((i) => i.name)).toContain('set_history_exercise_at');

    const plan = db().getAllSync<{ detail: string }>(
      `EXPLAIN QUERY PLAN
         SELECT * FROM set_history
         WHERE exercise_id = ? AND is_warmup = 0
         ORDER BY performed_at DESC LIMIT 200`,
      'ex_pullup_90',
    );
    expect(plan.map((r) => r.detail).join(' ')).toContain('set_history_exercise_at');
  });
});

/* ------------------------------------------------------------------ */

/**
 * THE MIGRATION — the single most dangerous change in 0.12.0.
 *
 * It is somebody's training log, so the tests come before the confidence. The rules
 * being checked here are the ones in `historyDb.ts`'s header: one transaction, read
 * back and counted before anything is recorded as done, the old key NEVER deleted,
 * and every row through the store's own validator.
 */
describe('migrating the log out of AsyncStorage', () => {
  /** A 0.10.0-shaped persisted blob: zustand's `{ state, version }` envelope. */
  async function legacyBlob(workouts: unknown[]) {
    await AsyncStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ state: { workouts }, version: 1 }),
    );
  }

  /** Two real workouts, built the way 0.10.0 would have stored them. */
  function twoWorkouts(): CompletedWorkout[] {
    useWorkoutHistory.getState().clearHistory();
    const a = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-10T17:00:00.000Z', 3));
    const b = useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z', 2));
    if (!a || !b) throw new Error('fixtures failed');
    const both = [b, a];
    useWorkoutHistory.getState().clearHistory();
    return both;
  }

  const sanitize = (raw: unknown) => useWorkoutHistory.getState().importWorkouts(raw);

  /** The store's own validator, as the migration receives it. */
  function guard(raw: unknown): CompletedWorkout[] {
    const before = useWorkoutHistory.getState().workouts;
    sanitize(raw);
    const validated = useWorkoutHistory.getState().workouts;
    useWorkoutHistory.getState().importWorkouts(before);
    return validated;
  }

  it('brings a real log across, row for row', async () => {
    const expected = twoWorkouts();
    await legacyBlob(expected);
    // Start from a genuinely empty database, as a fresh install of 0.12.0 would.
    useWorkoutHistory.getState().clearHistory();

    const outcome = await migrateFromAsyncStorage(guard);

    expect(outcome.status).toBe('migrated');
    expect(outcome.workouts).toBe(2);
    expect(outcome.sets).toBe(expected.reduce((n, w) => n + w.sets.length, 0));

    const read = readAllWorkouts() as CompletedWorkout[];
    expect(read.map((w) => w.id)).toEqual(expected.map((w) => w.id));
    expect(read[0].sets.map((r) => r.id)).toEqual(expected[0].sets.map((r) => r.id));
  });

  it('brings the pinned workout number across with the log', async () => {
    /*
     * The build that introduced the pin persisted it inside this same blob, beside
     * the workouts. Moving the workouts and dropping the pin would renumber the
     * whole log on the first launch after the update, with nothing said about it —
     * and the pin is the one fact in the app that cannot be recomputed from the
     * sessions. See `legacyNumbering`.
     */
    const expected = twoWorkouts();
    await AsyncStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        state: { workouts: expected, numbering: { workoutId: expected[0].id, number: 91 } },
        version: 1,
      }),
    );
    useWorkoutHistory.getState().clearHistory();

    await migrateHistoryIfNeeded();

    expect(useWorkoutHistory.getState().workouts).toHaveLength(2);
    expect(useWorkoutHistory.getState().numbering).toEqual({
      workoutId: expected[0].id,
      number: 91,
    });
  });

  it('drops a legacy pin pointing at a workout that did not survive', async () => {
    // Validated against what actually landed, not against what the blob claimed:
    // a pin onto a workout the guard dropped is a pin onto nothing.
    const expected = twoWorkouts();
    await AsyncStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        state: { workouts: expected, numbering: { workoutId: 'w_never_existed', number: 91 } },
        version: 1,
      }),
    );
    useWorkoutHistory.getState().clearHistory();

    await migrateHistoryIfNeeded();

    expect(useWorkoutHistory.getState().workouts).toHaveLength(2);
    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });

  it('NEVER deletes the old key, on success or otherwise', async () => {
    // Rule 3 of the migration. A few hundred kilobytes is a cheap price for the
    // only remaining copy of anything that goes wrong quietly.
    const expected = twoWorkouts();
    await legacyBlob(expected);
    useWorkoutHistory.getState().clearHistory();

    await migrateFromAsyncStorage(guard);

    expect(await AsyncStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('runs exactly once', async () => {
    const expected = twoWorkouts();
    await legacyBlob(expected);
    useWorkoutHistory.getState().clearHistory();

    expect((await migrateFromAsyncStorage(guard)).status).toBe('migrated');
    // Second launch: nothing to do, and — crucially — it must not re-import over a
    // log the user has since edited.
    expect((await migrateFromAsyncStorage(guard)).status).toBe('already-done');
  });

  it('does not resurrect a workout the user deleted after migrating', async () => {
    const expected = twoWorkouts();
    await legacyBlob(expected);
    useWorkoutHistory.getState().clearHistory();
    await migrateFromAsyncStorage(guard);

    // The old key still holds both. Delete one, relaunch.
    useWorkoutHistory.getState().importWorkouts(readAllWorkouts());
    useWorkoutHistory.getState().deleteWorkout(expected[0].id);
    await migrateFromAsyncStorage(guard);

    expect((readAllWorkouts() as CompletedWorkout[]).map((w) => w.id)).toEqual([expected[1].id]);
  });

  it('records a fresh install as done rather than asking forever', async () => {
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);

    expect((await migrateFromAsyncStorage(guard)).status).toBe('nothing-to-move');
    expect((await migrateFromAsyncStorage(guard)).status).toBe('already-done');
  });

  it('survives a corrupt blob without losing the database', async () => {
    await AsyncStorage.setItem(LEGACY_STORAGE_KEY, 'this is not JSON {');

    const outcome = await migrateFromAsyncStorage(guard);

    expect(outcome.status).toBe('failed');
    expect(readAllWorkouts()).toEqual([]);
    // Nothing in it to lose, and the key stays for anybody who wants to look.
    expect(await AsyncStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it('refuses to record success when the read-back count disagrees', async () => {
    /*
     * Rule 2, and the reason the sanitizer is passed IN rather than imported: hand
     * the migration a guard that claims more rows than it writes and the
     * verification has to catch it. A partially migrated log is the one outcome
     * worse than a failed migration, because it is indistinguishable from a
     * complete one.
     */
    const expected = twoWorkouts();
    await legacyBlob(expected);
    useWorkoutHistory.getState().clearHistory();

    const lying = (raw: unknown): CompletedWorkout[] => {
      const real = guard(raw);
      // One extra workout that shares an id, so the insert writes one row and the
      // count expects two.
      return [...real, { ...real[0] }];
    };

    const outcome = await migrateFromAsyncStorage(lying);
    expect(outcome.status).toBe('failed');

    // ...and because it did not record success, the next launch tries again.
    expect((await migrateFromAsyncStorage(guard)).status).toBe('migrated');
  });

  it('validates the legacy rows with the store’s own guard', async () => {
    // Not a second validator. A malformed row that AsyncStorage happily held is
    // dropped on the way into the database, exactly as it was dropped on the way
    // out of AsyncStorage before.
    const good = twoWorkouts();
    await legacyBlob([...good, { id: 'w_bad' }, 'not an object', null]);
    useWorkoutHistory.getState().clearHistory();

    const outcome = await migrateFromAsyncStorage(guard);

    expect(outcome.status).toBe('migrated');
    expect(outcome.workouts).toBe(2);
  });
});

/* ------------------------------------------------------------------ */

describe('workout numbering', () => {
  /** Three finished workouts, oldest first in time. */
  function threeWorkouts() {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-01T10:00:00.000Z'));
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-08T10:00:00.000Z'));
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-15T10:00:00.000Z'));
    // Newest first, as the store keeps them.
    return useWorkoutHistory.getState().workouts;
  }

  it('ships unpinned', () => {
    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });

  it('pins a number to one workout', () => {
    const [newest] = threeWorkouts();
    useWorkoutHistory.getState().setWorkoutNumber(newest.id, 91);

    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: newest.id, number: 91 });
  });

  it('refuses a number below 1, and a workout that is not there', () => {
    const [newest] = threeWorkouts();

    useWorkoutHistory.getState().setWorkoutNumber(newest.id, 0);
    useWorkoutHistory.getState().setWorkoutNumber('nope', 40);

    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });

  it('moves the pin to a neighbour when the pinned workout is deleted', () => {
    const workouts = threeWorkouts();
    const [newest, middle] = workouts;
    useWorkoutHistory.getState().setWorkoutNumber(newest.id, 91);

    useWorkoutHistory.getState().deleteWorkout(newest.id);

    // The pin survives as the number that workout already had, so nothing else
    // in the log renumbers.
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: middle.id, number: 90 });
  });

  it('leaves the pin alone when some other workout is deleted', () => {
    const workouts = threeWorkouts();
    const [newest, , oldest] = workouts;
    useWorkoutHistory.getState().setWorkoutNumber(newest.id, 91);

    useWorkoutHistory.getState().deleteWorkout(oldest.id);

    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: newest.id, number: 91 });
  });

  it('drops the pin when the whole log is cleared', () => {
    const [newest] = threeWorkouts();
    useWorkoutHistory.getState().setWorkoutNumber(newest.id, 91);

    useWorkoutHistory.getState().clearHistory();

    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });

  it('keeps an imported pin only when it points at an imported workout', () => {
    const [newest] = threeWorkouts();
    const workouts = useWorkoutHistory.getState().workouts;

    useWorkoutHistory.getState().importWorkouts(workouts, { workoutId: newest.id, number: 91 });
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: newest.id, number: 91 });

    useWorkoutHistory.getState().importWorkouts(workouts, { workoutId: 'gone', number: 91 });
    expect(useWorkoutHistory.getState().numbering).toBeNull();
  });
});
