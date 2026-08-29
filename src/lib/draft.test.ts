import { describe, expect, it } from 'vitest';

import {
  buildDraftEntry,
  buildDraftSession,
  defaultTargetCount,
  defaultTargetSets,
  formatTarget,
  sessionVolume,
  workingSetLabels,
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
  function routine(): Routine {
    return {
      ...routineFor(machine.id),
      items: [{ id: 'ri1', exerciseId: machine.id, order: 0, targetSets: 4 }],
    };
  }

  it('follows the setting when the exercise has no rest of its own', () => {
    const session = build(machine, [], routine());
    expect(session.entries[0].restSeconds).toBe(120);
  });

  it("uses the EXERCISE's own rest where it has one", () => {
    const own: Exercise = { ...machine, defaultRestSeconds: 180 };
    const session = build(own, [], routine());
    expect(session.entries[0].restSeconds).toBe(180);
  });

  it('records an explicit no-rest rather than falling back to the setting', () => {
    // A swim rests for nothing on purpose.
    const none: Exercise = { ...machine, defaultRestSeconds: 0 };
    const session = build(none, [], routine());
    expect(session.entries[0].restSeconds).toBe(0);
  });

  it('carries no rest override of its own — the entry reads the exercise', () => {
    /*
     * The session used to copy the routine item's rest onto the entry, which is
     * how a workout could disagree with the library about how long a movement
     * rests. `completeSet` resolves from `entry.exercise` now, so there is nothing
     * on the entry to go stale. See `lib/rest.ts`.
     */
    const session = build(machine, [], routine());
    expect(JSON.stringify(session.entries[0])).not.toContain('restSecondsOverride');
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

/* ------------------------------------------------------------------ */

/**
 * W, 1, 2, 3.
 *
 * A warm-up is a set that does not count, so it must not be numbered as one:
 * "set 2 of 3" has to mean the second of three sets that counted.
 */
describe('workingSetLabels', () => {
  const w = { isWarmup: true };
  const s = { isWarmup: false };

  it('numbers only the working sets', () => {
    expect(workingSetLabels([w, s, s, s])).toEqual([null, 1, 2, 3]);
  });

  it('numbers straight through when nothing is a warm-up', () => {
    expect(workingSetLabels([s, s, s])).toEqual([1, 2, 3]);
  });

  it('handles a warm-up in the middle, which is unusual but legal', () => {
    expect(workingSetLabels([s, w, s])).toEqual([1, null, 2]);
  });

  it('is empty for an empty list', () => {
    expect(workingSetLabels([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

/**
 * A LADDER OVERRIDES THE PREFILL — the one thing that does.
 *
 * Every other row in this app is prefilled from last session, because repeating
 * last session is the common case. A ladder is the opposite claim: the user
 * switched it on so the app would hand them last session PLUS ONE REP, on the set
 * the scheme says earns it. Copying history over that would silently delete the
 * progression.
 */
describe('a ladder in a draft session', () => {
  const pullUps: Exercise = {
    id: 'ex_pullups',
    ownerId: null,
    name: 'Wide pull-ups',
    muscleGroups: ['back'],
    requiresWeight: false,
    countUnit: 'reps',
    loadMode: 'none',
    isUnilateral: false,
    ladder: { max: 16, earned: 2 },
    isArchived: false,
    createdAt: '2026-08-17T00:00:00.000Z',
  };

  const lastSession = [10, 10, 10, 10, 10].map((count, setIndex) =>
    loggedSet({
      id: `sh_${setIndex}`,
      exerciseId: pullUps.id,
      setIndex,
      count,
      weightKg: null,
      loadMode: 'none',
    }),
  );

  it('prefills every set from the ladder, not from last session', () => {
    const session = build(pullUps, lastSession, routineFor(pullUps.id, 5));
    expect(session.entries[0].sets.map((s) => s.count)).toEqual([16, 10, 9, 8, 7]);
  });

  it('carries the ladder onto the entry so the session can reshape itself', () => {
    const session = build(pullUps, lastSession, routineFor(pullUps.id, 5));
    expect(session.entries[0].ladder).toEqual({ max: 16, earned: 2 });
  });

  it('takes its set count from the plan, not from what last session did', () => {
    // Five logged sets last time, four planned now: a five-set ladder and a
    // four-set ladder are different numbers, so the widening other exercises get
    // would silently reshape the scheme.
    const session = build(pullUps, lastSession, routineFor(pullUps.id, 4));
    expect(session.entries[0].sets.map((s) => s.count)).toEqual([16, 10, 9, 7]);
  });

  it('still prefills the WEIGHT from history — the ladder owns reps only', () => {
    const weighted: Exercise = { ...pullUps, requiresWeight: true, loadMode: 'added_bodyweight' };
    const history = lastSession.map((s) => ({
      ...s,
      weightKg: 20,
      loadMode: 'added_bodyweight' as const,
    }));
    const session = build(weighted, history, routineFor(weighted.id, 5));
    expect(session.entries[0].sets.map((s) => s.weightKg)).toEqual([20, 20, 20, 20, 20]);
    expect(session.entries[0].sets.map((s) => s.count)).toEqual([16, 10, 9, 8, 7]);
  });

  it('leaves an exercise with no ladder exactly as it was', () => {
    const session = build(machine, [loggedSet({ count: 8, setIndex: 0 })]);
    expect(session.entries[0].ladder).toBeUndefined();
    expect(session.entries[0].sets[0].count).toBe(8);
  });

  it('refuses to run on a hold, however the row was edited', () => {
    const plank: Exercise = { ...pullUps, countUnit: 'seconds', defaultCount: 120 };
    const session = build(plank, [], routineFor(plank.id, 3));
    expect(session.entries[0].ladder).toBeUndefined();
    expect(session.entries[0].sets.map((s) => s.count)).toEqual([120, 120, 120]);
  });

  it('plans five sets by default, because five is the scheme', () => {
    expect(defaultTargetSets({ countUnit: 'reps', ladder: { max: 16, earned: 0 } })).toBe(5);
    // ...and a ladder that cannot run does not change the answer.
    expect(defaultTargetSets({ countUnit: 'seconds', ladder: { max: 16, earned: 0 } })).toBe(3);
  });
});

describe('formatTarget with a ladder', () => {
  const entry = {
    targetSets: 5,
    exercise: { countUnit: 'reps' } as Exercise,
    ladder: { max: 16, earned: 0 },
  };

  it('states every set, because that is what a ladder is', () => {
    expect(formatTarget(entry)).toBe('16 + 10 + 8 + 8 + 6');
  });

  it('follows the rows the session actually has', () => {
    const sets = [{ isWarmup: false }, { isWarmup: false }, { isWarmup: false }];
    expect(formatTarget({ ...entry, sets })).toBe('16 + 10 + 6');
  });

  it('does not let a warm-up take a rung', () => {
    const sets = [{ isWarmup: true }, { isWarmup: false }, { isWarmup: false }];
    expect(formatTarget({ ...entry, sets })).toBe('16 + 10');
  });

  it('falls back to the ordinary target line without a ladder', () => {
    expect(formatTarget({ targetSets: 4, targetRepsMax: 8, exercise: entry.exercise })).toBe(
      '4 × 8 reps',
    );
  });
});
