import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  daysBetween,
  formatAmount,
  groupDigits,
  matchesPeriod,
  overallBalance,
  parseAmount,
  periodLabel,
  periodRange,
  shiftPeriod,
  startOfWeek,
  toDayKey,
  totalFor,
  totalsByCategory,
  transactionsIn,
  weekdayOf,
} from './money';
import type { Period, Transaction } from '../types/finance';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: over.id ?? `t_${over.date ?? '1'}_${over.amount ?? 0}`,
    categoryId: over.categoryId ?? 'cat_food',
    kind: over.kind ?? 'expense',
    amount: over.amount ?? 100,
    date: over.date ?? '2026-09-12',
    createdAt: over.createdAt ?? '2026-09-12T10:00:00.000Z',
    note: over.note,
  };
}

const day = (anchor: string): Period => ({ kind: 'day', anchor });
const week = (anchor: string): Period => ({ kind: 'week', anchor });
const month = (anchor: string): Period => ({ kind: 'month', anchor });
const year = (anchor: string): Period => ({ kind: 'year', anchor });

describe('day keys', () => {
  it('reads a local date without shifting it', () => {
    expect(toDayKey(new Date(2026, 8, 13, 0, 30))).toBe('2026-09-13');
    expect(toDayKey(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-13');
  });

  it('steps across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('clamps a month step to the target month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-09-13', '2026-09-13')).toBe(0);
    expect(daysBetween('2026-09-13', '2026-09-12')).toBe(-1);
    expect(daysBetween('2026-08-31', '2026-09-02')).toBe(2);
  });

  it('starts the week on Monday, and Sunday closes the week before', () => {
    expect(weekdayOf('2026-09-13')).toBe(0);
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07');
  });
});

describe('periods', () => {
  it('covers the whole month regardless of the anchor day', () => {
    expect(periodRange(month('2026-09-12'))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange(month('2026-02-05'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('has no ends for all time', () => {
    expect(periodRange({ kind: 'all', anchor: '2026-09-12' })).toBeNull();
  });

  it('labels what the screen is looking at', () => {
    expect(periodLabel(month('2026-09-12'))).toBe('September 2026');
    expect(periodLabel(year('2026-09-12'))).toBe('2026 year');
    expect(periodLabel(day('2026-09-12'))).toBe('12 September 2026');
    expect(periodLabel(week('2026-09-13'))).toBe('07 – 13 September');
  });

  it('steps by its own unit', () => {
    expect(shiftPeriod(month('2026-09-12'), -1).anchor.slice(0, 7)).toBe('2026-08');
    expect(shiftPeriod(year('2026-09-12'), 1).anchor.slice(0, 4)).toBe('2027');
    expect(shiftPeriod(week('2026-09-13'), -1).anchor).toBe('2026-08-31');
  });
});

describe('the month lump', () => {
  const lump = txn({ id: 'lump', date: '2026-08', amount: 30000 });

  it('counts in its month, its year and all time', () => {
    expect(matchesPeriod(month('2026-08-01'), lump)).toBe(true);
    expect(matchesPeriod(year('2026-01-01'), lump)).toBe(true);
    expect(matchesPeriod({ kind: 'all', anchor: '2026-09-13' }, lump)).toBe(true);
  });

  it('never lands on a day or a week', () => {
    expect(matchesPeriod(day('2026-08-15'), lump)).toBe(false);
    expect(matchesPeriod(week('2026-08-15'), lump)).toBe(false);
  });

  it('does not leak into a neighbouring month', () => {
    expect(matchesPeriod(month('2026-09-01'), lump)).toBe(false);
  });

  it('sorts after every dated day of its own month', () => {
    const ordered = transactionsIn(
      [txn({ id: 'd1', date: '2026-08-30' }), lump, txn({ id: 'd2', date: '2026-09-01' })],
      { kind: 'all', anchor: '2026-09-13' },
    ).map((t) => t.id);
    expect(ordered).toEqual(['d2', 'lump', 'd1']);
  });
});

describe('totals', () => {
  const txns = [
    txn({ id: 'a', amount: 400, categoryId: 'cat_transport', date: '2026-09-12' }),
    txn({ id: 'b', amount: 2000, categoryId: 'cat_family', date: '2026-09-12' }),
    txn({ id: 'c', amount: 36200, kind: 'income', categoryId: 'cat_salary', date: '2026-09-02' }),
    txn({ id: 'd', amount: 9000, categoryId: 'cat_food', date: '2026-08' }),
  ];

  it('sums one direction in one window', () => {
    expect(totalFor(txns, day('2026-09-12'), 'expense')).toBe(2400);
    expect(totalFor(txns, day('2026-09-12'), 'income')).toBe(0);
    expect(totalFor(txns, month('2026-09-12'), 'income')).toBe(36200);
  });

  it('groups by category', () => {
    expect(totalsByCategory(txns, day('2026-09-12'), 'expense')).toEqual({
      cat_transport: 400,
      cat_family: 2000,
    });
  });

  it('balances income against expense over all time, lumps included', () => {
    expect(overallBalance(txns)).toBe(36200 - 400 - 2000 - 9000);
  });
});

describe('formatting', () => {
  it('groups thousands by hand', () => {
    expect(groupDigits(9020)).toBe('9,020');
    expect(groupDigits(393770)).toBe('393,770');
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(-1500)).toBe('-1,500');
  });

  it('puts the currency after the number', () => {
    expect(formatAmount(28970, 'AMD')).toBe('28,970 AMD');
    expect(formatAmount(-500, 'AMD')).toBe('-500 AMD');
  });

  it('refuses anything that is not a positive number', () => {
    expect(parseAmount('1,500')).toBe(1500);
    expect(parseAmount(' 240 ')).toBe(240);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});
