import { describe, expect, it } from 'vitest';

import {
  applyDraftToExercise,
  draftToExercise,
  emptyExerciseDraft,
  exerciseToDraft,
} from './exerciseDraft';
import type { Exercise } from '../types/models';

/**
 * The two conversions behind the exercise editor.
 *
 * These stopped being cosmetic when the create screen learned to EDIT: a mistake
 * here does not produce a wrong default on something new, it rewrites a library row
 * that already has logged sets pointing at it.
 */

const machine: Exercise = {
  id: 'ex_rope_curl',
  ownerId: 'u1',
  name: 'Biceps curl rope machine',
  aliases: ['rope curl'],
  muscleGroups: ['biceps', 'forearms'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  incrementKg: 2.5,
  defaultWeightKg: 16,
  defaultCount: 12,
  defaultRestSeconds: 120,
  equipment: 'cable',
  isArchived: false,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const plank: Exercise = {
  id: 'ex_plank',
  ownerId: null,
  name: 'Plank',
  muscleGroups: ['core'],
  requiresWeight: false,
  countUnit: 'seconds',
  loadMode: 'none',
  timerMode: 'countdown',
  prepareSeconds: 5,
  isUnilateral: false,
  defaultCount: 120,
  isArchived: false,
  createdAt: '2026-06-01T00:00:00.000Z',
};

/* ------------------------------------------------------------------ */

describe('a round trip changes nothing', () => {
  it('holds a weighted exercise', () => {
    const back = applyDraftToExercise(exerciseToDraft(machine), machine);

    expect(back.name).toBe(machine.name);
    expect(back.muscleGroups).toEqual(machine.muscleGroups);
    expect(back.requiresWeight).toBe(true);
    expect(back.countUnit).toBe('reps');
    expect(back.loadMode).toBe('external');
    expect(back.defaultWeightKg).toBe(16);
    expect(back.defaultCount).toBe(12);
    expect(back.incrementKg).toBe(2.5);
  });

  it('holds a timed hold, where the target lives in the DURATION well', () => {
    const draft = exerciseToDraft(plank);
    // The 2:00 is a clock, so it belongs to the duration well and not to the rep
    // target — moving it would turn a two-minute plank into 120 reps.
    expect(draft.durationSeconds).toBe(120);

    const back = applyDraftToExercise(draft, plank);
    expect(back.defaultCount).toBe(120);
    expect(back.countUnit).toBe('seconds');
    expect(back.timerMode).toBe('countdown');
    expect(back.prepareSeconds).toBe(5);
  });
});

describe('editing preserves what identifies the exercise', () => {
  it('keeps the id, the owner and the creation date', () => {
    const renamed = applyDraftToExercise(
      { ...exerciseToDraft(machine), name: 'Rope curls' },
      machine,
    );

    // The id is what every logged set points at: history follows the rename.
    expect(renamed.id).toBe(machine.id);
    expect(renamed.ownerId).toBe('u1');
    expect(renamed.createdAt).toBe(machine.createdAt);
    expect(renamed.name).toBe('Rope curls');
  });

  it('leaves a shipped exercise shipped', () => {
    const edited = applyDraftToExercise(exerciseToDraft(plank), plank);
    // `ownerId: null` is what "came with the app" means, and `Restore the shipped
    // exercise library` reads it.
    expect(edited.ownerId).toBeNull();
  });

  it('carries across the fields the editor never shows', () => {
    const edited = applyDraftToExercise(exerciseToDraft(machine), machine);

    expect(edited.aliases).toEqual(machine.aliases);
    expect(edited.equipment).toBe('cable');
    expect(edited.isUnilateral).toBe(machine.isUnilateral);
  });

  it('trims the name, because a trailing space is invisible in a list', () => {
    const edited = applyDraftToExercise(
      { ...exerciseToDraft(machine), name: '  Rope curls  ' },
      machine,
    );
    expect(edited.name).toBe('Rope curls');
  });
});

describe('the shape axes stay consistent', () => {
  it('drops the weight fields when weight is switched off', () => {
    const draft = {
      ...exerciseToDraft(machine),
      requiresWeight: false,
      countUnit: 'reps' as const,
    };
    const edited = applyDraftToExercise(draft, machine);

    // No weight cell means no load mode, no increment and no starting weight —
    // otherwise the row claims inputs it will never render.
    expect(edited.requiresWeight).toBe(false);
    expect(edited.loadMode).toBe('none');
    expect(edited.incrementKg).toBeUndefined();
    expect(edited.defaultWeightKg).toBeUndefined();
  });

  it('gives a weighted exercise a real load mode when it had none', () => {
    const unweighted: Exercise = { ...machine, requiresWeight: false, loadMode: 'none' };
    const draft = { ...exerciseToDraft(unweighted), requiresWeight: true };

    expect(applyDraftToExercise(draft, unweighted).loadMode).toBe('external');
  });

  it('omits the timer entirely when it is manual', () => {
    const draft = { ...exerciseToDraft(plank), timerMode: 'manual' as const };
    const edited = applyDraftToExercise(draft, plank);

    // Absent, not stored as 'manual': a row that says nothing about a timer reads
    // more easily than one that says "off".
    expect(edited.timerMode).toBeUndefined();
    expect(edited.prepareSeconds).toBeUndefined();
  });
});

describe('a row with nothing set still opens in the editor', () => {
  const bare: Exercise = {
    id: 'ex_bare',
    ownerId: null,
    name: 'Something',
    muscleGroups: [],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    isUnilateral: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('fills every well with a usable number', () => {
    const draft = exerciseToDraft(bare);

    // The wells render 40 px numerals; there is no such thing as an empty one.
    expect(draft.defaultWeightKg).toBeGreaterThan(0);
    expect(draft.targetCount).toBeGreaterThan(0);
    expect(draft.durationSeconds).toBeGreaterThan(0);
    expect(draft.incrementKg).toBe(2.5);
    expect(draft.prepareSeconds).toBeGreaterThan(0);
  });

  it('repairs junk that survived a JSON round-trip', () => {
    const junk = {
      ...bare,
      defaultWeightKg: NaN,
      defaultCount: -3,
      incrementKg: 0,
    } as Exercise;
    const draft = exerciseToDraft(junk);

    expect(Number.isFinite(draft.defaultWeightKg)).toBe(true);
    expect(draft.targetCount).toBeGreaterThan(0);
    expect(draft.incrementKg).toBe(2.5);
  });
});

describe('creating', () => {
  it('stamps a new id and creation date', () => {
    const draft = emptyExerciseDraft('Zercher squat', 'quads', 150);
    const created = draftToExercise(draft, 'ex_new', 'u1', new Date('2026-08-17T17:00:00.000Z'));

    expect(created.id).toBe('ex_new');
    expect(created.createdAt).toBe('2026-08-17T17:00:00.000Z');
    // The muscle the create flow was opened from is primary, so the exercise files
    // where the user was looking.
    expect(created.muscleGroups).toEqual(['quads']);
    expect(created.defaultRestSeconds).toBe(150);
  });
});
