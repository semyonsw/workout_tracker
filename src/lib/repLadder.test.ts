import { describe, expect, it } from 'vitest';

import {
  AUTO_LADDER_SEED_REPS,
  LADDER_MAX_LIMITS,
  LADDER_SETS,
  autoLadderFor,
  describeLadder,
  describeLadderOutcomes,
  ladderAdvance,
  ladderAfterTopSet,
  ladderBumpOrder,
  ladderForMax,
  ladderMet,
  ladderOf,
  ladderOutcomes,
  ladderSpread,
  ladderTargets,
  ladderTotal,
  isAutoLadder,
  normalizeLadder,
  performedLadderCounts,
  reshapeLadderSets,
  sessionsToNextMax,
  supportsLadder,
} from './repLadder';
import type { CountUnit, RepLadder } from '../types/models';

/**
 * THE REFERENCE TABLE — every row the user trained off, transcribed from the
 * program they brought to this app.
 *
 * This is the spec, and `ladderForMax` is only correct if it reproduces all of it
 * from arithmetic. Two years of training and a real log say these numbers work;
 * a formula that gets 25 of 26 rows right is a different program that looks like
 * this one.
 *
 * Level 1 is `1 + 1 + 1` in the original — three sets, not five — so it is tested
 * at three sets, which is what it is.
 */
const REFERENCE: Record<number, number[]> = {
  2: [2, 1, 1, 1, 1],
  3: [3, 2, 2, 1, 1],
  4: [4, 3, 2, 2, 1],
  5: [5, 4, 3, 2, 1],
  6: [6, 4, 3, 3, 2],
  7: [7, 5, 4, 3, 2],
  8: [8, 5, 4, 4, 3],
  9: [9, 6, 5, 4, 3],
  10: [10, 7, 5, 5, 3],
  11: [11, 7, 6, 5, 4],
  12: [12, 8, 6, 6, 4],
  13: [13, 8, 7, 6, 5],
  14: [14, 9, 7, 7, 5],
  15: [15, 9, 8, 7, 6],
  16: [16, 10, 8, 8, 6],
  17: [17, 10, 9, 8, 7],
  20: [20, 12, 10, 10, 8],
  21: [21, 12, 11, 10, 9],
  22: [22, 13, 11, 11, 9],
  23: [23, 13, 12, 11, 10],
  24: [24, 14, 12, 12, 10],
  25: [25, 14, 13, 12, 11],
  26: [26, 15, 13, 13, 11],
  27: [27, 15, 14, 13, 12],
  28: [28, 16, 14, 14, 12],
  29: [29, 16, 15, 14, 13],
};

function ladder(max: number, earned = 0): RepLadder {
  return { max, earned };
}

/* ------------------------------------------------------------------ */

describe('ladderForMax — the reference table', () => {
  for (const [max, expected] of Object.entries(REFERENCE)) {
    it(`max ${max} is ${expected.join(' + ')}`, () => {
      expect(ladderForMax(Number(max), 5)).toEqual(expected);
    });
  }

  it('reproduces level 1, which is three sets of one', () => {
    expect(ladderForMax(1, 3)).toEqual([1, 1, 1]);
  });

  /**
   * The invariant that IS the scheme. Every row of the table above sums to three
   * times its max, and so does every max the table does not list.
   */
  it('totals exactly three times the max, at every max, at five sets', () => {
    for (let max = 2; max <= 60; max += 1) {
      expect(ladderTotal(ladderForMax(max, 5))).toBe(3 * max);
    }
  });

  it('never plans a zero, a negative or a set above the max', () => {
    for (let max = 1; max <= 60; max += 1) {
      for (const sets of [1, 2, 3, 4, 5, 6, 8, 12, 20]) {
        const plan = ladderForMax(max, sets);
        expect(plan).toHaveLength(sets);
        expect(plan[0]).toBe(max);
        for (const reps of plan) {
          expect(reps).toBeGreaterThanOrEqual(1);
          expect(reps).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('descends, always — a backoff never asks for more than the set before it', () => {
    for (let max = 1; max <= 60; max += 1) {
      for (const sets of [2, 3, 4, 5, 6, 8, 12]) {
        const plan = ladderForMax(max, sets);
        for (let i = 1; i < plan.length; i += 1) expect(plan[i]).toBeLessThanOrEqual(plan[i - 1]);
      }
    }
  });

  it('keeps the backoffs on half the max at any set count', () => {
    // Four sets is two and a half times the max, six sets three and a half: the
    // total moves with the set count because the average per backoff does not.
    expect(ladderForMax(16, 4)).toEqual([16, 10, 8, 6]);
    expect(ladderForMax(16, 6)).toEqual([16, 10, 8, 8, 8, 6]);
    expect(ladderTotal(ladderForMax(16, 4))).toBe(40);
    expect(ladderTotal(ladderForMax(16, 6))).toBe(56);
  });

  it('is just the max at one set', () => {
    expect(ladderForMax(16, 1)).toEqual([16]);
  });

  it('clamps an absurd or broken max instead of planning it', () => {
    expect(ladderForMax(0, 5)[0]).toBe(LADDER_MAX_LIMITS.min);
    expect(ladderForMax(-4, 5)[0]).toBe(LADDER_MAX_LIMITS.min);
    expect(ladderForMax(Number.NaN, 5)[0]).toBe(LADDER_MAX_LIMITS.min);
    expect(ladderForMax(500, 5)[0]).toBe(LADDER_MAX_LIMITS.max);
  });

  it('spreads by two once there are reps to spread, and narrows below that', () => {
    expect(ladderSpread(16)).toBe(2);
    expect(ladderSpread(9)).toBe(2);
    expect(ladderSpread(7)).toBe(2); // 7 + 5 + 4 + 3 + 2 — the odd exception
    expect(ladderSpread(8)).toBe(1);
    expect(ladderSpread(4)).toBe(1);
    expect(ladderSpread(2)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('ladderBumpOrder', () => {
  /**
   * Bottom-up, and it lands the plan exactly on the next level rather than near
   * it. That exactness is the only thing that makes "new max 17" true.
   */
  it('is the sets that differ from the next level, last set first', () => {
    // 16 + 10 + 8 + 8 + 6  →  17 + 10 + 9 + 8 + 7
    expect(ladderBumpOrder(16, 5)).toEqual([4, 2]);
    // 17 + 10 + 9 + 8 + 7  →  18 + 11 + 9 + 9 + 7
    expect(ladderBumpOrder(17, 5)).toEqual([3, 1]);
  });

  it('never includes the top set — that rep is the promotion', () => {
    for (let max = 1; max <= 40; max += 1) {
      expect(ladderBumpOrder(max, 5)).not.toContain(0);
    }
  });

  it('walks the whole level: base + every bump + the PR = the next level', () => {
    for (let max = 1; max <= 40; max += 1) {
      for (const sets of [1, 3, 4, 5, 6]) {
        const order = ladderBumpOrder(max, sets);
        const walked = ladderForMax(max, sets);
        for (const index of order) walked[index] += 1;
        const promoted = ladderTargets({ max, earned: order.length + 1 }, sets);
        expect(promoted).toEqual(ladderForMax(max + 1, sets));
        // ...and the step before the promotion is the next level bar its top set.
        expect(walked.slice(1)).toEqual(ladderForMax(max + 1, sets).slice(1));
      }
    }
  });

  it('promotes on the very next session when there are no backoffs to earn', () => {
    expect(ladderBumpOrder(16, 1)).toEqual([]);
    expect(ladderAdvance(ladder(16), 1)).toEqual({ max: 17, earned: 0 });
  });
});

/* ------------------------------------------------------------------ */

describe('ladderTargets', () => {
  it('adds the earned reps from the bottom up', () => {
    expect(ladderTargets(ladder(16, 0), 5)).toEqual([16, 10, 8, 8, 6]);
    expect(ladderTargets(ladder(16, 1), 5)).toEqual([16, 10, 8, 8, 7]);
    expect(ladderTargets(ladder(16, 2), 5)).toEqual([16, 10, 9, 8, 7]);
  });

  it('grows the session total by exactly one rep per earned rep', () => {
    for (let earned = 0; earned <= 8; earned += 1) {
      expect(ladderTotal(ladderTargets(ladder(16, earned), 5))).toBe(48 + earned);
    }
  });

  it('rolls over rather than overflowing when earned outgrows the level', () => {
    // The third met session is the PR, so `earned: 3` IS the ladder for 17.
    expect(ladderTargets(ladder(16, 3), 5)).toEqual(ladderForMax(17, 5));
    expect(ladderTargets(ladder(16, 6), 5)).toEqual(ladderForMax(18, 5));
  });

  it('survives a garbage earned count from an older blob', () => {
    expect(ladderTargets({ max: 16, earned: Number.NaN }, 5)).toEqual([16, 10, 8, 8, 6]);
    expect(ladderTargets({ max: 16, earned: -3 }, 5)).toEqual([16, 10, 8, 8, 6]);
    // The cap exists so a nonsense value cannot turn this into a long loop.
    expect(ladderTargets({ max: 16, earned: 1e9 }, 5)[0]).toBeLessThanOrEqual(
      LADDER_MAX_LIMITS.max,
    );
  });
});

/* ------------------------------------------------------------------ */

/**
 * THE USER'S OWN LOG, replayed.
 *
 * Their first four sessions on this scheme were 10 + 7 + 5 + 5 + 3, then two
 * sessions of one extra rep, then 11 + 7 + 6 + 5 + 4 — which is the level-11 row
 * of the reference table. Three met sessions, one new max. If this test fails the
 * app has stopped running the program the user actually did.
 */
describe('the progression, replayed against a real log', () => {
  it('walks 10 → 11 in three met sessions, landing on the table row', () => {
    let state = ladder(10);
    expect(ladderTargets(state, 5)).toEqual([10, 7, 5, 5, 3]); // their day 1

    state = ladderAdvance(state, 5);
    expect(ladderTargets(state, 5)).toEqual([10, 7, 5, 5, 4]);

    state = ladderAdvance(state, 5);
    expect(ladderTargets(state, 5)).toEqual([10, 7, 6, 5, 4]);

    state = ladderAdvance(state, 5);
    expect(state).toEqual({ max: 11, earned: 0 });
    expect(ladderTargets(state, 5)).toEqual([11, 7, 6, 5, 4]); // their day 4
    expect(ladderTargets(state, 5)).toEqual(REFERENCE[11]);
  });

  it('reaches 17 + 10 + 9 + 8 + 7 — the day-29 session — from 16', () => {
    let state = ladder(16);
    for (let session = 0; session < 3; session += 1) state = ladderAdvance(state, 5);
    expect(state).toEqual({ max: 17, earned: 0 });
    expect(ladderTargets(state, 5)).toEqual([17, 10, 9, 8, 7]);
  });

  it('says how many met sessions are left before the max moves', () => {
    expect(sessionsToNextMax(ladder(16, 0), 5)).toBe(3);
    expect(sessionsToNextMax(ladder(16, 1), 5)).toBe(2);
    // 1 is also the whole of "the next one is a personal record".
    expect(sessionsToNextMax(ladder(16, 2), 5)).toBe(1);
    expect(ladderAdvance(ladder(16, 2), 5).max).toBe(17);
  });
});

/* ------------------------------------------------------------------ */

describe('ladderMet', () => {
  const targets = [16, 10, 8, 8, 6];

  it('accepts the prescription exactly', () => {
    expect(ladderMet(targets, [16, 10, 8, 8, 6])).toBe(true);
  });

  it('accepts more than the prescription, on any set', () => {
    expect(ladderMet(targets, [18, 10, 9, 8, 6])).toBe(true);
  });

  it('refuses one rep short anywhere — the total does not buy it back', () => {
    expect(ladderMet(targets, [16, 10, 8, 8, 5])).toBe(false);
    // 60 reps against a target of 48, and still not this session.
    expect(ladderMet(targets, [20, 20, 20, 0, 0])).toBe(false);
  });

  it('refuses a session that stopped early', () => {
    expect(ladderMet(targets, [16, 10, 8, 8])).toBe(false);
  });

  it('ignores extra sets past the plan', () => {
    expect(ladderMet(targets, [16, 10, 8, 8, 6, 4])).toBe(true);
  });

  it('counts completed working sets only', () => {
    expect(
      performedLadderCounts([
        { count: 5, isWarmup: true, isCompleted: true },
        { count: 16, isWarmup: false, isCompleted: true },
        { count: 10, isWarmup: false, isCompleted: false },
      ]),
    ).toEqual([16]);
  });
});

/* ------------------------------------------------------------------ */

describe('ladderAfterTopSet — the session reshaping itself', () => {
  it('rebuilds the day off a top set that beat the plan', () => {
    // Planned 16, got 18: the backoffs were built for a lighter day.
    expect(ladderAfterTopSet(ladder(16), 18, 5)).toEqual([18, 11, 9, 9, 7]);
  });

  it('rebuilds it off a top set that missed', () => {
    expect(ladderAfterTopSet(ladder(16), 14, 5)).toEqual([14, 9, 7, 7, 5]);
  });

  it('leaves the earned reps alone when the top set matched the max', () => {
    expect(ladderAfterTopSet(ladder(16, 2), 16, 5)).toEqual([16, 10, 9, 8, 7]);
  });

  it('treats one more than the max as the next level exactly', () => {
    expect(ladderAfterTopSet(ladder(16, 2), 17, 5)).toEqual(ladderForMax(17, 5));
  });

  it('ignores a zero or a broken top set rather than planning off it', () => {
    expect(ladderAfterTopSet(ladder(16), 0, 5)).toEqual([16, 10, 8, 8, 6]);
    expect(ladderAfterTopSet(ladder(16), Number.NaN, 5)).toEqual([16, 10, 8, 8, 6]);
  });
});

describe('reshapeLadderSets', () => {
  const row = (
    count: number,
    over: Partial<{ isWarmup: boolean; isCompleted: boolean; isPrefilled: boolean }> = {},
  ) => ({
    count,
    isWarmup: false,
    isCompleted: false,
    isPrefilled: true,
    ...over,
  });

  it('rewrites the prefilled rows below the top set', () => {
    const sets = [row(18, { isCompleted: true }), row(10), row(8), row(8), row(6)];
    expect(reshapeLadderSets(sets, [18, 11, 9, 9, 7])).toEqual([null, 11, 9, 9, 7]);
  });

  it('never touches a logged set', () => {
    const sets = [row(18, { isCompleted: true }), row(10, { isCompleted: true }), row(8)];
    expect(reshapeLadderSets(sets, [18, 11, 9])).toEqual([null, null, 9]);
  });

  it('never touches a row the user edited', () => {
    const sets = [row(18, { isCompleted: true }), row(12, { isPrefilled: false }), row(8)];
    expect(reshapeLadderSets(sets, [18, 11, 9])).toEqual([null, null, 9]);
  });

  it('leaves a value that is already right alone', () => {
    const sets = [row(16, { isCompleted: true }), row(10), row(8)];
    expect(reshapeLadderSets(sets, [16, 10, 9])).toEqual([null, null, 9]);
  });

  it('does not let a warm-up consume a rung', () => {
    const sets = [
      row(5, { isWarmup: true, isCompleted: true }),
      row(16, { isCompleted: true }),
      row(10),
      row(8),
    ];
    expect(reshapeLadderSets(sets, [16, 11, 9])).toEqual([null, null, 11, 9]);
  });

  it('leaves rows past the end of the ladder as they are', () => {
    const sets = [row(16, { isCompleted: true }), row(10), row(8)];
    expect(reshapeLadderSets(sets, [16, 11])).toEqual([null, 11, null]);
  });
});

/* ------------------------------------------------------------------ */

describe('ladderOf', () => {
  const subject = (countUnit: CountUnit, value: unknown) =>
    ({ countUnit, ladder: value }) as Parameters<typeof ladderOf>[0];

  it('reads a valid ladder off a rep-counted exercise', () => {
    expect(ladderOf(subject('reps', { max: 16, earned: 2 }))).toEqual({ max: 16, earned: 2 });
  });

  it('refuses every unit but reps — a ladder is a rep prescription', () => {
    expect(supportsLadder('reps')).toBe(true);
    for (const unit of ['seconds', 'meters', 'rounds'] as CountUnit[]) {
      expect(supportsLadder(unit)).toBe(false);
      expect(ladderOf(subject(unit, { max: 16, earned: 0 }))).toBeNull();
    }
  });

  it('is null when there is no ladder at all', () => {
    expect(ladderOf(subject('reps', undefined))).toBeNull();
    expect(ladderOf(undefined)).toBeNull();
    expect(ladderOf(null)).toBeNull();
  });

  it('repairs what a hand-edited backup can carry', () => {
    expect(normalizeLadder({ max: 16 })).toEqual({ max: 16, earned: 0 });
    expect(normalizeLadder({ max: 16, earned: 'two' })).toEqual({ max: 16, earned: 0 });
    expect(normalizeLadder({ max: 16.4, earned: 1.6 })).toEqual({ max: 16, earned: 2 });
    expect(normalizeLadder({ max: -2, earned: 0 })).toEqual({ max: 1, earned: 0 });
    expect(normalizeLadder({ max: 5000, earned: 0 })).toEqual({ max: 100, earned: 0 });
    expect(normalizeLadder({ max: Number.NaN })).toBeNull();
    expect(normalizeLadder({})).toBeNull();
    expect(normalizeLadder('16')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('ladderOutcomes', () => {
  const entry = (
    counts: number[],
    ladderState: RepLadder | undefined,
    over: { name?: string; countUnit?: CountUnit; completed?: number } = {},
  ) => ({
    exercise: {
      id: 'ex_pullups',
      name: over.name ?? 'Wide pull-ups',
      countUnit: over.countUnit ?? ('reps' as CountUnit),
      ...(ladderState ? { ladder: ladderState } : {}),
    },
    sets: counts.map((count, i) => ({
      count,
      isWarmup: false,
      isCompleted: i < (over.completed ?? counts.length),
    })),
  });

  it('advances a ladder whose target was met', () => {
    const [outcome] = ladderOutcomes([entry([16, 10, 8, 8, 6], ladder(16))]);
    expect(outcome.before).toEqual({ max: 16, earned: 0 });
    expect(outcome.after).toEqual({ max: 16, earned: 1 });
    expect(outcome.nextTargets).toEqual([16, 10, 8, 8, 7]);
    expect(outcome.isPersonalRecord).toBe(false);
  });

  it('marks the session that moves the max', () => {
    const [outcome] = ladderOutcomes([entry([16, 10, 9, 8, 7], ladder(16, 2))]);
    expect(outcome.after).toEqual({ max: 17, earned: 0 });
    expect(outcome.isPersonalRecord).toBe(true);
    expect(outcome.nextTargets).toEqual([17, 10, 9, 8, 7]);
  });

  it('takes the top set as the new max when the whole ladder for it was met', () => {
    // Planned 16, did the full 18-ladder. That is a tested max, and handing them 16
    // again next week would be the app not watching.
    const [outcome] = ladderOutcomes([entry([18, 11, 9, 9, 7], ladder(16))]);
    expect(outcome.after).toEqual({ max: 18, earned: 1 });
    expect(outcome.isPersonalRecord).toBe(true);
    expect(outcome.nextTargets).toEqual([18, 11, 9, 9, 8]);
  });

  it('earns one ordinary rep when a big top set was not backed up', () => {
    // 18 on the first set and the 16-ladder's backoffs under it: the 18 was not a
    // max, it was a good set, and the app already re-shaped the day around it.
    const [outcome] = ladderOutcomes([entry([18, 10, 8, 8, 6], ladder(16))]);
    expect(outcome.after).toEqual({ max: 16, earned: 1 });
    expect(outcome.isPersonalRecord).toBe(false);
  });

  it('drops the reps earned against the old max when a new one is proved', () => {
    const [outcome] = ladderOutcomes([entry([18, 11, 9, 9, 7], ladder(16, 2))]);
    expect(outcome.after).toEqual({ max: 18, earned: 1 });
  });

  it('never lets a lighter day count, however completely it was finished', () => {
    // The rows re-shape down to the 14-ladder mid-session and this session finished
    // every one of them — but the plan was 16, and earning progress towards a PR on
    // a day that missed the max is how a scheme stops being trusted.
    expect(ladderOutcomes([entry([14, 9, 7, 7, 5], ladder(16))])).toEqual([]);
  });

  it('produces nothing for a session that missed', () => {
    expect(ladderOutcomes([entry([16, 10, 8, 8, 5], ladder(16))])).toEqual([]);
  });

  it('produces nothing for a session that left sets unlogged', () => {
    expect(ladderOutcomes([entry([16, 10, 8, 8, 6], ladder(16), { completed: 4 })])).toEqual([]);
  });

  it('ignores exercises with no ladder', () => {
    expect(ladderOutcomes([entry([16, 10, 8, 8, 6], undefined)])).toEqual([]);
  });

  it('judges against the set count the session actually ran', () => {
    // Four working sets, so the target is the four-set ladder, not the five-set one.
    const [outcome] = ladderOutcomes([entry([16, 10, 8, 6], ladder(16))]);
    expect(outcome.targets).toEqual([16, 10, 8, 6]);
  });
});

describe('the words', () => {
  it('writes a ladder the way the user writes it', () => {
    expect(describeLadder(ladderTargets(ladder(16), LADDER_SETS))).toBe('16 + 10 + 8 + 8 + 6');
  });

  it('states what moved, and nothing about how it felt', () => {
    const outcomes = ladderOutcomes([
      {
        exercise: { id: 'a', name: 'Wide pull-ups', countUnit: 'reps', ladder: ladder(16, 2) },
        sets: [16, 10, 9, 8, 7].map((count) => ({ count, isWarmup: false, isCompleted: true })),
      },
    ]);
    expect(describeLadderOutcomes(outcomes)).toBe(
      'Wide pull-ups · new max 17 · 17 + 10 + 9 + 8 + 7 next time',
    );
    expect(describeLadderOutcomes([])).toBeNull();
  });
});

/*
 * `Make every exercise a rep ladder` is a bulk edit, and a bulk edit that cannot be
 * undone is a trap. `auto` is the whole of the undo: it marks a ladder the setting
 * put there and nothing has happened to since, and these are the four ways that
 * mark is allowed to come off.
 */
describe('auto ladders', () => {
  it('keeps the auto mark through a round-trip, and only when it is true', () => {
    expect(normalizeLadder({ max: 16, earned: 0, auto: true })).toEqual({
      max: 16,
      earned: 0,
      auto: true,
    });
    // Absent, not `false`: a hand-made ladder round-trips as exactly `{max, earned}`.
    expect(normalizeLadder({ max: 16, earned: 0 })).toEqual({ max: 16, earned: 0 });
    expect(normalizeLadder({ max: 16, earned: 0, auto: 'yes' })).toEqual({ max: 16, earned: 0 });
  });

  it('seeds the max from the exercise\u2019s own target reps', () => {
    expect(autoLadderFor({ countUnit: 'reps', defaultCount: 20 })).toEqual({
      max: 20,
      earned: 0,
      auto: true,
    });
  });

  it('falls back to the seed when the exercise has never said what it targets', () => {
    expect(autoLadderFor({ countUnit: 'reps' })).toEqual({
      max: AUTO_LADDER_SEED_REPS,
      earned: 0,
      auto: true,
    });
  });

  it('hands back the ladder an exercise already runs, rather than a fresh seed', () => {
    // The point of rule 1 in `setLadderOnAllExercises`: a tested max and the reps
    // earned against it are what the feature is FOR, not something to overwrite.
    expect(
      autoLadderFor({ countUnit: 'reps', defaultCount: 8, ladder: { max: 16, earned: 2 } }),
    ).toEqual({ max: 16, earned: 2 });
  });

  it('refuses every unit that is not reps', () => {
    for (const countUnit of ['seconds', 'rounds', 'meters'] as const) {
      expect(autoLadderFor({ countUnit, defaultCount: 60 })).toBeNull();
    }
  });

  it('stops being the setting\u2019s to remove once a rep has been earned', () => {
    expect(isAutoLadder({ max: 12, earned: 0, auto: true })).toBe(true);
    expect(isAutoLadder({ max: 12, earned: 1, auto: true })).toBe(false);
    expect(isAutoLadder({ max: 12, earned: 0 })).toBe(false);
    expect(isAutoLadder(null)).toBe(false);
  });

  it('drops the mark the moment the ladder advances', () => {
    // `ladderAdvance` rebuilds the object, so one met session turns an auto ladder
    // into a fact the setting will not take away.
    expect(ladderAdvance({ max: 12, earned: 0, auto: true }).auto).toBeUndefined();
  });
});
