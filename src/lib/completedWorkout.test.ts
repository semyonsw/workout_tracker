import { describe, expect, it } from 'vitest';

import {
  buildCompletedWorkout,
  historyByExerciseId,
  monthKey,
  recentlyUsedExerciseIds,
  recomputeWorkout,
} from './completedWorkout';
import { buildDraftSession, type DraftSession } from './draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

function draft(startedAt = '2026-08-17T17:00:00.000Z'): DraftSession {
  return buildDraftSession({
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
}

/** Complete the first `count` sets of the first entry, at a fixed weight. */
function logFirstEntry(session: DraftSession, count: number, weightKg = 40): DraftSession {
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

/* ------------------------------------------------------------------ */

describe('buildCompletedWorkout', () => {
  it('records nothing for a session where nothing was logged', () => {
    // Started and abandoned. An empty row in the history list would claim a
    // workout happened.
    expect(buildCompletedWorkout(draft())).toBeNull();
  });

  it('records only what was completed', () => {
    const session = logFirstEntry(draft(), 2);
    const workout = buildCompletedWorkout(session, new Date('2026-08-17T18:14:00.000Z'));

    expect(workout).not.toBeNull();
    expect(workout?.setCount).toBe(2);
    expect(workout?.sets).toHaveLength(2);
    expect(workout?.exercises).toHaveLength(1);
    expect(workout?.exercises[0].setCount).toBe(2);
    // Planned-but-untouched sets are an intention, not history.
    expect(workout?.sets.every((s) => s.isCompleted)).toBe(true);
  });

  it('keeps the session id, so finishing twice cannot become two workouts', () => {
    const session = logFirstEntry(draft(), 1);
    expect(buildCompletedWorkout(session)?.id).toBe(session.localId);
    expect(buildCompletedWorkout(session)?.sets[0].sessionId).toBe(session.localId);
  });

  it('measures duration from start to finish, floor one minute', () => {
    const session = logFirstEntry(draft('2026-08-17T17:00:00.000Z'), 1);

    expect(
      buildCompletedWorkout(session, new Date('2026-08-17T18:14:00.000Z'))?.durationMinutes,
    ).toBe(74);
    // A workout that took ten seconds still took a minute as far as a log is
    // concerned; zero would read as missing data.
    expect(
      buildCompletedWorkout(session, new Date('2026-08-17T17:00:10.000Z'))?.durationMinutes,
    ).toBe(1);
    // And a clock that went backwards cannot produce a negative workout.
    expect(
      buildCompletedWorkout(session, new Date('2026-08-16T17:00:00.000Z'))?.durationMinutes,
    ).toBe(1);
  });

  it('snapshots the exercise, so a rename or a delete cannot rewrite the log', () => {
    const session = logFirstEntry(draft(), 2);
    const workout = buildCompletedWorkout(session);
    const entry = session.entries[0];

    expect(workout?.exercises[0].name).toBe(entry.exercise.name);
    expect(workout?.exercises[0].countUnit).toBe(entry.exercise.countUnit);
    expect(workout?.exercises[0].loadMode).toBe(entry.exercise.loadMode);
    expect(workout?.exercises[0].exerciseId).toBe(entry.exercise.id);
  });

  it('summarizes with the shared shorthand', () => {
    const session = logFirstEntry(draft(), 2, 40);
    const workout = buildCompletedWorkout(session);
    const first = session.entries[0];

    // `ex_pullup_90` is added-bodyweight, so the shorthand leads with "+40 kg".
    expect(first.exercise.loadMode).toBe('added_bodyweight');
    expect(workout?.exercises[0].summary).toContain('+40 kg');
    expect(workout?.exercises[0].topWeightKg).toBe(40);
  });

  /*
   * This test used to assert `40 * reps` for a set of +40 kg weighted pull-ups and
   * call it correct. It was asserting the bug: `added_bodyweight` means the body
   * plus forty, so the belt alone is not the load, and the app had no bodyweight to
   * add to it. The contract now is that the app either knows the load or says it
   * does not.
   */
  it('leaves bodyweight work out of volume, and says the total is partial', () => {
    const session = logFirstEntry(draft(), 2, 40);
    const workout = buildCompletedWorkout(session);

    // `ex_pullup_90` is added_bodyweight, and no bodyweight was passed in.
    expect(workout?.totalVolumeKg).toBe(0);
    expect(workout?.volumeIsPartial).toBe(true);
  });

  it('counts the body plus the belt once a bodyweight is known', () => {
    const session = logFirstEntry(draft(), 2, 40);
    const reps = session.entries[0].sets.slice(0, 2).reduce((n, s) => n + s.count, 0);
    const workout = buildCompletedWorkout(session, new Date('2026-08-17T19:00:00.000Z'), 82);

    expect(workout?.totalVolumeKg).toBe((82 + 40) * reps);
    expect(workout?.volumeIsPartial).toBe(false);
  });
});

describe('a workout that was never formally started', () => {
  it('dates itself from the first set that was logged', () => {
    // `Start` was never pressed — the first ✓ started the workout, so the store
    // has stamped `startedAt` by the time this runs. Here that stamp is missing
    // entirely (an older persisted session), and the record still has to say when
    // the training happened rather than carrying a null.
    const session = logFirstEntry(draft(), 2);
    const completedAt = '2026-08-17T17:05:00.000Z';
    const unstarted: DraftSession = {
      ...session,
      startedAt: null,
      entries: session.entries.map((entry, i) =>
        i === 0
          ? { ...entry, sets: entry.sets.map((s) => (s.isCompleted ? { ...s, completedAt } : s)) }
          : entry,
      ),
    };

    const workout = buildCompletedWorkout(unstarted, new Date('2026-08-17T18:00:00.000Z'));
    expect(workout?.startedAt).toBe(completedAt);
    expect(workout?.sets.every((row) => row.performedAt === completedAt)).toBe(true);
    expect(workout?.durationMinutes).toBe(55);
  });
});

/* ------------------------------------------------------------------ */

describe('the per-exercise total', () => {
  it('adds up every logged set', () => {
    const session = logFirstEntry(draft(), 3, 40);
    const workout = buildCompletedWorkout(session, new Date('2026-08-17T18:00:00.000Z'));
    const exercise = workout?.exercises[0];

    const counts = session.entries[0].sets.slice(0, 3).map((s) => s.count);
    expect(exercise?.setCount).toBe(3);
    expect(exercise?.totalCount).toBe(counts.reduce((sum, c) => sum + c, 0));
  });

  it('counts only what was completed', () => {
    // The planned rows that were never logged are an intention, and an intention
    // must not inflate a total the user reads as a fact.
    const one = buildCompletedWorkout(logFirstEntry(draft(), 1, 40));
    const two = buildCompletedWorkout(logFirstEntry(draft(), 2, 40));

    expect(one!.exercises[0].totalCount).toBeLessThan(two!.exercises[0].totalCount);
  });
});

/* ------------------------------------------------------------------ */

describe('recentlyUsedExerciseIds', () => {
  /** A workout carrying exactly these exercises, in this order. */
  function workoutWith(id: string, startedAt: string, exerciseIds: string[]) {
    return {
      id,
      title: 'Session',
      startedAt,
      endedAt: startedAt,
      durationMinutes: 40,
      setCount: exerciseIds.length,
      totalVolumeKg: 0,
      volumeIsPartial: false,
      sets: [],
      exercises: exerciseIds.map((exerciseId) => ({
        exerciseId,
        name: exerciseId,
        countUnit: 'reps' as const,
        loadMode: 'none' as const,
        setCount: 1,
        summary: '10',
        totalCount: 10,
        topWeightKg: null,
      })),
    };
  }

  it('is newest-first and lists each exercise once', () => {
    const workouts = [
      workoutWith('w2', '2026-08-17T17:00:00.000Z', ['ex_plank', 'ex_pushups']),
      workoutWith('w1', '2026-08-10T17:00:00.000Z', ['ex_pushups', 'ex_swim']),
    ];

    // `ex_pushups` was in both; it belongs where it was LAST trained.
    expect(recentlyUsedExerciseIds(workouts)).toEqual(['ex_plank', 'ex_pushups', 'ex_swim']);
  });

  it('stops at the limit', () => {
    const workouts = [workoutWith('w1', '2026-08-17T17:00:00.000Z', ['a', 'b', 'c', 'd'])];
    expect(recentlyUsedExerciseIds(workouts, 2)).toEqual(['a', 'b']);
  });

  it('is empty before anything has been trained', () => {
    // The card it feeds hides itself rather than showing three exercises the user
    // has never done — which is what the hard-coded list used to do.
    expect(recentlyUsedExerciseIds([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe('historyByExerciseId', () => {
  it('merges logged sets on top of extra rows without mutating them', () => {
    const session = logFirstEntry(draft(), 2);
    const workout = buildCompletedWorkout(session);
    if (!workout) throw new Error('fixture logged nothing');

    const exerciseId = workout.sets[0].exerciseId;
    const seedCount = fixtureHistoryByExerciseId[exerciseId]?.length ?? 0;

    const merged = historyByExerciseId([workout], fixtureHistoryByExerciseId);
    expect(merged[exerciseId]).toHaveLength(seedCount + 2);
    // The fixture is a module-level constant shared by every screen; copying it is
    // the difference between "merged view" and "quietly appended to the seed on
    // every render".
    expect(fixtureHistoryByExerciseId[exerciseId]?.length ?? 0).toBe(seedCount);
  });

  it('works with nothing extra — which is how the app now calls it', () => {
    const session = logFirstEntry(draft(), 1);
    const workout = buildCompletedWorkout(session);
    if (!workout) throw new Error('fixture logged nothing');

    const merged = historyByExerciseId([workout]);
    expect(Object.keys(merged)).toEqual([workout.sets[0].exerciseId]);
    expect(merged[workout.sets[0].exerciseId]).toHaveLength(1);
  });
});

describe('monthKey', () => {
  it('buckets by calendar month', () => {
    expect(monthKey('2026-08-17T17:00:00.000Z')).toBe('2026-08');
    expect(monthKey('2026-08-01T00:00:00.000Z')).toBe('2026-08');
    expect(monthKey('2026-09-01T00:00:00.000Z')).toBe('2026-09');
    expect(monthKey('2025-12-31T23:00:00.000Z')).toBe('2025-12');
  });
});

/* ------------------------------------------------------------------ */

/**
 * What a warm-up costs the record, which is nothing, and what it costs the
 * numbers derived from it, which is itself.
 *
 * `isWarmup` became reachable in 0.12.0 (`QuickAdjust`). Before that these cases
 * could only be produced by a hand-edited backup; now every one of them is a
 * thumb away.
 */
describe('warm-ups in a finished workout', () => {
  /** A session with `warmups` leading rows marked as warm-ups. */
  function withWarmups(logged: number, warmups: number): DraftSession {
    const session = logFirstEntry(draft(), logged, 40);
    const [first, ...rest] = session.entries;
    return {
      ...session,
      entries: [
        { ...first, sets: first.sets.map((s, i) => (i < warmups ? { ...s, isWarmup: true } : s)) },
        ...rest,
      ],
    };
  }

  it('keeps the row but leaves it out of every count', () => {
    const workout = buildCompletedWorkout(withWarmups(3, 1), undefined, 82);

    // The row is history: it happened, and `isWarmup` is what everything
    // downstream filters on.
    expect(workout?.sets).toHaveLength(3);
    expect(workout?.sets.filter((s) => s.isWarmup)).toHaveLength(1);
    // The derived numbers count the two working sets.
    expect(workout?.setCount).toBe(2);
    expect(workout?.exercises[0].setCount).toBe(2);
  });

  it('leaves it out of the volume', () => {
    const withOne = buildCompletedWorkout(withWarmups(3, 1), undefined, 82);
    const withNone = buildCompletedWorkout(withWarmups(3, 0), undefined, 82);
    const [a, b, c] = withWarmups(3, 0).entries[0].sets;

    // Exactly the first set's worth of volume, and no more.
    const perSet = (reps: number) => (82 + 40) * reps;
    expect(withNone?.totalVolumeKg).toBe(perSet(a.count) + perSet(b.count) + perSet(c.count));
    expect(withOne?.totalVolumeKg).toBe(perSet(b.count) + perSet(c.count));
  });

  it('leaves it out of the exercise total and the shorthand', () => {
    const workout = buildCompletedWorkout(withWarmups(3, 1), undefined, 82);
    const [, b, c] = withWarmups(3, 0).entries[0].sets;

    expect(workout?.exercises[0].totalCount).toBe(b.count + c.count);
    expect(workout?.exercises[0].summary).not.toContain('undefined');
  });

  it('records nothing at all when only warm-ups were logged', () => {
    // Warming up and going home is not a workout, and a history row claiming one
    // is worse than no row — the same argument as a session with nothing logged.
    expect(buildCompletedWorkout(withWarmups(2, 2))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

/**
 * Correcting one logged set.
 *
 * The point of `recomputeWorkout` is that a correction cannot leave a record whose
 * parts disagree. Every derived number goes back through the same functions that
 * built it — `summarizeSessionSets` for the shorthand, `effectiveLoadKg` for the
 * load — rather than being patched.
 */
describe('recomputeWorkout', () => {
  /** A finished workout of `count` sets at `weightKg`, with a bodyweight applied. */
  function finished(count = 3, weightKg = 40) {
    const workout = buildCompletedWorkout(logFirstEntry(draft(), count, weightKg), undefined, 82);
    if (!workout) throw new Error('nothing was recorded');
    return workout;
  }

  it('regenerates the summary, the total and the volume from the rows', () => {
    const before = finished(3, 40);
    const [first] = before.sets;

    // 40 kg becomes 4 — the typo this whole feature exists for.
    const after = recomputeWorkout(
      { ...before, sets: before.sets.map((r) => (r.id === first.id ? { ...r, weightKg: 4 } : r)) },
      82,
    );

    // The shorthand now leads with the 40 kg sets and shows the 4 as a group.
    expect(after.exercises[0].summary).not.toBe(before.exercises[0].summary);
    expect(after.exercises[0].summary).toContain('+4 kg');
    expect(after.exercises[0].topWeightKg).toBe(40);
    // ...and the volume follows, because it is recomputed rather than patched.
    expect(after.totalVolumeKg).toBe(before.totalVolumeKg - (82 + 40 - (82 + 4)) * first.count);
  });

  it('follows a corrected count into the exercise total', () => {
    const before = finished(3, 40);
    const [first] = before.sets;
    const after = recomputeWorkout(
      {
        ...before,
        sets: before.sets.map((r) => (r.id === first.id ? { ...r, count: first.count + 5 } : r)),
      },
      82,
    );

    expect(after.exercises[0].totalCount).toBe(before.exercises[0].totalCount + 5);
  });

  it('drops the set count and the summary group when a row is removed', () => {
    const before = finished(3, 40);
    const after = recomputeWorkout({ ...before, sets: before.sets.slice(1) }, 82);

    expect(after.setCount).toBe(before.setCount - 1);
    expect(after.exercises[0].setCount).toBe(before.exercises[0].setCount - 1);
  });

  it('keeps the identity of the workout and the exercise snapshots', () => {
    // A correction corrects a number. It does not re-derive what the workout was,
    // and it must not re-read the library — the snapshot is what stops a renamed or
    // deleted exercise rewriting history.
    const before = finished(2, 40);
    const after = recomputeWorkout({ ...before, sets: before.sets.slice(0, 1) }, 82);

    expect(after.id).toBe(before.id);
    expect(after.title).toBe(before.title);
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.endedAt).toBe(before.endedAt);
    expect(after.durationMinutes).toBe(before.durationMinutes);
    expect(after.exercises[0].name).toBe(before.exercises[0].name);
    expect(after.exercises[0].exerciseId).toBe(before.exercises[0].exerciseId);
  });

  it('drops an exercise whose last row went, and adds nothing', () => {
    const before = finished(2, 40);
    const after = recomputeWorkout({ ...before, sets: [] }, 82);

    expect(after.exercises).toEqual([]);
    expect(after.setCount).toBe(0);
  });

  it('marks the volume partial again when it cannot weigh a corrected row', () => {
    // Recomputed with no bodyweight: the same rows, and the app now cannot say.
    const before = finished(2, 40);
    expect(before.volumeIsPartial).toBe(false);

    const after = recomputeWorkout(before, null);
    expect(after.volumeIsPartial).toBe(true);
    expect(after.totalVolumeKg).toBe(0);
  });

  it('leaves a warm-up out of everything derived, and keeps its row', () => {
    const before = finished(3, 40);
    const [first] = before.sets;
    const after = recomputeWorkout(
      {
        ...before,
        sets: before.sets.map((r) => (r.id === first.id ? { ...r, isWarmup: true } : r)),
      },
      82,
    );

    expect(after.sets).toHaveLength(3);
    expect(after.setCount).toBe(2);
    expect(after.exercises[0].setCount).toBe(2);
  });
});
