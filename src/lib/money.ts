/**
 * The money log — amounts, the categories they sit in, and the window you read
 * them through.
 *
 *   OVERALL BALANCE
 *   9,020 AMD
 *   ‹ September 2026 ▾ ›
 *   Expenses 28,970 AMD  |  Incomes 36,200 AMD
 *
 * ── AN AMOUNT BELONGS TO A DAY, OR TO A WHOLE MONTH ───────────────────────
 *
 * Rent, a metro pass, a subscription: real money that is genuinely not spent on
 * the 3rd. Filing those under a day is a small lie that the day view then
 * repeats — open the 3rd and a third of the month's spending is sitting on it.
 *
 * So `when` has two shapes, and a `month` amount counts towards the MONTH, the
 * YEAR and the BALANCE, and towards NO SINGLE DAY and no week. It is not hidden
 * and it is not double-counted; it simply has no day to be on. Every screen that
 * shows one labels it `whole month` for that reason.
 *
 * ── ONE HUE, SO DIRECTION IS A WORD ───────────────────────────────────────
 *
 * Expenses are not red and incomes are not green — see `tailwind.config.js`. The
 * two totals sit side by side and the SELECTED one is the one on `surface-alt`
 * with its figure in `green-bright`; the other is flat and muted. Colour says
 * "this is the one you are reading", never "this one is bad".
 *
 * ── THE BALANCE IS ALWAYS ALL-TIME ────────────────────────────────────────
 *
 * It sits above the interval picker and does not move when the picker does,
 * because "what do I have" is not a question about September. Everything below
 * it is windowed; it is not.
 *
 * Amounts are whole AMD. There are no sub-units in circulation, so an integer is
 * the honest type and `0.1 + 0.2` never gets a chance to happen.
 */

import {
  dayKey,
  formatLongDay,
  formatMonth,
  formatShortDay,
  pad,
  parseDay,
  weekEnd,
  weekStart,
} from './days';
import type { ID } from '../types/models';

export type Direction = 'expense' | 'income';

export type AmountWhen =
  | { kind: 'day'; date: string }
  /** `month` is 0-based, as `Date` uses it. */
  | { kind: 'month'; year: number; month: number };

export interface MoneyCategory {
  id: ID;
  name: string;
  /** One emoji. The only pictures in the app, and the user picks them. */
  glyph: string;
  order: number;
  /** Archived categories keep their amounts and leave the grid. */
  archivedAt: string | null;
}

export interface Amount {
  id: ID;
  categoryId: ID;
  direction: Direction;
  /** Whole AMD, always positive; `direction` carries the sign. */
  value: number;
  when: AmountWhen;
  note: string;
  createdAt: string;
}

/** The window the month screen reads through. */
export type Interval = 'day' | 'week' | 'month' | 'year' | 'all';

export const INTERVALS: readonly Interval[] = ['day', 'week', 'month', 'year', 'all'];

export const INTERVAL_LABELS: Record<Interval, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All time',
};

/** "9,020" — grouped, no unit. Tabular numerals do the aligning. */
export function formatValue(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  return sign + rounded.toLocaleString('en-US');
}

/**
 * "9,020 AMD" — the number and whatever the user counts in.
 *
 * The code is a PARAMETER and not a constant because the label is a setting now
 * (`settingsStore.currencyCode`), and it is a label rather than a currency: no
 * amount carries a code, nothing is converted, and changing it repaints every
 * figure in the app without touching one of them. A lib that reached into the
 * settings store to find out would make every money test a store test, so the
 * screens pass it down.
 */
export function formatMoney(value: number, code: string): string {
  return `${formatValue(value)} ${code}`;
}

/** The month's name on its own, without the year. */
function monthName(year: number, month: number): string {
  return formatMonth(year, month).split(' ')[0];
}

/** "07 – 13 September", or "28 September – 04 October" across a seam. */
export function formatWeek(day: string): string {
  const from = parseDay(weekStart(day));
  const to = parseDay(weekEnd(day));
  if (!from || !to) return day;
  const toLabel = monthName(to.getFullYear(), to.getMonth());
  if (from.getMonth() === to.getMonth()) {
    return `${pad(from.getDate())} – ${pad(to.getDate())} ${toLabel}`;
  }
  return `${pad(from.getDate())} ${monthName(from.getFullYear(), from.getMonth())} – ${pad(to.getDate())} ${toLabel}`;
}

/**
 * What the picker row says under each interval name, for a given anchor day.
 *
 * These are the SAME strings the header shows once an interval is chosen, so the
 * sheet is a preview of the screen rather than a list of nouns.
 */
export function describeInterval(interval: Interval, anchor: string): string {
  const date = parseDay(anchor);
  if (!date) return '';
  switch (interval) {
    case 'day':
      return formatLongDay(anchor);
    case 'week':
      return formatWeek(anchor);
    case 'month':
      return formatMonth(date.getFullYear(), date.getMonth());
    case 'year':
      return `${date.getFullYear()} year`;
    case 'all':
      return 'Everything recorded';
  }
}

/**
 * Does this amount fall in the window?
 *
 * A whole-month amount answers `false` for `day` and `week` on purpose — see the
 * header. It is the one rule in this file worth getting wrong twice.
 */
export function inInterval(amount: Amount, interval: Interval, anchor: string): boolean {
  if (interval === 'all') return true;
  const at = parseDay(anchor);
  if (!at) return false;

  if (amount.when.kind === 'month') {
    if (interval === 'day' || interval === 'week') return false;
    if (interval === 'year') return amount.when.year === at.getFullYear();
    return amount.when.year === at.getFullYear() && amount.when.month === at.getMonth();
  }

  const on = parseDay(amount.when.date);
  if (!on) return false;
  switch (interval) {
    case 'day':
      return amount.when.date === anchor;
    case 'week':
      return amount.when.date >= weekStart(anchor) && amount.when.date <= weekEnd(anchor);
    case 'month':
      return on.getFullYear() === at.getFullYear() && on.getMonth() === at.getMonth();
    case 'year':
      return on.getFullYear() === at.getFullYear();
  }
}

/** Move the anchor one window forward or back. `all` does not move. */
export function shiftAnchor(interval: Interval, anchor: string, step: number): string {
  const date = parseDay(anchor);
  if (!date) return anchor;
  switch (interval) {
    case 'day':
      date.setDate(date.getDate() + step);
      break;
    case 'week':
      date.setDate(date.getDate() + step * 7);
      break;
    case 'month':
      // Day 1 first, so stepping off the 31st does not skip February.
      date.setDate(1);
      date.setMonth(date.getMonth() + step);
      break;
    case 'year':
      date.setDate(1);
      date.setFullYear(date.getFullYear() + step);
      break;
    case 'all':
      return anchor;
  }
  return dayKey(date);
}

export interface Totals {
  expenses: number;
  incomes: number;
}

export function totalsIn(amounts: readonly Amount[], interval: Interval, anchor: string): Totals {
  let expenses = 0;
  let incomes = 0;
  for (const amount of amounts) {
    if (!inInterval(amount, interval, anchor)) continue;
    if (amount.direction === 'expense') expenses += amount.value;
    else incomes += amount.value;
  }
  return { expenses, incomes };
}

/** Incomes less expenses, over everything ever recorded. */
export function balanceOf(amounts: readonly Amount[]): number {
  let balance = 0;
  for (const amount of amounts) {
    balance += amount.direction === 'expense' ? -amount.value : amount.value;
  }
  return balance;
}

/** `categoryId` → total, for one direction inside the window. Missing = 0. */
export function byCategory(
  amounts: readonly Amount[],
  direction: Direction,
  interval: Interval,
  anchor: string,
): Record<ID, number> {
  const totals: Record<ID, number> = {};
  for (const amount of amounts) {
    if (amount.direction !== direction) continue;
    if (!inInterval(amount, interval, anchor)) continue;
    totals[amount.categoryId] = (totals[amount.categoryId] ?? 0) + amount.value;
  }
  return totals;
}

/**
 * One category's amounts inside the window, newest first.
 *
 * Whole-month amounts sort as if they were on the LAST day of their month, which
 * puts the metro pass under the days it actually covered rather than above a
 * month it has not started.
 */
export function amountsIn(
  amounts: readonly Amount[],
  categoryId: ID,
  interval: Interval,
  anchor: string,
): Amount[] {
  return amounts
    .filter((amount) => amount.categoryId === categoryId && inInterval(amount, interval, anchor))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

function sortKey(amount: Amount): string {
  if (amount.when.kind === 'day') return `${amount.when.date}#${amount.createdAt}`;
  const last = new Date(amount.when.year, amount.when.month + 1, 0);
  return `${dayKey(last)}#${amount.createdAt}`;
}

/** "12 September · taxi to the gym" — the faint line under an amount. */
export function describeAmount(amount: Amount): string {
  const parts: string[] = [];
  if (amount.when.kind === 'day') {
    parts.push(formatShortDay(amount.when.date));
  } else {
    parts.push(formatMonth(amount.when.year, amount.when.month), 'whole month');
  }
  if (amount.note.trim() !== '') parts.push(amount.note.trim());
  return parts.join(' · ');
}

/** "7 amounts" · "1 amount" · "No amounts yet". */
export function describeCount(count: number): string {
  if (count === 0) return 'No amounts yet';
  return `${count} ${count === 1 ? 'amount' : 'amounts'}`;
}
