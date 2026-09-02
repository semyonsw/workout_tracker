import { describe, expect, it } from 'vitest';

import {
  BODYWEIGHT_LIMITS,
  bodyweightAt,
  bodyweightSeries,
  clampBodyweightKg,
  latestBodyweightKg,
  MAX_BODYWEIGHT_ENTRIES,
  recordBodyweight,
  sanitizeBodyweightLog,
  type BodyweightEntry,
} from './bodyweightLog';

/**
 * Bodyweight as a series.
 *
 * The bug this replaces: one scalar was the multiplier on every pull-up, dip and
 * assisted set ever logged, so `recomputeWorkout` repriced a session from June at
 * September's weight, and a lifter who gained 4 kg while holding `+20 × 8` looked
 * like a plateau to the overload engine.
 *
 * The rule that carries all of it is `bodyweightAt`: the most recent reading AT OR
 * BEFORE the date, because a weight taken after a session says nothing about it.
 */

const log: BodyweightEntry[] = [
  { at: '2026-08-30T07:00:00.000Z', kg: 82.5 },
  { at: '2026-07-11T07:00:00.000Z', kg: 80 },
  { at: '2026-05-02T07:00:00.000Z', kg: 78.5 },
];

describe('what the lifter weighed on a day', () => {
  it('reads the most recent entry at or before it', () => {
    expect(bodyweightAt(log, '2026-08-31T18:00:00.000Z')).toBe(82.5);
    expect(bodyweightAt(log, '2026-08-01T18:00:00.000Z')).toBe(80);
    expect(bodyweightAt(log, '2026-06-01T18:00:00.000Z')).toBe(78.5);
  });

  it('reads the entry exactly on the day, not the one before it', () => {
    expect(bodyweightAt(log, '2026-07-11T07:00:00.000Z')).toBe(80);
  });

  it('uses the oldest reading for a session that predates every weigh-in', () => {
    /*
     * Not null: every set logged before the user first typed their weight would
     * otherwise become unreadable and drop out of volume entirely, which is a worse
     * answer than "you were roughly this heavy back then".
     */
    expect(bodyweightAt(log, '2020-01-01T00:00:00.000Z')).toBe(78.5);
  });

  it('is null only for a log with nothing in it', () => {
    // The case every caller already handles — see `effectiveLoadKg`.
    expect(bodyweightAt([], '2026-08-01T00:00:00.000Z')).toBeNull();
    expect(latestBodyweightKg([])).toBeNull();
  });

  it('falls back to the latest reading for an unusable date', () => {
    expect(bodyweightAt(log, 'not a date')).toBe(82.5);
    expect(bodyweightAt(log, undefined)).toBe(82.5);
  });
});

describe('recording a reading', () => {
  it('puts the newest first', () => {
    const next = recordBodyweight(log, 83, new Date('2026-09-02T07:00:00.000Z'));
    expect(next[0]).toEqual({ at: '2026-09-02T07:00:00.000Z', kg: 83 });
    expect(next).toHaveLength(4);
  });

  it('replaces the same day rather than appending a second reading', () => {
    /*
     * Nobody wants a log of their morning and evening weight. Built with the LOCAL
     * date constructor on purpose: "one a day" means one per calendar day where the
     * user is standing, so two UTC instants either side of local midnight are two
     * days and must stay two entries.
     */
    const morning = recordBodyweight([], 82, new Date(2026, 8, 2, 7, 0));
    const evening = recordBodyweight(morning, 83.4, new Date(2026, 8, 2, 21, 0));
    expect(evening).toHaveLength(1);
    expect(evening[0].kg).toBe(83.4);

    const nextDay = recordBodyweight(evening, 83, new Date(2026, 8, 3, 7, 0));
    expect(nextDay).toHaveLength(2);
  });

  it('leaves the log alone for a value that is not a weight', () => {
    // A text field mid-edit must not be able to empty the series.
    for (const bad of [undefined, NaN, 0, -5]) {
      expect(recordBodyweight(log, bad as number)).toHaveLength(3);
    }
  });

  it('clamps to something a human could weigh', () => {
    expect(clampBodyweightKg(1)).toBe(BODYWEIGHT_LIMITS.min);
    expect(clampBodyweightKg(5000)).toBe(BODYWEIGHT_LIMITS.max);
    // An out-of-range READING is dropped rather than clamped: an invented weight on
    // a real date is worse than one fewer point.
    expect(recordBodyweight([], 5000)).toEqual([]);
  });

  it('keeps one decimal place', () => {
    expect(recordBodyweight([], 82.34567)[0].kg).toBe(82.3);
  });
});

describe('sanitizing what comes off disk', () => {
  it('drops rows it cannot read rather than repairing them', () => {
    // An invented date would put a weight on a day the user never stepped on a scale.
    const dirty = [
      { at: '2026-08-30T07:00:00.000Z', kg: 82.5 },
      { at: 'nonsense', kg: 80 },
      { at: '2026-07-11T07:00:00.000Z', kg: NaN },
      { at: '2026-06-11T07:00:00.000Z', kg: 900 },
      null,
      'eighty kilos',
      { kg: 80 },
    ];
    expect(sanitizeBodyweightLog(dirty)).toEqual([{ at: '2026-08-30T07:00:00.000Z', kg: 82.5 }]);
  });

  it('is total — anything at all comes back as a usable log', () => {
    for (const bad of [undefined, null, 'log', 42, {}]) {
      expect(sanitizeBodyweightLog(bad)).toEqual([]);
    }
  });

  it('caps a scripted or corrupt blob', () => {
    const absurd = Array.from({ length: MAX_BODYWEIGHT_ENTRIES + 200 }, (_, i) => ({
      at: new Date(2000, 0, 1 + i).toISOString(),
      kg: 80,
    }));
    expect(sanitizeBodyweightLog(absurd)).toHaveLength(MAX_BODYWEIGHT_ENTRIES);
  });

  it('sorts newest first however the rows arrived', () => {
    const shuffled = [log[2], log[0], log[1]];
    expect(sanitizeBodyweightLog(shuffled).map((e) => e.kg)).toEqual([82.5, 80, 78.5]);
  });
});

describe('the chart series', () => {
  it('is oldest first, like every other trend', () => {
    expect(bodyweightSeries(log).map((p) => p.value)).toEqual([78.5, 80, 82.5]);
  });

  it('is empty for an empty log, so the screen can drop the chart', () => {
    expect(bodyweightSeries([])).toEqual([]);
  });
});
