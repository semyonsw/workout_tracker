import { describe, expect, it } from 'vitest';

import {
  BALANCE_WINDOWS,
  balanceWindowDays,
  clusterBalance,
  describeClusterTotals,
} from './balance';
import type { CompletedWorkout } from './completedWorkout';
import { formatDuration } from './units';
import type { Exercise, SetHistory } from '../types/models';

/**
 * Sets per cluster, made of data that was already there.
 *
 * The whole point is that nothing here is stored: `lib/muscles.ts` files an
 * exercise by its primary muscle, every set row carries its `exerciseId`, and
 * this is the join. So the tests worth having are about what gets counted and what
 * does not — the window boundary, warm-ups, and the exercise somebody deleted six
 * months after training it.
 */

const NOW = new Date('2026-08-13T12:00:00.000Z');

function exercise(id: string, muscleGroups: Exercise['muscleGroups']): Exercise {
  return {
    id,
    ownerId: 'u1',
    name: id,
    muscleGroups,
    requiresWeight: false,
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** `back` files under pull, `chest` under push, `quads` under legs. */
const library = Object.fromEntries(
  [
    exercise('ex_pullup', ['back', 'biceps']),
    exercise('ex_bench', ['chest', 'triceps']),
    exercise('ex_squat', ['quads', 'glutes']),
    exercise('ex_plank', ['core']),
    exercise('ex_swim', ['cardio']),
  ].map((e) => [e.id, e]),
);

function row(exerciseId: string, overrides: Partial<SetHistory> = {}, index = 0): SetHistory {
  return {
    id: `${exerciseId}-${index}-${overrides.sessionId ?? 'w'}`,
    sessionId: 'w1',
    exerciseId,
    performedAt: '2026-08-11T18:00:00.000Z',
    setIndex: index,
    weightKg: null,
    count: 10,
    countUnit: 'reps',
    loadMode: 'none',
    isWarmup: false,
    isCompleted: true,
    ...overrides,
  };
}

function workout(id: string, startedAt: string, sets: SetHistory[]): CompletedWorkout {
  return {
    id,
    title: 'Session',
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: sets.map((s) => ({ ...s, sessionId: id })),
  };
}

const balance = (workouts: CompletedWorkout[], windowDays: number | null = null) =>
  clusterBalance({ workouts, exercisesById: library, windowDays, now: NOW });

/* ------------------------------------------------------------------ */

describe('clusterBalance', () => {
  it('buckets each set under its exercise’s primary cluster', () => {
    const result = balance([
      workout('w1', '2026-08-11T18:00:00.000Z', [
        row('ex_pullup', {}, 0),
        row('ex_pullup', {}, 1),
        row('ex_bench', {}, 2),
        row('ex_squat', {}, 3),
      ]),
    ]);

    const byCluster = Object.fromEntries(result.clusters.map((c) => [c.cluster, c.sets]));
    expect(byCluster).toEqual({ push: 1, pull: 2, legs: 1, core: 0, cardio: 0 });
    expect(result.maxSets).toBe(2);
    expect(result.totalSets).toBe(4);
  });

  it('lists every cluster, including the ones with nothing in them', () => {
    // A zero is the whole feature: "legs 0" over twelve weeks is a fact, and
    // omitting the row would hide exactly the thing worth seeing.
    const result = balance([workout('w1', '2026-08-11T18:00:00.000Z', [row('ex_pullup')])]);

    expect(result.clusters.map((c) => c.cluster)).toEqual([
      'push',
      'pull',
      'legs',
      'core',
      'cardio',
    ]);
    expect(result.clusters.find((c) => c.cluster === 'legs')?.sets).toBe(0);
  });

  it('honours the window boundary, inclusively', () => {
    const sets = [row('ex_pullup')];
    // 28 days back from 2026-08-13 is 2026-07-16.
    const onTheEdge = workout('w1', '2026-07-16T18:00:00.000Z', sets);
    const oneDayOlder = workout('w2', '2026-07-15T18:00:00.000Z', sets);

    expect(balance([onTheEdge], 28).totalSets).toBe(1);
    expect(balance([oneDayOlder], 28).totalSets).toBe(0);
    // ...and `null` is the whole log.
    expect(balance([oneDayOlder], null).totalSets).toBe(1);
  });

  it('excludes warm-ups, like every other analysis in the app', () => {
    const result = balance([
      workout('w1', '2026-08-11T18:00:00.000Z', [
        row('ex_pullup', {}, 0),
        row('ex_pullup', { isWarmup: true }, 1),
      ]),
    ]);

    expect(result.clusters.find((c) => c.cluster === 'pull')?.sets).toBe(1);
    expect(result.totalSets).toBe(1);
  });

  it('still counts an exercise that has been deleted from the library since', () => {
    // `libraryStore` promises deleting an exercise never touches its history, so
    // the work happened and the rows are there. Iterating the LIBRARY and asking
    // what each exercise did would silently drop all of it.
    const result = balance([
      workout('w1', '2026-08-11T18:00:00.000Z', [
        row('ex_pullup', {}, 0),
        row('ex_deleted_lunge', {}, 1),
        row('ex_deleted_lunge', {}, 2),
      ]),
    ]);

    expect(result.unfiled).toBe(2);
    // Counted in the total, so nothing quietly disappears from the arithmetic...
    expect(result.totalSets).toBe(3);
    // ...but not filed under a cluster it cannot be known to belong to.
    expect(result.clusters.reduce((n, c) => n + c.sets, 0)).toBe(1);
  });

  it('splits the totals by unit rather than adding reps to seconds', () => {
    // `core` is sit-ups in reps and planks in seconds. 90 + 480 is 570 of nothing.
    const result = balance([
      workout('w1', '2026-08-11T18:00:00.000Z', [
        row('ex_plank', { count: 120, countUnit: 'seconds' }, 0),
        row('ex_plank', { count: 120, countUnit: 'seconds' }, 1),
        row('ex_plank', { count: 30, countUnit: 'reps' }, 2),
      ]),
    ]);

    expect(result.clusters.find((c) => c.cluster === 'core')?.totals).toEqual({
      seconds: 240,
      reps: 30,
    });
  });

  it('adds up across workouts inside the window', () => {
    const result = balance(
      [
        workout('w1', '2026-08-11T18:00:00.000Z', [row('ex_pullup', {}, 0)]),
        workout('w2', '2026-08-04T18:00:00.000Z', [row('ex_pullup', {}, 0)]),
        workout('w3', '2026-05-01T18:00:00.000Z', [row('ex_pullup', {}, 0)]),
      ],
      28,
    );

    expect(result.clusters.find((c) => c.cluster === 'pull')?.sets).toBe(2);
  });

  it('is all zeroes for an empty history, not an empty list', () => {
    // The screen decides whether to render at all, from `totalSets`. It must not
    // have to guard against a missing cluster.
    const result = balance([]);

    expect(result.totalSets).toBe(0);
    expect(result.maxSets).toBe(0);
    expect(result.unfiled).toBe(0);
    expect(result.clusters).toHaveLength(5);
    expect(result.clusters.every((c) => c.sets === 0)).toBe(true);
  });

  it('ignores a row that is somehow not completed', () => {
    const result = balance([
      workout('w1', '2026-08-11T18:00:00.000Z', [row('ex_pullup', { isCompleted: false })]),
    ]);
    expect(result.totalSets).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('describeClusterTotals', () => {
  it('says what the sets added up to, per unit', () => {
    expect(describeClusterTotals({ reps: 380 }, formatDuration)).toBe('380 reps');
    expect(describeClusterTotals({ seconds: 480 }, formatDuration)).toBe('8 min');
    expect(describeClusterTotals({ reps: 90, seconds: 480 }, formatDuration)).toBe(
      '90 reps · 8 min',
    );
    expect(describeClusterTotals({ meters: 3000 }, formatDuration)).toBe('3000 m');
  });

  it('is empty rather than a stray separator when there is nothing', () => {
    expect(describeClusterTotals({}, formatDuration)).toBe('');
    expect(describeClusterTotals({ reps: 0 }, formatDuration)).toBe('');
  });
});

describe('the windows', () => {
  it('offers four weeks, twelve weeks and all', () => {
    expect(BALANCE_WINDOWS.map((w) => w.value)).toEqual(['4w', '12w', 'all']);
    expect(balanceWindowDays('4w')).toBe(28);
    expect(balanceWindowDays('12w')).toBe(84);
    expect(balanceWindowDays('all')).toBeNull();
  });
});
