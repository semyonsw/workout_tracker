import { describe, expect, it } from 'vitest';

import { buildDraftSession } from './draft';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import type { Exercise, Routine, SetHistory } from '../types/models';

/**
 * What a brand-new exercise's FIRST session is prefilled with.
 *
 * The create screen lets you set a default weight and a target — "this machine
 * starts at 30 kg, 12 reps". Those two numbers had nowhere to go: no field on
 * `Exercise` carried them, so the first session of anything new opened with an empty
 * weight cell and a made-up rep target, and the create screen's wells were decoration.
 */

const machine: Exercise = {
  id: 'ex_new_machine',
  ownerId: 'u1',
  name: 'Biceps curl rope machine',
  muscleGroups: ['biceps'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  incrementKg: 2.5,
  defaultWeightKg: 30,
  defaultCount: 12,
  isArchived: false,
  createdAt: '2026-08-17T00:00:00.000Z',
};

/** A routine holding one exercise, with no per-item target of its own. */
function routineFor(exerciseId: string, targetSets = 4): Routine {
  return {
    id: 'r_test',
    ownerId: 'u1',
    name: 'Test',
    items: [{ id: 'ri1', exerciseId, order: 0, targetSets }],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function build(exercise: Exercise, history: SetHistory[] = [], routine = routineFor(exercise.id)) {
  return buildDraftSession({
    routine,
    exercisesById: { [exercise.id]: exercise },
    historyByExerciseId: { [exercise.id]: history },
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
    now: new Date('2026-08-17T17:00:00.000Z'),
  });
}

function loggedSet(overrides: Partial<SetHistory> = {}): SetHistory {
  return {
    id: 'sh1',
    sessionId: 's1',
    exerciseId: machine.id,
    performedAt: '2026-08-16T17:00:00.000Z',
    setIndex: 0,
    weightKg: 45,
    count: 8,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
    estimated1RM: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

describe('first-ever session prefill', () => {
  it("starts at the exercise's own default weight", () => {
    const entry = build(machine).entries[0];

    expect(entry.sets).toHaveLength(4);
    expect(entry.sets.every((s) => s.weightKg === 30)).toBe(true);
    expect(entry.sets.every((s) => s.count === 12)).toBe(true);
    // Still ghosted: nothing here has been confirmed by the user yet.
    expect(entry.sets.every((s) => s.isPrefilled)).toBe(true);
  });

  it('leaves the weight empty when the exercise has no default', () => {
    const { defaultWeightKg: _omitted, ...noDefault } = machine;
    const entry = build(noDefault as Exercise).entries[0];

    // `null` renders as "—", which is honest: nobody said where to start.
    expect(entry.sets[0].weightKg).toBeNull();
  });

  it('ignores a junk default that survived a JSON round-trip', () => {
    for (const bad of [NaN, 0, -20, undefined, null]) {
      const entry = build({ ...machine, defaultWeightKg: bad as number }).entries[0];
      expect(entry.sets[0].weightKg).toBeNull();
    }
  });

  it('never carries a weight onto unweighted work', () => {
    const bodyweight: Exercise = {
      ...machine,
      id: 'ex_pushup',
      requiresWeight: false,
      loadMode: 'none',
      defaultWeightKg: 30, // left over from a toggle flip
      defaultCount: 15,
    };

    const entry = build(bodyweight).entries[0];
    expect(entry.sets.every((s) => s.weightKg === null)).toBe(true);
    expect(entry.sets[0].count).toBe(15);
  });
});

describe('history always wins', () => {
  it('prefills from the last session, not from the default', () => {
    const entry = build(machine, [loggedSet()]).entries[0];

    // The whole one-tap promise: what you did last time, not what you planned.
    expect(entry.sets[0].weightKg).toBe(45);
    expect(entry.sets[0].count).toBe(8);
  });

  it('extends a short session with its own last set rather than the default', () => {
    const entry = build(machine, [loggedSet(), loggedSet({ id: 'sh2', setIndex: 1, weightKg: 40 })])
      .entries[0];

    expect(entry.sets.map((s) => s.weightKg)).toEqual([45, 40, 40, 40]);
  });
});

describe("the routine item's target still leads", () => {
  it('uses the item target when it has one', () => {
    const routine = routineFor(machine.id);
    routine.items[0] = { ...routine.items[0], targetRepsMax: 6 };

    // The routine is a plan for THIS session; the exercise default is where a
    // movement starts in general.
    expect(build(machine, [], routine).entries[0].sets[0].count).toBe(6);
  });
});
