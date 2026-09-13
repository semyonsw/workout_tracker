import { describe, expect, it } from 'vitest';

import {
  clampHour,
  clampMinute,
  formatClockTime,
  formatLongDay,
  formatMonth,
  parseClockTime,
} from './days';

/**
 * The clock helpers, and the two Russian month tables.
 *
 * `days.ts` is mostly date arithmetic that the calendar suites already exercise
 * from above. What is pinned here is the part with no other caller to catch it:
 * a reminder's `HH:MM` goes to disk, comes back through a sanitizer, and is then
 * handed to Android as an alarm — so a parse that disagrees with the formatter
 * by one case is a notification at the wrong hour, or none at all.
 */

describe('a wall-clock time', () => {
  it('round-trips through every minute of the day', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 1) {
        expect(parseClockTime(formatClockTime(hour, minute))).toEqual({ hour, minute });
      }
    }
  });

  it('always formats to two digits and two colons-worth of width', () => {
    expect(formatClockTime(7, 5)).toBe('07:05');
    expect(formatClockTime(23, 59)).toBe('23:59');
    expect(formatClockTime(0, 0)).toBe('00:00');
  });

  /*
   * REFUSED, not repaired. Everything that reaches this is either the wheel's
   * own output or a string out of a backup file, and a time nobody can read is
   * better answered with the default than with a guess about which half of
   * `7:5` was meant — the caller (`usableClockTime`) has a real answer to fall
   * back to and a wrong alarm hour has no way of announcing itself.
   */
  it('refuses anything that is not a 24-hour time', () => {
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('12:60')).toBeNull();
    expect(parseClockTime('7:5')).toBeNull();
    expect(parseClockTime('half six')).toBeNull();
    expect(parseClockTime('')).toBeNull();
    expect(parseClockTime(undefined)).toBeNull();
    expect(parseClockTime(700)).toBeNull();
    // A single-digit HOUR is fine — the minutes are what must be two wide.
    expect(parseClockTime('7:05')).toEqual({ hour: 7, minute: 5 });
  });

  it('clamps a number that could never be a time', () => {
    expect(clampHour(Number.NaN)).toBe(0);
    expect(clampHour(99)).toBe(23);
    expect(clampHour(-1)).toBe(0);
    expect(clampMinute(Number.NaN)).toBe(0);
    expect(clampMinute(61)).toBe(59);
  });
});

describe('the Russian dates', () => {
  // Two tables on purpose: a heading names the month, a date declines it.
  it('names a month for a heading and declines it for a date', () => {
    expect(formatMonth(2026, 8, 'ru')).toBe('Сентябрь 2026');
    expect(formatLongDay('2026-09-12', 'ru')).toBe('12 сентября 2026');
  });

  it('leaves English exactly as it was', () => {
    expect(formatMonth(2026, 8)).toBe('September 2026');
    expect(formatLongDay('2026-09-12')).toBe('12 September 2026');
  });
});
