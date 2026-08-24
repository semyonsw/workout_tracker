import { describe, expect, it } from 'vitest';

import {
  buildDraftEntry,
  buildDraftSession,
  defaultTargetCount,
  defaultTargetSets,
  sessionVolume,
  type DraftSession,
} from './draft';
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

/* ------------------------------------------------------------------ */

/**
 * One exercise, appended to a session that is already running — "pull day, plus
 * some neck at the end". The rows have to be built by the same function the routine
 * path uses, or an exercise added mid-workout would prefill differently from the
 * same exercise planned in advance.
 */
describe('an exercise added mid-workout', () => {
  const entryFor = (history: SetHistory[] = [], plannedSetCount = 1) =>
    buildDraftEntry({
      exercise: machine,
      history,
      policy: DEFAULT_OVERLOAD_POLICY,
      unitSystem: 'metric',
      restSeconds: 120,
      transitionRestSeconds: 150,
      targetSets: 1,
      targetRepsMax: defaultTargetCount(machine),
      plannedSetCount,
      now: new Date('2026-08-17T17:00:00.000Z'),
    });

  it('starts at exactly one set, whatever last session did', () => {
    // Four sets last time; the user is deciding set by set today, and `Add set` is
    // one tap. Planning four rows for an exercise nobody planned is a guess.
    const entry = entryFor([loggedSet(), loggedSet({ id: 'sh2', setIndex: 1 })]);

    expect(entry.sets).toHaveLength(1);
  });

  it('still prefills that set from history — the one-tap promise holds', () => {
    const entry = entryFor([loggedSet()]);

    expect(entry.sets[0].weightKg).toBe(45);
    expect(entry.sets[0].count).toBe(8);
    expect(entry.lastSessionSummary).toBeTruthy();
  });

  it("falls back to the exercise's own starting numbers with no history", () => {
    const entry = entryFor();

    expect(entry.sets[0].weightKg).toBe(30);
    expect(entry.sets[0].count).toBe(12);
  });

  it('carries a real overload verdict rather than an empty one', () => {
    const entry = entryFor([loggedSet()]);

    expect(entry.overload).toBeDefined();
    expect(entry.overloadAccepted).toBe(false);
  });

  it('never builds an entry with no rows at all', () => {
    // A zero would render a header with nothing under it and no way back to a row.
    expect(entryFor([], 0).sets).toHaveLength(1);
  });
});

describe('defaultTargetCount', () => {
  it("uses the exercise's own target where it has one", () => {
    expect(defaultTargetCount(machine)).toBe(12);
  });

  it('falls back per unit, because a target in seconds is not a rep count', () => {
    // One shared constant would plan a ten-second plank and a ten-second round.
    expect(defaultTargetCount({ countUnit: 'reps', defaultCount: undefined })).toBe(10);
    expect(defaultTargetCount({ countUnit: 'seconds', defaultCount: undefined })).toBe(60);
    expect(defaultTargetCount({ countUnit: 'rounds', defaultCount: undefined })).toBe(180);
    expect(defaultTargetCount({ countUnit: 'meters', defaultCount: undefined })).toBe(500);
  });

  it('treats a NaN that survived a JSON round-trip as not set', () => {
    expect(defaultTargetCount({ countUnit: 'reps', defaultCount: Number.NaN })).toBe(10);
    expect(defaultTargetCount({ countUnit: 'reps', defaultCount: 0 })).toBe(10);
  });
});

/* ------------------------------------------------------------------ */

/**
 * Session volume, and what it does when it cannot weigh a set.
 *
 * The old function skipped every exercise with `requiresWeight === false` — so
 * push-ups, planks, boxing and swimming all contributed zero — and for the two
 * modes it did count it counted the belt instead of the load. These tests pin the
 * four load modes and, more importantly, what happens with no bodyweight on file.
 */
describe('sessionVolume', () => {
  /** One exercise, one completed set, in whatever shape the case needs. */
  function oneSet(
    overrides: Partial<Exercise>,
    weightKg: number | null,
    count: number,
    isWarmup = false,
  ): DraftSession {
    const exercise: Exercise = { ...machine, ...overrides };
    const session = build(exercise);
    const [entry] = session.entries;
    return {
      ...session,
      entries: [
        {
          ...entry,
          sets: [
            {
              localId: 'set_1',
              weightKg,
              count,
              isWarmup,
              isCompleted: true,
              completedAt: '2026-08-17T18:00:00.000Z',
              isPrefilled: false,
            },
          ],
        },
      ],
    };
  }

  it('multiplies an external load by its reps', () => {
    expect(sessionVolume(oneSet({ loadMode: 'external' }, 80, 8), 82)).toEqual({
      kg: 640,
      unweighable: 0,
    });
  });

  it('counts a weighted dip as body plus belt', () => {
    expect(sessionVolume(oneSet({ loadMode: 'added_bodyweight' }, 40, 5), 82).kg).toBe(610);
  });

  it('counts an assisted pull-up as body MINUS the help', () => {
    // 62 × 8 = 496. The old maths gave (20 × 8) = 160 and called more help progress.
    expect(sessionVolume(oneSet({ loadMode: 'assisted' }, 20, 8), 82).kg).toBe(496);
  });

  it('counts push-ups, which used to be worth nothing at all', () => {
    const pushups = oneSet({ loadMode: 'none', requiresWeight: false }, null, 20);
    expect(sessionVolume(pushups, 82).kg).toBe(1640);
  });

  it('falls back to external-only and says so when no bodyweight is set', () => {
    // This is the upgrade path for every existing user: the number is exactly what
    // the old function produced, and `unweighable` is the app admitting it.
    const dips = oneSet({ loadMode: 'added_bodyweight' }, 40, 5);
    expect(sessionVolume(dips)).toEqual({ kg: 0, unweighable: 1 });

    const bar = oneSet({ loadMode: 'external' }, 80, 8);
    expect(sessionVolume(bar)).toEqual({ kg: 640, unweighable: 0 });
  });

  it('never multiplies kilograms by seconds, metres or rounds', () => {
    for (const countUnit of ['seconds', 'meters', 'rounds'] as const) {
      const timed = oneSet({ countUnit, loadMode: 'none', requiresWeight: false }, null, 120);
      // Not "unweighable" either — a 2:00 plank has no weight volume to be missing.
      expect(sessionVolume(timed, 82)).toEqual({ kg: 0, unweighable: 0 });
    }
  });

  it('leaves warm-ups out, like every other analysis in the app', () => {
    expect(sessionVolume(oneSet({ loadMode: 'external' }, 80, 8, true), 82)).toEqual({
      kg: 0,
      unweighable: 0,
    });
  });

  it('ignores planned sets that were never completed', () => {
    const session = build({ ...machine, loadMode: 'external' });
    // Straight from `buildDraftSession`: rows exist, none are ✓.
    expect(sessionVolume(session, 82)).toEqual({ kg: 0, unweighable: 0 });
  });
});

/* ------------------------------------------------------------------ */

/**
 * Rest, back to two levels.
 *
 * `buildDraftSession` deliberately ignored `item.restSeconds` for a release,
 * because the cascade it replaced went one level further — through
 * `exercise.defaultRestSeconds`, which nearly every shipped exercise carries and
 * nobody could see or change — so the only two rest controls in the app were
 * shadowed almost everywhere. The routine editor can set, show and clear an item
 * override now, which is the condition that was missing.
 */
describe('the rest an entry is built with', () => {
  function routineWithRest(restSeconds?: number): Routine {
    return {
      ...routineFor(machine.id),
      items: [
        {
          id: 'ri1',
          exerciseId: machine.id,
          order: 0,
          targetSets: 4,
          ...(restSeconds != null ? { restSeconds } : {}),
        },
      ],
    };
  }

  it('follows Settings when the item has no override', () => {
    const session = build(machine, [], routineWithRest());
    expect(session.entries[0].restSeconds).toBe(120);
    // And says so: no override recorded, which is what `completeSet` checks.
    expect(session.entries[0].restSecondsOverride).toBeUndefined();
  });

  it("uses the ITEM's rest where the routine set one", () => {
    const session = build(machine, [], routineWithRest(180));
    expect(session.entries[0].restSeconds).toBe(180);
    expect(session.entries[0].restSecondsOverride).toBe(180);
  });

  it('records an explicit no-rest as an override, not as missing', () => {
    // A swim rests for nothing on purpose.
    const session = build(machine, [], routineWithRest(0));
    expect(session.entries[0].restSeconds).toBe(0);
    expect(session.entries[0].restSecondsOverride).toBe(0);
  });

  it('never reads the exercise’s own default rest', () => {
    // The level that was removed, and the reason the setting looked broken.
    const withOwnRest: Exercise = { ...machine, defaultRestSeconds: 240 };
    const session = build(withOwnRest, [], routineWithRest());
    expect(session.entries[0].restSeconds).toBe(120);
    expect(session.entries[0].restSecondsOverride).toBeUndefined();
  });
});

describe('defaultTargetSets', () => {
  it('is four sets of reps, twelve rounds, three holds and one distance', () => {
    // Per unit, because "four" means different things: four sets of reps, twelve
    // rounds on a bag, three holds of a plank, one swim.
    expect(defaultTargetSets({ countUnit: 'reps' })).toBe(4);
    expect(defaultTargetSets({ countUnit: 'rounds' })).toBe(12);
    expect(defaultTargetSets({ countUnit: 'seconds' })).toBe(3);
    expect(defaultTargetSets({ countUnit: 'meters' })).toBe(1);
  });
});
