/**
 * The round chain — the one thing in this app that starts work without being asked.
 *
 * Which makes the NEGATIVE cases the important ones: every `toBeNull` below is a
 * moment where a phone would otherwise have started a three-minute round at
 * somebody who did not ask for one. The positive case is a single line.
 */

import { describe, expect, it } from 'vitest';

import { autoRoundToStart, hasRoundLeft, isRoundExercise } from './rounds';
import type { DraftEntry, DraftSession, DraftSet } from './draft';
import { DEFAULT_OVERLOAD_POLICY, evaluateOverload } from './progressiveOverload';
import { seedExercises } from '../data/seed';
import type { Exercise } from '../types/models';

const boxing = seedExercises.find((e) => e.id === 'ex_boxing_bag') as Exercise;
const plank = seedExercises.find((e) => e.id === 'ex_plank') as Exercise;
const handstand = seedExercises.find((e) => e.id === 'ex_handstand') as Exercise;
const pushups = seedExercises.find((e) => e.id === 'ex_pushups') as Exercise;

const NOW = 1_800_000_000_000;
const IDLE_REST = { endsAt: null, pausedRemainingMs: null };

function set(localId: string, isCompleted = false): DraftSet {
  return {
    localId,
    weightKg: null,
    count: 180,
    isWarmup: false,
    isCompleted,
    completedAt: isCompleted ? '2026-09-01T10:00:00.000Z' : null,
    isPrefilled: false,
  };
}

function entry(exercise: Exercise, sets: DraftSet[]): DraftEntry {
  return {
    localId: `e_${exercise.id}`,
    exercise,
    targetSets: sets.length,
    restSeconds: 60,
    transitionRestSeconds: 150,
    sets,
    // The verdict plays no part in the chain, so it is built by the engine's own
    // "nothing to say" path rather than hand-written into a shape that can drift.
    overload: evaluateOverload({
      exercise,
      history: [],
      policy: DEFAULT_OVERLOAD_POLICY,
      unitSystem: 'metric',
    }),
    overloadAccepted: false,
    lastSessionSummary: null,
    lastSessionShort: null,
  };
}

function session(entries: DraftEntry[]): DraftSession {
  return {
    localId: 's1',
    title: 'Boxing',
    startedAt: '2026-09-01T10:00:00.000Z',
    entries,
  };
}

/** The ordinary case: round 1 logged, the rest has run out, nothing else running. */
function ready() {
  const bag = entry(boxing, [set('r1', true), set('r2'), set('r3')]);
  return {
    session: session([bag]),
    roundsAuto: bag.localId,
    rest: { endsAt: NOW - 1, pausedRemainingMs: null },
    setTimer: null,
    nowMs: NOW,
  };
}

describe('isRoundExercise', () => {
  it('is rounds counted by a countdown — the bag', () => {
    expect(isRoundExercise(boxing)).toBe(true);
  });

  it('is NOT a prescribed hold: a plank is seconds, and it is not a round', () => {
    expect(isRoundExercise(plank)).toBe(false);
  });

  it('is NOT a calisthenics hold — a handstand ends when you say so', () => {
    expect(isRoundExercise(handstand)).toBe(false);
  });

  it('is NOT rep-counted work, whatever a stray timerMode claims', () => {
    expect(isRoundExercise({ ...pushups, timerMode: 'countdown' })).toBe(false);
  });

  it('is NOT rounds logged by hand: without a clock there is no bell to chain', () => {
    expect(isRoundExercise({ ...boxing, timerMode: 'manual' })).toBe(false);
  });
});

describe('autoRoundToStart', () => {
  it('names the next round once the rest it was waiting on has run out', () => {
    expect(autoRoundToStart(ready())).toEqual({ entryId: 'e_ex_boxing_bag', setId: 'r2' });
  });

  it('fires with no rest at all — a skipped rest means the next round now', () => {
    expect(autoRoundToStart({ ...ready(), rest: IDLE_REST })).toEqual({
      entryId: 'e_ex_boxing_bag',
      setId: 'r2',
    });
  });

  it('waits while the rest is still counting', () => {
    expect(
      autoRoundToStart({
        ...ready(),
        rest: { endsAt: NOW + 30_000, pausedRemainingMs: null },
      }),
    ).toBeNull();
  });

  it('waits forever while the rest is PAUSED — a pause is the user saying not yet', () => {
    expect(
      autoRoundToStart({ ...ready(), rest: { endsAt: null, pausedRemainingMs: 30_000 } }),
    ).toBeNull();
  });

  it('never talks over a clock that is already running', () => {
    expect(
      autoRoundToStart({
        ...ready(),
        setTimer: { entryId: 'e_ex_boxing_bag', setId: 'r2' },
      }),
    ).toBeNull();
  });

  it('does nothing while the chain is disarmed — ✕ has to mean ✕', () => {
    expect(autoRoundToStart({ ...ready(), roundsAuto: null })).toBeNull();
  });

  it('does nothing before the first round is logged: ▶ is the user’s press', () => {
    const bag = entry(boxing, [set('r1'), set('r2')]);
    expect(
      autoRoundToStart({
        session: session([bag]),
        roundsAuto: bag.localId,
        rest: IDLE_REST,
        setTimer: null,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('stops after the last round rather than wrapping to another exercise', () => {
    const bag = entry(boxing, [set('r1', true), set('r2', true)]);
    const press = entry(pushups, [set('p1')]);
    expect(
      autoRoundToStart({
        session: session([bag, press]),
        roundsAuto: bag.localId,
        rest: IDLE_REST,
        setTimer: null,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('refuses a chain armed at an exercise that is no longer in the session', () => {
    expect(autoRoundToStart({ ...ready(), roundsAuto: 'e_gone' })).toBeNull();
  });

  it('refuses a chain armed at something that is not round work', () => {
    const hold = entry(plank, [set('h1', true), set('h2')]);
    expect(
      autoRoundToStart({
        session: session([hold]),
        roundsAuto: hold.localId,
        rest: IDLE_REST,
        setTimer: null,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('refuses when there is no session at all', () => {
    expect(autoRoundToStart({ ...ready(), session: null })).toBeNull();
  });
});

describe('hasRoundLeft', () => {
  it('is true while the bag still owes a round', () => {
    expect(hasRoundLeft(entry(boxing, [set('r1', true), set('r2')]))).toBe(true);
  });

  it('is false once every round is logged', () => {
    expect(hasRoundLeft(entry(boxing, [set('r1', true)]))).toBe(false);
  });

  it('is false for anything that is not round work', () => {
    expect(hasRoundLeft(entry(plank, [set('h1')]))).toBe(false);
  });
});

/* A seed check, so the shipped bag keeps the shape the chain is written for. */
describe('the shipped boxing exercise', () => {
  it('runs a countdown and buys a lead-in before the first round', () => {
    expect(boxing.countUnit).toBe('rounds');
    expect(boxing.timerMode).toBe('countdown');
    expect(boxing.prepareSeconds).toBeGreaterThan(0);
  });

  it('and the policy it is judged by is the shipped one', () => {
    expect(DEFAULT_OVERLOAD_POLICY.repTarget).toBeGreaterThan(0);
  });
});
