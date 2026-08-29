import { describe, expect, it } from 'vitest';

import {
  TARGET_COUNT_LIMITS,
  TARGET_SETS_LIMITS,
  applyPlannedSetDiff,
  bumpTargetCount,
  bumpTargetMin,
  bumpTargetSets,
  describePlannedSetDiff,
  isSupersettedWithAbove,
  performedSetCounts,
  plannedSetDiff,
  supersetRunPosition,
  toggleSupersetWithAbove,
} from './routinePlan';
import type { RoutineItem } from '../types/models';

function item(overrides: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: 'ri1',
    exerciseId: 'ex_dips',
    order: 0,
    targetSets: 4,
    targetRepsMax: 8,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

/**
 * The set count that used to be four forever.
 *
 * `appendToRoutine` wrote a bare 4 and nothing in the app could write
 * `targetSets` again, so a routine's shape was decided by a literal in a store
 * action. These are the functions the editor's ± chips call.
 */
describe('bumpTargetSets', () => {
  it('nudges by one', () => {
    expect(bumpTargetSets(item(), 1).targetSets).toBe(5);
    expect(bumpTargetSets(item(), -1).targetSets).toBe(3);
  });

  it('stops at one set, because a plan with no work in it is not a plan', () => {
    expect(bumpTargetSets(item({ targetSets: 1 }), -1).targetSets).toBe(TARGET_SETS_LIMITS.min);
    expect(TARGET_SETS_LIMITS.min).toBe(1);
  });

  it('stops at the ceiling', () => {
    const maxed = item({ targetSets: TARGET_SETS_LIMITS.max });
    expect(bumpTargetSets(maxed, 5).targetSets).toBe(TARGET_SETS_LIMITS.max);
  });

  it('repairs a NaN that reached the item from an older blob', () => {
    // This number becomes a set count in `buildDraftSession`.
    expect(bumpTargetSets(item({ targetSets: NaN }), 1).targetSets).toBe(TARGET_SETS_LIMITS.min);
  });
});

describe('bumpTargetCount', () => {
  it('steps reps by one', () => {
    expect(bumpTargetCount(item(), 'reps', 1).targetRepsMax).toBe(9);
  });

  it('steps a hold and a round by fifteen seconds', () => {
    const plank = item({ targetRepsMax: 120 });
    expect(bumpTargetCount(plank, 'seconds', 15).targetRepsMax).toBe(135);
    expect(bumpTargetCount(plank, 'rounds', -15).targetRepsMax).toBe(105);
  });

  it('holds each unit inside its own range, not a shared one', () => {
    // One shared 1–100 would cap a boxing round at 1:40 and let somebody plan a
    // 100 m swim as a session.
    expect(bumpTargetCount(item({ targetRepsMax: 3595 }), 'seconds', 15).targetRepsMax).toBe(
      TARGET_COUNT_LIMITS.seconds.max,
    );
    expect(bumpTargetCount(item({ targetRepsMax: 99 }), 'reps', 5).targetRepsMax).toBe(
      TARGET_COUNT_LIMITS.reps.max,
    );
    expect(bumpTargetCount(item({ targetRepsMax: 50 }), 'meters', -25).targetRepsMax).toBe(
      TARGET_COUNT_LIMITS.meters.min,
    );
  });

  it('drags the range floor down with it, but never up', () => {
    const range = item({ targetRepsMin: 6, targetRepsMax: 8 });
    // Down past the floor: "8–6" nudged to 6 is not a range of 6–6.
    const lowered = bumpTargetCount(bumpTargetCount(range, 'reps', -1), 'reps', -1);
    expect(lowered.targetRepsMax).toBe(6);
    expect(lowered.targetRepsMin).toBe(6);
    // Back up: the floor the user set stays where they set it.
    expect(bumpTargetCount(range, 'reps', 4).targetRepsMin).toBe(6);
  });
});

/**
 * The optional low end of the rep range.
 *
 * One chip opens and closes it, because it is a thing that is either on or off
 * and a second control for that is a switch nobody would find.
 */
describe('bumpTargetMin', () => {
  it('opens the range at the target, so the first tap moves what is on screen', () => {
    expect(bumpTargetMin(item({ targetRepsMax: 10 }), 'reps', -1).targetRepsMin).toBe(9);
  });

  it('is off until it is opened', () => {
    expect(item().targetRepsMin).toBeUndefined();
  });

  it('switches off when nudged up to the target', () => {
    const range = item({ targetRepsMin: 7, targetRepsMax: 8 });
    // A floor at the target IS the target — "8–8" is one number.
    expect(bumpTargetMin(range, 'reps', 1).targetRepsMin).toBeUndefined();
    expect('targetRepsMin' in bumpTargetMin(range, 'reps', 1)).toBe(false);
  });

  it('switches off when nudged below the unit floor', () => {
    const range = item({ targetRepsMin: 1, targetRepsMax: 8 });
    expect('targetRepsMin' in bumpTargetMin(range, 'reps', -1)).toBe(false);
  });

  it('deletes the key rather than storing undefined', () => {
    // It is persisted, and `{"targetRepsMin": null}` in a backup file is a claim
    // about the format that is not true.
    const cleared = bumpTargetMin(item({ targetRepsMin: 6 }), 'reps', 10);
    expect(JSON.stringify(cleared)).not.toContain('targetRepsMin');
  });
});

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

/**
 * Pulling the session's real shape back into the plan.
 *
 * The rules here are all about not putting words in the user's mouth: an
 * unfinished row is an intention, an exercise added mid-session is a fact about
 * today, and a skipped exercise is not a request to delete it from the plan.
 */
describe('plannedSetDiff', () => {
  const items = [
    item({ id: 'ri1', exerciseId: 'ex_dips', targetSets: 4 }),
    item({ id: 'ri2', exerciseId: 'ex_plank', targetSets: 3 }),
  ];

  it('reports an exercise that did more sets than the plan says', () => {
    expect(
      plannedSetDiff(items, [{ exerciseId: 'ex_dips', name: 'Dips', completedSets: 5 }]),
    ).toEqual([
      { itemId: 'ri1', exerciseId: 'ex_dips', name: 'Dips', plannedSets: 4, completedSets: 5 },
    ]);
  });

  it('reports fewer sets too — a plan can be too ambitious', () => {
    const [change] = plannedSetDiff(items, [
      { exerciseId: 'ex_dips', name: 'Dips', completedSets: 2 },
    ]);
    expect(change.completedSets).toBe(2);
  });

  it('says nothing when the session matched the plan', () => {
    expect(
      plannedSetDiff(items, [
        { exerciseId: 'ex_dips', name: 'Dips', completedSets: 4 },
        { exerciseId: 'ex_plank', name: 'Plank', completedSets: 3 },
      ]),
    ).toEqual([]);
  });

  it('never lets an exercise added mid-session join the routine', () => {
    // Deciding to do neck work halfway through pull day is a fact about today.
    expect(
      plannedSetDiff(items, [{ exerciseId: 'ex_neck', name: 'Neck curl', completedSets: 3 }]),
    ).toEqual([]);
  });

  it('reads a skipped exercise as "I did not get to it", not as a plan change', () => {
    // Rewriting targetSets to 0 would be a routine that plans nothing.
    expect(
      plannedSetDiff(items, [{ exerciseId: 'ex_dips', name: 'Dips', completedSets: 0 }]),
    ).toEqual([]);
  });

  it('lets one routine item learn from one session entry', () => {
    // A routine may list the same exercise twice; the first unclaimed item learns
    // and the second entry does not rewrite it again.
    const twice = [
      item({ id: 'ri1', exerciseId: 'ex_dips', targetSets: 4 }),
      item({ id: 'ri2', exerciseId: 'ex_dips', targetSets: 2 }),
    ];
    const changes = plannedSetDiff(twice, [
      { exerciseId: 'ex_dips', name: 'Dips', completedSets: 5 },
      { exerciseId: 'ex_dips', name: 'Dips', completedSets: 3 },
    ]);
    expect(changes.map((c) => [c.itemId, c.completedSets])).toEqual([
      ['ri1', 5],
      ['ri2', 3],
    ]);
  });
});

describe('applyPlannedSetDiff', () => {
  const items = [
    item({ id: 'ri1', exerciseId: 'ex_dips', targetSets: 4, targetRepsMax: 8, targetRepsMin: 6 }),
    item({ id: 'ri2', exerciseId: 'ex_plank', targetSets: 3 }),
  ];

  it('writes only the set counts, and only for the items that changed', () => {
    const changes = plannedSetDiff(items, [
      { exerciseId: 'ex_dips', name: 'Dips', completedSets: 5 },
    ]);
    const next = applyPlannedSetDiff(items, changes);

    expect(next[0].targetSets).toBe(5);
    // Everything else about the item is left exactly alone.
    expect(next[0].targetRepsMax).toBe(8);
    expect(next[0].targetRepsMin).toBe(6);
    expect(next[1]).toBe(items[1]);
  });

  it('is a no-op with no changes', () => {
    expect(applyPlannedSetDiff(items, [])).toEqual(items);
  });

  it('still clamps — a session of 40 sets is a bug somewhere, not a plan', () => {
    const next = applyPlannedSetDiff(items, [
      { itemId: 'ri1', exerciseId: 'ex_dips', name: 'Dips', plannedSets: 4, completedSets: 400 },
    ]);
    expect(next[0].targetSets).toBe(TARGET_SETS_LIMITS.max);
  });
});

describe('describePlannedSetDiff', () => {
  it('is null when there is nothing to say', () => {
    expect(describePlannedSetDiff([])).toBeNull();
  });

  it('states the fact and nothing else', () => {
    const line = describePlannedSetDiff([
      { itemId: 'ri1', exerciseId: 'ex_dips', name: 'Dips', plannedSets: 4, completedSets: 5 },
    ]);
    expect(line).toBe('Dips did 5 sets, not 4');
    // No gamification: five is not better than four, it is what happened.
    for (const word of ['great', 'nice', 'exceeded', 'beat', 'goal', '!']) {
      expect(line?.toLowerCase()).not.toContain(word);
    }
  });

  it('names the first and counts the rest', () => {
    const line = describePlannedSetDiff([
      { itemId: 'ri1', exerciseId: 'a', name: 'Dips', plannedSets: 4, completedSets: 5 },
      { itemId: 'ri2', exerciseId: 'b', name: 'Plank', plannedSets: 3, completedSets: 2 },
    ]);
    expect(line).toBe('Dips did 5 sets, not 4, and 1 other changed too');
  });
});

describe('performedSetCounts', () => {
  it('counts only what was ticked', () => {
    expect(
      performedSetCounts([
        {
          exercise: { id: 'ex_dips', name: 'Dips' },
          sets: [{ isCompleted: true }, { isCompleted: true }, { isCompleted: false }],
        },
      ]),
    ).toEqual([{ exerciseId: 'ex_dips', name: 'Dips', completedSets: 2 }]);
  });
});

/* ------------------------------------------------------------------ */

/**
 * The one superset control: "with the exercise above".
 *
 * `supersetGroup` is a string, and a UI that let people name groups would need a
 * group-name concept, a picker, and an answer for two groups sharing a name — for
 * a feature whose whole content is "these two are done back to back". Adjacency
 * is the model, which is also what a superset is in a gym.
 */
describe('supersets in the routine editor', () => {
  const three = [
    item({ id: 'ri1', exerciseId: 'a' }),
    item({ id: 'ri2', exerciseId: 'b' }),
    item({ id: 'ri3', exerciseId: 'c' }),
  ];

  it('joins two adjacent items into one group', () => {
    const next = toggleSupersetWithAbove(three, 1);

    expect(next[0].supersetGroup).toBeDefined();
    expect(next[1].supersetGroup).toBe(next[0].supersetGroup);
    expect(next[2].supersetGroup).toBeUndefined();
    expect(isSupersettedWithAbove(next, 1)).toBe(true);
  });

  it('grows the same group rather than making a second pair', () => {
    // Toggling the second and then the third builds one group of three.
    const next = toggleSupersetWithAbove(toggleSupersetWithAbove(three, 1), 2);
    const groups = new Set(next.map((i) => i.supersetGroup));

    expect(groups.size).toBe(1);
    expect(next.every((i) => i.supersetGroup != null)).toBe(true);
  });

  it('does nothing on the first row, which has nothing above it', () => {
    expect(toggleSupersetWithAbove(three, 0)).toEqual(three);
  });

  it('splits a pair back into two singletons', () => {
    const joined = toggleSupersetWithAbove(three, 1);
    const split = toggleSupersetWithAbove(joined, 1);

    expect(isSupersettedWithAbove(split, 1)).toBe(false);
    // Two distinct groups of one, which render as no group at all.
    expect(split[0].supersetGroup).not.toBe(split[1].supersetGroup);
    expect(supersetRunPosition(split, 0)).toBe('none');
    expect(supersetRunPosition(split, 1)).toBe('none');
  });

  it('splits A–B–C in the middle into A alone and B–C together', () => {
    // Ungrouping B means B leaves; C stays with A only if it is still next to it,
    // and it is not. So B takes what is below it with it.
    const run = toggleSupersetWithAbove(toggleSupersetWithAbove(three, 1), 2);
    const split = toggleSupersetWithAbove(run, 1);

    expect(supersetRunPosition(split, 0)).toBe('none');
    expect(split[1].supersetGroup).toBe(split[2].supersetGroup);
    expect(supersetRunPosition(split, 1)).toBe('start');
    expect(supersetRunPosition(split, 2)).toBe('continue');
  });

  it('reads a group id shared by non-adjacent items as no group', () => {
    // Reachable by reordering a routine, and a bracket that skips a row is a lie
    // about what happens in the gym.
    const scattered = [
      item({ id: 'ri1', exerciseId: 'a', supersetGroup: 'sg' }),
      item({ id: 'ri2', exerciseId: 'b' }),
      item({ id: 'ri3', exerciseId: 'c', supersetGroup: 'sg' }),
    ];

    expect(isSupersettedWithAbove(scattered, 2)).toBe(false);
    // Two members exist, so the run positions are honest about the first one
    // opening a bracket the second does not continue.
    expect(supersetRunPosition(scattered, 1)).toBe('none');
  });
});
