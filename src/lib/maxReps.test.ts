import { describe, expect, it } from 'vitest';

import { countsToMax, showsMaxLabel } from './maxReps';

/**
 * `MAX` is a claim about a set that cannot be planned, so the two things worth
 * testing are the gate (who may make that claim) and the cell (when the word
 * stands in for the number).
 */
describe('a MAX target', () => {
  it('is rep-counted work that asked for one', () => {
    expect(countsToMax({ countUnit: 'reps', countToMax: true })).toBe(true);
    expect(countsToMax({ countUnit: 'reps' })).toBe(false);
  });

  it('is not available to time, distance or rounds — a clock already says it', () => {
    for (const countUnit of ['seconds', 'meters', 'rounds'] as const) {
      expect(countsToMax({ countUnit, countToMax: true })).toBe(false);
    }
  });

  it('loses to a ladder, which prescribes every rep it would refuse to', () => {
    expect(countsToMax({ countUnit: 'reps', countToMax: true, ladder: { max: 12 } })).toBe(false);
    expect(countsToMax({ countUnit: 'reps', countToMax: true, ladderOn: true })).toBe(false);
  });
});

describe('the count cell', () => {
  const max = { countUnit: 'reps', countToMax: true } as const;

  it('says MAX while the counter is still at zero', () => {
    expect(showsMaxLabel(max, { count: 0, isCompleted: false })).toBe(true);
  });

  it('says the number the moment there is one to say', () => {
    expect(showsMaxLabel(max, { count: 1, isCompleted: false })).toBe(false);
  });

  it('never hides a logged set, not even a failed one', () => {
    // A set of zero that has been ticked is a set you failed, and that is a fact
    // about the session — `MAX` over it would be the app declining to record it.
    expect(showsMaxLabel(max, { count: 0, isCompleted: true })).toBe(false);
  });

  it('is not the word for an ordinary exercise, whatever the count', () => {
    expect(showsMaxLabel({ countUnit: 'reps' }, { count: 0, isCompleted: false })).toBe(false);
  });
});
