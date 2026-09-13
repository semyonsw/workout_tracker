/**
 * Daily tasks — the shapes the Tasks side of the app is made of.
 *
 * A task is a thing that is supposed to happen on a day. That is all it is: there
 * is no habit score, no strength curve and no compounding streak multiplier here,
 * because the number this app already trusts is the one it can prove — you did it
 * or you did not, on a date.
 *
 * ── SCHEDULES ARE THREE, NOT A GRAMMAR ─────────────────────────────────────
 *
 *   daily     every day
 *   weekdays  the weekdays in `activeWeekdays` (0 = Sunday, matching `getDay`)
 *   once      exactly `date`, and then it is history
 *
 * The habit tracker this data came from had `fixed`, `specific_weekdays`,
 * `specific_month_days` and an `excludedWeekdays` list that had to agree with an
 * `activeWeekdays` list. Two lists that must be each other's complement is a bug
 * with a schema; one list and a mode is the same expressiveness with nothing to
 * keep in step.
 *
 * ── AUTO ───────────────────────────────────────────────────────────────────
 *
 * `auto` is what makes this app one app rather than three. A task marked `workout`
 * is ticked by FINISHING A WORKOUT, and one marked `expense` by recording a
 * transaction — on the date the thing happened, not the date the app noticed. The
 * user never ticks those by hand, and if the day has no such task yet, one is
 * created (see `lib/taskSync.ts`): a day you trained is a day the workout task was
 * done, whether or not you had planned it that morning.
 *
 * ── THE LOG IS A MAP, NOT ROWS ─────────────────────────────────────────────
 *
 * `TaskLog` is `taskId → dayKey → boolean`, which is the shape the imported
 * history already had and the shape every question the Tasks screen asks wants:
 * "is this done today" is two lookups, and a month grid for one task is one object.
 * `false` is a real value and is NOT the same as missing — it is the record of a
 * day that was explicitly marked not done, which is what the notes hang off.
 */

import type { ID } from './models';

export type TaskSchedule = 'daily' | 'weekdays' | 'once';

/** What ticks a task without the user: a finished workout, or a recorded amount. */
export type TaskAuto = 'workout' | 'expense';

export interface DailyTask {
  id: ID;
  name: string;
  /** Two characters for the month grid, where a name does not fit. */
  mark: string;
  schedule: TaskSchedule;
  /** 0 = Sunday … 6 = Saturday. Read only when `schedule` is `weekdays`. */
  activeWeekdays: number[];
  /** `YYYY-MM-DD`. Read only when `schedule` is `once`. */
  date?: string;
  auto?: TaskAuto;
  order: number;
  isArchived: boolean;
  createdAt: string;
}

/** `taskId → dayKey → done`. See the header on why `false` is not absence. */
export type TaskLog = Record<ID, Record<string, boolean>>;

/** `taskId → dayKey → note`. Why a day went the way it did, in the user's words. */
export type TaskNotes = Record<ID, Record<string, string>>;
