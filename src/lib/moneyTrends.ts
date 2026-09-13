/**
 * The money log, over TIME rather than over a window.
 *
 *   EXPENSES · WEEK            EXPENSES · YEAR
 *   3 400 ┄┄┄┄┄┄┄┄┄●           58 000 ┄┄┄┄┄●╱╲
 *         ╱╲   ╱╲╱                    ╱╲  ╱   ╲●
 *     0 ●╱  ╲●╱                 0 ┄┄●╱  ╲╱
 *       MON      SUN                JAN   JUN   SEP
 *
 * `MoneyScreen`'s interval picker answers "how much in September". This answers
 * the other question, the one a single total cannot: IS IT GOING UP. Those are
 * different enough to need different arithmetic — a window is a filter, a trend
 * is a bucketed series — and this file is the second one.
 *
 * ── THE BUCKET FOLLOWS THE RANGE, AND IT IS NOT A CHOICE ──────────────────
 *
 * A year of daily points is 365 dots in a 342-pixel box: a smear, not a shape.
 * So up to a quarter the bucket is the DAY and past it the MONTH — `bucketOf` in
 * `lib/trends.ts` owns that rule, because the task chart needs exactly the same
 * one and two copies of it would drift.
 *
 * ── A WHOLE-MONTH AMOUNT HAS NO DAY, SO IT HAS NO DAILY POINT ─────────────
 *
 * The same rule `inInterval` states and the one worth getting wrong twice: rent
 * is not spent on the 3rd. In a day-bucketed series it is left out; in a
 * month-bucketed one it lands on its month, whole. The screen says so, because
 * a chart whose weekly total disagrees with the screen above it is a chart
 * nobody can use — and the reason for the difference is a real fact about the
 * money, not an artefact.
 *
 * ── EMPTY BUCKETS ARE PLOTTED, AND THAT IS THE OPPOSITE OF `lib/trends.ts` ─
 *
 * A training chart drops a session with no reps in it, because a swim day is a
 * day the question does not apply to. A Tuesday you spent nothing is not that:
 * it is a real answer, it is the answer you are hoping for, and leaving it out
 * would draw a flat line through a week that actually had four quiet days in it.
 * So a bucket with no amounts is a genuine zero here.
 */

import { dayKey, formatMonth, formatShortDay, parseDay, shiftDay } from './days';
import type { Amount, Direction } from './money';
import { bucketOf, rangeLength, type TrendPoint, type TrendRange } from './trends';

/** One bucket of the money chart. */
export interface MoneyTrendPoint extends TrendPoint {
  /** `YYYY-MM-DD` for a day bucket, `YYYY-MM` for a month one. */
  key: string;
  /** "12 September" / "September 2026" — what the bucket is, in words. */
  label: string;
  value: number;
}

/** The earliest day any amount in the log belongs to, or null for an empty log. */
export function earliestDay(amounts: readonly Amount[]): string | null {
  let earliest: string | null = null;
  for (const amount of amounts) {
    const day =
      amount.when.kind === 'day'
        ? amount.when.date
        : dayKey(new Date(amount.when.year, amount.when.month, 1));
    if (day !== '' && (earliest === null || day < earliest)) earliest = day;
  }
  return earliest;
}

/**
 * The first day a range covers, ending at `today`.
 *
 * `all` walks back to the first amount ever recorded, so the left edge of the
 * chart is the day the log began. A log with nothing in it starts today, which
 * draws one bucket and therefore draws no line — correct, and better than a year
 * of zeroes that look like a year of thrift.
 */
export function moneyRangeStart(
  amounts: readonly Amount[],
  range: TrendRange,
  today: string,
): string {
  const length = rangeLength(range);
  if (length != null) return shiftDay(today, -(length - 1));
  return earliestDay(amounts) ?? today;
}

/** `2026-09-13` → `2026-09`. The month a day belongs to, as a sortable key. */
function monthKey(day: string): string {
  return day.slice(0, 7);
}

/**
 * Every bucket in the range, oldest first and none of them missing.
 *
 * Built from the CALENDAR rather than from the amounts, which is what makes an
 * empty Tuesday a zero instead of a gap — see the file header.
 */
function bucketsIn(range: TrendRange, from: string, today: string): MoneyTrendPoint[] {
  const buckets: MoneyTrendPoint[] = [];
  const byMonth = bucketOf(range) === 'month';
  const seen = new Set<string>();

  for (let day = from; day <= today; day = shiftDay(day, 1)) {
    const at = parseDay(day);
    if (!at) break;
    const key = byMonth ? monthKey(day) : day;
    if (!seen.has(key)) {
      seen.add(key);
      const noon = byMonth ? new Date(at.getFullYear(), at.getMonth(), 1, 12) : new Date(at);
      if (!byMonth) noon.setHours(12, 0, 0, 0);
      buckets.push({
        key,
        at: noon.toISOString(),
        label: byMonth ? formatMonth(at.getFullYear(), at.getMonth()) : formatShortDay(day),
        value: 0,
      });
    }
    // A junk `today` would otherwise run this loop forever.
    if (buckets.length > 1200) break;
  }

  return buckets;
}

/** Which bucket an amount lands in, or null when it has no place in this series. */
function keyOf(amount: Amount, byMonth: boolean): string | null {
  if (amount.when.kind === 'month') {
    // No day to sit on — see the file header. In a monthly series it is whole.
    if (!byMonth) return null;
    return `${amount.when.year}-${String(amount.when.month + 1).padStart(2, '0')}`;
  }
  return byMonth ? monthKey(amount.when.date) : amount.when.date;
}

/**
 * One direction, bucketed over a range: what went out (or came in) each day or month.
 *
 * Oldest first, every bucket present, whole AMD. The chart reads this straight —
 * it owns no arithmetic, exactly like every other chart in the app.
 */
export function moneyTrendSeries(
  amounts: readonly Amount[],
  direction: Direction,
  range: TrendRange,
  today: string,
): MoneyTrendPoint[] {
  const from = moneyRangeStart(amounts, range, today);
  const byMonth = bucketOf(range) === 'month';
  const buckets = bucketsIn(range, from, today);
  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const amount of amounts) {
    if (amount.direction !== direction) continue;
    const key = keyOf(amount, byMonth);
    if (key === null) continue;
    const bucket = index.get(key);
    if (bucket) bucket.value += amount.value;
  }

  return buckets;
}

/**
 * The RUNNING BALANCE across the range: incomes less expenses, accumulated.
 *
 * The one series that answers "am I getting anywhere", and the one place in this
 * file where a bucket is not independent of the ones before it. It starts from
 * the balance as it stood the day BEFORE the range — otherwise a chart of the
 * last week would open at zero and claim you owned nothing on Monday.
 *
 * Whole-month amounts count into the opening balance and into their own month's
 * bucket, which means a weekly balance line steps at the start of the month it
 * covers rather than on rent day. That is the same honest limitation the daily
 * series has, for the same reason.
 */
export function moneyBalanceSeries(
  amounts: readonly Amount[],
  range: TrendRange,
  today: string,
): MoneyTrendPoint[] {
  const from = moneyRangeStart(amounts, range, today);
  const byMonth = bucketOf(range) === 'month';
  const buckets = bucketsIn(range, from, today);
  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const keys = new Set(buckets.map((bucket) => bucket.key));

  let opening = 0;
  for (const amount of amounts) {
    const signed = amount.direction === 'expense' ? -amount.value : amount.value;
    const key = keyOf(amount, byMonth);
    // Outside the range entirely, or a whole-month amount a daily series cannot
    // place: either way it belongs to what the range OPENED with.
    if (key === null || !keys.has(key)) {
      opening += signed;
      continue;
    }
    const bucket = index.get(key);
    if (bucket) bucket.value += signed;
  }

  let running = opening;
  for (const bucket of buckets) {
    running += bucket.value;
    bucket.value = running;
  }
  return buckets;
}

export interface MoneyTrendSummary {
  total: number;
  /** Mean per bucket, rounded — "about 2 400 a day". */
  average: number;
  /** The biggest single bucket, for "your heaviest day was…". */
  peak: MoneyTrendPoint | null;
  buckets: number;
  /** Buckets with nothing in them at all. Zero spending IS the finding. */
  quiet: number;
}

export function summarizeMoneyTrend(points: readonly MoneyTrendPoint[]): MoneyTrendSummary {
  let total = 0;
  let quiet = 0;
  let peak: MoneyTrendPoint | null = null;
  for (const point of points) {
    total += point.value;
    if (point.value === 0) quiet += 1;
    if (!peak || point.value > peak.value) peak = point;
  }
  return {
    total,
    average: points.length === 0 ? 0 : Math.round(total / points.length),
    peak: peak && peak.value > 0 ? peak : null,
    buckets: points.length,
    quiet,
  };
}

/**
 * One category's share of a direction over the whole range, biggest first.
 *
 * Not a chart — a chart of eight categories is eight lines and no answer. The
 * grid above already says what each one came to; what it cannot say is which one
 * is the reason the line went up, and a sorted list of three does.
 */
export interface CategoryShare {
  categoryId: string;
  value: number;
  /** 0–100, rounded, of the range's total for that direction. */
  percent: number;
}

export function categoryShares(
  amounts: readonly Amount[],
  direction: Direction,
  range: TrendRange,
  today: string,
): CategoryShare[] {
  const from = moneyRangeStart(amounts, range, today);
  const byMonth = bucketOf(range) === 'month';
  // The range IS the buckets — asking them what keys exist is the only definition
  // of "in range" that cannot disagree with the line drawn beside this list.
  const keys = new Set(bucketsIn(range, from, today).map((bucket) => bucket.key));

  const totals = new Map<string, number>();
  let total = 0;
  for (const amount of amounts) {
    if (amount.direction !== direction) continue;
    const key = keyOf(amount, byMonth);
    if (key === null || !keys.has(key)) continue;
    totals.set(amount.categoryId, (totals.get(amount.categoryId) ?? 0) + amount.value);
    total += amount.value;
  }

  return [...totals.entries()]
    .map(([categoryId, value]) => ({
      categoryId,
      value,
      percent: total === 0 ? 0 : Math.round((value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}
