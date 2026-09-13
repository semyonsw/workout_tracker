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

import type { Language } from './i18n';

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

/**
 * The Russian months, TWICE, because the language declines them and the app
 * prints both cases.
 *
 * `Сентябрь 2026` is a heading — the month named, nominative. `12 сентября` is a
 * date — the month in the genitive, because the day is what the phrase is about.
 * One table would make one of those two wrong on every screen that shows it, and
 * "12 Сентябрь" is the kind of wrong that reads as a machine wrote it.
 */
export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

/** The same twelve in the genitive, for `12 сентября`. */
export const MONTH_NAMES_RU_OF = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/** The column headings, Monday first. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export const WEEKDAY_INITIALS_RU = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'] as const;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const WEEKDAY_LABELS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_NAMES_RU = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

/**
 * The tables for one language.
 *
 * `lang` defaults to English on every formatter below, which is what makes this
 * change additive: a caller that has not been translated yet keeps printing
 * exactly what it printed before.
 */
export function weekdayLabels(lang: Language = 'en'): readonly string[] {
  return lang === 'ru' ? WEEKDAY_LABELS_RU : WEEKDAY_LABELS;
}

export function weekdayInitials(lang: Language = 'en'): readonly string[] {
  return lang === 'ru' ? WEEKDAY_INITIALS_RU : WEEKDAY_INITIALS;
}

export function weekdayNames(lang: Language = 'en'): readonly string[] {
  return lang === 'ru' ? WEEKDAY_NAMES_RU : WEEKDAY_NAMES;
}

/** "September 2026" / "Сентябрь 2026". `month` is 0-based, as `Date` uses it. */
export function formatMonth(year: number, month: number, lang: Language = 'en'): string {
  const names = lang === 'ru' ? MONTH_NAMES_RU : MONTH_NAMES;
  return `${names[month]} ${year}`;
}

/** "12 September 2026" / "12 сентября 2026". */
export function formatLongDay(key: string, lang: Language = 'en'): string {
  const date = parseDay(key);
  if (!date) return key;
  const names = lang === 'ru' ? MONTH_NAMES_RU_OF : MONTH_NAMES;
  return `${date.getDate()} ${names[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 September" — the year left off, for rows already inside a month. */
export function formatShortDay(key: string, lang: Language = 'en'): string {
  const date = parseDay(key);
  if (!date) return key;
  const names = lang === 'ru' ? MONTH_NAMES_RU_OF : MONTH_NAMES;
  return `${date.getDate()} ${names[date.getMonth()]}`;
}

/**
 * `HH:MM` on a 24-hour clock, from a number of hours and minutes.
 *
 * Twenty-four hours and no AM/PM anywhere in the app: the wheel the user sets a
 * reminder on runs 00–23, and a 12-hour label beside a 24-hour picker is two
 * clocks disagreeing on one screen.
 */
export function formatClockTime(hour: number, minute: number): string {
  return `${pad(clampHour(hour))}:${pad(clampMinute(minute))}`;
}

export function clampHour(hour: number): number {
  return Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : 0;
}

export function clampMinute(minute: number): number {
  return Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : 0;
}

/** `"07:30"` → `{ hour: 7, minute: 30 }`. Anything else → null. */
export function parseClockTime(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
