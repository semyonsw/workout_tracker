/**
 * Money — the shapes the Expenses side of the app is made of.
 *
 * Three of them, and the third is the one that carries a decision.
 *
 * `MoneyCategory` is a bucket with a name. Categories are user data, not a fixed
 * enum: the whole point of the section is that when money goes somewhere the app
 * has never heard of, you make the bucket on the spot. They are ARCHIVED rather
 * than deleted when they still hold transactions, because a category is the only
 * thing that says what a past amount was for — deleting it would turn history into
 * a column of numbers.
 *
 * `Transaction` is one amount on one date. `amount` is a whole number of currency
 * units (AMD has no subunit anyone uses) and is always POSITIVE — the sign lives in
 * `kind`, so a total is a filter and a sum rather than a filter and a sign check.
 *
 * ── THE MONTH LUMP ─────────────────────────────────────────────────────────
 *
 * `date` is `YYYY-MM-DD` for something that happened on a day, and `YYYY-MM` for a
 * month somebody typed in from memory: "September cost me 28,970 and I am not
 * reconstructing which day each coffee was". Both are transactions and both count
 * towards a month, a year and the balance; the month lump simply does not belong to
 * any single day, which is exactly what `no data` on a day screen should mean.
 *
 * Encoding it in the STRING rather than in a separate flag is deliberate: every
 * comparison in `lib/money.ts` is a lexicographic one on day keys, and a key that is
 * shorter than a day key sorts and compares in a way that can never be mistaken for
 * one. `isMonthLump` is the single place that asks.
 */

import type { ID } from './models';

/** Money out, or money in. The sign of every amount in the app. */
export type MoneyKind = 'expense' | 'income';

export interface MoneyCategory {
  id: ID;
  name: string;
  kind: MoneyKind;
  /**
   * One or two characters drawn in the category's tile — an emoji, a currency
   * mark, initials. There is no icon set here: the app ships one glyph budget and
   * it is spent on things that do something (see `components/Icon.tsx`).
   */
  glyph: string;
  order: number;
  /** Hidden from the pickers, still resolving for every amount filed under it. */
  isArchived: boolean;
  createdAt: string;
}

export interface Transaction {
  id: ID;
  categoryId: ID;
  kind: MoneyKind;
  /** Whole currency units, always positive. */
  amount: number;
  /** `YYYY-MM-DD` — a day — or `YYYY-MM` — a month lump. See the header. */
  date: string;
  note?: string;
  createdAt: string;
}

/** Is this transaction a month typed in from memory rather than a logged day? */
export function isMonthLump(date: string): boolean {
  return date.length === 7;
}

/** The windows the Money screen can be looking at. */
export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * A window, as a kind plus one day inside it.
 *
 * The anchor is a day key even for `year`, so stepping between periods is one
 * function and switching KIND keeps you where you were: a year view stepped back
 * twice and then switched to months lands in the month you were already looking at.
 */
export interface Period {
  kind: PeriodKind;
  /** `YYYY-MM-DD`. Ignored by `all`, kept so switching back out of it remembers. */
  anchor: string;
}
