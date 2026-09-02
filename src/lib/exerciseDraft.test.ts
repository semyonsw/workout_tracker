import { describe, expect, it } from 'vitest';

import {
  applyDraftToExercise,
  bumpDraftRest,
  bumpDraftSets,
  bumpLadderMax,
  draftToExercise,
  emptyExerciseDraft,
  exerciseToDraft,
  followSettingsRest,
  toggleLadder,
} from './exerciseDraft';
import { defaultTargetSets } from './draft';
import { REST_LIMITS } from './rest';
import { LADDER_SETS } from './repLadder';
import { TARGET_SETS_LIMITS } from './routinePlan';
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
  });

  it('does not stamp the rest setting onto the exercise', () => {
    /*
     * THE BUG, in one assertion. The draft's rest is seeded from Settings so the
     * row has something to show, and `draftToExercise` used to write it into
     * `defaultRestSeconds` unconditionally — so every exercise ever saved came out
     * carrying a permanent override with the setting's value of that moment, and
     * the setting was shadowed everywhere afterwards. See `lib/rest.ts`.
     */
    const draft = emptyExerciseDraft('Zercher squat', 'quads', 150);
    const created = draftToExercise(draft, 'ex_new', 'u1');

    expect(created.defaultRestSeconds).toBeUndefined();
    expect(JSON.stringify(created)).not.toContain('defaultRestSeconds');
  });

  it('writes a rest the user actually set, and takes it back on demand', () => {
    const own = bumpDraftRest(emptyExerciseDraft('Zercher squat', 'quads', 150), -REST_LIMITS.step);
    expect(own.restFollowsSettings).toBe(false);
    expect(draftToExercise(own, 'ex_new', 'u1').defaultRestSeconds).toBe(135);

    // ...and back to following, which is an absence rather than a copy of 150.
    const back = followSettingsRest(own, 150);
    expect(back.restSeconds).toBe(150);
    expect(draftToExercise(back, 'ex_new', 'u1').defaultRestSeconds).toBeUndefined();
  });

  it('round-trips an exercise through the editor without inventing a rest', () => {
    // Opening an exercise, changing nothing and saving must not give it a rest it
    // did not have — the shape of the original stamp, one screen away.
    const existing = draftToExercise(
      emptyExerciseDraft('Zercher squat', 'quads', 150),
      'ex_z',
      'u1',
    );

    const following = exerciseToDraft(existing, 200);
    expect(following.restSeconds).toBe(200);
    expect(following.restFollowsSettings).toBe(true);
    expect(applyDraftToExercise(following, existing).defaultRestSeconds).toBeUndefined();

    const own = exerciseToDraft({ ...existing, defaultRestSeconds: 90 }, 200);
    expect(own.restSeconds).toBe(90);
    expect(own.restFollowsSettings).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

/**
 * The ladder, through the editor and back.
 *
 * The one that matters: `ladderEarned` is not on the screen and must survive
 * anyway. A user who renames their pull-ups must not lose the two reps their
 * ladder has climbed — the same rule that makes `id` and `createdAt` survive an
 * edit, for the same reason.
 */
describe('the ladder round trip', () => {
  const withLadder: Exercise = { ...machine, ladder: { max: 16, earned: 2 } };

  it('opens an existing ladder as on, with its max and its progress', () => {
    const draft = exerciseToDraft(withLadder);
    expect(draft.ladderOn).toBe(true);
    expect(draft.ladderMax).toBe(16);
    expect(draft.ladderEarned).toBe(2);
  });

  it('carries the earned reps through an unrelated edit', () => {
    const draft = exerciseToDraft(withLadder);
    const saved = applyDraftToExercise({ ...draft, name: 'Wide pull-ups' }, withLadder);
    expect(saved.name).toBe('Wide pull-ups');
    expect(saved.ladder).toEqual({ max: 16, earned: 2 });
  });

  it('resets the earned reps when the max is retested by hand', () => {
    const draft = bumpLadderMax(exerciseToDraft(withLadder), 1);
    expect(draft.ladderMax).toBe(17);
    // Two reps earned against 16 say nothing about 17.
    expect(draft.ladderEarned).toBe(0);
  });

  it('does not reset anything when the max cannot move', () => {
    const pinned = { ...exerciseToDraft(withLadder), ladderMax: 100 };
    expect(bumpLadderMax(pinned, 1)).toBe(pinned);
  });

  it('switches on with a max seeded from the target reps on screen', () => {
    const draft = toggleLadder({ ...emptyExerciseDraft('Pull-ups'), targetCount: 12 }, true);
    expect(draft.ladderOn).toBe(true);
    expect(draft.ladderMax).toBe(12);
  });

  it('keeps the max when switched off, so the toggle is reversible', () => {
    const off = toggleLadder(exerciseToDraft(withLadder), false);
    expect(off.ladderOn).toBe(false);
    expect(off.ladderMax).toBe(16);
    expect(draftToExercise(off, 'ex_x', 'u1').ladder).toBeUndefined();
  });

  it('writes no ladder on a unit that cannot run one', () => {
    const draft = { ...exerciseToDraft(plank), ladderOn: true, ladderMax: 16, ladderEarned: 0 };
    expect(draftToExercise(draft, 'ex_x', 'u1').ladder).toBeUndefined();
  });

  it('opens a hand-edited or stale ladder as off rather than as a broken form', () => {
    const broken = { ...machine, ladder: { max: Number.NaN, earned: 0 } };
    expect(exerciseToDraft(broken).ladderOn).toBe(false);
    // ...and one on a row whose count unit moved under it.
    expect(exerciseToDraft({ ...withLadder, countUnit: 'seconds' }).ladderOn).toBe(false);
  });

  it('is off on a brand-new exercise', () => {
    const draft = emptyExerciseDraft('Zercher squat');
    expect(draft.ladderOn).toBe(false);
    expect(draftToExercise(draft, 'ex_new', 'u1').ladder).toBeUndefined();
  });
});

/**
 * THE SET COUNT.
 *
 * It used to not be on this screen at all: `defaultTargetSets` guessed per count
 * unit and the only correction was inside each routine, item by item. These are
 * the two directions of the new field, and the one rule that matters is that what
 * the editor shows is what a routine would actually plan.
 */
describe('the planned set count', () => {
  it('round-trips, and is what a routine item is built from', () => {
    const draft = { ...exerciseToDraft(machine), targetSets: 6 };
    const saved = applyDraftToExercise(draft, machine);

    expect(saved.defaultSets).toBe(6);
    expect(defaultTargetSets(saved)).toBe(6);
    expect(exerciseToDraft(saved).targetSets).toBe(6);
  });

  it('opens a row that has never had one at the per-unit fallback', () => {
    // The same number a routine item would get, so the editor is not showing a
    // number the plan disagrees with.
    expect(exerciseToDraft(machine).targetSets).toBe(defaultTargetSets(machine));
    expect(exerciseToDraft(plank).targetSets).toBe(defaultTargetSets(plank));
  });

  it('clamps to what a routine may hold', () => {
    const draft = exerciseToDraft(machine);
    expect(bumpDraftSets({ ...draft, targetSets: TARGET_SETS_LIMITS.min }, -5).targetSets).toBe(
      TARGET_SETS_LIMITS.min,
    );
    expect(bumpDraftSets({ ...draft, targetSets: TARGET_SETS_LIMITS.max }, 5).targetSets).toBe(
      TARGET_SETS_LIMITS.max,
    );
  });

  it('repairs a hand-edited row rather than saving it', () => {
    const broken = { ...exerciseToDraft(machine), targetSets: Number.NaN };
    expect(draftToExercise(broken, 'ex_x', 'u1').defaultSets).toBe(TARGET_SETS_LIMITS.min);
  });
});

/**
 * THE LADDER'S MAX IS THE REP NUMBER.
 *
 * The bug: the screen carried a `TARGET REPS` well AND a ladder max, so setting a
 * max of 16 left the well on the 12 a blank draft starts with, and 12 is what got
 * saved as `defaultCount` — the number the first session prefills. Two controls,
 * one quantity. There is one now.
 */
describe('the max is the only rep number', () => {
  const laddered = { ...machine, defaultCount: 12, ladder: { max: 16, earned: 0 } };

  it('opens the rep target ON the max, not on the stored count', () => {
    expect(exerciseToDraft(laddered).targetCount).toBe(16);
  });

  it('saves the max as the count the first session starts at', () => {
    const draft = bumpLadderMax(exerciseToDraft(laddered), 1);
    const saved = applyDraftToExercise(draft, laddered);

    expect(saved.ladder).toEqual({ max: 17, earned: 0 });
    // Not 12. The first rung of the ladder IS the max.
    expect(saved.defaultCount).toBe(17);
  });

  it('derives the count from the max even when the draft disagrees', () => {
    const stale = { ...exerciseToDraft(laddered), targetCount: 12 };
    expect(draftToExercise(stale, 'ex_x', 'u1').defaultCount).toBe(16);
  });

  it('leaves the max behind as the rep target when the ladder is switched off', () => {
    const off = toggleLadder(exerciseToDraft(laddered), false);
    expect(off.targetCount).toBe(16);
    expect(draftToExercise(off, 'ex_x', 'u1').defaultCount).toBe(16);
  });

  it('asks for the scheme’s five sets when switched on', () => {
    const on = toggleLadder(emptyExerciseDraft('Pull-ups'), true);
    expect(on.targetSets).toBe(LADDER_SETS);
  });

  it('leaves a hold alone — its duration is not a rep target', () => {
    const draft = { ...exerciseToDraft(plank), ladderOn: true, ladderMax: 16 };
    expect(draftToExercise(draft, 'ex_x', 'u1').defaultCount).toBe(120);
  });
});

/**
 * THE CUE. One line of form, on the movement rather than on a set.
 *
 * `SetHistory.notes` was deleted because "prose per set is a search feature this app
 * has no screen for". This is the field that survives that objection: it is a fact
 * about the exercise, edited where the exercise is defined, displayed on the card
 * while you are doing it.
 */
describe('the form cue', () => {
  it('round-trips', () => {
    const withCue = { ...machine, cue: 'Elbows in, pause at the chest' };
    expect(exerciseToDraft(withCue).cue).toBe('Elbows in, pause at the chest');
    expect(applyDraftToExercise(exerciseToDraft(withCue), withCue).cue).toBe(
      'Elbows in, pause at the chest',
    );
  });

  it('is absent rather than empty when there is nothing to say', () => {
    // A row of empty quotes on disk is a field pretending to have a value.
    expect(exerciseToDraft(machine).cue).toBe('');
    expect(draftToExercise(emptyExerciseDraft('Zercher squat'), 'ex_x', 'u1').cue).toBeUndefined();
  });

  it('trims whitespace, and treats blank as absent', () => {
    const draft = { ...emptyExerciseDraft('Squat'), cue: '   ' };
    expect(draftToExercise(draft, 'ex_x', 'u1').cue).toBeUndefined();

    const padded = { ...emptyExerciseDraft('Squat'), cue: '  Brace hard  ' };
    expect(draftToExercise(padded, 'ex_x', 'u1').cue).toBe('Brace hard');
  });

  it('caps a paragraph, because it is one line on a card', () => {
    const essay = { ...emptyExerciseDraft('Squat'), cue: 'x'.repeat(500) };
    expect(draftToExercise(essay, 'ex_x', 'u1').cue).toHaveLength(120);
  });

  it('can be cleared by an edit', () => {
    const withCue = { ...machine, cue: 'Old cue' };
    const cleared = applyDraftToExercise({ ...exerciseToDraft(withCue), cue: '' }, withCue);
    expect(cleared.cue).toBeUndefined();
  });
});
