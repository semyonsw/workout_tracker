import { describe, expect, it } from 'vitest';

import type { CompletedWorkout } from './completedWorkout';
import {
  exerciseCountSeries,
  exerciseTopWeightSeries,
  summarizeTrend,
  workoutRepsSeries,
  workoutVolumeSeries,
} from './trends';
import type { SetHistory } from '../types/models';

/** One logged set, with only the fields these functions read. */
function row(overrides: Partial<SetHistory> = {}): SetHistory {
  return {
    id: `sh_${Math.random().toString(36).slice(2)}`,
    sessionId: 's1',
    exerciseId: 'ex_a',
    performedAt: '2026-08-01T10:00:00.000Z',
    setIndex: 0,
    weightKg: 40,
    count: 10,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    ...overrides,
  };
}

/**
 * A finished workout carrying exactly these rows. Newest-first callers.
 *
 * `volume` is what the STORE would have written for these rows — the series reads
 * the record rather than recomputing it, so the fixture has to state it. Partial
 * means at least one set's load would not resolve; see `volumeIsPartial`.
 */
function workout(
  id: string,
  startedAt: string,
  sets: SetHistory[],
  volume: { kg: number; partial?: boolean } = { kg: 0 },
): CompletedWorkout {
  return {
    id,
    title: 'Session',
    startedAt,
    endedAt: startedAt,
    durationMinutes: 40,
    setCount: sets.length,
    totalVolumeKg: volume.kg,
    volumeIsPartial: volume.partial ?? false,
    exercises: [],
    sets,
  };
}

/* ------------------------------------------------------------------ */

describe('workoutRepsSeries', () => {
  it('adds up every rep of a workout and comes back oldest first', () => {
    // The store keeps workouts newest-first; a chart reads left to right.
    const series = workoutRepsSeries([
      workout('w2', '2026-08-10T10:00:00.000Z', [row({ count: 8 }), row({ count: 7 })]),
      workout('w1', '2026-08-03T10:00:00.000Z', [row({ count: 5 })]),
    ]);

    expect(series).toEqual([
      { at: '2026-08-03T10:00:00.000Z', value: 5 },
      { at: '2026-08-10T10:00:00.000Z', value: 15 },
    ]);
  });

  it('counts reps only — a plank is not eleven reps', () => {
    const series = workoutRepsSeries([
      workout('w1', '2026-08-03T10:00:00.000Z', [
        row({ count: 6 }),
        row({ count: 120, countUnit: 'seconds' }),
        row({ count: 1500, countUnit: 'meters' }),
      ]),
    ]);

    expect(series).toEqual([{ at: '2026-08-03T10:00:00.000Z', value: 6 }]);
  });

  it('drops warm-ups and skips a workout with no rep work at all', () => {
    // A swim day is not a day with zero reps — it is a day the question doesn't
    // apply to, and a zero mid-line reads as a collapse.
    const series = workoutRepsSeries([
      workout('w2', '2026-08-10T10:00:00.000Z', [row({ count: 300, countUnit: 'seconds' })]),
      workout('w1', '2026-08-03T10:00:00.000Z', [
        row({ count: 10, isWarmup: true }),
        row({ count: 8 }),
      ]),
    ]);

    expect(series).toEqual([{ at: '2026-08-03T10:00:00.000Z', value: 8 }]);
  });
});

describe('workoutVolumeSeries', () => {
  it('plots the volume the workout was recorded with', () => {
    const series = workoutVolumeSeries([
      workout('w1', '2026-08-03T10:00:00.000Z', [row({ count: 5, weightKg: 40 })], { kg: 200 }),
    ]);

    expect(series).toEqual([{ at: '2026-08-03T10:00:00.000Z', value: 200 }]);
  });

  it('has no point for a bodyweight-only day', () => {
    expect(
      workoutVolumeSeries([workout('w1', '2026-08-03T10:00:00.000Z', [row({ weightKg: null })])]),
    ).toEqual([]);
  });

  it('leaves out a workout whose volume is only part of the session', () => {
    /*
     * The bodyweight set in here has no resolvable load, so the stored 200 kg is
     * the weighted work alone. Plotting it would draw a dip in the line that says
     * "less training that day" about a day that had more. See `workoutVolumeSeries`.
     */
    const series = workoutVolumeSeries([
      workout('w2', '2026-08-10T10:00:00.000Z', [row({ count: 5, weightKg: 60 })], { kg: 300 }),
      workout(
        'w1',
        '2026-08-03T10:00:00.000Z',
        [row({ count: 5, weightKg: 40 }), row({ weightKg: null, loadMode: 'none' })],
        { kg: 200, partial: true },
      ),
    ]);

    expect(series).toEqual([{ at: '2026-08-10T10:00:00.000Z', value: 300 }]);
  });
});

describe('exerciseCountSeries', () => {
  const history = [
    row({ sessionId: 's1', performedAt: '2026-08-01T10:00:00.000Z', count: 8 }),
    row({ sessionId: 's1', performedAt: '2026-08-01T10:00:00.000Z', count: 6 }),
    row({ sessionId: 's2', performedAt: '2026-08-08T10:00:00.000Z', count: 9 }),
    row({ sessionId: 's2', performedAt: '2026-08-08T10:00:00.000Z', count: 9 }),
    row({
      exerciseId: 'ex_b',
      sessionId: 's2',
      performedAt: '2026-08-08T10:00:00.000Z',
      count: 99,
    }),
  ];

  it('sums each session and orders oldest first', () => {
    expect(exerciseCountSeries(history, 'ex_a')).toEqual([
      { at: '2026-08-01T10:00:00.000Z', value: 14 },
      { at: '2026-08-08T10:00:00.000Z', value: 18 },
    ]);
  });

  it('ignores other exercises entirely', () => {
    expect(exerciseCountSeries(history, 'ex_b')).toEqual([
      { at: '2026-08-08T10:00:00.000Z', value: 99 },
    ]);
  });
});

describe('exerciseTopWeightSeries', () => {
  it('takes the top working weight of each session, not the last', () => {
    // A session that drops down (80 × 7, then 75 × 7) worked at 80.
    const series = exerciseTopWeightSeries(
      [
        row({ sessionId: 's1', performedAt: '2026-08-01T10:00:00.000Z', weightKg: 80 }),
        row({ sessionId: 's1', performedAt: '2026-08-01T10:00:00.000Z', weightKg: 75 }),
        row({ sessionId: 's2', performedAt: '2026-08-08T10:00:00.000Z', weightKg: 82.5 }),
      ],
      'ex_a',
    );

    expect(series.map((p) => p.value)).toEqual([80, 82.5]);
  });

  it('has no line for unweighted work', () => {
    expect(exerciseTopWeightSeries([row({ weightKg: null })], 'ex_a')).toEqual([]);
  });
});

describe('summarizeTrend', () => {
  it('reports first to last, with the sign', () => {
    expect(
      summarizeTrend([
        { at: 'a', value: 100 },
        { at: 'b', value: 120 },
        { at: 'c', value: 130 },
      ]),
    ).toEqual({ first: 100, last: 130, delta: 30, percent: 30, sessions: 3 });
  });

  it('reports a fall as a fall', () => {
    expect(
      summarizeTrend([
        { at: 'a', value: 80 },
        { at: 'b', value: 75 },
      ])?.delta,
    ).toBe(-5);
  });

  it('is null under two points, because one measurement is not a direction', () => {
    expect(summarizeTrend([{ at: 'a', value: 80 }])).toBeNull();
    expect(summarizeTrend([])).toBeNull();
  });

  it('has no percentage to report from zero', () => {
    expect(
      summarizeTrend([
        { at: 'a', value: 0 },
        { at: 'b', value: 10 },
      ])?.percent,
    ).toBeNull();
  });
});
