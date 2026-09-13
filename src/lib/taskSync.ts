/**
 * The seam between the three sections — what a finished workout and a recorded
 * amount do to the day's task list.
 *
 * This is the feature that makes one app out of three, and it is four lines of rule:
 *
 *  1. A workout finished on a day TICKS that day's workout task.
 *  2. An amount recorded against a day TICKS that day's expense task.
 *  3. If the day has no such task, ONE IS CREATED and immediately ticked.
 *  4. It happens on the date of the THING, never the date the app noticed.
 *
 * Rule 3 is the one worth stating out loud. The obvious alternative — do nothing
 * when there is no task — makes the feature invisible exactly when it would be most
 * useful: the first time you train after installing, which is the day you would most
 * like to see a tick. The created task is a normal task afterwards: renameable,
 * reschedulable, deletable. Rule 4 is what makes back-dating a transaction correct
 * rather than a lie — recording Tuesday's taxi on Thursday ticks Tuesday.
 *
 * `auto` is matched on the FIRST non-archived task carrying it, so a user who wants
 * their own wording just renames the one that exists rather than ending up with two.
 *
 * Pure, and deliberately: the store turns the plan into writes, the tests check the
 * plan. Ids come in as a parameter for the same reason — a function that calls a
 * random generator is a function you cannot assert on.
 */

import { nextOrder } from './tasks';
import type { DailyTask, TaskAuto } from '../types/tasks';

/** The wording a task gets when the app has to invent one. */
export const AUTO_TASK_DEFAULTS: Record<TaskAuto, { name: string; mark: string }> = {
  workout: { name: 'Workout', mark: 'WO' },
  expense: { name: 'Track expenses', mark: 'TE' },
};

/** Either an existing task to tick, or a whole task to add and then tick. */
export type AutoTickPlan = { kind: 'tick'; taskId: string } | { kind: 'create'; task: DailyTask };

/**
 * What ticking `source` should write. The DAY is the store's business: the plan is
 * about which task, and the same plan serves whichever date the caller is ticking.
 *
 * A created task is `daily`: the alternative — a one-off pinned to the day — buries a
 * new row in the list on every training day, and "did I train today" is a question
 * about every day whether or not the answer is yes.
 */
export function planAutoTick(
  tasks: readonly DailyTask[],
  source: TaskAuto,
  newId: string,
  now: string,
): AutoTickPlan {
  const existing = tasks.find((task) => task.auto === source && !task.isArchived);
  if (existing) return { kind: 'tick', taskId: existing.id };

  const defaults = AUTO_TASK_DEFAULTS[source];
  return {
    kind: 'create',
    task: {
      id: newId,
      name: defaults.name,
      mark: defaults.mark,
      schedule: 'daily',
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      auto: source,
      order: nextOrder(tasks),
      isArchived: false,
      createdAt: now,
    },
  };
}
