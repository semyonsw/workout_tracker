/**
 * The training month — which days you trained, as a grid.
 *
 *   September 2026            8 workouts
 *   M  T  W  T  F  S  S
 *      1  2  3  4  5  6
 *   7  8  9 10 11 12 13
 *  14 15 16 17 18 19 20       ← a filled cell is a day with a workout
 *  21 22 23 24 25 26 27
 *  28 29 30
 *
 * ── THIS IS NOT A STREAK ───────────────────────────────────────────────────
 *
 * `HistoryScreen`'s header is explicit: "THE TOTALS LINE IS A FACT, NOT A GOAL. No
 * streaks, no badges, no weekly target." A calendar is on the right side of that
 * line and the distinction is worth stating, because the two look similar and are
 * not:
 *
 *  • A STREAK is a claim about the future — it exists to be broken, and its whole
 *    mechanism is the cost of breaking it. It turns "I was ill for a week" into a
 *    number going to zero.
 *  • A CALENDAR is a record of what happened. It answers "how consistent was
 *    February" in one glance, which is a question the session list genuinely cannot
 *    answer — sixteen rows of dates is not a shape — and it answers it without
 *    grading anybody.
 *
 * So: no current-streak counter, no longest-streak counter, no flame, no target
 * ring, no colour scale for "intensity". A day either has training in it or it does
 * not, and the month says how many.
 *
 * ── WEEKS START ON MONDAY ──────────────────────────────────────────────────
 *
 * Because a training week does. Sunday-first is a US calendar convention and it
 * splits every weekend across two rows, which is precisely the shape a lifter is
 * looking for when they scan for gaps.
 *
 * Everything here is pure and local-time: a workout belongs to the day it started,
 * in the timezone the user was standing in, which is what `dayKey` computes and
 * what makes a 23:40 session appear on the right square.
 */

import type { CompletedWorkout } from './completedWorkout';

/** One cell. `day` is null for the leading blanks before the 1st. */
export interface CalendarCell {
  /** Day of the month, or null for padding. */
  day: number | null;
  /** How many workouts started that day. 0 = an untrained day. */
  workouts: number;
  /** ISO date of the day, for an accessibility label. Null for padding. */
  date: string | null;
}

export interface CalendarMonth {
  year: number;
  /** 0-based, as `Date` uses it. */
  month: number;
  /** "September 2026". */
  label: string;
  /** Weeks of seven cells, Monday first, padded at the start only. */
  weeks: CalendarCell[][];
  /** Workouts in this month. */
  total: number;
  /** Days in this month with at least one workout. */
  daysTrained: number;
}

const MONTH_NAMES = [
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

/** Monday-first weekday index: Mon = 0 … Sun = 6. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** `YYYY-MM-DD` in LOCAL time — the day the user was standing in. */
export function dayKey(at: string | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * How many workouts started on each local day, keyed by `YYYY-MM-DD`.
 *
 * Built once and shared by every month the user scrolls through, because the whole
 * log is a few thousand rows and rebuilding the index per month would walk it again
 * on every swipe.
 */
export function workoutsByDay(workouts: readonly CompletedWorkout[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const workout of workouts) {
    const key = dayKey(workout.startedAt);
    if (key === '') continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * One month's grid.
 *
 * Padded at the START only. A trailing pad to fill the last row would draw empty
 * squares for days that have not happened yet, which reads as untrained rather than
 * as future — so the last week is simply short, and the grid is left-aligned.
 */
export function monthGrid(
  year: number,
  month: number,
  byDay: Record<string, number>,
): CalendarMonth {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayIndex(first);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < lead; i += 1) cells.push({ day: null, workouts: 0, date: null });

  let total = 0;
  let daysTrained = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dayKey(new Date(year, month, day));
    const workouts = byDay[key] ?? 0;
    total += workouts;
    if (workouts > 0) daysTrained += 1;
    cells.push({ day, workouts, date: key });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    year,
    month,
    label: `${MONTH_NAMES[month]} ${year}`,
    weeks,
    total,
    daysTrained,
  };
}

/**
 * The months worth showing, newest first: every month from the first workout to
 * this one.
 *
 * GAPS INCLUDED. A month with no training in it is a fact about the log and the
 * most interesting thing on the screen — skipping the empty ones would draw a
 * calendar with no gaps in it, which is the one thing a calendar is for.
 *
 * Capped, because a log imported from a decade of training should not build a
 * hundred and twenty grids to render three.
 */
export function trainingMonths(
  workouts: readonly CompletedWorkout[],
  now: Date = new Date(),
  limit = 24,
): CalendarMonth[] {
  const byDay = workoutsByDay(workouts);

  let earliest = now;
  for (const workout of workouts) {
    const at = new Date(workout.startedAt);
    if (Number.isFinite(at.getTime()) && at < earliest) earliest = at;
  }

  const months: CalendarMonth[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const floor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

  while (cursor >= floor && months.length < limit) {
    months.push(monthGrid(cursor.getFullYear(), cursor.getMonth(), byDay));
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return months;
}

/** "8 workouts · 7 days" — the month's header line, or null for an empty month. */
export function describeMonth(month: CalendarMonth): string | null {
  if (month.total === 0) return null;
  const workouts = `${month.total} ${month.total === 1 ? 'workout' : 'workouts'}`;
  // Only when they differ: "8 workouts · 8 days" states the same thing twice.
  if (month.daysTrained === month.total) return workouts;
  return `${workouts} · ${month.daysTrained} days`;
}

/** The column headings, Monday first. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
