import { describe, expect, it } from 'vitest';

import {
  type Amount,
  type MoneyAccount,
  amountsIn,
  balanceOf,
  balanceOfAccount,
  inAccount,
  openingFor,
  byCategory,
  describeAmount,
  describeInterval,
  formatMoney,
  inInterval,
  shiftAnchor,
  totalsIn,
} from './money';

/**
 * The money log.
 *
 * Almost every test here is really one test asked five ways: a WHOLE-MONTH amount
 * counts towards the month, the year and the balance, and towards no single day
 * and no week. It is the rule that makes rent honest, it is invisible until you
 * open a Tuesday and find a third of the month sitting on it, and it is the one
 * thing in this file that a refactor can quietly invert.
 */

let seq = 0;
function day(date: string, value: number, over: Partial<Amount> = {}): Amount {
  seq += 1;
  return {
    id: `a${seq}`,
    categoryId: 'transport',
    accountId: 'cash',
    direction: 'expense',
    value,
    when: { kind: 'day', date },
    note: '',
    createdAt: `2026-09-01T00:00:0${seq % 10}.000Z`,
    ...over,
  };
}

function month(
  year: number,
  monthIndex: number,
  value: number,
  over: Partial<Amount> = {},
): Amount {
  return day('2026-01-01', value, { ...over, when: { kind: 'month', year, month: monthIndex } });
}

describe('the whole-month amount', () => {
  const pass = month(2026, 8, 6000, { note: 'metro pass' });

  it('counts towards its month, its year and everything', () => {
    expect(inInterval(pass, 'month', '2026-09-13')).toBe(true);
    expect(inInterval(pass, 'year', '2026-09-13')).toBe(true);
    expect(inInterval(pass, 'all', '2026-09-13')).toBe(true);
  });

  it('counts towards no single day and no week', () => {
    expect(inInterval(pass, 'day', '2026-09-13')).toBe(false);
    expect(inInterval(pass, 'week', '2026-09-13')).toBe(false);
  });

  it('is not in some other month or year', () => {
    expect(inInterval(pass, 'month', '2026-10-13')).toBe(false);
    expect(inInterval(pass, 'year', '2025-09-13')).toBe(false);
  });

  it('says so on its own row, in place of a date', () => {
    expect(describeAmount(pass)).toBe('September 2026 · whole month · metro pass');
  });

  it('still moves the balance', () => {
    expect(balanceOf([pass])).toBe(-6000);
  });
});

describe('the window', () => {
  const taxi = day('2026-09-12', 400, { note: 'taxi to the gym' });

  it('holds a day, a Monday-first week, a month and a year', () => {
    expect(inInterval(taxi, 'day', '2026-09-12')).toBe(true);
    expect(inInterval(taxi, 'day', '2026-09-13')).toBe(false);
    // 2026-09-13 is a Sunday, so its week is the 7th to the 13th.
    expect(inInterval(taxi, 'week', '2026-09-13')).toBe(true);
    expect(inInterval(taxi, 'week', '2026-09-14')).toBe(false);
    expect(inInterval(taxi, 'month', '2026-09-30')).toBe(true);
    expect(inInterval(taxi, 'year', '2026-01-01')).toBe(true);
  });

  it('previews itself in the picker the way the header will read', () => {
    expect(describeInterval('day', '2026-09-12')).toBe('12 September 2026');
    expect(describeInterval('week', '2026-09-13')).toBe('07 – 13 September');
    expect(describeInterval('month', '2026-09-13')).toBe('September 2026');
    expect(describeInterval('year', '2026-09-13')).toBe('2026 year');
    expect(describeInterval('all', '2026-09-13')).toBe('Everything recorded');
  });

  it('names a week that crosses a month seam on both sides', () => {
    // 2026-09-30 is a Wednesday: the week runs 28 September to 4 October.
    expect(describeInterval('week', '2026-09-30')).toBe('28 September – 04 October');
  });

  it('steps a month without skipping February off the 31st', () => {
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftAnchor('month', '2026-09-13', -1)).toBe('2026-08-01');
    expect(shiftAnchor('day', '2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftAnchor('week', '2026-09-13', 1)).toBe('2026-09-20');
  });

  it('does not move "all time"', () => {
    expect(shiftAnchor('all', '2026-09-13', 1)).toBe('2026-09-13');
  });
});

describe('the totals', () => {
  const amounts: Amount[] = [
    day('2026-09-12', 400),
    day('2026-09-12', 1500, { categoryId: 'food' }),
    day('2026-09-02', 9000, { direction: 'income', categoryId: 'family' }),
    month(2026, 8, 6000),
    day('2026-08-30', 250, { categoryId: 'food' }),
  ];

  it('separates the two directions rather than signing one of them', () => {
    expect(totalsIn(amounts, 'month', '2026-09-13')).toEqual({ expenses: 7900, incomes: 9000 });
  });

  it('drops the whole-month amount out of the day it never happened on', () => {
    expect(totalsIn(amounts, 'day', '2026-09-12')).toEqual({ expenses: 1900, incomes: 0 });
  });

  it('reads the balance over everything ever recorded, not the window', () => {
    // 9,000 in, 400 + 1,500 + 6,000 + 250 out.
    expect(balanceOf(amounts)).toBe(850);
  });

  it('totals one direction per category, and leaves the untouched ones out', () => {
    expect(byCategory(amounts, 'expense', 'month', '2026-09-13')).toEqual({
      transport: 6400,
      food: 1500,
    });
    expect(byCategory(amounts, 'income', 'month', '2026-09-13')).toEqual({ family: 9000 });
  });
});

describe('a category', () => {
  const amounts: Amount[] = [
    day('2026-09-04', 1000, { note: 'taxi home' }),
    day('2026-09-12', 400, { note: 'taxi to the gym' }),
    month(2026, 8, 6000, { note: 'metro pass' }),
    day('2026-08-02', 700),
  ];

  it('lists the month newest first, with the month lump at the end of it', () => {
    const rows = amountsIn(amounts, 'transport', 'month', '2026-09-13');
    // The pass sorts as the 30th — under the days it covered, not above them.
    expect(rows.map((a) => a.note)).toEqual(['metro pass', 'taxi to the gym', 'taxi home']);
  });

  it('leaves other months out of it', () => {
    expect(amountsIn(amounts, 'transport', 'month', '2026-09-13')).toHaveLength(3);
    expect(amountsIn(amounts, 'transport', 'all', '2026-09-13')).toHaveLength(4);
  });

  it('drops the note from the line when there is not one', () => {
    expect(describeAmount(day('2026-09-08', 400))).toBe('8 September');
  });
});

describe('the figure', () => {
  it('groups thousands and carries the unit', () => {
    expect(formatMoney(9020, 'AMD')).toBe('9,020 AMD');
    expect(formatMoney(0, 'AMD')).toBe('0 AMD');
    expect(formatMoney(28970, 'USD')).toBe('28,970 USD');
    expect(formatMoney(-1500, 'AMD')).toBe('-1,500 AMD');
  });
});

/**
 * The subsections.
 *
 * Two piles of money that never touch, and an `opening` that is the money nobody
 * logged. The test worth keeping is the LAST one: setting a balance must move
 * only the opening, because the alternative — a correction that quietly edits
 * what was already recorded, or one that lands as an income — is exactly what
 * this field exists to avoid.
 */
describe('a subsection', () => {
  const cash: MoneyAccount = {
    id: 'cash',
    name: 'Cash',
    glyph: '💵',
    order: 0,
    opening: 40000,
    archivedAt: null,
  };
  const amounts: Amount[] = [
    day('2026-09-04', 1000),
    day('2026-09-05', 2500, { accountId: 'online' }),
    day('2026-09-06', 9000, { direction: 'income' }),
  ];

  it('holds what it opened with, plus only its own amounts', () => {
    expect(inAccount(amounts, 'cash')).toHaveLength(2);
    expect(balanceOfAccount(cash, amounts)).toBe(40000 - 1000 + 9000);
  });

  it('is not touched by what another subsection spent', () => {
    const online: MoneyAccount = { ...cash, id: 'online', name: 'Online', opening: 0 };
    expect(balanceOfAccount(online, amounts)).toBe(-2500);
  });

  it('turns a balance the user typed into the opening behind it', () => {
    const opening = openingFor(cash, amounts, 50000);
    expect(balanceOfAccount({ ...cash, opening }, amounts)).toBe(50000);
    // And nothing logged moved to get there.
    expect(amounts.map((a) => a.value)).toEqual([1000, 2500, 9000]);
  });

  it('takes a balance below zero — an account can hold less than nothing', () => {
    const opening = openingFor(cash, amounts, -500);
    expect(balanceOfAccount({ ...cash, opening }, amounts)).toBe(-500);
  });
});
