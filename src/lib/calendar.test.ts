import { describe, expect, it } from 'vitest';

import {
  dayKey,
  describeMonth,
  monthGrid,
  trainingMonths,
  WEEKDAY_INITIALS,
  workoutsByDay,
} from './calendar';
import type { CompletedWorkout } from './completedWorkout';

/**
 * The training calendar.
 *
 * A record, not a streak — see the file header. These tests pin the four things
 * that make it readable: weeks start on Monday, months run OLDEST FIRST so the
 * current one is last, empty months are rendered rather than skipped, and a day
 * belongs to the LOCAL date it started on.
 */

let seq = 0;
/** A workout that started at a local date/time. */
function workout(year: number, month: number, day: number, hour = 10): CompletedWorkout {
  seq += 1;
  const startedAt = new Date(year, month, day, hour).toISOString();
  return {
    id: `w${seq}`,
    title: 'Pull',
    startedAt,
    endedAt: startedAt,
    durationMinutes: 60,
    setCount: 12,
    totalVolumeKg: 3000,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
  };
}

describe('the grid', () => {
  it('starts weeks on Monday, because a training week does', () => {
    expect(WEEKDAY_INITIALS).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);

    // 1 September 2026 is a Tuesday, so exactly one leading blank.
    const month = monthGrid(2026, 8, {});
    expect(month.weeks[0][0].day).toBeNull();
    expect(month.weeks[0][1].day).toBe(1);
  });

  it('pads only at the start — the last week is short, not full of blanks', () => {
    /*
     * A trailing pad would draw empty squares for days that have not happened yet,
     * which reads as untrained rather than as future.
     */
    const month = monthGrid(2026, 8, {});
    const last = month.weeks[month.weeks.length - 1];
    expect(last.every((cell) => cell.day != null)).toBe(true);
    expect(last.length).toBeLessThanOrEqual(7);
  });

  it('covers every day of the month exactly once', () => {
    for (const [year, m, days] of [
      [2026, 8, 30],
      [2026, 1, 28],
      [2024, 1, 29],
      [2026, 0, 31],
    ] as const) {
      const grid = monthGrid(year, m, {});
      const numbered = grid.weeks.flat().filter((cell) => cell.day != null);
      expect(numbered).toHaveLength(days);
      expect(numbered.map((cell) => cell.day)).toEqual(
        Array.from({ length: days }, (_, i) => i + 1),
      );
    }
  });

  it('fills the days that have workouts, and counts them', () => {
    const workouts = [workout(2026, 8, 3), workout(2026, 8, 5), workout(2026, 8, 5)];
    const grid = monthGrid(2026, 8, workoutsByDay(workouts));

    const filled = grid.weeks.flat().filter((cell) => cell.workouts > 0);
    expect(filled.map((cell) => cell.day)).toEqual([3, 5]);
    expect(grid.total).toBe(3);
    // Two workouts on one day is one day trained.
    expect(grid.daysTrained).toBe(2);
  });
});

describe('the day a workout belongs to', () => {
  it('is the LOCAL date it started on', () => {
    // A 23:40 session must land on that evening's square, not the next morning's.
    const late = workout(2026, 8, 3, 23);
    expect(dayKey(late.startedAt)).toBe('2026-09-03');
  });

  it('is empty for a date that cannot be read', () => {
    expect(dayKey('not a date')).toBe('');
    // ...and such a workout is simply not counted anywhere.
    expect(workoutsByDay([{ ...workout(2026, 8, 3), startedAt: 'nonsense' }])).toEqual({});
  });
});

describe('which months are shown', () => {
  it('is every month from the first workout to now, gaps included', () => {
    /*
     * The gaps are the only thing on the screen that tells you something you did
     * not already know — a calendar with no empty months in it is not a calendar.
     */
    const months = trainingMonths([workout(2026, 5, 10)], new Date(2026, 8, 2));
    expect(months.map((m) => m.label)).toEqual([
      'June 2026',
      'July 2026',
      'August 2026',
      'September 2026',
    ]);
    // June holds the workout; July is one of the empty months in between.
    expect(months[0].total).toBe(1);
    expect(months[1].total).toBe(0);
  });

  it('runs OLDEST FIRST, so this month is the last thing in the list', () => {
    /*
     * The exception to the app's newest-first rule, and the reason the screen opens
     * scrolled to the bottom: a calendar is read rather than scanned, and running it
     * backwards puts the 30th of one month directly above the 1st of the next.
     */
    const months = trainingMonths([workout(2026, 6, 1)], new Date(2026, 8, 2));
    expect(months[0].label).toBe('July 2026');
    expect(months.at(-1)?.label).toBe('September 2026');
  });

  it('is just this month for an empty log', () => {
    const months = trainingMonths([], new Date(2026, 8, 2));
    expect(months).toHaveLength(1);
    expect(months[0].total).toBe(0);
  });

  it('is capped, so a decade of imported history does not build 120 grids', () => {
    const months = trainingMonths([workout(2010, 0, 1)], new Date(2026, 8, 2), 24);
    expect(months).toHaveLength(24);
    /*
     * ...and the cap keeps the RECENT months. Capping a chronological walk would
     * keep 2010 and drop this year, which is why the walk runs backwards and the
     * reversal happens at the end.
     */
    expect(months.at(-1)?.label).toBe('September 2026');
    expect(months[0].label).toBe('October 2024');
  });
});

describe('the month header', () => {
  it('states the workouts, and the days only when they differ', () => {
    const twoInADay = monthGrid(
      2026,
      8,
      workoutsByDay([workout(2026, 8, 3), workout(2026, 8, 3), workout(2026, 8, 6)]),
    );
    expect(describeMonth(twoInADay)).toBe('3 workouts · 2 days');

    const oneEach = monthGrid(2026, 8, workoutsByDay([workout(2026, 8, 3), workout(2026, 8, 6)]));
    // "2 workouts · 2 days" states the same thing twice.
    expect(describeMonth(oneEach)).toBe('2 workouts');
  });

  it('is null for a month with nothing in it', () => {
    expect(describeMonth(monthGrid(2026, 8, {}))).toBeNull();
  });

  it('does not pluralise a single workout', () => {
    expect(describeMonth(monthGrid(2026, 8, workoutsByDay([workout(2026, 8, 3)])))).toBe(
      '1 workout',
    );
  });
});
