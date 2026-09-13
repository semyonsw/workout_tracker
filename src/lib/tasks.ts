/**
 * The task maths — scheduling, streaks and the month grid, as pure functions.
 *
 * No store, no clock, no DOM. The day being asked about is always a parameter, which
 * is what lets the whole Tasks section be tested against a fixed calendar — and what
 * keeps "yesterday" from meaning something different at 00:30 than it does at 23:00.
 *
 * ── A DAY IS PLANNED OR IT IS NOT ──────────────────────────────────────────
 *
 * Everything here rests on `isScheduled`. A task that is not scheduled on a day is
 * absent from that day: not pending, not skipped, not a zero in the ratio. That is
 * the difference between "I did 6 of 8 today" and "I did 6 of 11 today, three of
 * which were never today's problem" — and it is the reason the imported gym task,
 * which runs three days a week, does not drag every Monday's figure down.
 */

import { addDays, weekdayOf } from './money';
import type { DailyTask, TaskLog } from '../types/tasks';
import type { ID } from '../types/models';

/** Is this task supposed to happen on this day? */
export function isScheduled(task: DailyTask, dayKey: string): boolean {
  if (task.isArchived) return false;
  switch (task.schedule) {
    case 'daily':
      return true;
    case 'weekdays':
      return task.activeWeekdays.includes(weekdayOf(dayKey));
    case 'once':
      return task.date === dayKey;
  }
}

/** The day's list, in the user's order. */
export function tasksForDay(tasks: readonly DailyTask[], dayKey: string): DailyTask[] {
  return tasks.filter((task) => isScheduled(task, dayKey)).sort((a, b) => a.order - b.order);
}

/** Done, not done, or never answered. `undefined` is a day nobody has said anything about. */
export function statusOf(log: TaskLog, taskId: ID, dayKey: string): boolean | undefined {
  return log[taskId]?.[dayKey];
}

export function isDone(log: TaskLog, taskId: ID, dayKey: string): boolean {
  return log[taskId]?.[dayKey] === true;
}

/** How much of a day is behind you. `planned` counts only what the day actually asks for. */
export function dayProgress(
  tasks: readonly DailyTask[],
  log: TaskLog,
  dayKey: string,
): { done: number; planned: number } {
  const planned = tasksForDay(tasks, dayKey);
  let done = 0;
  for (const task of planned) if (isDone(log, task.id, dayKey)) done += 1;
  return { done, planned: planned.length };
}

/**
 * Consecutive scheduled days completed, ending at `dayKey`.
 *
 * TODAY IS A GRACE DAY. A streak that resets at midnight and only rebuilds when you
 * tick the box would read `0` every morning, which is both true and useless: the
 * question the number answers is "how long have I been keeping this up", and the
 * answer at 9am is not zero because the day is not over. So an unfinished CURRENT
 * day is skipped rather than counted as a break; any earlier scheduled day that is
 * not done ends the run.
 *
 * Bounded at two years of walking back, because an unbroken streak and a corrupt log
 * look identical from inside a loop.
 */
export function streakOf(task: DailyTask, log: TaskLog, dayKey: string): number {
  let streak = 0;
  let cursor = dayKey;
  for (let i = 0; i < 730; i += 1) {
    if (isScheduled(task, cursor)) {
      if (isDone(log, task.id, cursor)) streak += 1;
      else if (cursor !== dayKey) break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** One cell per day of a month: was it asked for, and was it done. */
export interface MonthCell {
  dayKey: string;
  day: number;
  scheduled: boolean;
  status: boolean | undefined;
}

/** The month grid for one task. `monthKey` is `YYYY-MM`. */
export function monthCells(task: DailyTask, log: TaskLog, monthKey: string): MonthCell[] {
  const [year, month] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = [];
  for (let day = 1; day <= last; day += 1) {
    const dayKey = `${monthKey}-${`${day}`.padStart(2, '0')}`;
    cells.push({
      dayKey,
      day,
      scheduled: isScheduled(task, dayKey),
      status: statusOf(log, task.id, dayKey),
    });
  }
  return cells;
}

/** Done out of asked-for, across a whole month. The number under the grid. */
export function monthScore(
  task: DailyTask,
  log: TaskLog,
  monthKey: string,
): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const cell of monthCells(task, log, monthKey)) {
    if (!cell.scheduled) continue;
    planned += 1;
    if (cell.status === true) done += 1;
  }
  return { done, planned };
}

/** The order a newly added task takes: the end of the list. */
export function nextOrder(tasks: readonly DailyTask[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.order + 1), 0);
}

/** `Mon`, `Tue`, … for the weekday chips. Index is `getDay`'s. */
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** `Every day`, `Mon · Wed · Fri`, `Once, 12 September` — what a row says under its name. */
export function describeSchedule(task: DailyTask): string {
  if (task.schedule === 'daily') return 'Every day';
  if (task.schedule === 'once') return task.date ? `Once · ${task.date}` : 'Once';
  if (task.activeWeekdays.length === 0) return 'No days';
  if (task.activeWeekdays.length === 7) return 'Every day';
  return [...task.activeWeekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES[d])
    .join(' · ');
}

/** Two upper-case characters out of a name, for the month grid's row label. */
export function markFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
