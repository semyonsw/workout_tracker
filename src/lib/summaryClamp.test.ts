import { describe, expect, it } from 'vitest';

import { clampSummary } from './summaryClamp';

/**
 * The history row that rendered with no exercise name on it.
 *
 * Seven held sets of fifteen seconds produced a summary wide enough to take the
 * whole row, and the name beside it collapsed to nothing. These pin the two things
 * that has to be true of the fix: a clamped summary never ends mid-value, and the
 * rows that already fit are handed back BYTE FOR BYTE — a log that reworded itself
 * to make room would be a worse bug than the one being fixed.
 */
describe('clampSummary', () => {
  it('leaves a summary that already fits exactly as it was', () => {
    for (const summary of ['+32 kg · 5 4 4 4', '20 13 10 8', '12 rounds · 3 min', '120 m']) {
      expect(clampSummary(summary)).toEqual({ text: summary, hidden: 0 });
    }
  });

  it('clamps the timed row that started this — seven sets down to five', () => {
    const summary = Array(7).fill('15 sec').join(' · ');
    expect(clampSummary(summary)).toEqual({
      text: '15 sec · 15 sec · 15 sec · 15 sec · 15 sec',
      hidden: 2,
    });
  });

  it('counts rep counts inside one group, so a long set list clamps too', () => {
    expect(clampSummary('20 13 12 10 8 6 5')).toEqual({ text: '20 13 12 10 8', hidden: 2 });
  });

  it('keeps the load label with the reps it belongs to', () => {
    expect(clampSummary('+32 kg · 8 8 8 8 8 8')).toEqual({ text: '+32 kg · 8 8 8 8', hidden: 2 });
  });

  it('puts back the right separator on either side of a clamp', () => {
    // A top set and a drop: the clamp has to survive crossing a group boundary.
    expect(clampSummary('80 kg · 7 · 75 kg · 7 7 6', 4)).toEqual({
      text: '80 kg · 7 · 75 kg · 7',
      hidden: 2,
    });
  });

  it('handles an empty summary — an exercise whose rows were all warm-ups', () => {
    expect(clampSummary('')).toEqual({ text: '', hidden: 0 });
  });
});
