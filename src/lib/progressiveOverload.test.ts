/**
 * Overload-engine tests.
 *
 * The fixtures are REAL logged sessions (workouts #80–#87, 21 Jul – 11 Aug 2026)
 * rather than invented numbers, because the interesting failure modes of this
 * engine — ramp-then-drop sets, deloads, unequal session spacing — only show up
 * in real logs. "Today" is pinned to 2026-08-13 so the tests never drift.
 *
 * Run: npx vitest run src/lib/progressiveOverload.test.ts
 */

import { describe, expect, it } from 'vitest';
import type { SetHistory } from '../types/models';
import { DEFAULT_OVERLOAD_POLICY, evaluateOverload } from './progressiveOverload';

const NOW = new Date('2026-08-13T12:00:00.000Z');

/** Compact fixture builder: one call per (session, weight) group of sets. */
function sets(
  exerciseId: string,
  sessionId: string,
  date: string,
  weightKg: number | null,
  reps: number[],
  opts: { isWarmup?: boolean } = {},
): SetHistory[] {
  return reps.map((count, i) => ({
    id: `${sessionId}-${exerciseId}-${weightKg}-${i}`,
    sessionId,
    exerciseId,
    performedAt: `${date}T18:00:00.000Z`,
    setIndex: i,
    weightKg,
    count,
    countUnit: 'reps' as const,
    loadMode: 'added_bodyweight' as const,
    isWarmup: opts.isWarmup ?? false,
    isCompleted: true,
    estimated1RM: null,
  }));
}

const weightedExercise = {
  id: 'ex_situps',
  requiresWeight: true,
  incrementKg: 2.5,
  countUnit: 'reps' as const,
};

describe('evaluateOverload', () => {
  it('fires on a genuine plateau: +25 kg sit-ups, 5 sessions across 23 days', () => {
    // #80 21 Jul, #81 23 Jul, #82 28 Jul, #84 4 Aug, #86 8 Aug — all +25 kg.
    const history = [
      ...sets('ex_situps', 's80', '2026-07-21', 25, [12, 12, 12]),
      ...sets('ex_situps', 's81', '2026-07-23', 25, [12, 12, 12]),
      ...sets('ex_situps', 's82', '2026-07-28', 25, [12, 12, 12]),
      ...sets('ex_situps', 's84', '2026-08-04', 25, [12, 12, 12]),
      ...sets('ex_situps', 's86', '2026-08-08', 25, [12, 12, 12]),
    ];

    const verdict = evaluateOverload({ exercise: weightedExercise, history, now: NOW });

    expect(verdict.status).toBe('due_weight');
    expect(verdict.shouldNudge).toBe(true);
    expect(verdict.currentWeightKg).toBe(25);
    expect(verdict.suggestedWeightKg).toBe(27.5);
    expect(verdict.sessionsAtWeight).toBe(5);
    expect(verdict.plateauDays).toBe(23);
    expect(verdict.since).toBe('2026-07-21T18:00:00.000Z');
  });

  it('stays quiet while working back up from a heavier weight (dips 40 → 35 → 30)', () => {
    // A naive "same weight 2 sessions" check would eventually nudge here.
    // The regression guard must win: the user handled +40 kg three weeks ago.
    const dips = { ...weightedExercise, id: 'ex_dips' };
    const history = [
      ...sets('ex_dips', 's80', '2026-07-21', 40, [4, 3, 4]),
      ...sets('ex_dips', 's82', '2026-07-28', 25, [10]),
      ...sets('ex_dips', 's82', '2026-07-28', 35, [7, 5, 3]),
      ...sets('ex_dips', 's85', '2026-08-06', 30, [8, 6, 5, 4]),
      ...sets('ex_dips', 's87', '2026-08-11', 30, [12, 8, 6, 5]),
    ];

    const verdict = evaluateOverload({ exercise: dips, history, now: NOW });

    expect(verdict.status).toBe('regressing');
    expect(verdict.shouldNudge).toBe(false);
    expect(verdict.currentWeightKg).toBe(30);
  });

  it('takes the TOP weight of a ramped session, not the last or lightest set', () => {
    // "+25kg 10, then +35kg 7 5 3" is a 35 kg session, and the reps that count
    // are the 7 done AT 35 kg — not the 10 done at 25 kg.
    const dips = { ...weightedExercise, id: 'ex_dips' };
    const history = [
      ...sets('ex_dips', 's82', '2026-07-28', 25, [10]),
      ...sets('ex_dips', 's82', '2026-07-28', 35, [7, 5, 3]),
    ];

    const verdict = evaluateOverload({ exercise: dips, history, now: NOW });

    expect(verdict.currentWeightKg).toBe(35);
    expect(verdict.bestRepsAtWeight).toBe(7);
  });

  it('asks for a rep before asking for load when the rep target is not owned', () => {
    // Weighted 90° pull-ups at +40 kg for 4 reps, twice, 21 days apart.
    // The weight is stale, but 4 reps is nowhere near the 8-rep target.
    const pullups = { ...weightedExercise, id: 'ex_pullups' };
    const history = [
      ...sets('ex_pullups', 's81', '2026-07-23', 40, [4]),
      ...sets('ex_pullups', 's86', '2026-08-08', 40, [4, 4]),
    ];

    const verdict = evaluateOverload({
      exercise: pullups,
      history,
      policy: { ...DEFAULT_OVERLOAD_POLICY, minSessions: 2 },
      now: NOW,
    });

    expect(verdict.status).toBe('due_reps');
    expect(verdict.shouldNudge).toBe(true);
    expect(verdict.suggestedReps).toBe(5);
    expect(verdict.suggestedWeightKg).toBeNull();
  });

  it('will not call two sessions a plateau, however far apart they are', () => {
    // 15 kg brachialis curls on 30 Jul and 8 Aug: 14 stale days but only two
    // data points. Two sessions is a coincidence; three is a pattern.
    const curls = { ...weightedExercise, id: 'ex_curls' };
    const history = [
      ...sets('ex_curls', 's83', '2026-07-30', 15, [16, 12, 12]),
      ...sets('ex_curls', 's86', '2026-08-08', 15, [16, 16, 14, 14]),
    ];

    const verdict = evaluateOverload({ exercise: curls, history, now: NOW });

    expect(verdict.status).toBe('building');
    expect(verdict.plateauDays).toBe(14);
    expect(verdict.sessionsAtWeight).toBe(2);
    expect(verdict.shouldNudge).toBe(false);
  });

  it('recognises a fresh increase and gets out of the way', () => {
    const history = [
      ...sets('ex_situps', 's80', '2026-07-21', 25, [12, 12, 12]),
      ...sets('ex_situps', 's86', '2026-08-08', 27.5, [10, 10, 9]),
    ];

    const verdict = evaluateOverload({ exercise: weightedExercise, history, now: NOW });

    expect(verdict.status).toBe('progressing');
    expect(verdict.shouldNudge).toBe(false);
  });

  it('ignores warm-ups and uncompleted sets', () => {
    const history = [
      ...sets('ex_situps', 's80', '2026-07-21', 25, [12], { isWarmup: false }),
      // A 60 kg warm-up would otherwise become the session's "top weight".
      ...sets('ex_situps', 's80', '2026-07-21', 60, [5], { isWarmup: true }),
    ];

    const verdict = evaluateOverload({ exercise: weightedExercise, history, now: NOW });

    expect(verdict.currentWeightKg).toBe(25);
  });

  it('returns insufficient_data for bodyweight / cardio work', () => {
    const pushups = {
      id: 'ex_pushups',
      requiresWeight: false,
      incrementKg: undefined,
      countUnit: 'reps' as const,
    };
    const history = [
      ...sets('ex_pushups', 's82', '2026-07-28', null, [14, 13, 10, 10]),
      ...sets('ex_pushups', 's87', '2026-08-11', null, [16, 15, 13, 12]),
    ];

    const verdict = evaluateOverload({ exercise: pushups, history, now: NOW });

    expect(verdict.status).toBe('insufficient_data');
    expect(verdict.shouldNudge).toBe(false);
  });

  it('uses 5 lb jumps for imperial users instead of an unloadable 5.5 lb', () => {
    const history = [
      ...sets('ex_situps', 's80', '2026-07-21', 25, [12, 12, 12]),
      ...sets('ex_situps', 's82', '2026-07-28', 25, [12, 12, 12]),
      ...sets('ex_situps', 's86', '2026-08-08', 25, [12, 12, 12]),
    ];

    const verdict = evaluateOverload({
      exercise: { ...weightedExercise, incrementKg: undefined },
      history,
      unitSystem: 'imperial',
      now: NOW,
    });

    // 25 kg ≈ 55.1 lb → next loadable rung is 60 lb ≈ 27.22 kg.
    expect(verdict.status).toBe('due_weight');
    expect(verdict.suggestedWeightKg).toBeCloseTo(27.22, 1);
  });
});
