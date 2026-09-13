/**
 * What the phone should say, and when — computed, not scheduled.
 *
 *   Gym / Boxing        Mon · Wed · Fri   07:00   →  3 weekly alerts
 *   Read before sleep   Every day         22:30   →  1 daily alert
 *   Wash the dishes     Once · 14 Sep     09:00   →  1 dated alert
 *   the workout itself  Mon · Wed · Fri   18:00   →  3 weekly alerts
 *
 * ── WHY THE PLAN IS A PURE FUNCTION AND THE SCHEDULING IS NOT HERE ────────
 *
 * `lib/notify.ts` talks to Android. Everything it does can fail, none of it may
 * throw, and none of it can be tested without a phone — which is exactly the
 * wrong place for the decisions. WHICH tasks get an alert, on which days, at
 * what instant, in which language, and which ones are silently dropped because
 * their moment has passed: all of that is arithmetic over data the app already
 * has, and it is all here, where a test can read it.
 *
 * The result is a list of `PlannedReminder`s with stable ids. `syncReminders`
 * then does the dullest possible thing with it — cancel what this app scheduled,
 * schedule the plan — and because the plan is deterministic, two syncs in a row
 * with nothing changed produce the same alerts at the same instants.
 *
 * ── REPEATING WHERE IT CAN BE, DATED WHERE IT MUST BE ─────────────────────
 *
 * A daily or weekly trigger is handed to Android ONCE and then fires forever,
 * with the app closed, force-stopped, or never opened again. That is the only
 * behaviour a habit reminder can have: a scheme that re-arms the next fortnight
 * every time the app launches is a scheme that goes quiet exactly when somebody
 * has stopped opening the app, which is the week the reminder was for.
 *
 * A ONE-DAY task cannot be a repeat — it is one instant — so it gets a dated
 * alert, and one whose instant has already gone gets nothing rather than an
 * alert about a moment in the past.
 *
 * ── A TASK THAT HAS NOT STARTED YET GETS NOTHING, YET ─────────────────────
 *
 * Android's weekly trigger has no "not before" — it is a weekday and a time.
 * A habit set to begin on the 1st of next month would therefore start buzzing
 * this Monday, which is the app contradicting the date the user just typed.
 * So a task whose `startedOn` is still in the future contributes no alert, and
 * picks one up at the next sync after it begins. Sync runs on every launch and
 * every return to the foreground, so "the next sync" is the first time the user
 * so much as looks at the phone — and somebody who scheduled a habit to start
 * next month will open this app before next month.
 */

import { parseClockTime, parseDay } from './days';
import { t, type Language } from './i18n';
import { asksOn, describeSchedule, type Task, type Weekday } from './tasks';

/** When an alert fires. Two repeat forever; the third is one instant. */
export type ReminderTrigger =
  | { kind: 'daily'; hour: number; minute: number }
  /** Monday = 0 … Sunday = 6, as the whole app counts. */
  | { kind: 'weekly'; weekday: Weekday; hour: number; minute: number }
  /** Epoch ms. For the one-day tasks, which are not a repeat. */
  | { kind: 'date'; at: number };

export interface PlannedReminder {
  /**
   * Stable across syncs for the same task and the same day of the week.
   *
   * It is the notification's identifier, which is what makes a re-sync a
   * REPLACEMENT rather than a duplicate: scheduling `task:t7:w2` again overwrites
   * the one already sitting in Android's queue instead of adding a second alert
   * for the same task at the same minute.
   */
  id: string;
  title: string;
  body: string;
  trigger: ReminderTrigger;
}

export interface ReminderInputs {
  tasks: readonly Task[];
  workout: {
    enabled: boolean;
    days: readonly Weekday[];
    /** `HH:MM`, 24-hour. */
    time: string;
  };
  lang: Language;
  /** Now, for deciding which dated alerts have already gone. */
  now: Date;
}

/** Anything closer than this is not a cue, it is a notification about the past. */
const MIN_LEAD_MS = 30_000;

/**
 * The whole plan: every alert this app wants Android to be holding.
 *
 * Deterministic and total — an unreadable time, an archived task, a one-day task
 * whose day was last week all fall out quietly rather than producing an alert
 * that cannot fire.
 */
export function planReminders(input: ReminderInputs): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const todayKey = dayKeyOf(input.now);

  for (const task of input.tasks) {
    if (task.archivedAt !== null) continue;
    const at = task.reminder;
    if (!at) continue;

    /*
     * The TASK'S OWN NAME is the headline, and the schedule is the second line.
     *
     * Not "Reminder: wash the dishes" — the notification shade is a list of
     * one-line headlines and the useful half has to be the half that is read.
     * The body says which commitment it is ("Every day", "Mon · Wed · Fri"), so
     * a buzz at 07:00 is legible without opening anything.
     */
    const title = task.name;
    const body = describeSchedule(task.schedule, input.lang);

    if (task.schedule.kind === 'once') {
      const fireAt = instantOn(task.schedule.day, at.hour, at.minute);
      // Already gone: a phone buzzing about yesterday's dishes is worse than
      // silence, and it is the only thing a past instant could produce.
      if (fireAt == null || fireAt - input.now.getTime() < MIN_LEAD_MS) continue;
      plan.push({
        id: `task:${task.id}:once`,
        title,
        body,
        trigger: { kind: 'date', at: fireAt },
      });
      continue;
    }

    // Not begun yet — see the file header on why this is nothing rather than a
    // weekly alert that would start early.
    if (task.startedOn > todayKey) continue;

    if (task.schedule.kind === 'daily') {
      plan.push({
        id: `task:${task.id}:daily`,
        title,
        body,
        trigger: { kind: 'daily', hour: at.hour, minute: at.minute },
      });
      continue;
    }

    for (const weekday of [...task.schedule.days].sort((a, b) => a - b)) {
      plan.push({
        id: `task:${task.id}:w${weekday}`,
        title,
        body,
        trigger: { kind: 'weekly', weekday, hour: at.hour, minute: at.minute },
      });
    }
  }

  if (input.workout.enabled && input.workout.days.length > 0) {
    const at = parseClockTime(input.workout.time);
    if (at) {
      for (const weekday of [...input.workout.days].sort((a, b) => a - b)) {
        plan.push({
          id: `workout:w${weekday}`,
          title: t('Time to train', input.lang),
          body: t('Workout reminder', input.lang),
          trigger: { kind: 'weekly', weekday, hour: at.hour, minute: at.minute },
        });
      }
    }
  }

  return plan;
}

/**
 * How many alerts a plan holds, and how many tasks are speaking.
 *
 * Read by the settings screen, so "3 reminders" is a fact taken from the same
 * function that produces them rather than a second count that can disagree.
 */
export function countReminders(plan: readonly PlannedReminder[]): {
  alerts: number;
  subjects: number;
} {
  const subjects = new Set(plan.map((reminder) => reminder.id.split(':').slice(0, 2).join(':')));
  return { alerts: plan.length, subjects: subjects.size };
}

/** The tasks that would speak, for a settings screen that wants to name them. */
export function speakingTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((task) => task.archivedAt === null && task.reminder !== null);
}

/**
 * Does this task ask on the day its reminder would land on?
 *
 * A sanity check rather than a scheduler input: `planReminders` derives the days
 * FROM the schedule, so the two cannot disagree — and this is the assertion that
 * keeps it that way if either ever grows a special case.
 */
export function reminderMatchesSchedule(task: Task, day: string): boolean {
  return asksOn(task, day);
}

/* ------------------------------------------------------------------ */

/** Local midnight-based `YYYY-MM-DD`, without importing the day module's Date path. */
function dayKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `2026-09-14` + 09:00 → epoch ms in LOCAL time, or null for a junk day. */
export function instantOn(day: string, hour: number, minute: number): number | null {
  const date = parseDay(day);
  if (!date) return null;
  date.setHours(hour, minute, 0, 0);
  const at = date.getTime();
  return Number.isFinite(at) ? at : null;
}
