import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MAX_WORKOUTS,
  historyTotals,
  recentSummaries,
  useWorkoutHistory,
} from './workoutHistoryStore';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { historyByExerciseId } from '../lib/completedWorkout';
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

beforeEach(() => {
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

describe('rehydration', () => {
  async function rehydrateWith(state: unknown) {
    await AsyncStorage.setItem('workout-history', JSON.stringify({ state, version: 1 }));
    await useWorkoutHistory.persist.rehydrate();
    return useWorkoutHistory.getState().workouts;
  }

  it('restores well-formed workouts', async () => {
    const stored = useWorkoutHistory
      .getState()
      .saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    const workouts = await rehydrateWith({ workouts: [stored] });

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
    const workouts = await rehydrateWith(blob);
    expect(Array.isArray(workouts)).toBe(true);
  });

  it('drops a workout with no id, title or date', async () => {
    const workouts = await rehydrateWith({
      workouts: [
        { title: 'No id', startedAt: '2026-08-17T17:00:00.000Z' },
        { id: 'w1', startedAt: '2026-08-17T17:00:00.000Z' },
        { id: 'w2', title: 'No date' },
        { id: 'w3', title: 'Bad date', startedAt: 'yesterday-ish' },
      ],
    });

    expect(workouts).toEqual([]);
  });

  it('repairs a workout whose numbers are junk rather than losing it', async () => {
    const workouts = await rehydrateWith({
      workouts: [
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
      ],
    });

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

    const workouts = await rehydrateWith({
      workouts: [
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
      ],
    });

    expect(workouts[0].sets.map((s) => s.id)).toEqual(['sh1']);
  });

  /*
   * 0.11.0 deleted five fields from `SetHistory`: `estimated1RM`, `rpe`, `notes`,
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
    const workouts = await rehydrateWith({
      workouts: [
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
      ],
    });

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
   * `volumeIsPartial` arrived in 0.11.0 as well, and unlike the five deletions it
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

    const workouts = await rehydrateWith({
      workouts: [
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
      ],
    });

    const byId = Object.fromEntries(workouts.map((w) => [w.id, w.volumeIsPartial]));
    expect(byId).toEqual({ w1: false, w2: true, w3: false });
  });

  it('keeps at most MAX_WORKOUTS, newest first', async () => {
    const many = Array.from({ length: MAX_WORKOUTS + 20 }, (_, i) => ({
      id: `w${i}`,
      title: 'Pull',
      // Descending dates: index 0 is the newest.
      startedAt: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
      exercises: [],
      sets: [],
    }));

    const workouts = await rehydrateWith({ workouts: many });
    expect(workouts).toHaveLength(MAX_WORKOUTS);
    expect(workouts[0].id).toBe('w0');
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
