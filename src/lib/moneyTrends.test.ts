import { describe, expect, it } from 'vitest';

import type { Amount } from './money';
import {
  categoryShares,
  earliestDay,
  moneyBalanceSeries,
  moneyRangeStart,
  moneyTrendSeries,
  summarizeMoneyTrend,
} from './moneyTrends';

/**
 * The money, over time.
 *
 * Two rules carry this file and both are easy to get backwards:
 *
 *  1. AN EMPTY BUCKET IS A ZERO. The opposite of `lib/trends.ts`, on purpose — a
 *     Tuesday you spent nothing is a real answer, and dropping it would draw a
 *     flat line through a quiet week.
 *  2. A WHOLE-MONTH AMOUNT HAS NO DAY. It is absent from a daily series and whole
 *     in a monthly one. Rent is not spent on the 3rd.
 */

let seq = 0;
function day(date: string, value: number, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'food',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date },
    note: '',
    createdAt: `${date}T09:00:00.000Z`,
    ...over,
  };
}

function month(
  year: number,
  monthIndex: number,
  value: number,
  over: Partial<Amount> = {},
): Amount {
  seq += 1;
  return {
    id: `m${seq}`,
    categoryId: 'rent',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'month', year, month: monthIndex },
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('where a range starts', () => {
  it('counts back from today, today included', () => {
    expect(moneyRangeStart([], 'week', '2026-09-13')).toBe('2026-09-07');
    expect(moneyRangeStart([], 'month', '2026-09-13')).toBe('2026-08-15');
  });

  it('`all time` starts at the first amount ever recorded', () => {
    const amounts = [day('2026-08-30', 100), day('2026-09-12', 200)];
    expect(earliestDay(amounts)).toBe('2026-08-30');
    expect(moneyRangeStart(amounts, 'all', '2026-09-13')).toBe('2026-08-30');
  });

  it('...and an empty log starts today, so nothing is drawn rather than a year of zeroes', () => {
    expect(moneyRangeStart([], 'all', '2026-09-13')).toBe('2026-09-13');
  });
});

describe('one direction, bucketed', () => {
  it('gives every day in the range a point, quiet days included', () => {
    const points = moneyTrendSeries([day('2026-09-12', 400)], 'expense', 'week', '2026-09-13');
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.value)).toEqual([0, 0, 0, 0, 0, 400, 0]);
    expect(points[5].key).toBe('2026-09-12');
    expect(points[5].label).toBe('12 September');
  });

  it('adds up several amounts on the same day', () => {
    const points = moneyTrendSeries(
      [day('2026-09-13', 400), day('2026-09-13', 600)],
      'expense',
      'week',
      '2026-09-13',
    );
    expect(points[points.length - 1].value).toBe(1000);
  });

  it('reads ONE direction, and an income is not a small expense', () => {
    const amounts = [day('2026-09-13', 400), day('2026-09-13', 9000, { direction: 'income' })];
    expect(moneyTrendSeries(amounts, 'expense', 'week', '2026-09-13').at(-1)?.value).toBe(400);
    expect(moneyTrendSeries(amounts, 'income', 'week', '2026-09-13').at(-1)?.value).toBe(9000);
  });

  it('leaves a WHOLE-MONTH amount out of a daily series — it has no day to sit on', () => {
    const points = moneyTrendSeries([month(2026, 8, 60000)], 'expense', 'week', '2026-09-13');
    expect(points.every((p) => p.value === 0)).toBe(true);
  });

  it('...and puts it whole into a monthly one', () => {
    const points = moneyTrendSeries([month(2026, 8, 60000)], 'expense', 'year', '2026-09-13');
    const september = points.find((p) => p.key === '2026-09');
    expect(september?.value).toBe(60000);
    expect(september?.label).toBe('September 2026');
  });

  it('buckets a year by month, so the line is a shape rather than a smear', () => {
    const points = moneyTrendSeries(
      [day('2026-08-30', 100), day('2026-09-01', 200), day('2026-09-13', 300)],
      'expense',
      'year',
      '2026-09-13',
    );
    // 365 days back from 13 September lands on 14 September a year earlier, so
    // the range touches thirteen calendar months — the first of them a part-month.
    expect(points).toHaveLength(13);
    expect(points[0].key).toBe('2025-09');
    expect(points.at(-1)).toMatchObject({ key: '2026-09', value: 500 });
    expect(points.at(-2)).toMatchObject({ key: '2026-08', value: 100 });
  });
});

describe('the running balance', () => {
  it('accumulates incomes less expenses across the range', () => {
    const points = moneyBalanceSeries(
      [day('2026-09-12', 400), day('2026-09-13', 1000, { direction: 'income' })],
      'week',
      '2026-09-13',
    );
    expect(points.map((p) => p.value)).toEqual([0, 0, 0, 0, 0, -400, 600]);
  });

  /*
   * The one that would otherwise lie: a week of history opening at zero claims
   * you owned nothing on Monday, which is a statement about your money rather
   * than about the range you picked.
   */
  it('OPENS at what you already had, rather than at zero', () => {
    const points = moneyBalanceSeries(
      [day('2026-01-04', 50000, { direction: 'income' }), day('2026-09-13', 400)],
      'week',
      '2026-09-13',
    );
    expect(points[0].value).toBe(50000);
    expect(points.at(-1)?.value).toBe(49600);
  });

  it('counts a whole-month amount a daily series cannot place into the opening figure', () => {
    const points = moneyBalanceSeries([month(2026, 8, 60000)], 'week', '2026-09-13');
    expect(points.every((p) => p.value === -60000)).toBe(true);
  });
});

describe('summarizing a range', () => {
  it('states the total, the per-bucket average, the peak and the quiet buckets', () => {
    const summary = summarizeMoneyTrend(
      moneyTrendSeries(
        [day('2026-09-12', 400), day('2026-09-13', 300)],
        'expense',
        'week',
        '2026-09-13',
      ),
    );
    expect(summary.total).toBe(700);
    expect(summary.buckets).toBe(7);
    expect(summary.average).toBe(100);
    expect(summary.quiet).toBe(5);
    expect(summary.peak?.key).toBe('2026-09-12');
  });

  it('has no peak at all when nothing was recorded — a peak of zero is not a finding', () => {
    expect(
      summarizeMoneyTrend(moneyTrendSeries([], 'expense', 'week', '2026-09-13')).peak,
    ).toBeNull();
  });
});

describe('which category is the reason', () => {
  it('sorts by size and states each share of the range', () => {
    const amounts = [
      day('2026-09-12', 300, { categoryId: 'food' }),
      day('2026-09-13', 700, { categoryId: 'transport' }),
    ];
    expect(categoryShares(amounts, 'expense', 'week', '2026-09-13')).toEqual([
      { categoryId: 'transport', value: 700, percent: 70 },
      { categoryId: 'food', value: 300, percent: 30 },
    ]);
  });

  it('only counts what is inside the range the line was drawn over', () => {
    const amounts = [day('2026-01-04', 90000, { categoryId: 'rent' }), day('2026-09-13', 300)];
    const shares = categoryShares(amounts, 'expense', 'week', '2026-09-13');
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({ categoryId: 'food', value: 300, percent: 100 });
  });
});
