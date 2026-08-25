import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import { MAX_PLAUSIBLE_REST_SECONDS, MIN_REST_SAMPLES, restMedians } from './restHistory';
import type { SetHistory } from '../types/models';

/**
 * The median rest actually taken.
 *
 * `SetHistory.restTakenSeconds` was in the model from the first release with
 * nothing writing it, and the number was free the whole time: the store knows when
 * a rest began and when the next ✓ landed. These tests are about the two decisions
 * that make the number usable — median rather than mean, and per source without a
 * new field to say which source it was.
 */

function row(setIndex: number, restTakenSeconds: number | undefined, index: number): SetHistory {
  return {
    id: `sh${index}`,
    sessionId: 'w1',
    exerciseId: 'ex_a',
    performedAt: '2026-08-11T18:00:00.000Z',
    setIndex,
    weightKg: null,
    count: 10,
    countUnit: 'reps',
    loadMode: 'none',
    isWarmup: false,
    isCompleted: true,
    ...(restTakenSeconds != null ? { restTakenSeconds } : {}),
  };
}

function workout(sets: SetHistory[], id = 'w1'): CompletedWorkout {
  return {
    id,
    title: 'Session',
    startedAt: '2026-08-11T18:00:00.000Z',
    endedAt: '2026-08-11T19:00:00.000Z',
    durationMinutes: 60,
    setCount: sets.length,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets,
  };
}

/** `n` between-sets rests of `seconds` each. Set index 1 = between sets. */
function betweenSets(seconds: number[], from = 0): SetHistory[] {
  return seconds.map((s, i) => row(1, s, from + i));
}

/** `n` between-exercises rests. Set index 0 = the first set of an exercise. */
function betweenExercises(seconds: number[], from = 100): SetHistory[] {
  return seconds.map((s, i) => row(0, s, from + i));
}

/* ------------------------------------------------------------------ */

describe('restMedians', () => {
  it('is the median, so one interruption does not move it', () => {
    // Ten two-minute rests and one phone call. A mean would read 3:16.
    const samples = [120, 120, 120, 118, 122, 120, 125, 115, 120, 120, 1200];
    const { betweenSets: median } = restMedians([workout(betweenSets(samples))]);

    expect(median).toBe(120);
  });

  it('averages the middle two on an even-length list', () => {
    const { betweenSets: median } = restMedians([
      workout(betweenSets([100, 100, 100, 100, 100, 140, 140, 140, 140, 140])),
    ]);
    expect(median).toBe(120);
  });

  it('says nothing at all below the sample threshold', () => {
    const nearly = Array.from({ length: MIN_REST_SAMPLES - 1 }, () => 120);
    const enough = Array.from({ length: MIN_REST_SAMPLES }, () => 120);

    expect(restMedians([workout(betweenSets(nearly))]).betweenSets).toBeNull();
    expect(restMedians([workout(betweenSets(enough))]).betweenSets).toBe(120);
  });

  it('keeps the two sources apart', () => {
    // Two settings, two lengths. The source is derived from `setIndex`: a rest
    // recorded on set 0 of an exercise is the rest taken before that exercise.
    const result = restMedians([
      workout([
        ...betweenSets(Array.from({ length: 10 }, () => 120)),
        ...betweenExercises(Array.from({ length: 10 }, () => 180)),
      ]),
    ]);

    expect(result.betweenSets).toBe(120);
    expect(result.betweenExercises).toBe(180);
    expect(result.sampleCounts).toEqual({ betweenSets: 10, betweenExercises: 10 });
  });

  it('reports a source with enough samples even when the other has none', () => {
    const result = restMedians([workout(betweenSets(Array.from({ length: 12 }, () => 90)))]);

    expect(result.betweenSets).toBe(90);
    expect(result.betweenExercises).toBeNull();
    expect(result.sampleCounts.betweenExercises).toBe(0);
  });

  it('ignores rows the timer never measured', () => {
    // "I did not use the timer" is an absent field, not a zero — which is why
    // `completeSet` records nothing rather than zero.
    const measured = Array.from({ length: 10 }, (_, i) => row(1, 150, i));
    const unmeasured = Array.from({ length: 40 }, (_, i) => row(1, undefined, 100 + i));

    const result = restMedians([workout([...measured, ...unmeasured])]);
    expect(result.betweenSets).toBe(150);
    expect(result.sampleCounts.betweenSets).toBe(10);
  });

  it('ignores a recorded zero, which would drag the median to nothing', () => {
    const zeros = Array.from({ length: 40 }, (_, i) => row(1, 0, 100 + i));
    const real = Array.from({ length: 10 }, (_, i) => row(1, 150, i));

    expect(restMedians([workout([...real, ...zeros])]).betweenSets).toBe(150);
  });

  it('throws away a gap too long to be a rest anybody took', () => {
    // An app left open in a locker. The sample is discarded rather than clamped:
    // a clamped 30:00 would be a number the app invented.
    const real = Array.from({ length: 10 }, (_, i) => row(1, 120, i));
    const absurd = [row(1, MAX_PLAUSIBLE_REST_SECONDS + 1, 200)];

    const result = restMedians([workout([...real, ...absurd])]);
    expect(result.sampleCounts.betweenSets).toBe(10);
    expect(result.betweenSets).toBe(120);
  });

  it('reads across workouts, newest first, up to the limit', () => {
    // Rest habits change; a median over three years is a fact about somebody else.
    const recent = workout(betweenSets(Array.from({ length: 10 }, () => 90)), 'w_new');
    const ancient = workout(betweenSets(Array.from({ length: 10 }, () => 300)), 'w_old');

    expect(restMedians([recent, ancient], 1).betweenSets).toBe(90);
    // Both together: twenty samples, ten at each, so the median sits between them.
    expect(restMedians([recent, ancient], 2).sampleCounts.betweenSets).toBe(20);
  });

  it('is null for an empty log rather than throwing', () => {
    expect(restMedians([])).toEqual({
      betweenSets: null,
      betweenExercises: null,
      sampleCounts: { betweenSets: 0, betweenExercises: 0 },
    });
  });
});
