/**
 * The money maths — every question the Expenses screens ask, as pure functions.
 *
 * Nothing here imports a store, a component or `Date.now`: a period is a value the
 * caller passes in, so the whole section is testable without a renderer and without
 * a clock. Same doctrine as `lib/rest.ts` and `lib/trends.ts`.
 *
 * ── DAY KEYS, NOT DATES ────────────────────────────────────────────────────
 *
 * Everything in here is a `YYYY-MM-DD` string, and arithmetic goes through UTC
 * midnight on the way in and out. A `Date` carries a timezone and a time of day, and
 * both of those have exactly one job in a spending log: to move a transaction into
 * the previous day the first time somebody records one at 00:30, or the first time
 * they cross a DST boundary. Strings compare lexicographically in date order, which
 * is what every range check below relies on.
 *
 * `toDayKey` is the ONE place local time is read, because "today" is a local
 * question. Everything downstream of it is a string.
 *
 * ── THE WEEK STARTS ON MONDAY ──────────────────────────────────────────────
 *
 * Not a preference. The month and the year are the windows anyone budgets in; the
 * week exists to answer "what have I spent since the weekend", and a week that
 * starts on Sunday splits the weekend across two of them.
 */

import {
  isMonthLump,
  type MoneyKind,
  type Period,
  type PeriodKind,
  type Transaction,
} from '../types/finance';
import type { ID } from '../types/models';

/** A local calendar day as `YYYY-MM-DD`. The only reader of local time here. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The `YYYY-MM` a day key belongs to. Also the key a month lump is filed under. */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** UTC midnight for a day key, so arithmetic never meets a DST hour. */
function atUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** `delta` days later (or earlier), as a day key. */
export function addDays(dayKey: string, delta: number): string {
  const date = atUtc(dayKey);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** `delta` months later (or earlier), clamped to the target month's last day. */
export function addMonths(dayKey: string, delta: number): string {
  const date = atUtc(dayKey);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + delta);
  const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((atUtc(to).getTime() - atUtc(from).getTime()) / 86400000);
}

/** 0 = Sunday … 6 = Saturday, matching `Date.getDay` and the task schedules. */
export function weekdayOf(dayKey: string): number {
  return atUtc(dayKey).getUTCDay();
}

/** How many days a month has. `month` is 1-based, as it is in a day key. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The Monday of the week `dayKey` falls in. See the header. */
export function startOfWeek(dayKey: string): string {
  const weekday = weekdayOf(dayKey);
  // Sunday (0) belongs to the week that began six days earlier, not the one starting today.
  const back = weekday === 0 ? 6 : weekday - 1;
  return addDays(dayKey, -back);
}

/**
 * The first and last day a period covers, or `null` for `all` — which has no ends,
 * and saying so is better than inventing two sentinel dates for callers to compare
 * against.
 */
export function periodRange(period: Period): { from: string; to: string } | null {
  const anchor = period.anchor;
  switch (period.kind) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      const [y, m] = anchor.split('-').map(Number);
      const last = daysInMonth(y, m);
      return {
        from: `${anchor.slice(0, 7)}-01`,
        to: `${anchor.slice(0, 7)}-${`${last}`.padStart(2, '0')}`,
      };
    }
    case 'year': {
      const y = anchor.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'all':
      return null;
  }
}

/**
 * Does this transaction count towards this period?
 *
 * The whole month-lump rule is here. A lump belongs to a MONTH, so it counts in that
 * month, in the year containing it, and in all time — and in no day and no week,
 * because it never claimed to have happened on one. A day screen showing part of a
 * lump would be inventing a day that the user explicitly said they do not remember.
 */
export function matchesPeriod(period: Period, txn: Transaction): boolean {
  if (period.kind === 'all') return true;

  if (isMonthLump(txn.date)) {
    if (period.kind === 'month') return txn.date === monthKeyOf(period.anchor);
    if (period.kind === 'year') return txn.date.slice(0, 4) === period.anchor.slice(0, 4);
    return false;
  }

  const range = periodRange(period);
  if (!range) return true;
  return txn.date >= range.from && txn.date <= range.to;
}

/** The same period, `delta` steps forward or back. `all` has nowhere to go. */
export function shiftPeriod(period: Period, delta: number): Period {
  switch (period.kind) {
    case 'day':
      return { ...period, anchor: addDays(period.anchor, delta) };
    case 'week':
      return { ...period, anchor: addDays(startOfWeek(period.anchor), delta * 7) };
    case 'month':
      return { ...period, anchor: addMonths(`${monthKeyOf(period.anchor)}-01`, delta) };
    case 'year':
      return { ...period, anchor: addMonths(`${monthKeyOf(period.anchor)}-01`, delta * 12) };
    case 'all':
      return period;
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `September 2026`, for a month key or a day key inside one. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** `12 September 2026`. */
export function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** What the header over the category grid says this window is. */
export function periodLabel(period: Period): string {
  switch (period.kind) {
    case 'day':
      return dayLabel(period.anchor);
    case 'week': {
      const range = periodRange(period);
      if (!range) return '';
      const [, fromM, fromD] = range.from.split('-').map(Number);
      const [, toM, toD] = range.to.split('-').map(Number);
      const left = fromM === toM ? `${fromD}` : `${fromD} ${MONTHS[fromM - 1]}`;
      return `${`${left}`.padStart(2, '0')} – ${`${toD}`.padStart(2, '0')} ${MONTHS[toM - 1]}`;
    }
    case 'month':
      return monthLabel(period.anchor);
    case 'year':
      return `${period.anchor.slice(0, 4)} year`;
    case 'all':
      return 'All time';
  }
}

/** The short word the period sheet puts on its tile. */
export function periodName(kind: PeriodKind): string {
  return kind === 'all' ? 'All time' : kind[0].toUpperCase() + kind.slice(1);
}

/** Every transaction inside a window, newest first. */
export function transactionsIn(txns: readonly Transaction[], period: Period): Transaction[] {
  return txns.filter((txn) => matchesPeriod(period, txn)).sort(byDateDesc);
}

/**
 * Newest first, and month lumps sort as the END of their month.
 *
 * A lump for September is the whole of September, so listing it above the 30th and
 * below the 1st is the only placement that is not a claim about a day.
 */
export function byDateDesc(a: Transaction, b: Transaction): number {
  const left = sortKey(a);
  const right = sortKey(b);
  if (left === right) return b.createdAt < a.createdAt ? -1 : 1;
  return left < right ? 1 : -1;
}

function sortKey(txn: Transaction): string {
  return isMonthLump(txn.date) ? `${txn.date}-99` : txn.date;
}

/** What was spent (or earned) in this window. */
export function totalFor(txns: readonly Transaction[], period: Period, kind: MoneyKind): number {
  let total = 0;
  for (const txn of txns) {
    if (txn.kind === kind && matchesPeriod(period, txn)) total += txn.amount;
  }
  return total;
}

/** Per-category totals for one window and one direction. Categories with nothing get 0 by omission. */
export function totalsByCategory(
  txns: readonly Transaction[],
  period: Period,
  kind: MoneyKind,
): Record<ID, number> {
  const totals: Record<ID, number> = {};
  for (const txn of txns) {
    if (txn.kind !== kind || !matchesPeriod(period, txn)) continue;
    totals[txn.categoryId] = (totals[txn.categoryId] ?? 0) + txn.amount;
  }
  return totals;
}

/**
 * Everything in, minus everything out, over all time.
 *
 * The number at the top of the screen, and the one figure that is NOT filtered by
 * the period: a balance for "this week" is not a balance, it is a delta, and the
 * screen already shows both of those underneath.
 */
export function overallBalance(txns: readonly Transaction[]): number {
  let balance = 0;
  for (const txn of txns) balance += txn.kind === 'income' ? txn.amount : -txn.amount;
  return balance;
}

/**
 * `9,020 AMD` — grouped, with the unit after it.
 *
 * Grouping by hand rather than through `Intl`: Hermes ships a cut-down ICU, and a
 * number format that silently falls back to `9020` on the phone while passing in the
 * test runner is the kind of difference that is only ever found on the phone.
 */
export function formatAmount(amount: number, currency: string): string {
  return `${groupDigits(amount)} ${currency}`;
}

/** `28970` → `28,970`. Negative signs are the caller's business. */
export function groupDigits(value: number): string {
  const digits = `${Math.abs(Math.round(value))}`;
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return value < 0 ? `-${out}` : out;
}

/** Whole units from what somebody typed, or `null` for anything that is not a number. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}
