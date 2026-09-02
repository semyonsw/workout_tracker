import { describe, expect, it } from 'vitest';

import {
  beatSomething,
  describeBests,
  exerciseBests,
  recordsBeatenBy,
  type ExerciseBests,
} from './records';
import type { Exercise, SetHistory } from '../types/models';

/**
 * The bests.
 *
 * Two rules carry this file. THE EFFECTIVE LOAD IS WHAT COMPARES — a pull-up at
 * `+20 kg` when the lifter weighed 78 is not the same set as `+20 kg` at 82, and
 * treating them as tied is how bodyweight progress went missing. And TIES GO TO THE
 * OLDER SET, because a record is "when did this last move" and re-doing your best
 * set does not move it.
 */

const pulldown: Exercise = {
  id: 'ex_pulldown',
  ownerId: null,
  name: 'Lat pulldown',
  muscleGroups: ['back'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const pullup: Exercise = { ...pulldown, id: 'ex_pullup', loadMode: 'added_bodyweight' };
const plank: Exercise = {
  ...pulldown,
  id: 'ex_plank',
  requiresWeight: false,
  loadMode: 'none',
  countUnit: 'seconds',
};

let seq = 0;
const row = (over: Partial<SetHistory> & { exerciseId: string }): SetHistory => ({
  id: `s${(seq += 1)}`,
  sessionId: 'sess',
  performedAt: '2026-06-01T10:00:00.000Z',
  setIndex: 0,
  weightKg: 80,
  count: 8,
  countUnit: 'reps',
  loadMode: 'external',
  isWarmup: false,
  isCompleted: true,
  ...over,
});

describe('the standing bests', () => {
  it('finds the heaviest set, the most reps, and the heaviest set by load × reps', () => {
    const history = [
      row({
        exerciseId: pulldown.id,
        weightKg: 80,
        count: 8,
        performedAt: '2026-06-01T10:00:00.000Z',
      }),
      row({
        exerciseId: pulldown.id,
        weightKg: 100,
        count: 3,
        performedAt: '2026-07-01T10:00:00.000Z',
      }),
      row({
        exerciseId: pulldown.id,
        weightKg: 60,
        count: 15,
        performedAt: '2026-08-01T10:00:00.000Z',
      }),
    ];
    const bests = exerciseBests(history, pulldown);

    expect(bests.heaviest?.value).toBe(100);
    expect(bests.mostCount?.value).toBe(15);
    // 80 × 8 = 640 beats 100 × 3 = 300 and 60 × 15 = 900… so 900 wins.
    expect(bests.bestSetLoad?.value).toBe(900);
  });

  it('ignores warm-ups, unlogged rows and other exercises', () => {
    const history = [
      row({ exerciseId: pulldown.id, weightKg: 200, isWarmup: true }),
      row({ exerciseId: pulldown.id, weightKg: 300, isCompleted: false }),
      row({ exerciseId: 'ex_other', weightKg: 400 }),
      row({ exerciseId: pulldown.id, weightKg: 80, count: 8 }),
    ];
    expect(exerciseBests(history, pulldown).heaviest?.value).toBe(80);
  });

  it('has nothing to say about an exercise with no history', () => {
    const bests = exerciseBests([], pulldown);
    expect(bests.heaviest).toBeNull();
    expect(bests.mostCount).toBeNull();
    expect(bests.bestSetLoad).toBeNull();
  });

  it('keeps the OLDER set when two are equal', () => {
    const history = [
      row({
        exerciseId: pulldown.id,
        weightKg: 80,
        count: 8,
        performedAt: '2026-06-01T10:00:00.000Z',
      }),
      row({
        exerciseId: pulldown.id,
        weightKg: 80,
        count: 8,
        performedAt: '2026-08-01T10:00:00.000Z',
      }),
    ];
    // Re-doing your best set does not move the record.
    expect(exerciseBests(history, pulldown).heaviest?.at).toBe('2026-06-01T10:00:00.000Z');
  });

  it('does not multiply a weight by seconds', () => {
    // `80 kg × 120 seconds` is not a set load, it is two units multiplied together.
    const history = [
      row({
        exerciseId: plank.id,
        weightKg: null,
        count: 120,
        countUnit: 'seconds',
        loadMode: 'none',
      }),
    ];
    const bests = exerciseBests(history, plank);
    expect(bests.mostCount?.value).toBe(120);
    expect(bests.bestSetLoad).toBeNull();
  });
});

describe('bodyweight work', () => {
  const history = [
    row({
      exerciseId: pullup.id,
      weightKg: 20,
      count: 8,
      loadMode: 'added_bodyweight',
      performedAt: '2026-01-01T10:00:00.000Z',
    }),
    row({
      exerciseId: pullup.id,
      weightKg: 20,
      count: 8,
      loadMode: 'added_bodyweight',
      performedAt: '2026-08-01T10:00:00.000Z',
    }),
  ];

  it('ranks the same logged weight by what the body actually moved', () => {
    /*
     * The whole reason `bodyweightAt` exists. Two identical logged sets, seven
     * months apart, four kilograms of lifter between them — the second one is
     * heavier and it must win.
     */
    const bests = exerciseBests(history, pullup, (at) => (at.startsWith('2026-01') ? 78 : 82));
    expect(bests.heaviest?.value).toBe(102);
    expect(bests.heaviest?.at).toBe('2026-08-01T10:00:00.000Z');
    // ...and the row still renders as the `+20` the user typed.
    expect(bests.heaviest?.weightKg).toBe(20);
  });

  it('keeps quiet about load when no bodyweight is known', () => {
    // The same silence `sessionVolume` keeps rather than printing a figure it
    // knows undercounts.
    const bests = exerciseBests(history, pullup);
    expect(bests.heaviest).toBeNull();
    expect(bests.bestSetLoad).toBeNull();
    // The rep axis carries the exercise on its own.
    expect(bests.mostCount?.value).toBe(8);
  });
});

describe('whether a set beats the record', () => {
  const bests: ExerciseBests = {
    heaviest: { value: 100, weightKg: 100, count: 3, at: '2026-06-01T10:00:00.000Z' },
    mostCount: { value: 15, weightKg: 60, count: 15, at: '2026-06-01T10:00:00.000Z' },
    bestSetLoad: { value: 900, weightKg: 60, count: 15, at: '2026-06-01T10:00:00.000Z' },
  };

  it('needs to be STRICTLY better', () => {
    // A card that says "new best" for a set you have done four times is a card
    // nobody believes the fifth time.
    expect(beatSomething(recordsBeatenBy({ weightKg: 100, count: 3 }, bests, pulldown, null))).toBe(
      false,
    );
    expect(recordsBeatenBy({ weightKg: 102.5, count: 3 }, bests, pulldown, null).heaviest).toBe(
      true,
    );
    expect(recordsBeatenBy({ weightKg: 60, count: 16 }, bests, pulldown, null).mostCount).toBe(
      true,
    );
  });

  it('reports the set-load axis on its own', () => {
    // 80 × 12 = 960: not the heaviest and not the most reps, but the best set.
    const beaten = recordsBeatenBy({ weightKg: 80, count: 12 }, bests, pulldown, null);
    expect(beaten.heaviest).toBe(false);
    expect(beaten.mostCount).toBe(false);
    expect(beaten.bestSetLoad).toBe(true);
  });

  it('never counts a warm-up or an empty set', () => {
    expect(
      beatSomething(
        recordsBeatenBy({ weightKg: 500, count: 50, isWarmup: true }, bests, pulldown, null),
      ),
    ).toBe(false);
    expect(beatSomething(recordsBeatenBy({ weightKg: 500, count: 0 }, bests, pulldown, null))).toBe(
      false,
    );
  });

  it('beats an empty record on the first set ever logged', () => {
    const none: ExerciseBests = { heaviest: null, mostCount: null, bestSetLoad: null };
    expect(beatSomething(recordsBeatenBy({ weightKg: 40, count: 5 }, none, pulldown, null))).toBe(
      true,
    );
  });
});

describe('the one-line summary', () => {
  const kg = (n: number) => `${n} kg`;
  const reps = (n: number) => `${n}`;

  it('states the heaviest set and the best set load', () => {
    const bests = exerciseBests(
      [
        row({
          exerciseId: pulldown.id,
          weightKg: 100,
          count: 3,
          performedAt: '2026-07-01T10:00:00.000Z',
        }),
        row({
          exerciseId: pulldown.id,
          weightKg: 60,
          count: 15,
          performedAt: '2026-08-01T10:00:00.000Z',
        }),
      ],
      pulldown,
    );
    expect(describeBests(bests, 'reps', kg, reps)).toBe('100 kg × 3 · 15 · 900 kg set');
  });

  it('does not state the same row twice', () => {
    // One set that is both the heaviest and the highest-rep: naming the rep count
    // again after `100 kg × 8` is the line repeating itself.
    const bests = exerciseBests(
      [row({ exerciseId: pulldown.id, weightKg: 100, count: 8 })],
      pulldown,
    );
    expect(describeBests(bests, 'reps', kg, reps)).toBe('100 kg × 8 · 800 kg set');
  });

  it('is null when the log has nothing to say', () => {
    expect(describeBests(exerciseBests([], pulldown), 'reps', kg, reps)).toBeNull();
  });
});
