import { describe, expect, it } from 'vitest';

import {
  addExerciseToWorkout,
  addSetToWorkout,
  clampDurationMinutes,
  clampWorkoutTitle,
  DURATION_LIMITS,
  formatTimeOfDay,
  reindexSets,
  removeExerciseFromWorkout,
  renameWorkout,
  retimeWorkout,
  setWorkoutDuration,
  shiftWorkout,
} from './workoutEdit';
import type { CompletedWorkout } from './completedWorkout';
import type { Exercise, SetHistory } from '../types/models';

/**
 * Editing a workout that already happened.
 *
 * Two rules carry this file, and both are about not producing a record that
 * disagrees with itself:
 *
 *  1. EVERY DERIVED NUMBER IS REGENERATED. The shorthand, the set count, the
 *     exercise total and the volume are functions of the rows, so an edit that
 *     changed the rows and left them alone would be a summary describing sets that
 *     are no longer there.
 *  2. A RETIME MOVES THE ROWS TOO. `performedAt` is the workout's own instant
 *     denormalised onto every set — it is what the overload engine and every chart
 *     read — so a header that moved without them would put a session on Tuesday
 *     that every analysis still dates to Wednesday.
 */

const START = new Date(2026, 7, 17, 10, 24);

const pullup: Exercise = {
  id: 'ex_pullup',
  ownerId: null,
  name: 'Weighted 90° pull-ups',
  muscleGroups: ['back'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  defaultWeightKg: 40,
  defaultCount: 5,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const plank: Exercise = {
  ...pullup,
  id: 'ex_plank',
  name: 'Plank',
  requiresWeight: false,
  loadMode: 'none',
  countUnit: 'seconds',
  defaultWeightKg: undefined,
  defaultCount: 120,
};

function row(over: Partial<SetHistory> & { id: string; exerciseId: string }): SetHistory {
  return {
    sessionId: 'w1',
    performedAt: START.toISOString(),
    setIndex: 0,
    weightKg: 40,
    count: 4,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    ...over,
  };
}

/** Two exercises, three rows: pull-ups (2) then plank (1). */
function workout(): CompletedWorkout {
  const sets = [
    row({ id: 's1', exerciseId: pullup.id, setIndex: 0, count: 4 }),
    row({ id: 's2', exerciseId: pullup.id, setIndex: 1, count: 3 }),
    row({
      id: 's3',
      exerciseId: plank.id,
      setIndex: 2,
      weightKg: null,
      count: 120,
      countUnit: 'seconds',
      loadMode: 'none',
    }),
  ];
  return {
    id: 'w1',
    title: 'Pull + swimming',
    startedAt: START.toISOString(),
    endedAt: new Date(START.getTime() + 74 * 60_000).toISOString(),
    durationMinutes: 74,
    setCount: 3,
    totalVolumeKg: 280,
    volumeIsPartial: false,
    exercises: [
      {
        exerciseId: pullup.id,
        name: pullup.name,
        countUnit: 'reps',
        loadMode: 'external',
        setCount: 2,
        summary: '40 kg · 4 3',
        totalCount: 7,
        topWeightKg: 40,
      },
      {
        exerciseId: plank.id,
        name: plank.name,
        countUnit: 'seconds',
        loadMode: 'none',
        setCount: 1,
        summary: '2:00',
        totalCount: 120,
        topWeightKg: null,
      },
    ],
    sets,
  };
}

describe('the name', () => {
  it('changes, and every other number is left where it was', () => {
    const next = renameWorkout(workout(), '  Pull, short  ');
    expect(next.title).toBe('Pull, short');
    expect(next.setCount).toBe(3);
    expect(next.sets).toHaveLength(3);
  });

  it('refuses to become empty', () => {
    expect(renameWorkout(workout(), '   ').title).toBe('Pull + swimming');
    expect(clampWorkoutTitle('', 'Fallback')).toBe('Fallback');
  });

  it('is capped, because it is one line on a row', () => {
    expect(renameWorkout(workout(), 'x'.repeat(200)).title).toHaveLength(80);
  });
});

describe('moving a workout in time', () => {
  it('re-dates every set with it', () => {
    /*
     * The rule that matters. `performedAt` is what the overload engine, the trends
     * and the exercise history all read; a header that moved without the rows would
     * be a session on the wrong day everywhere except the row you were looking at.
     */
    const to = new Date(2026, 7, 16, 10, 24);
    const next = retimeWorkout(workout(), to);
    expect(next.startedAt).toBe(to.toISOString());
    for (const set of next.sets) expect(set.performedAt).toBe(to.toISOString());
  });

  it('keeps how long it took', () => {
    const next = retimeWorkout(workout(), new Date(2026, 7, 16, 6, 0));
    expect(next.durationMinutes).toBe(74);
    expect(Date.parse(next.endedAt) - Date.parse(next.startedAt)).toBe(74 * 60_000);
  });

  it('nudges by whole minutes, one day being 1440 of them', () => {
    const next = shiftWorkout(workout(), -1440);
    expect(next.startedAt).toBe(new Date(2026, 7, 16, 10, 24).toISOString());
    expect(shiftWorkout(next, 15).startedAt).toBe(new Date(2026, 7, 16, 10, 39).toISOString());
  });

  it('never moves a workout into the future', () => {
    // A session dated tomorrow sorts above everything and reads as a plan.
    const next = shiftWorkout(workout(), 60 * 24 * 365 * 5);
    expect(Date.parse(next.startedAt)).toBeLessThanOrEqual(Date.now());
  });

  it('leaves a record with an unreadable date alone', () => {
    const broken = { ...workout(), startedAt: 'nonsense' };
    expect(shiftWorkout(broken, 60)).toBe(broken);
    expect(retimeWorkout(workout(), new Date(NaN)).startedAt).toBe(workout().startedAt);
  });
});

describe('how long it took', () => {
  it('moves the end, not the start', () => {
    const next = setWorkoutDuration(workout(), 61);
    expect(next.startedAt).toBe(workout().startedAt);
    expect(next.durationMinutes).toBe(61);
    expect(Date.parse(next.endedAt) - Date.parse(next.startedAt)).toBe(61 * 60_000);
  });

  it('clamps to something a workout could have taken', () => {
    expect(clampDurationMinutes(0)).toBe(DURATION_LIMITS.min);
    expect(clampDurationMinutes(-5)).toBe(DURATION_LIMITS.min);
    expect(clampDurationMinutes(99_999)).toBe(DURATION_LIMITS.max);
    expect(clampDurationMinutes(Number.NaN)).toBe(DURATION_LIMITS.min);
  });
});

describe('adding a set', () => {
  it('seeds it from that exercise’s last row', () => {
    // The same rule `addSet` follows in a live session: another one of those.
    const next = addSetToWorkout(workout(), pullup.id, 'new1');
    expect(next).not.toBeNull();
    const added = next?.sets.find((s) => s.id === 'new1');
    expect(added?.weightKg).toBe(40);
    expect(added?.count).toBe(3);
    expect(added?.countUnit).toBe('reps');
    expect(added?.isWarmup).toBe(false);
  });

  it('regenerates the summary and the totals around it', () => {
    const next = addSetToWorkout(workout(), pullup.id, 'new1');
    const snapshot = next?.exercises.find((e) => e.exerciseId === pullup.id);
    expect(snapshot?.setCount).toBe(3);
    expect(snapshot?.totalCount).toBe(10);
    expect(snapshot?.summary).toContain('4 3 3');
    expect(next?.setCount).toBe(4);
  });

  it('lands in POSITION, not at the end of the session', () => {
    /*
     * A row appended to the first of two exercises must sort before the second
     * exercise's rows: `setIndex` orders the rows on disk and prints in the CSV.
     */
    const next = addSetToWorkout(workout(), pullup.id, 'new1');
    const order = [...(next?.sets ?? [])]
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((s) => s.exerciseId);
    expect(order).toEqual([pullup.id, pullup.id, pullup.id, plank.id]);
  });

  it('takes the unit off the snapshot for a time-counted exercise', () => {
    const next = addSetToWorkout(workout(), plank.id, 'new1');
    const added = next?.sets.find((s) => s.id === 'new1');
    expect(added?.countUnit).toBe('seconds');
    expect(added?.count).toBe(120);
    expect(added?.weightKg).toBeNull();
  });

  it('is null for an exercise the workout does not contain', () => {
    // Inventing a snapshot would be an `Add set` that quietly created an exercise.
    expect(addSetToWorkout(workout(), 'ex_nope', 'new1')).toBeNull();
  });
});

describe('adding an exercise', () => {
  it('brings a snapshot and one row, seeded from the library row', () => {
    const squat: Exercise = {
      ...pullup,
      id: 'ex_squat',
      name: 'Squat',
      defaultWeightKg: 60,
      defaultCount: 5,
    };
    const next = addExerciseToWorkout(workout(), squat, 'new1');

    expect(next?.exercises.map((e) => e.exerciseId)).toEqual([pullup.id, plank.id, 'ex_squat']);
    const added = next?.sets.find((s) => s.id === 'new1');
    expect(added?.weightKg).toBe(60);
    expect(added?.count).toBe(5);
    // The snapshot's derived four are rebuilt, not left as the placeholders.
    const snapshot = next?.exercises.find((e) => e.exerciseId === 'ex_squat');
    expect(snapshot?.setCount).toBe(1);
    expect(snapshot?.summary).not.toBe('');
    expect(snapshot?.name).toBe('Squat');
  });

  it('carries the NAME rather than a pointer, so a later rename cannot rewrite it', () => {
    const squat: Exercise = { ...pullup, id: 'ex_squat', name: 'Back squat' };
    const next = addExerciseToWorkout(workout(), squat, 'new1');
    expect(next?.exercises.at(-1)?.name).toBe('Back squat');
  });

  it('gives an unweighted exercise no weight', () => {
    const pushups: Exercise = {
      ...plank,
      id: 'ex_pushups',
      name: 'Push-ups',
      countUnit: 'reps',
      defaultCount: 30,
    };
    const next = addExerciseToWorkout(workout(), pushups, 'new1');
    expect(next?.sets.find((s) => s.id === 'new1')?.weightKg).toBeNull();
  });

  it('is null when the exercise is already in the workout', () => {
    // `Add a set` is the operation for that; two snapshots for one exercise would
    // give the workout two rows both claiming to summarise it.
    expect(addExerciseToWorkout(workout(), pullup, 'new1')).toBeNull();
  });
});

describe('removing an exercise', () => {
  it('takes its rows with it and rebuilds the rest', () => {
    const next = removeExerciseFromWorkout(workout(), plank.id);
    expect(next?.exercises.map((e) => e.exerciseId)).toEqual([pullup.id]);
    expect(next?.sets.every((s) => s.exerciseId === pullup.id)).toBe(true);
    expect(next?.setCount).toBe(2);
    // Indices are positions again, with no hole where the plank was.
    expect(next?.sets.map((s) => s.setIndex)).toEqual([0, 1]);
  });

  it('is refused when it is the last one', () => {
    /*
     * A workout with nothing in it is not a workout, and the operation the user
     * wants is `Delete this workout` — which asks first.
     */
    const one = removeExerciseFromWorkout(workout(), plank.id);
    expect(one).not.toBeNull();
    expect(removeExerciseFromWorkout(one!, pullup.id)).toBeNull();
  });

  it('is refused when only warm-ups would survive', () => {
    const warmupOnly: CompletedWorkout = {
      ...workout(),
      sets: [
        row({ id: 's1', exerciseId: pullup.id, setIndex: 0, isWarmup: true }),
        row({ id: 's3', exerciseId: plank.id, setIndex: 1, weightKg: null, count: 120 }),
      ],
    };
    expect(removeExerciseFromWorkout(warmupOnly, plank.id)).toBeNull();
  });

  it('is null for an exercise that is not there', () => {
    expect(removeExerciseFromWorkout(workout(), 'ex_nope')).toBeNull();
  });
});

describe('reindexing', () => {
  it('renumbers by exercise order, then by the order rows already had', () => {
    const scrambled: CompletedWorkout = {
      ...workout(),
      sets: [
        row({ id: 'b', exerciseId: plank.id, setIndex: 9 }),
        row({ id: 'a2', exerciseId: pullup.id, setIndex: 4 }),
        row({ id: 'a1', exerciseId: pullup.id, setIndex: 1 }),
      ],
    };
    expect(reindexSets(scrambled).map((s) => s.id)).toEqual(['a1', 'a2', 'b']);
    expect(reindexSets(scrambled).map((s) => s.setIndex)).toEqual([0, 1, 2]);
  });

  it('keeps a row whose exercise has no snapshot, at the end', () => {
    // A malformed record is not a reason to lose a set that happened.
    const orphaned: CompletedWorkout = {
      ...workout(),
      sets: [...workout().sets, row({ id: 'orphan', exerciseId: 'ex_gone', setIndex: 0 })],
    };
    expect(reindexSets(orphaned).at(-1)?.id).toBe('orphan');
  });
});

describe('the time of day', () => {
  it('is a zero-padded local clock', () => {
    expect(formatTimeOfDay(new Date(2026, 7, 17, 9, 5).toISOString())).toBe('09:05');
    expect(formatTimeOfDay(new Date(2026, 7, 17, 23, 40).toISOString())).toBe('23:40');
  });

  it('says so when it cannot read the date', () => {
    expect(formatTimeOfDay('nonsense')).toBe('--:--');
  });
});
