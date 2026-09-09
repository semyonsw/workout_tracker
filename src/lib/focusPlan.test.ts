import { describe, expect, it } from 'vitest';

import { buildDraftSession, type DraftSession } from './draft';
import { describeSetPosition, focusPlan } from './focusPlan';
import { DEFAULT_OVERLOAD_POLICY } from './progressiveOverload';
import type { Exercise, Routine } from '../types/models';

/**
 * What focus mode is looking at, without a renderer.
 *
 * The sheet has six states and no logic of its own, so everything worth getting
 * wrong is in here: which set it points at (the glow's rule, not a second one),
 * whether a warm-up gets numbered as a working set, whether the next set is on a
 * different machine, and what `undo last set` gives back.
 */

function exercise(id: string, name: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    ownerId: 'u1',
    name,
    muscleGroups: ['back'],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const pullups = exercise('ex_pullups', 'Weighted 90° pull-ups');
const rows = exercise('ex_rows', 'Wide pull-ups machine');

function session(items: [Exercise, number][]): DraftSession {
  const routine: Routine = {
    id: 'r1',
    ownerId: 'u1',
    name: 'Pull',
    items: items.map(([ex, targetSets], order) => ({
      id: `ri${order}`,
      exerciseId: ex.id,
      order,
      targetSets,
      targetRepsMax: 5,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return buildDraftSession({
    routine,
    exercisesById: Object.fromEntries(items.map(([ex]) => [ex.id, ex])),
    historyByExerciseId: {},
    policy: DEFAULT_OVERLOAD_POLICY,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    now: new Date('2026-09-09T18:00:00.000Z'),
  });
}

/** Log one set, at a stated minute. */
function log(s: DraftSession, entryIndex: number, setIndex: number, minute: number): DraftSession {
  return {
    ...s,
    entries: s.entries.map((entry, i) =>
      i === entryIndex
        ? {
            ...entry,
            sets: entry.sets.map((set, j) =>
              j === setIndex
                ? {
                    ...set,
                    isCompleted: true,
                    completedAt: `2026-09-09T18:${String(minute).padStart(2, '0')}:00.000Z`,
                  }
                : set,
            ),
          }
        : entry,
    ),
  };
}

/** Put a warm-up row at the front of an entry, the way `addWarmupSets` does. */
function withWarmup(s: DraftSession, entryIndex: number): DraftSession {
  return {
    ...s,
    entries: s.entries.map((entry, i) =>
      i === entryIndex
        ? {
            ...entry,
            sets: [
              { ...entry.sets[0], localId: 'warm1', isWarmup: true, weightKg: 20 },
              ...entry.sets,
            ],
          }
        : entry,
    ),
  };
}

/* ------------------------------------------------------------------ */

describe('focusPlan', () => {
  it('has nothing to show without a session', () => {
    expect(focusPlan(null)).toEqual({ current: null, lastLogged: null, isNewExercise: false });
  });

  it('points at the first set, numbered 1 of 4, before anything is logged', () => {
    const plan = focusPlan(session([[pullups, 4]]));
    expect(plan.current?.entry.exercise.name).toBe('Weighted 90° pull-ups');
    expect(plan.current?.workingNumber).toBe(1);
    expect(plan.current?.workingTotal).toBe(4);
    expect(plan.lastLogged).toBeNull();
    expect(plan.isNewExercise).toBe(false);
  });

  it('follows the ✓ down the exercise', () => {
    let s = session([[pullups, 4]]);
    s = log(s, 0, 0, 0);
    const plan = focusPlan(s);
    expect(plan.current?.workingNumber).toBe(2);
    expect(plan.lastLogged?.workingNumber).toBe(1);
    expect(plan.isNewExercise).toBe(false);
  });

  it('says a new exercise when the last ✓ finished the one before it', () => {
    let s = session([
      [pullups, 2],
      [rows, 4],
    ]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3);
    const plan = focusPlan(s);
    expect(plan.current?.entry.exercise.name).toBe('Wide pull-ups machine');
    expect(plan.current?.workingNumber).toBe(1);
    expect(plan.lastLogged?.entry.exercise.name).toBe('Weighted 90° pull-ups');
    expect(plan.isNewExercise).toBe(true);
  });

  it('walks on to the next exercise when a set was skipped rather than back to it', () => {
    // Logging out of order does not send you backwards: what comes next is what
    // comes next in the list, and the skipped set is picked up by the wrap once
    // there is nothing below it. Same rule as the glow — `lib/upNext.ts`.
    let s = session([
      [pullups, 3],
      [rows, 2],
    ]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 2, 3); // set 2 skipped, set 3 logged
    const plan = focusPlan(s);
    expect(plan.current?.entry.exercise.name).toBe('Wide pull-ups machine');
    expect(plan.isNewExercise).toBe(true);
  });

  it('comes back for the skipped set, and does not call it a new exercise', () => {
    let s = session([[pullups, 3]]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 2, 3); // set 2 skipped
    const plan = focusPlan(s);
    expect(plan.current?.workingNumber).toBe(2);
    expect(plan.lastLogged?.workingNumber).toBe(3);
    expect(plan.isNewExercise).toBe(false);
  });

  it('reads a warm-up as a warm-up, and numbers the working sets around it', () => {
    const s = withWarmup(session([[pullups, 3]]), 0);
    const plan = focusPlan(s);
    // The warm-up is first, so it is what focus mode points at — and it has no
    // working number.
    expect(plan.current?.workingNumber).toBeNull();
    expect(plan.current?.workingTotal).toBe(3);
    expect(plan.current?.set.isWarmup).toBe(true);

    const after = focusPlan(log(s, 0, 0, 0));
    expect(after.current?.workingNumber).toBe(1);
    expect(after.lastLogged?.workingNumber).toBeNull();
  });

  it('has no current set once the session is logged out, and still knows the last one', () => {
    let s = session([[pullups, 2]]);
    s = log(s, 0, 0, 0);
    s = log(s, 0, 1, 3);
    const plan = focusPlan(s);
    expect(plan.current).toBeNull();
    expect(plan.lastLogged?.workingNumber).toBe(2);
    expect(plan.isNewExercise).toBe(false);
  });

  it('describes where you are in the exercise, and says warm-up rather than a number', () => {
    const plan = focusPlan(session([[pullups, 4]]));
    expect(plan.current && describeSetPosition(plan.current)).toBe('set 1 of 4');

    const warm = focusPlan(withWarmup(session([[pullups, 4]]), 0));
    expect(warm.current && describeSetPosition(warm.current)).toBe('warm-up');
  });

  it('carries the set itself, so the sheet renders numbers rather than looking them up', () => {
    const s = session([[pullups, 4]]);
    const plan = focusPlan(s);
    expect(plan.current?.set.localId).toBe(s.entries[0].sets[0].localId);
    expect(plan.current?.entryId).toBe(s.entries[0].localId);
  });
});
