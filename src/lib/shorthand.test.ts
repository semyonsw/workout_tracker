/**
 * Shorthand + shape tests.
 *
 * These pin the EXACT strings the design specifies. Every expectation here is a
 * literal read off a frame in `Workout Tracker Android.dc.html`, which makes this
 * file the regression net for the design itself: a refactor that changes
 * "+40 kg · 4 4" into "+40 / +30 · 4 4 6 6" is a visual regression that no
 * typechecker would catch.
 *
 * Run: npx vitest run src/lib/shorthand.test.ts
 */

import { describe, expect, it } from 'vitest';

import { formatTarget, summarizeLastSession } from './draft';
import { describeSetInputs, describeShape, wellsFor } from './exerciseShape';
import { sessionRows, summarizeSessionSets, topWeightSeries } from './history';
import { formatCount, formatDuration, formatShortDate } from './units';
import { seedExercisesById } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { SetHistory } from '../types/models';

/** One session's sets for an exercise, in set order. */
function sets(
  exerciseId: string,
  weightKg: number | null,
  counts: number[],
  startIndex = 0,
): SetHistory[] {
  const exercise = seedExercisesById[exerciseId];
  return counts.map((count, i) => ({
    id: `t_${exerciseId}_${weightKg}_${startIndex + i}`,
    sessionId: 's_test',
    exerciseId,
    performedAt: '2026-08-08T18:00:00.000Z',
    setIndex: startIndex + i,
    weightKg,
    count,
    countUnit: exercise.countUnit,
    loadMode: exercise.loadMode,
    isWarmup: false,
    isCompleted: true,
  }));
}

const pullup90 = seedExercisesById.ex_pullup_90;
const pulldown = seedExercisesById.ex_pulldown_wide;
const boxing = seedExercisesById.ex_boxing_bag;
const swim = seedExercisesById.ex_swim;
const pushups = seedExercisesById.ex_pushups;

describe('summarizeLastSession', () => {
  it('leads with the top working weight, not the set the session ended on', () => {
    // Screen 01: "· last: +40 kg · 4 4" for a session that dropped to +30 after.
    const session = [...sets('ex_pullup_90', 40, [4, 4]), ...sets('ex_pullup_90', 30, [6, 6], 2)];
    expect(summarizeLastSession(session, pullup90, 'short')).toBe('+40 kg · 4 4');
    expect(summarizeLastSession(session, pullup90)).toBe('+40 kg · 4 4 · +30 kg · 6 6');
  });

  it('renders a uniform weighted session as one group', () => {
    expect(summarizeLastSession(sets('ex_pulldown_wide', 80, [8, 6, 5, 5]), pulldown)).toBe(
      '80 kg · 8 6 5 5',
    );
  });

  it('renders reps-only work as bare counts', () => {
    expect(summarizeLastSession(sets('ex_pushups', null, [14, 13, 10, 10]), pushups)).toBe(
      '14 13 10 10',
    );
  });

  it('collapses rounds to a count and a length', () => {
    const twelve = sets(
      'ex_boxing_bag',
      null,
      Array.from({ length: 12 }, () => 180),
    );
    expect(summarizeLastSession(twelve, boxing)).toBe('12 rounds · 3 min');
  });

  it('renders a swim as its duration', () => {
    expect(summarizeLastSession(sets('ex_swim', null, [3000]), swim)).toBe('50 min');
  });

  it('is null with no history rather than an empty string', () => {
    expect(summarizeLastSession([], pullup90)).toBeNull();
  });
});

describe('formatTarget', () => {
  it('states a rep range', () => {
    expect(
      formatTarget({ targetSets: 4, targetRepsMin: 4, targetRepsMax: 6, exercise: pullup90 }),
    ).toBe('4 × 4–6 reps');
  });

  it('collapses a single rep target', () => {
    expect(formatTarget({ targetSets: 3, targetRepsMax: 12, exercise: pullup90 })).toBe(
      '3 × 12 reps',
    );
  });

  it('states time-based work as a duration, never as reps', () => {
    expect(formatTarget({ targetSets: 12, targetRepsMax: 180, exercise: boxing })).toBe(
      '12 × 3 min',
    );
    expect(formatTarget({ targetSets: 1, targetRepsMax: 3000, exercise: swim })).toBe('1 × 50 min');
  });
});

describe('exercise shape', () => {
  it('describes which inputs a set will render', () => {
    expect(describeShape(pullup90)).toBe('KG · REPS · ADDED BODYWEIGHT');
    expect(describeShape(pulldown)).toBe('KG · REPS · EXTERNAL');
    expect(describeShape(pushups)).toBe('REPS ONLY');
  });

  it('names the set inputs for the create screen kicker', () => {
    expect(
      describeSetInputs({ requiresWeight: true, countUnit: 'reps', loadMode: 'added_bodyweight' }),
    ).toBe('weight + reps');
    expect(
      describeSetInputs({ requiresWeight: false, countUnit: 'rounds', loadMode: 'none' }),
    ).toBe('rounds only');
  });

  it('removes the weight well when weight is off, rather than disabling it', () => {
    const on = wellsFor({ requiresWeight: true, countUnit: 'reps', loadMode: 'external' });
    expect(on.map((w) => w.label)).toEqual(['default kg', 'target reps']);

    const off = wellsFor({ requiresWeight: false, countUnit: 'rounds', loadMode: 'none' });
    expect(off.map((w) => w.field)).not.toContain('weight');
    expect(off.map((w) => w.label)).toEqual(['rounds', 'round length']);
  });

  /*
   * A ladder owns the rep target of every set, so a second control for it is a
   * second answer — which is exactly how a max of 16 came to sit above a rep
   * target of 12. See `lib/exerciseDraft.ts`.
   */
  it('removes the rep well while a ladder prescribes the reps', () => {
    const weighted = wellsFor({
      requiresWeight: true,
      countUnit: 'reps',
      loadMode: 'external',
      ladderOn: true,
    });
    expect(weighted.map((w) => w.label)).toEqual(['default kg']);

    const bodyweight = wellsFor({
      requiresWeight: false,
      countUnit: 'reps',
      loadMode: 'none',
      ladderOn: true,
    });
    expect(bodyweight).toEqual([]);

    // ...and only for reps. A ladder cannot run on a hold, so nothing changes.
    const hold = wellsFor({
      requiresWeight: false,
      countUnit: 'seconds',
      loadMode: 'none',
      ladderOn: true,
    });
    expect(hold.map((w) => w.label)).toEqual(['duration']);
  });

  it('says so in the kicker, which is the receipt for the missing well', () => {
    expect(
      describeSetInputs({
        requiresWeight: true,
        countUnit: 'reps',
        loadMode: 'external',
        ladderOn: true,
      }),
    ).toBe('weight + ladder');
    expect(
      describeSetInputs({
        requiresWeight: false,
        countUnit: 'reps',
        loadMode: 'none',
        ladderOn: true,
      }),
    ).toBe('ladder reps');
  });
});

describe('sessionRows', () => {
  const rows = sessionRows(fixtureHistoryByExerciseId[pulldown.id], pulldown);

  it('splits drop sets off the lead so they stay out of the chart line', () => {
    const dropDay = rows.find((r) => r.performedAt.startsWith('2026-07-23'));
    expect(dropDay?.lead).toBe('80 kg · 7');
    expect(dropDay?.drops).toBe(' · 75 kg · 7 7 6');
    // The drop is 75, but the session's top weight — the plotted one — is 80.
    expect(dropDay?.topWeightKg).toBe(80);
  });

  it('orders newest first and plots oldest first', () => {
    expect(rows[0].performedAt.startsWith('2026-08-08')).toBe(true);
    expect(topWeightSeries(rows).map((p) => p.value)).toEqual([60, 70, 75, 80, 80, 80]);
  });

  it('drops warm-ups and incomplete sets, exactly as the overload engine does', () => {
    const history: SetHistory[] = [
      ...sets('ex_pulldown_wide', 100, [1]).map((s) => ({ ...s, isWarmup: true })),
      ...sets('ex_pulldown_wide', 95, [1], 1).map((s) => ({ ...s, isCompleted: false })),
      ...sets('ex_pulldown_wide', 80, [8, 6], 2),
    ];
    const [row] = sessionRows(history, pulldown);
    expect(row.topWeightKg).toBe(80);
    expect(row.lead).toBe('80 kg · 8 6');
  });

  it('has nothing to plot for an exercise with no load', () => {
    expect(topWeightSeries(sessionRows(fixtureHistoryByExerciseId[swim.id], swim))).toEqual([]);
  });
});

describe('summarizeSessionSets', () => {
  it('leads with the top weight even when the session ramped up to it', () => {
    const ramp = [...sets('ex_pulldown_wide', 70, [8]), ...sets('ex_pulldown_wide', 80, [5], 1)];
    expect(summarizeSessionSets(ramp, pulldown).lead).toBe('80 kg · 5');
    expect(summarizeSessionSets(ramp, pulldown).drops).toBe(' · 70 kg · 8');
  });
});

describe('formatting primitives', () => {
  it('reads time-based counts as a clock and reps as an integer', () => {
    expect(formatCount(180, 'rounds')).toBe('3:00');
    expect(formatCount(3000, 'seconds')).toBe('50:00');
    expect(formatCount(8, 'reps')).toBe('8');
  });

  it('states durations in the coarsest exact unit', () => {
    expect(formatDuration(180)).toBe('3 min');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(0)).toBe('no rest');
  });

  it('formats dates the way a training log reads them', () => {
    expect(formatShortDate('2026-08-08T18:00:00.000Z')).toBe('8 Aug');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Warm-ups, now that they are reachable.
 *
 * `isWarmup` was on both `DraftSet` and `SetHistory` from the first release with
 * two consumers filtering on it and nothing able to set it. The 0.12.0 toggle in
 * `QuickAdjust` makes these cases real rather than theoretical.
 */
describe('the shorthand ignores warm-ups', () => {
  const exercise = seedExercisesById['ex_pullup_90'];

  it('leaves a light warm-up out instead of rendering it as a drop set', () => {
    // "+15 kg · 8" reads as a drop from +40, which is a session that did not
    // happen: it was the set before the working sets, not after them.
    const rows = [
      { ...sets(exercise.id, 15, [8])[0], isWarmup: true, setIndex: 0 },
      ...sets(exercise.id, 40, [4, 4, 4]).map((r, i) => ({ ...r, setIndex: i + 1 })),
    ];

    const { lead, drops, topWeightKg } = summarizeSessionSets(rows, exercise);
    expect(lead).toBe('+40 kg · 4 4 4');
    expect(drops).toBeNull();
    expect(topWeightKg).toBe(40);
  });

  it('never lets a heavy warm-up single lead the line', () => {
    // The bug this fixes twice over: the same row also drove the overload verdict.
    const rows = [
      { ...sets(exercise.id, 60, [1])[0], isWarmup: true, setIndex: 0 },
      ...sets(exercise.id, 40, [4, 4]).map((r, i) => ({ ...r, setIndex: i + 1 })),
    ];

    const { lead, topWeightKg } = summarizeSessionSets(rows, exercise);
    expect(lead).toBe('+40 kg · 4 4');
    expect(topWeightKg).toBe(40);
  });

  it('says nothing at all about a session of only warm-ups', () => {
    const rows = sets(exercise.id, 15, [8, 8]).map((r) => ({ ...r, isWarmup: true }));
    expect(summarizeSessionSets(rows, exercise)).toEqual({
      lead: '',
      drops: null,
      topWeightKg: null,
    });
  });
});
