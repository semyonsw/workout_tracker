/**
 * The daily log — what you said you would do, and what you did.
 *
 *   Morning Bible/Narek reading     Every day · 12 in a row
 *   Gym / Boxing                    Mon · Wed · Fri · auto
 *   Book reading before sleep       Every day · missed on purpose · travelling
 *
 * ── A STREAK HERE, AND NOT IN THE TRAINING LOG ─────────────────────────────
 *
 * `lib/calendar.ts` refuses to count a streak, and the reason it gives is that a
 * training streak turns "I was ill for a week" into a number going to zero. That
 * argument is about TRAINING, where the body decides and the log's only job is to
 * be honest about what happened. A habit is the other thing: the whole reason to
 * write "read before sleep" on a list is that the list pushes back, and a habit
 * list with nothing at stake is a to-do list that resets every night. So the
 * streak stays — and the escape hatch that makes it honest comes with it.
 *
 * ── THREE ANSWERS, NOT TWO ────────────────────────────────────────────────
 *
 * A day is `done`, `missed` ON PURPOSE, or UNANSWERED, and the third is not a
 * synonym for the second. Unanswered is a day nobody has judged yet — today
 * before bedtime, or a Tuesday last week you never opened the app on. Missed is
 * a deliberate mark: *I chose not to, and I am saying so.*
 *
 * That deliberate mark is EXCUSED. It does not break the streak and it leaves
 * the denominator — nine rows on a day with one excused reads `5 of 8`, not
 * `5 of 9`. Otherwise the only way to keep a streak alive through a week of
 * travelling is to lie, and a log you have to lie to is a log you stop opening.
 * An UNANSWERED day in the past is the one that breaks a streak, because it is
 * the one where the day went by without you.
 *
 * ── AND `auto` ────────────────────────────────────────────────────────────
 *
 * Two tasks are ticked by the rest of the app rather than by a thumb: finishing a
 * workout ticks the training one, recording an amount ticks the money one. They
 * are still ordinary tasks — still tappable, still skippable — `auto` only says
 * that something else will get there first. See `lib/autoTick.ts`.
 *
 * Everything here is pure and local-time: a task belongs to the day you were
 * standing in, which is what `calendar.dayKey` computes.
 */

import {
  WEEKDAY_LABELS,
  dayKey,
  daysBetween,
  formatMonth,
  parseDay,
  shiftDay,
  weekdayIndex,
} from './days';
import type { ID } from '../types/models';

/** Monday = 0 … Sunday = 6, matching the Monday-first grid the app draws. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TaskSchedule = { kind: 'daily' } | { kind: 'weekdays'; days: readonly Weekday[] };

/** What the circle on the left of a row says. Absent = unanswered. */
export type TaskMark = 'done' | 'missed';

/** Which part of the app ticks this one without being asked. */
export type TaskAutoSource = 'workout' | 'money';

export interface Task {
  id: ID;
  name: string;
  schedule: TaskSchedule;
  auto: TaskAutoSource | null;
  /** The first day it asked for anything, `YYYY-MM-DD`. Days before it are blank. */
  startedOn: string;
  /** Archived tasks keep their history and leave the day list. */
  archivedAt: string | null;
  order: number;
}

/** A day's answer. A note can exist with no mark — a day you wrote on but never judged. */
export interface TaskEntry {
  mark: TaskMark | null;
  note: string;
}

/** `taskId` → `YYYY-MM-DD` → entry. Sparse: most days have no row at all. */
export type TaskLog = Record<ID, Record<string, TaskEntry>>;

const EMPTY_ENTRY: TaskEntry = { mark: null, note: '' };

/** Monday-first weekday index of a `YYYY-MM-DD`. */
export function weekdayOf(key: string): Weekday | null {
  const date = parseDay(key);
  if (!date) return null;
  return weekdayIndex(date) as Weekday;
}

/** Did this task ask for anything on this day? Before `startedOn`, nothing ever did. */
export function asksOn(task: Task, day: string): boolean {
  if (day < task.startedOn) return false;
  if (task.schedule.kind === 'daily') return true;
  const weekday = weekdayOf(day);
  return weekday !== null && task.schedule.days.includes(weekday);
}

export function entryOf(log: TaskLog, taskId: ID, day: string): TaskEntry {
  return log[taskId]?.[day] ?? EMPTY_ENTRY;
}

/** "Every day" · "Mon · Wed · Fri" · "Never" for a weekday list nobody picked. */
export function describeSchedule(schedule: TaskSchedule): string {
  if (schedule.kind === 'daily') return 'Every day';
  if (schedule.days.length === 0) return 'Never';
  const ordered = [...schedule.days].sort((a, b) => a - b);
  return ordered.map((day) => WEEKDAY_LABELS[day]).join(' · ');
}

/**
 * The streak: scheduled days in a row ending at the last one that was answered.
 *
 * Walks BACKWARDS from today. Today is skipped whatever it says, because a day
 * still being lived is not yet evidence either way — an unanswered today would
 * otherwise zero a streak every morning. Excused days are stepped over without
 * counting; the first unanswered past day stops the walk.
 *
 * Bounded by `startedOn`, so a task created yesterday cannot walk 2015.
 */
export function streakOf(task: Task, log: TaskLog, today: string): number {
  let streak = 0;
  // A ticked today is already part of the run it belongs to.
  if (asksOn(task, today) && entryOf(log, task.id, today).mark === 'done') streak += 1;

  let day = shiftDay(today, -1);
  // The walk is bounded by `startedOn`, and again by the span in case it is junk.
  let guard = ageInDays(task.startedOn, today) + 1;
  while (day >= task.startedOn && guard > 0) {
    if (asksOn(task, day)) {
      const { mark } = entryOf(log, task.id, day);
      if (mark === 'done') streak += 1;
      else if (mark !== 'missed') break;
    }
    day = shiftDay(day, -1);
    guard -= 1;
  }
  return streak;
}

export interface DayProgress {
  done: number;
  /** Scheduled today, less the ones excused on purpose. */
  total: number;
  /** 0–1, and 1 on a day that asked for nothing so the bar reads full rather than empty. */
  fraction: number;
}

/** "6 of 8 done" and the width of the bar above it. */
export function dayProgress(tasks: readonly Task[], log: TaskLog, day: string): DayProgress {
  let done = 0;
  let total = 0;
  for (const task of tasks) {
    if (!asksOn(task, day)) continue;
    const { mark } = entryOf(log, task.id, day);
    if (mark === 'missed') continue;
    total += 1;
    if (mark === 'done') done += 1;
  }
  return { done, total, fraction: total === 0 ? 1 : done / total };
}

/** The tasks that asked for something on a day, in their own order. */
export function tasksOn(tasks: readonly Task[], day: string): Task[] {
  return tasks
    .filter((task) => task.archivedAt === null && asksOn(task, day))
    .sort((a, b) => a.order - b.order);
}

/**
 * The faint second line of a row: schedule, streak, `auto`, then the day's note.
 *
 * The note goes LAST and the row clips at one line, so a long note is trimmed
 * rather than pushing the facts off the end.
 */
export function describeTaskRow(task: Task, log: TaskLog, day: string): string {
  const entry = entryOf(log, task.id, day);
  const parts: string[] = [describeSchedule(task.schedule)];
  const streak = streakOf(task, log, day);
  if (streak >= 2) parts.push(`${streak} in a row`);
  if (entry.mark === 'missed') parts.push('missed on purpose');
  if (task.auto) parts.push('auto');
  if (entry.note.trim() !== '') parts.push(entry.note.trim());
  return parts.join(' · ');
}

/** What a square in the month grid says. `blank` = the task never asked. */
export type TaskCellState = 'done' | 'missed' | 'unanswered' | 'blank';

export interface TaskCell {
  /** Day of the month, or null for the padding before the 1st. */
  day: number | null;
  date: string | null;
  state: TaskCellState;
  isToday: boolean;
}

export interface TaskMonth {
  year: number;
  /** 0-based, as `Date` uses it. */
  month: number;
  /** "September 2026". */
  label: string;
  /** Weeks of seven cells, Monday first, padded at the start only. */
  weeks: TaskCell[][];
  /** Days done this month. */
  done: number;
  /** Days it asked for, up to today, less the excused ones. */
  asked: number;
}

/**
 * One month of one task, as a grid.
 *
 * Padded at the start only, like the training calendar: a trailing pad would
 * draw squares for days that have not happened, which reads as missed rather
 * than as future. FUTURE days inside this month are `blank` for the same
 * reason — a day that has not arrived has not been skipped.
 */
export function taskMonth(
  task: Task,
  log: TaskLog,
  year: number,
  month: number,
  today: string,
): TaskMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayIndex(new Date(year, month, 1));

  const cells: TaskCell[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({ day: null, date: null, state: 'blank', isToday: false });
  }

  let done = 0;
  let asked = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dayKey(new Date(year, month, day));
    const isToday = date === today;
    let state: TaskCellState = 'blank';

    if (asksOn(task, date) && date <= today) {
      const { mark } = entryOf(log, task.id, date);
      state = mark === 'done' ? 'done' : mark === 'missed' ? 'missed' : 'unanswered';
      if (mark !== 'missed') asked += 1;
      if (mark === 'done') done += 1;
    }
    cells.push({ day, date, state, isToday });
  }

  const weeks: TaskCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, label: formatMonth(year, month), weeks, done, asked };
}

/** How many days apart two days are, for "since 4 January 2026" style copy. */
export function ageInDays(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to));
}
