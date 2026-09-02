import { describe, expect, it } from 'vitest';

import { exerciseSessionFor } from './healthConnect';
import type { CompletedWorkout } from './completedWorkout';

/**
 * The one part of the Health Connect integration that can be wrong in a way anybody
 * notices: the mapping. Everything else in that file is a guarded call into a native
 * module that may not exist, and its whole contract is "never throw, never speak".
 */

const workout = (over: Partial<CompletedWorkout> = {}): CompletedWorkout => ({
  id: 'w1',
  title: 'Pull + swimming',
  startedAt: '2026-09-02T10:00:00.000Z',
  endedAt: '2026-09-02T11:14:00.000Z',
  durationMinutes: 74,
  setCount: 18,
  totalVolumeKg: 4720,
  volumeIsPartial: false,
  exercises: [],
  sets: [],
  ...over,
});

describe('the exercise session record', () => {
  it('carries the interval, the title and strength training — and nothing else', () => {
    const record = exerciseSessionFor(workout());
    expect(record).toEqual({
      recordType: 'ExerciseSession',
      startTime: '2026-09-02T10:00:00.000Z',
      endTime: '2026-09-02T11:14:00.000Z',
      // 70 is Health Connect's own EXERCISE_TYPE_STRENGTH_TRAINING; it is part of
      // the wire format and cannot change.
      exerciseType: 70,
      title: 'Pull + swimming',
    });
    // No sets, no volume, no calories. There is no per-set record type in Health
    // Connect, and an invented energy figure is the kind of number this codebase
    // deletes on sight.
    expect(Object.keys(record ?? {})).toHaveLength(5);
  });

  it('never writes a zero-length interval', () => {
    // Health Connect rejects one, and `durationMinutes` already floors at 1 for the
    // same reason: a workout that happened took at least a minute.
    const record = exerciseSessionFor(workout({ endedAt: '2026-09-02T10:00:00.000Z' }));
    expect(record?.endTime).toBe('2026-09-02T10:01:00.000Z');
  });

  it('repairs an end that predates the start', () => {
    const record = exerciseSessionFor(workout({ endedAt: '2020-01-01T00:00:00.000Z' }));
    expect(record?.endTime).toBe('2026-09-02T10:01:00.000Z');
  });

  it('is null when there is no usable start', () => {
    expect(exerciseSessionFor(workout({ startedAt: 'nonsense' }))).toBeNull();
  });

  it('never sends an empty title', () => {
    expect(exerciseSessionFor(workout({ title: '   ' }))?.title).toBe('Workout');
  });

  it('trims a long title, because other apps render it', () => {
    const long = 'x'.repeat(200);
    expect(String(exerciseSessionFor(workout({ title: long }))?.title)).toHaveLength(80);
  });
});
