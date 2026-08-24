import { describe, expect, it } from 'vitest';

import {
  ITEM_REST_LIMITS,
  TARGET_COUNT_LIMITS,
  TARGET_SETS_LIMITS,
  applyPlannedSetDiff,
  bumpItemRest,
  bumpTargetCount,
  bumpTargetMin,
  bumpTargetSets,
  clearItemRest,
  describePlannedSetDiff,
  performedSetCounts,
  plannedSetDiff,
  resolveItemRest,
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

/**
 * The rest cascade — the bug this release walks back one level.
 *
 * It used to be three levels deep through `exercise.defaultRestSeconds`, which
 * nearly every shipped exercise carries and nobody could see or change, so the
 * two Settings values were shadowed almost everywhere. It is two levels now, and
 * the item level is only in it because the editor can set it, show it and clear
 * it.
 */
describe('resolveItemRest', () => {
  it('follows the setting when the item has no override', () => {
    expect(resolveItemRest(item(), 120)).toEqual({ seconds: 120, source: 'settings' });
  });

  it('uses the item where it has one', () => {
    expect(resolveItemRest(item({ restSeconds: 180 }), 120)).toEqual({
      seconds: 180,
      source: 'item',
    });
  });

  it('treats an explicit zero as an override, not as missing', () => {
    // A swim rests for nothing on purpose, and `0 ?? x` is 0 — but `undefined ?? x`
    // is x, and the difference is the whole cascade.
    expect(resolveItemRest(item({ restSeconds: 0 }), 120)).toEqual({
      seconds: 0,
      source: 'item',
    });
  });

  it('ignores a nonsense override rather than resting for NaN seconds', () => {
    expect(resolveItemRest(item({ restSeconds: NaN }), 120).source).toBe('settings');
    expect(resolveItemRest(item({ restSeconds: -5 }), 120).source).toBe('settings');
  });
});

describe('bumpItemRest and clearItemRest', () => {
  it('creates the override from the value currently in force', () => {
    // The first tap moves the number the row is showing rather than jumping.
    const next = bumpItemRest(item(), ITEM_REST_LIMITS.step, 120);
    expect(next.restSeconds).toBe(135);
  });

  it('nudges an existing override from itself, not from the setting', () => {
    const own = item({ restSeconds: 180 });
    expect(bumpItemRest(own, -ITEM_REST_LIMITS.step, 120).restSeconds).toBe(165);
  });

  it('can be nudged all the way to no rest', () => {
    expect(bumpItemRest(item({ restSeconds: 10 }), -15, 120).restSeconds).toBe(0);
  });

  it('clears back to FOLLOWING the setting, not to a copy of it', () => {
    const cleared = clearItemRest(item({ restSeconds: 180 }));
    expect('restSeconds' in cleared).toBe(false);
    expect(resolveItemRest(cleared, 90)).toEqual({ seconds: 90, source: 'settings' });
    // ...and it keeps following as the setting moves.
    expect(resolveItemRest(cleared, 150).seconds).toBe(150);
  });
});

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
    item({ id: 'ri1', exerciseId: 'ex_dips', targetSets: 4, targetRepsMax: 8, restSeconds: 90 }),
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
    expect(next[0].restSeconds).toBe(90);
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
