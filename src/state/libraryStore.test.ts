import { beforeEach, describe, expect, it } from 'vitest';

import { routineUsageCount, useLibrary } from './libraryStore';
import { seedExercises, seedRoutines } from '../data/seed';
import type { Exercise } from '../types/models';

const newExercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'ex_test_1',
  ownerId: 'u1',
  name: 'Test press',
  muscleGroups: ['chest'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
});

/**
 * `+ Add routine` was wired to an empty handler, so the button did nothing at all.
 * These are the rules the fix has to hold to.
 */
describe('creating a routine', () => {
  it('appends an empty routine and returns it', () => {
    const before = useLibrary.getState().routines.length;
    const created = useLibrary.getState().createRoutine();

    // Returned, because the caller's next move is to open its editor.
    expect(created.id).toBeTruthy();
    expect(created.items).toEqual([]);
    expect(useLibrary.getState().routines).toHaveLength(before + 1);
    expect(useLibrary.getState().routines.at(-1)?.id).toBe(created.id);
  });

  it('names it, and never twice the same', () => {
    const first = useLibrary.getState().createRoutine();
    const second = useLibrary.getState().createRoutine();

    expect(first.name).toBe('New routine');
    // Two rows reading "New routine" are two rows you cannot tell apart, and the
    // list is how you find the one you just made.
    expect(second.name).toBe('New routine 2');
  });

  it('takes a name when one is given, and ignores an empty one', () => {
    expect(useLibrary.getState().createRoutine('Legs, heavy').name).toBe('Legs, heavy');
    expect(useLibrary.getState().createRoutine('   ').name).toBe('New routine');
  });

  it('is immediately editable — the editor writes into a real routine', () => {
    const created = useLibrary.getState().createRoutine();
    const exerciseId = seedExercises[0].id;

    // This is why the routine is created BEFORE the editor opens: adding an
    // exercise writes straight to the store.
    useLibrary.getState().appendToRoutine(created.id, exerciseId);

    const stored = useLibrary.getState().routines.find((r) => r.id === created.id);
    expect(stored?.items.map((i) => i.exerciseId)).toEqual([exerciseId]);
  });

  it('can be deleted again, which is how a cancelled create is undone', () => {
    const created = useLibrary.getState().createRoutine();
    useLibrary.getState().deleteRoutine(created.id);

    expect(useLibrary.getState().routines.some((r) => r.id === created.id)).toBe(false);
  });
});

describe('add and delete', () => {
  it('adds an exercise to the library', () => {
    useLibrary.getState().addExercise(newExercise());
    expect(useLibrary.getState().exercises.some((e) => e.id === 'ex_test_1')).toBe(true);
  });

  it('deleting removes it', () => {
    useLibrary.getState().addExercise(newExercise());
    useLibrary.getState().deleteExercise('ex_test_1');
    expect(useLibrary.getState().exercises.some((e) => e.id === 'ex_test_1')).toBe(false);
  });

  /*
   * The rule worth a test: a routine holding a dead `exerciseId` doesn't crash —
   * `buildDraftSession` skips unresolvable items — it quietly plans fewer sets than
   * its own set count claims, which is a lie on the home screen.
   */
  it('deleting an exercise removes it from every routine', () => {
    const victim = seedRoutines[0].items[0].exerciseId;
    expect(routineUsageCount(useLibrary.getState().routines, victim)).toBeGreaterThan(0);

    useLibrary.getState().deleteExercise(victim);

    expect(routineUsageCount(useLibrary.getState().routines, victim)).toBe(0);
    for (const routine of useLibrary.getState().routines) {
      expect(routine.items.some((i) => i.exerciseId === victim)).toBe(false);
    }
  });

  it('renumbers the surviving items so order has no gaps', () => {
    const victim = seedRoutines[0].items[0].exerciseId;
    useLibrary.getState().deleteExercise(victim);

    for (const routine of useLibrary.getState().routines) {
      expect(routine.items.map((i) => i.order)).toEqual(routine.items.map((_, i) => i));
    }
  });

  it('leaves routines that never held it untouched', () => {
    const before = useLibrary.getState().routines;
    useLibrary.getState().addExercise(newExercise());
    useLibrary.getState().deleteExercise('ex_test_1');

    // Same array identities: nothing was rewritten for a no-op.
    expect(useLibrary.getState().routines).toEqual(before);
  });
});

describe('appendToRoutine', () => {
  it('defaults a rep exercise to 4 sets of 10', () => {
    const routineId = seedRoutines[0].id;
    const reps = seedExercises.find((e) => e.countUnit === 'reps');
    if (!reps) throw new Error('no rep exercise in the fixtures');

    useLibrary.getState().appendToRoutine(routineId, reps.id);
    const items = useLibrary.getState().routines.find((r) => r.id === routineId)?.items ?? [];
    const added = items[items.length - 1];

    expect(added.exerciseId).toBe(reps.id);
    expect(added.targetSets).toBe(4);
    expect(added.targetRepsMax).toBe(10);
  });

  /*
   * `targetRepsMax` holds SECONDS for time-counted work, so a shared default of 10
   * would add a ten-second plank and a ten-second boxing round — and on a timed
   * exercise that number is what the countdown counts down.
   */
  it('defaults a timed exercise to a duration, not to ten reps', () => {
    const routineId = seedRoutines[0].id;
    const timed = seedExercises.find((e) => e.countUnit === 'seconds');
    if (!timed) throw new Error('no time-counted exercise in the fixtures');

    useLibrary.getState().appendToRoutine(routineId, timed.id);
    const items = useLibrary.getState().routines.find((r) => r.id === routineId)?.items ?? [];
    const added = items[items.length - 1];

    expect(added.targetRepsMax).toBe(60);
  });

  it('defaults rounds to twelve threes', () => {
    const routineId = seedRoutines[0].id;
    const rounds = seedExercises.find((e) => e.countUnit === 'rounds');
    if (!rounds) throw new Error('no round-counted exercise in the fixtures');

    useLibrary.getState().appendToRoutine(routineId, rounds.id);
    const items = useLibrary.getState().routines.find((r) => r.id === routineId)?.items ?? [];
    const added = items[items.length - 1];

    expect(added.targetSets).toBe(12);
    expect(added.targetRepsMax).toBe(180);
  });

  it('ignores an exercise that is not in the library', () => {
    const routineId = seedRoutines[0].id;
    const before = useLibrary.getState().routines.find((r) => r.id === routineId)?.items.length;

    useLibrary.getState().appendToRoutine(routineId, 'ex_does_not_exist');
    expect(useLibrary.getState().routines.find((r) => r.id === routineId)?.items.length).toBe(
      before,
    );
  });
});

describe('routines', () => {
  it('updates a routine by id and stamps it', () => {
    const routine = useLibrary.getState().routines[0];
    useLibrary.getState().updateRoutine(routine.id, { name: 'Renamed', items: [] });

    const after = useLibrary.getState().routines.find((r) => r.id === routine.id);
    expect(after?.name).toBe('Renamed');
    expect(after?.items).toEqual([]);
    expect(after?.updatedAt).not.toBe(routine.updatedAt);
  });

  it('deletes a routine without touching the library', () => {
    const routine = useLibrary.getState().routines[0];
    const exerciseCount = useLibrary.getState().exercises.length;

    useLibrary.getState().deleteRoutine(routine.id);

    expect(useLibrary.getState().routines.some((r) => r.id === routine.id)).toBe(false);
    expect(useLibrary.getState().exercises).toHaveLength(exerciseCount);
  });

  it('restoring the seed library undoes everything', () => {
    useLibrary.getState().addExercise(newExercise());
    useLibrary.getState().deleteRoutine(seedRoutines[0].id);
    useLibrary.getState().restoreSeedLibrary();

    expect(useLibrary.getState().exercises).toEqual(seedExercises);
    expect(useLibrary.getState().routines).toEqual(seedRoutines);
  });
});
