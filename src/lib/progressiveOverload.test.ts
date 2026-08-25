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
    expect(verdict.sessionsInRun).toBe(5);
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
    expect(verdict.suggestedCount).toBe(5);
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
    expect(verdict.sessionsInRun).toBe(2);
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

  /*
   * This test used to assert `insufficient_data` here and call it correct: the
   * engine returned an empty verdict the moment `requiresWeight` was false, on the
   * grounds that rep- and time-based progression was handled by the routine's
   * target. It was not — that target was not editable at all until 0.12.0, and it
   * is still a number the user has to think of while every weighted lift gets one
   * derived from its own history.
   *
   * Push-ups climbing 14 → 16 across two weeks is the app's own definition of
   * progressing, and it says so now. The count axis has its own describe block
   * below.
   */
  it('reads bodyweight work on the COUNT axis instead of ignoring it', () => {
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

    expect(verdict.status).toBe('progressing');
    expect(verdict.currentCount).toBe(16);
    // Climbing is not a nudge. Silence is still the default state.
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

/* ------------------------------------------------------------------ */

/**
 * The count axis.
 *
 * Most of the shipped library has no weight on it — push-ups, planks, dead
 * hangs, hollow holds, boxing rounds — and none of it ever progressed. The same
 * plateau run, staleness test and regression guard now read the top COUNT per
 * session where there is no weight to read.
 */
describe('evaluateOverload on the count axis', () => {
  /** One timed session: `seconds` sets, held for `held` seconds each. */
  function holds(sessionId: string, date: string, held: number[]): SetHistory[] {
    return held.map((count, i) => ({
      id: `${sessionId}-plank-${i}`,
      sessionId,
      exerciseId: 'ex_plank',
      performedAt: `${date}T18:00:00.000Z`,
      setIndex: i,
      weightKg: null,
      count,
      countUnit: 'seconds' as const,
      loadMode: 'none' as const,
      isWarmup: false,
      isCompleted: true,
    }));
  }

  /** A plank: time-counted, and the phone runs the clock, so it is measured. */
  const plank = {
    id: 'ex_plank',
    requiresWeight: false,
    incrementKg: undefined,
    countUnit: 'seconds' as const,
    timerMode: 'countdown' as const,
  };

  it('fires on a plank stuck at 2:00 for three sessions across three weeks', () => {
    const history = [
      ...holds('s80', '2026-07-21', [120, 120, 91]),
      ...holds('s83', '2026-07-30', [120, 120, 105]),
      ...holds('s87', '2026-08-11', [120, 118, 100]),
    ];

    const verdict = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(verdict.status).toBe('due_count');
    expect(verdict.shouldNudge).toBe(true);
    expect(verdict.currentCount).toBe(120);
    expect(verdict.sessionsInRun).toBe(3);
    expect(verdict.plateauDays).toBe(23);
    // The step is `countStep('seconds')` — the same 15 the row's chips offer.
    expect(verdict.suggestedCount).toBe(135);
    // ...and no weight axis is invented for it.
    expect(verdict.currentWeightKg).toBeNull();
    expect(verdict.suggestedWeightKg).toBeNull();
  });

  it('reads as a clock, never as a number of seconds', () => {
    const history = [
      ...holds('s80', '2026-07-21', [120]),
      ...holds('s83', '2026-07-30', [120]),
      ...holds('s87', '2026-08-11', [120]),
    ];

    const { message } = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(message).toBe('3× at 2:00 — try 2:15');
    // "try 135 seconds" is the storage unit leaking into copy somebody reads
    // between sets.
    expect(message).not.toContain('135');
    expect(message).not.toContain('120');
  });

  it('stays quiet on a plank that is climbing', () => {
    const history = [
      ...holds('s80', '2026-07-21', [90]),
      ...holds('s83', '2026-07-30', [105]),
      ...holds('s87', '2026-08-11', [120]),
    ];

    const verdict = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(verdict.status).toBe('progressing');
    expect(verdict.shouldNudge).toBe(false);
  });

  it('stays quiet while working back up from a longer hold', () => {
    // 2:30 in July, 2:00 since. They are rebuilding, and "try 2:15" is both noise
    // and wrong — the same guard the weight axis has.
    const history = [
      ...holds('s79', '2026-07-14', [150]),
      ...holds('s80', '2026-07-21', [120]),
      ...holds('s83', '2026-07-30', [120]),
      ...holds('s87', '2026-08-11', [120]),
    ];

    const verdict = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(verdict.status).toBe('regressing');
    expect(verdict.shouldNudge).toBe(false);
  });

  it('watches rather than nudges while the run is still short', () => {
    const history = [...holds('s83', '2026-07-30', [120]), ...holds('s87', '2026-08-11', [120])];

    const verdict = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(verdict.status).toBe('building');
    expect(verdict.sessionsInRun).toBe(2);
    expect(verdict.shouldNudge).toBe(false);
    expect(verdict.message).toBe('2× at 2:00');
  });

  it('says nothing about time the phone did not measure', () => {
    // A 50-minute swim is typed from memory in a changing room. "3 sessions at
    // 50:00 — try 50:15" is the app pretending to read a stopwatch that was never
    // running.
    const swim = { ...plank, id: 'ex_plank', timerMode: 'manual' as const };
    const history = [
      ...holds('s80', '2026-07-21', [3000]),
      ...holds('s83', '2026-07-30', [3000]),
      ...holds('s87', '2026-08-11', [3000]),
    ];

    const verdict = evaluateOverload({ exercise: swim, history, now: NOW });

    expect(verdict.status).toBe('insufficient_data');
    expect(verdict.shouldNudge).toBe(false);
  });

  it('progresses reps by one and metres by twenty-five', () => {
    const at = (exerciseId: string, countUnit: 'reps' | 'meters', count: number) =>
      ['s80', 's83', 's87'].map((sessionId, i) => ({
        id: `${sessionId}-${exerciseId}`,
        sessionId,
        exerciseId,
        performedAt: ['2026-07-21', '2026-07-30', '2026-08-11'][i] + 'T18:00:00.000Z',
        setIndex: 0,
        weightKg: null,
        count,
        countUnit,
        loadMode: 'none' as const,
        isWarmup: false,
        isCompleted: true,
      }));

    const pushups = evaluateOverload({
      exercise: { id: 'ex_pu', requiresWeight: false, countUnit: 'reps' },
      history: at('ex_pu', 'reps', 20),
      now: NOW,
    });
    expect(pushups.suggestedCount).toBe(21);
    expect(pushups.message).toBe('3× at 20 — try 21');

    const swim = evaluateOverload({
      exercise: { id: 'ex_sw', requiresWeight: false, countUnit: 'meters' },
      history: at('ex_sw', 'meters', 1500),
      now: NOW,
    });
    // A distance IS measured — by the pool, not by the phone.
    expect(swim.suggestedCount).toBe(1525);
    expect(swim.message).toBe('3× at 1500 m — try 1525 m');
  });

  it('ignores warm-ups and incomplete sets, exactly as the weight axis does', () => {
    const history = [
      ...holds('s80', '2026-07-21', [120]),
      ...holds('s83', '2026-07-30', [120]),
      ...holds('s87', '2026-08-11', [120]),
      // A 3:00 "warm-up" hold would otherwise read as the session's top count and
      // break the run.
      ...holds('s87', '2026-08-11', [180]).map((row) => ({ ...row, isWarmup: true })),
    ];

    const verdict = evaluateOverload({ exercise: plank, history, now: NOW });

    expect(verdict.currentCount).toBe(120);
    expect(verdict.status).toBe('due_count');
  });
});

/* ------------------------------------------------------------------ */

/**
 * The wrong-verdict case, now that a warm-up can actually be marked.
 *
 * `summarizeSessions` has always dropped `isWarmup` rows, and until 0.12.0
 * nothing in the UI could set the flag — so a heavy warm-up single WAS the
 * session's top working weight as far as this engine could tell, and the nudge
 * fired off a set the user never worked at. The filter was correct and
 * unreachable; the toggle is what makes it matter.
 */
describe('a heavy warm-up single does not become the top working weight', () => {
  const history = [
    ...sets('ex_situps', 's80', '2026-07-21', 25, [12, 12, 12]),
    ...sets('ex_situps', 's81', '2026-07-23', 25, [12, 12, 12]),
    ...sets('ex_situps', 's82', '2026-07-28', 25, [12, 12, 12]),
    ...sets('ex_situps', 's84', '2026-08-04', 25, [12, 12, 12]),
    ...sets('ex_situps', 's86', '2026-08-08', 25, [12, 12, 12]),
  ];

  it('reads the working weight, not the warm-up above it', () => {
    // One 35 kg single to feel the weight, logged as a warm-up. Unfiltered it
    // would read as a 35 kg top set, break the plateau run at one session, and
    // report `progressing` on an exercise that has not moved in three weeks.
    const withWarmup = [
      ...history,
      ...sets('ex_situps', 's86', '2026-08-08', 35, [1], { isWarmup: true }),
    ];

    const verdict = evaluateOverload({ exercise: weightedExercise, history: withWarmup, now: NOW });

    expect(verdict.currentWeightKg).toBe(25);
    expect(verdict.status).toBe('due_weight');
    expect(verdict.sessionsInRun).toBe(5);
    expect(verdict.suggestedWeightKg).toBe(27.5);
  });

  it('and the same row unmarked DOES change the verdict — which is the bug', () => {
    const asWorking = [...history, ...sets('ex_situps', 's86', '2026-08-08', 35, [1])];

    const verdict = evaluateOverload({ exercise: weightedExercise, history: asWorking, now: NOW });

    expect(verdict.currentWeightKg).toBe(35);
    expect(verdict.status).not.toBe('due_weight');
  });
});

/* ------------------------------------------------------------------ */

/**
 * A LADDER SILENCES THIS ENGINE.
 *
 * Both of them read the same history and both answer "what should the next session
 * be", and on a laddered exercise they answer it differently: the nudge says "3
 * sessions at 16 — try 17" while the ladder has already decided that this
 * session's rep goes on the fourth set. Two suggestions on one card, one of them
 * wrong, for a prescription the user switched on so they would not have to think
 * about it.
 */
describe('a running ladder stands this engine down', () => {
  /** Bodyweight pull-ups, stuck on 16 for three sessions across three weeks. */
  const history = [
    ...sets('ex_pullups', 's80', '2026-07-21', null, [16, 10, 8, 8, 6]),
    ...sets('ex_pullups', 's83', '2026-07-30', null, [16, 10, 8, 8, 6]),
    ...sets('ex_pullups', 's87', '2026-08-11', null, [16, 10, 8, 8, 6]),
  ];
  const pullUps = {
    id: 'ex_pullups',
    requiresWeight: false,
    incrementKg: undefined,
    countUnit: 'reps' as const,
  };

  it('nudges without one — the plateau is real', () => {
    const verdict = evaluateOverload({ exercise: pullUps, history, now: NOW });
    expect(verdict.status).toBe('due_count');
    expect(verdict.shouldNudge).toBe(true);
  });

  it('says nothing at all with one', () => {
    const verdict = evaluateOverload({
      exercise: { ...pullUps, ladder: { max: 16, earned: 1 } },
      history,
      now: NOW,
    });
    expect(verdict.status).toBe('insufficient_data');
    expect(verdict.shouldNudge).toBe(false);
    expect(verdict.suggestedCount).toBeNull();
  });

  it("stands down on the weight axis too — one rep at a time is the ladder's job", () => {
    const weighted = { ...weightedExercise, ladder: { max: 16, earned: 0 } };
    const heavy = [
      ...sets('ex_situps', 's80', '2026-07-21', 25, [8, 8, 8]),
      ...sets('ex_situps', 's83', '2026-07-30', 25, [8, 8, 8]),
      ...sets('ex_situps', 's87', '2026-08-11', 25, [8, 8, 8]),
    ];
    expect(evaluateOverload({ exercise: weighted, history: heavy, now: NOW }).shouldNudge).toBe(
      false,
    );
    // ...and the same history without a ladder still fires, so the silence above
    // is the ladder and not the fixture.
    expect(
      evaluateOverload({ exercise: weightedExercise, history: heavy, now: NOW }).shouldNudge,
    ).toBe(true);
  });

  it('ignores a ladder on a unit that cannot run one', () => {
    const verdict = evaluateOverload({
      exercise: { ...pullUps, countUnit: 'meters' as const, ladder: { max: 16, earned: 0 } },
      history: history.map((s) => ({ ...s, countUnit: 'meters' as const })),
      now: NOW,
    });
    // A ladder of metres is not a scheme, so the engine keeps its own opinion.
    expect(verdict.status).not.toBe('insufficient_data');
  });
});
