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

  it("adding an exercise uses the exercise's own target, not a constant", () => {
    const created = useLibrary.getState().createRoutine();
    useLibrary.getState().addExercise(newExercise({ id: 'ex_target_12', defaultCount: 12 }));
    useLibrary.getState().appendToRoutine(created.id, 'ex_target_12');

    const item = useLibrary.getState().routines.find((r) => r.id === created.id)?.items[0];
    // 12 is what the create screen's `TARGET REPS` well said; a hard-coded 10 here
    // was the create screen quietly not meaning it.
    expect(item?.targetRepsMax).toBe(12);
  });

  it('falls back to a sane target per count unit when the exercise has none', () => {
    const created = useLibrary.getState().createRoutine();
    useLibrary.getState().addExercise(
      newExercise({
        id: 'ex_round',
        countUnit: 'rounds',
        requiresWeight: false,
        loadMode: 'none',
      }),
    );
    useLibrary.getState().appendToRoutine(created.id, 'ex_round');

    const item = useLibrary.getState().routines.find((r) => r.id === created.id)?.items[0];
    // A ten-second boxing round is not a thing; rounds default to 3:00.
    expect(item?.targetRepsMax).toBe(180);
  });

  it('can be deleted again, which is how a cancelled create is undone', () => {
    const created = useLibrary.getState().createRoutine();
    useLibrary.getState().deleteRoutine(created.id);

    expect(useLibrary.getState().routines.some((r) => r.id === created.id)).toBe(false);
  });
});

describe('editing an exercise', () => {
  it('replaces it in place, keeping the id', () => {
    useLibrary.getState().addExercise(newExercise({ name: 'Typo prees' }));
    const before = useLibrary.getState().exercises.length;

    useLibrary
      .getState()
      .updateExercise('ex_test_1', newExercise({ name: 'Test press', defaultWeightKg: 16 }));

    const after = useLibrary.getState().exercises;
    // In place: one row, same id, so every set logged against it stays attached.
    expect(after).toHaveLength(before);
    expect(after.find((e) => e.id === 'ex_test_1')?.name).toBe('Test press');
    expect(after.find((e) => e.id === 'ex_test_1')?.defaultWeightKg).toBe(16);
  });

  it('cannot change which exercise it is', () => {
    useLibrary.getState().addExercise(newExercise());
    useLibrary
      .getState()
      .updateExercise('ex_test_1', newExercise({ id: 'ex_something_else', name: 'Renamed' }));

    const ids = useLibrary.getState().exercises.map((e) => e.id);
    expect(ids).toContain('ex_test_1');
    expect(ids).not.toContain('ex_something_else');
  });

  it('leaves the routines holding it alone', () => {
    const held = seedRoutines[0].items[0].exerciseId;
    const before = routineUsageCount(useLibrary.getState().routines, held);
    const existing = useLibrary.getState().exercises.find((e) => e.id === held);
    if (!existing) throw new Error('fixture exercise missing');

    useLibrary.getState().updateExercise(held, { ...existing, name: 'Renamed movement' });

    // A rename is not a delete: the routine keeps its item and follows the name.
    expect(routineUsageCount(useLibrary.getState().routines, held)).toBe(before);
  });

  it('is a no-op for an id that is not there', () => {
    const before = useLibrary.getState().exercises;
    useLibrary.getState().updateExercise('ex_ghost', newExercise({ id: 'ex_ghost' }));

    expect(useLibrary.getState().exercises).toHaveLength(before.length);
    expect(useLibrary.getState().exercises.some((e) => e.id === 'ex_ghost')).toBe(false);
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

/* ------------------------------------------------------------------ */

/**
 * The training sequence. Its whole contract is "off and empty until the user
 * builds one", so most of these are about it staying out of the way.
 */
describe('the training sequence', () => {
  const routineIds = () => useLibrary.getState().sequence.routineIds;
  const seq = () => useLibrary.getState().sequence;

  it('ships off and empty', () => {
    expect(seq()).toEqual({ isActive: false, routineIds: [], cursor: 0 });
  });

  it('cannot be turned on with nothing in it', () => {
    // There would be nothing for it to suggest, and the home screen would render
    // an empty strip above an empty card.
    useLibrary.getState().setSequenceActive(true);
    expect(seq().isActive).toBe(false);
  });

  it('takes steps in order, repeats included', () => {
    const [pull, push] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(push.id);
    useLibrary.getState().addSequenceStep(pull.id);
    useLibrary.getState().addSequenceStep(push.id);

    // push → pull → push is three steps, two of them the same routine.
    expect(routineIds()).toEqual([push.id, pull.id, push.id]);
  });

  it('refuses a step for a routine that does not exist', () => {
    useLibrary.getState().addSequenceStep('r_nope');
    expect(routineIds()).toEqual([]);
  });

  it('turns on once it has a step, and stays on', () => {
    useLibrary.getState().addSequenceStep(useLibrary.getState().routines[0].id);
    useLibrary.getState().setSequenceActive(true);
    expect(seq().isActive).toBe(true);
  });

  it('moves a step up and down, and refuses to move it off either end', () => {
    const [a, b] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().addSequenceStep(b.id);

    useLibrary.getState().moveSequenceStep(1, -1);
    expect(routineIds()).toEqual([b.id, a.id]);

    useLibrary.getState().moveSequenceStep(0, -1);
    expect(routineIds()).toEqual([b.id, a.id]);

    useLibrary.getState().moveSequenceStep(1, 1);
    expect(routineIds()).toEqual([b.id, a.id]);
  });

  it('keeps the cursor on the same step when an earlier one is removed', () => {
    const [a, b, c] = useLibrary.getState().routines;
    for (const id of [a.id, b.id, c.id]) useLibrary.getState().addSequenceStep(id);
    useLibrary.getState().setSequenceCursor(2);

    useLibrary.getState().removeSequenceStep(0);

    // `c` was next up before and is still next up after.
    expect(routineIds()).toEqual([b.id, c.id]);
    expect(seq().cursor).toBe(1);
  });

  it('clamps the cursor when the last step is removed', () => {
    const [a, b] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().addSequenceStep(b.id);
    useLibrary.getState().setSequenceCursor(1);

    useLibrary.getState().removeSequenceStep(1);

    expect(seq().cursor).toBe(0);
  });

  it('advances only when the routine that was finished is the step it is on', () => {
    const [a, b] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().addSequenceStep(b.id);
    useLibrary.getState().setSequenceActive(true);

    // Trained something else entirely: the queue has not moved on.
    useLibrary.getState().advanceSequence(b.id);
    expect(seq().cursor).toBe(0);

    useLibrary.getState().advanceSequence(a.id);
    expect(seq().cursor).toBe(1);
  });

  it('wraps at the end — a sequence is a cycle', () => {
    const [a] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().setSequenceActive(true);

    useLibrary.getState().advanceSequence(a.id);
    expect(seq().cursor).toBe(0);
  });

  it('does not advance while it is off', () => {
    const [a, b] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().addSequenceStep(b.id);

    useLibrary.getState().advanceSequence(a.id);
    expect(seq().cursor).toBe(0);
  });

  it('drops the steps of a routine that gets deleted', () => {
    const [a, b] = useLibrary.getState().routines;
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().addSequenceStep(b.id);
    useLibrary.getState().addSequenceStep(a.id);
    useLibrary.getState().setSequenceCursor(2);

    useLibrary.getState().deleteRoutine(a.id);

    // A step pointing at a routine that is gone is a queue position with nothing
    // to open.
    expect(routineIds()).toEqual([b.id]);
    expect(seq().cursor).toBe(0);
  });

  it('is reset by restoring the shipped library', () => {
    useLibrary.getState().addSequenceStep(useLibrary.getState().routines[0].id);
    useLibrary.getState().setSequenceActive(true);

    useLibrary.getState().restoreSeedLibrary();

    expect(seq()).toEqual({ isActive: false, routineIds: [], cursor: 0 });
  });
});

describe('a sequence that runs out of steps', () => {
  it('switches itself off when the last step is removed', () => {
    useLibrary.getState().addSequenceStep(useLibrary.getState().routines[0].id);
    useLibrary.getState().setSequenceActive(true);

    useLibrary.getState().removeSequenceStep(0);

    // An active sequence with nothing in it would be a home screen promising a
    // next workout it cannot name.
    expect(useLibrary.getState().sequence).toEqual({
      isActive: false,
      routineIds: [],
      cursor: 0,
    });
  });

  it('switches itself off when its only routine is deleted', () => {
    const routine = useLibrary.getState().routines[0];
    useLibrary.getState().addSequenceStep(routine.id);
    useLibrary.getState().setSequenceActive(true);

    useLibrary.getState().deleteRoutine(routine.id);

    expect(useLibrary.getState().sequence.isActive).toBe(false);
  });
});
