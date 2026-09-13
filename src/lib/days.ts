/**
 * Days, as the app counts them.
 *
 * Three logs now hang off a calendar — training, tasks and money — and all three
 * need the same two things: a stable name for "the day the user was standing in",
 * and arithmetic on it that survives a month boundary and a daylight-saving jump.
 * This is that, and nothing else: no domain, no formatting opinions beyond the
 * strings the screens actually print.
 *
 * ── THE KEY IS LOCAL, AND IT IS A STRING ──────────────────────────────────
 *
 * `YYYY-MM-DD` in LOCAL time. Local because a 23:40 workout, a task ticked at
 * midnight and a taxi paid for on the way home all belong to the day the person
 * lived, not to whatever UTC thought at the time. A string because it sorts
 * lexicographically, compares with `<`, and is a valid object key — which is what
 * lets a whole month of task marks be a plain record with no index to rebuild.
 *
 * Arithmetic goes through `Date` rather than adding 86,400,000 ms, because two
 * days a year are not 24 hours long and the bug that produces is a square in the
 * wrong column once every spring.
 */

/** `YYYY-MM-DD` in LOCAL time — the day the user was standing in. */
export function dayKey(at: string | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` → a LOCAL midnight `Date`, or null if it is not a real date. */
export function parseDay(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Rejects 2026-02-31, which `Date` would happily roll into March.
  return dayKey(date) === key ? date : null;
}

/** The day `offset` days after `key`. */
export function shiftDay(key: string, offset: number): string {
  const date = parseDay(key);
  if (!date) return key;
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}

/** Days apart, `to` minus `from`, clamped at zero. */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Monday-first weekday index: Mon = 0 … Sun = 6. Weeks start on Monday everywhere. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** The Monday of the week `day` falls in. */
export function weekStart(day: string): string {
  const date = parseDay(day);
  if (!date) return day;
  date.setDate(date.getDate() - weekdayIndex(date));
  return dayKey(date);
}

/** The Sunday of the week `day` falls in. */
export function weekEnd(day: string): string {
  return shiftDay(weekStart(day), 6);
}

export const MONTH_NAMES = [
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
] as const;

/** The column headings, Monday first. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "September 2026". `month` is 0-based, as `Date` uses it. */
export function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** "12 September 2026". */
export function formatLongDay(key: string): string {
  const date = parseDay(key);
  if (!date) return key;
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 September" — the year left off, for rows already inside a month. */
export function formatShortDay(key: string): string {
  const date = parseDay(key);
  if (!date) return key;
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}
