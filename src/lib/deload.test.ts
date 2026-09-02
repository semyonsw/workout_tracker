import { describe, expect, it } from 'vitest';

import { DEFAULT_DELOAD_POLICY, evaluateDeload } from './deload';
import type { Exercise, SetHistory } from '../types/models';

/**
 * The back-off suggestion.
 *
 * The rule it exists for: after three sessions of being told to add a rep and not
 * managing it, a fourth nudge saying the same thing is the app not listening. The
 * rules it must not break are that a ladder is never touched (`lib/repLadder.ts` is
 * explicit that repeating a missed target is the honest response) and that a weight
 * these plates cannot load is never printed.
 */

const squat: Exercise = {
  id: 'ex_squat',
  ownerId: null,
  name: 'Back squat',
  muscleGroups: ['quads'],
  requiresWeight: true,
  countUnit: 'reps',
  loadMode: 'external',
  isUnilateral: false,
  barWeightKg: 20,
  incrementKg: 2.5,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const FULL = [25, 20, 15, 10, 5, 2.5, 1.25];

/** One session of one top set, `daysAgo` before a fixed today. */
let seq = 0;
function session(weightKg: number | null, reps: number, daysAgo: number): SetHistory {
  const at = new Date(Date.UTC(2026, 8, 2) - daysAgo * 86_400_000).toISOString();
  seq += 1;
  return {
    id: `s${seq}`,
    sessionId: `sess${seq}`,
    exerciseId: squat.id,
    performedAt: at,
    setIndex: 0,
    weightKg,
    count: reps,
    countUnit: 'reps',
    loadMode: 'external',
    isWarmup: false,
    isCompleted: true,
  };
}

describe('a stall', () => {
  it('is three sessions at one weight with no improvement', () => {
    const history = [session(80, 5, 0), session(80, 5, 7), session(80, 5, 14)];
    const verdict = evaluateDeload({ exercise: squat, history, availablePlatesKg: FULL });

    expect(verdict.shouldSuggest).toBe(true);
    expect(verdict.stalledSessions).toBe(3);
    expect(verdict.stuckWeightKg).toBe(80);
    // 85% of 80 is 68, and 67.5 is the heaviest thing these plates can make below it.
    expect(verdict.suggestedWeightKg).toBe(67.5);
    expect(verdict.message).toContain('67.5');
  });

  it('is not two sessions', () => {
    // Two is a bad night's sleep and a busy gym.
    const history = [session(80, 5, 0), session(80, 5, 7)];
    expect(
      evaluateDeload({ exercise: squat, history, availablePlatesKg: FULL }).shouldSuggest,
    ).toBe(false);
  });

  it('is not a run that is still improving', () => {
    // Newest first: 7 reps now against 5 three weeks ago is progress at this
    // weight, and the overload engine's `progressing` verdict is the right one.
    const history = [session(80, 7, 0), session(80, 6, 7), session(80, 5, 14)];
    expect(
      evaluateDeload({ exercise: squat, history, availablePlatesKg: FULL }).shouldSuggest,
    ).toBe(false);
  });

  it('counts only the leading block at one weight', () => {
    // The weight moved last session, so the run at 80 is one session long.
    const history = [session(80, 5, 0), session(75, 8, 7), session(75, 8, 14), session(75, 8, 21)];
    expect(
      evaluateDeload({ exercise: squat, history, availablePlatesKg: FULL }).shouldSuggest,
    ).toBe(false);
  });

  it('needs history at all', () => {
    expect(evaluateDeload({ exercise: squat, history: [] }).shouldSuggest).toBe(false);
  });
});

describe('what it refuses to touch', () => {
  it('never suggests a deload for a ladder', () => {
    /*
     * `lib/repLadder.ts`: "It does not deload on a miss… a program that cuts your
     * numbers because you slept badly is a program you stop trusting." The ladder
     * owns its own response to a missed session.
     */
    const laddered = { ...squat, ladder: { max: 16, earned: 0 } };
    const history = [session(80, 5, 0), session(80, 5, 7), session(80, 5, 14)];
    expect(
      evaluateDeload({ exercise: laddered, history, availablePlatesKg: FULL }).shouldSuggest,
    ).toBe(false);
  });

  it('says nothing about unweighted or time-counted work', () => {
    // "Do 85% of a plank" is a shorter plank, which is a worse set and not a deload.
    const pushups = { ...squat, requiresWeight: false };
    const plank = { ...squat, countUnit: 'seconds' as const };
    const history = [session(null, 20, 0), session(null, 20, 7), session(null, 20, 14)];
    expect(evaluateDeload({ exercise: pushups, history }).shouldSuggest).toBe(false);
    expect(evaluateDeload({ exercise: plank, history }).shouldSuggest).toBe(false);
  });

  it('never suggests a weight these plates cannot load', () => {
    const coarse = [20, 10, 5];
    const history = [session(70, 5, 0), session(70, 5, 7), session(70, 5, 14)];
    const verdict = evaluateDeload({ exercise: squat, history, availablePlatesKg: coarse });
    // 85% of 70 is 59.5; the grid here is 20, 30, 40, 50, 60 — so 50.
    expect(verdict.suggestedWeightKg).toBe(50);
  });

  it('says nothing when the back-off would land on the weight itself', () => {
    // A bare 20 kg bar has nothing below it to back off to.
    const history = [session(20, 5, 0), session(20, 5, 7), session(20, 5, 14)];
    expect(
      evaluateDeload({ exercise: squat, history, availablePlatesKg: FULL }).shouldSuggest,
    ).toBe(false);
  });

  it('rounds onto the equipment’s step when there is no bar', () => {
    const machine = { ...squat, barWeightKg: undefined, incrementKg: 5 };
    const history = [session(100, 5, 0), session(100, 5, 7), session(100, 5, 14)];
    // 85 lands on the 5 kg grid exactly.
    expect(evaluateDeload({ exercise: machine, history }).suggestedWeightKg).toBe(85);
  });
});

describe('the policy is a policy', () => {
  it('honours a different run length and a different depth', () => {
    const history = [session(80, 5, 0), session(80, 5, 7)];
    const verdict = evaluateDeload({
      exercise: squat,
      history,
      availablePlatesKg: FULL,
      policy: { minStallSessions: 2, deloadFraction: 0.5 },
    });
    expect(verdict.shouldSuggest).toBe(true);
    expect(verdict.suggestedWeightKg).toBe(40);
  });

  it('refuses a run length below two, however it arrived', () => {
    const history = [session(80, 5, 0)];
    expect(
      evaluateDeload({
        exercise: squat,
        history,
        availablePlatesKg: FULL,
        policy: { ...DEFAULT_DELOAD_POLICY, minStallSessions: 0 },
      }).shouldSuggest,
    ).toBe(false);
  });
});
