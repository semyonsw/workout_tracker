import { describe, expect, it } from 'vitest';

import {
  type Task,
  type TaskLog,
  asksOn,
  dayProgress,
  describeSchedule,
  describeTaskRow,
  reorderWithinVisible,
  streakOf,
  summarizeTaskTrend,
  taskMonth,
  taskTrendSeries,
  tasksMonth,
  tasksOn,
} from './tasks';

/**
 * The daily log.
 *
 * These tests pin the one idea the whole feature rests on: MISSED ON PURPOSE and
 * UNANSWERED are different answers. An excused day steps out of the streak and
 * out of the denominator; a day that simply went by does neither. Get those two
 * confused and the app either grades you for being ill or lets you keep a streak
 * by never opening it.
 */

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Morning Bible/Narek reading',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    archivedAt: null,
    order: 0,
    ...over,
  };
}

/** `{ '2026-09-03': 'done' }` → a log. */
function log(
  taskId: string,
  marks: Record<string, 'done' | 'missed'>,
  notes: Record<string, string> = {},
): TaskLog {
  const days: Record<string, { mark: 'done' | 'missed' | null; note: string }> = {};
  for (const [day, mark] of Object.entries(marks)) days[day] = { mark, note: notes[day] ?? '' };
  for (const [day, note] of Object.entries(notes)) {
    if (!days[day]) days[day] = { mark: null, note };
  }
  return { [taskId]: days };
}

describe('what a task asks for', () => {
  it('asks every day, or only on the weekdays it names', () => {
    const daily = task();
    const mwf = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });

    // 2026-09-14 is a Monday, 15 a Tuesday, 16 a Wednesday.
    expect(asksOn(daily, '2026-09-15')).toBe(true);
    expect(asksOn(mwf, '2026-09-14')).toBe(true);
    expect(asksOn(mwf, '2026-09-15')).toBe(false);
    expect(asksOn(mwf, '2026-09-16')).toBe(true);
  });

  it('never asked for anything before it existed', () => {
    const late = task({ startedOn: '2026-09-10' });
    expect(asksOn(late, '2026-09-09')).toBe(false);
    expect(asksOn(late, '2026-09-10')).toBe(true);
  });

  it('names its schedule the way the row reads it', () => {
    expect(describeSchedule({ kind: 'daily' })).toBe('Every day');
    expect(describeSchedule({ kind: 'weekdays', days: [4, 0, 2] })).toBe('Mon · Wed · Fri');
  });

  it('leaves archived tasks out of the day', () => {
    const live = task();
    const gone = task({ id: 't2', archivedAt: '2026-09-05T00:00:00.000Z' });
    expect(tasksOn([live, gone], '2026-09-12').map((t) => t.id)).toEqual(['t1']);
  });
});

describe('the streak', () => {
  it('counts scheduled days in a row, ending yesterday', () => {
    const t = task();
    const marks = log('t1', {
      '2026-09-09': 'done',
      '2026-09-10': 'done',
      '2026-09-11': 'done',
      '2026-09-12': 'done',
    });
    expect(streakOf(t, marks, '2026-09-13')).toBe(4);
  });

  it('does not zero itself every morning just because today is unanswered', () => {
    const t = task();
    const marks = log('t1', { '2026-09-11': 'done', '2026-09-12': 'done' });
    expect(streakOf(t, marks, '2026-09-13')).toBe(2);
  });

  it('counts today once it is ticked', () => {
    const t = task();
    const marks = log('t1', { '2026-09-12': 'done', '2026-09-13': 'done' });
    expect(streakOf(t, marks, '2026-09-13')).toBe(2);
  });

  it('steps over a day missed on purpose without counting it', () => {
    const t = task();
    const marks = log('t1', {
      '2026-09-09': 'done',
      '2026-09-10': 'missed',
      '2026-09-11': 'done',
      '2026-09-12': 'done',
    });
    expect(streakOf(t, marks, '2026-09-13')).toBe(3);
  });

  it('breaks on a past day nobody answered', () => {
    const t = task();
    const marks = log('t1', {
      '2026-09-09': 'done',
      '2026-09-11': 'done',
      '2026-09-12': 'done',
    });
    // The 10th went by without an answer, so the run starts on the 11th.
    expect(streakOf(t, marks, '2026-09-13')).toBe(2);
  });

  it('ignores days the task never asked for', () => {
    // Mon · Wed · Fri: the Tuesday between two ticks is not a gap.
    const t = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    const marks = log('t1', {
      '2026-09-07': 'done',
      '2026-09-09': 'done',
      '2026-09-11': 'done',
    });
    expect(streakOf(t, marks, '2026-09-12')).toBe(3);
  });
});

describe('the day', () => {
  it('leaves an excused task out of the denominator', () => {
    const tasks = [
      task({ id: 'a', order: 0 }),
      task({ id: 'b', order: 1 }),
      task({ id: 'c', order: 2 }),
    ];
    const marks: TaskLog = {
      a: { '2026-09-13': { mark: 'done', note: '' } },
      b: { '2026-09-13': { mark: 'missed', note: 'travelling' } },
    };
    // Three scheduled, one skipped on purpose: one of two, not one of three.
    expect(dayProgress(tasks, marks, '2026-09-13')).toEqual({ done: 1, total: 2, fraction: 0.5 });
  });

  it('reads full on a day that asked for nothing', () => {
    expect(dayProgress([], {}, '2026-09-13').fraction).toBe(1);
  });

  it('puts the note last on the row, after the facts', () => {
    const t = task({ auto: 'money' });
    const marks = log(
      't1',
      { '2026-09-12': 'done', '2026-09-13': 'done' },
      { '2026-09-13': 'bus fare' },
    );
    expect(describeTaskRow(t, marks, '2026-09-13')).toBe(
      'Every day · 2 in a row · auto · bus fare',
    );
  });

  it('says nothing about a streak of one', () => {
    const t = task();
    const marks = log('t1', { '2026-09-13': 'done' });
    expect(describeTaskRow(t, marks, '2026-09-13')).toBe('Every day');
  });
});

describe('the month grid', () => {
  const t = task({ schedule: { kind: 'weekdays', days: [0, 2, 4] } });
  const marks = log('t1', { '2026-09-02': 'done', '2026-09-04': 'missed', '2026-09-07': 'done' });
  const month = taskMonth(t, marks, 2026, 8, '2026-09-13');

  it('starts on Monday and pads only at the front', () => {
    // 1 September 2026 is a Tuesday: one leading blank, and no trailing pad.
    expect(month.weeks[0][0].day).toBeNull();
    expect(month.weeks[0][1].day).toBe(1);
    expect(month.weeks[month.weeks.length - 1].some((cell) => cell.day === 30)).toBe(true);
  });

  it('draws a day the task never asked for as blank, not as missed', () => {
    const tuesday = month.weeks[0][1];
    expect(tuesday.day).toBe(1);
    expect(tuesday.state).toBe('blank');
  });

  it('separates done, missed and unanswered', () => {
    const cells = Object.fromEntries(
      month.weeks
        .flat()
        .filter((cell) => cell.date)
        .map((cell) => [cell.date, cell.state]),
    );
    expect(cells['2026-09-02']).toBe('done');
    expect(cells['2026-09-04']).toBe('missed');
    expect(cells['2026-09-09']).toBe('unanswered');
  });

  it('leaves the future blank — a day that has not arrived has not been skipped', () => {
    const cells = Object.fromEntries(
      month.weeks
        .flat()
        .filter((cell) => cell.date)
        .map((cell) => [cell.date, cell.state]),
    );
    expect(cells['2026-09-18']).toBe('blank');
  });

  it('rings today', () => {
    expect(
      month.weeks
        .flat()
        .filter((cell) => cell.isToday)
        .map((cell) => cell.day),
    ).toEqual([13]);
  });

  it('tallies asked days up to today, excused ones excluded', () => {
    // Mon/Wed/Fri up to the 13th: 2, 4, 7, 9, 11 — the 4th was excused.
    expect(month).toMatchObject({ done: 2, asked: 4 });
  });
});

/* ------------------------------------------------------------------ */
/* Order                                                               */
/* ------------------------------------------------------------------ */

describe('reordering from a day that is showing a subset', () => {
  it('moves a row to the position the finger stopped at', () => {
    expect(reorderWithinVisible(['a', 'b', 'c'], ['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(reorderWithinVisible(['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('dropping a row back where it came from is a no-op', () => {
    expect(reorderWithinVisible(['a', 'b', 'c'], ['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  /*
   * THE ONE THAT MATTERS. On a Tuesday the Mon/Wed/Fri task is not on screen, so
   * "third visible row to the top" must not be read as "index 2 to index 0" in a
   * list the user cannot see. The hidden row keeps its slot; the visible ones are
   * permuted among their own.
   */
  it('permutes only the VISIBLE rows, and leaves a hidden one in its slot', () => {
    const all = ['daily1', 'mwf', 'daily2', 'daily3'];
    const visible = ['daily1', 'daily2', 'daily3'];

    // daily3 (third visible) to the top of the visible list.
    expect(reorderWithinVisible(all, visible, 'daily3', 0)).toEqual([
      'daily3',
      'mwf',
      'daily1',
      'daily2',
    ]);
  });

  it('clamps a drop past the end rather than refusing it', () => {
    expect(reorderWithinVisible(['a', 'b'], ['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
  });

  it('leaves the list alone when the moved row is not one of the visible ones', () => {
    expect(reorderWithinVisible(['a', 'b', 'c'], ['a', 'b'], 'c', 0)).toEqual(['a', 'b', 'c']);
  });
});

/* ------------------------------------------------------------------ */
/* The trend                                                           */
/* ------------------------------------------------------------------ */

describe('the habit line', () => {
  const daily = task({ id: 't1', startedOn: '2026-09-10' });

  it('plots percent done, one point per day, oldest first', () => {
    const points = taskTrendSeries(
      [daily],
      log('t1', { '2026-09-10': 'done', '2026-09-12': 'done' }),
      'week',
      '2026-09-13',
    );

    // The week is 7 days, but the task only started on the 10th — days before
    // `startedOn` ask for nothing, so they are not points.
    expect(points.map((p) => p.day)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
    expect(points.map((p) => p.value)).toEqual([100, 0, 100, 0]);
  });

  it('leaves out a day that asked for nothing rather than plotting it as a zero', () => {
    const mwf = task({ id: 't1', schedule: { kind: 'weekdays', days: [0, 2, 4] } });
    const points = taskTrendSeries([mwf], {}, 'week', '2026-09-13');
    // Mon 7, Wed 9, Fri 11 in that window — Tuesday is not a day you failed.
    expect(points.map((p) => p.day)).toEqual(['2026-09-07', '2026-09-09', '2026-09-11']);
  });

  it('a day excused on purpose leaves the denominator, exactly like the day bar', () => {
    const a = task({ id: 't1', startedOn: '2026-09-12' });
    const b = task({ id: 't2', startedOn: '2026-09-12' });
    const marks: TaskLog = {
      ...log('t1', { '2026-09-12': 'done' }),
      ...log('t2', { '2026-09-12': 'missed' }),
    };

    const [point] = taskTrendSeries([a, b], marks, 'week', '2026-09-12');
    expect(point.asked).toBe(1);
    expect(point.value).toBe(100);
  });

  it('summarizes the range over the whole of it, not as an average of averages', () => {
    const a = task({ id: 't1', startedOn: '2026-09-12' });
    const b = task({ id: 't2', startedOn: '2026-09-12' });
    const marks: TaskLog = {
      ...log('t1', { '2026-09-12': 'done', '2026-09-13': 'done' }),
      ...log('t2', { '2026-09-13': 'done' }),
    };

    const summary = summarizeTaskTrend(taskTrendSeries([a, b], marks, 'week', '2026-09-13'));
    expect(summary.days).toBe(2);
    expect(summary.asked).toBe(4);
    expect(summary.done).toBe(3);
    expect(summary.percent).toBe(75);
    // Only the 13th had everything answered.
    expect(summary.perfectDays).toBe(1);
  });

  it('`all time` starts on the day the log did, not on an arbitrary floor', () => {
    const old = task({ id: 't1', startedOn: '2026-09-11' });
    const points = taskTrendSeries([old], {}, 'all', '2026-09-13');
    expect(points[0].day).toBe('2026-09-11');
    expect(points).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* The month, across every task                                        */
/* ------------------------------------------------------------------ */

describe('a month of the whole list', () => {
  const a = task({ id: 't1', startedOn: '2026-09-01' });
  const b = task({ id: 't2', startedOn: '2026-09-01' });
  const marks: TaskLog = {
    ...log('t1', { '2026-09-01': 'done', '2026-09-02': 'done' }),
    ...log('t2', { '2026-09-01': 'done' }),
  };

  it('fills each square by the share of that day that got done', () => {
    const month = tasksMonth([a, b], marks, 2026, 8, '2026-09-03');
    const cells = Object.fromEntries(
      month.weeks
        .flat()
        .filter((cell) => cell.date)
        .map((cell) => [cell.date, cell]),
    );

    expect(cells['2026-09-01'].fraction).toBe(1);
    expect(cells['2026-09-02'].fraction).toBe(0.5);
    expect(cells['2026-09-03'].fraction).toBe(0);
  });

  it('pads only at the START — a trailing blank would draw days that have not happened', () => {
    const month = tasksMonth([a], {}, 2026, 8, '2026-09-30');
    // 1 September 2026 is a Tuesday, so one lead cell in a Monday-first grid.
    expect(month.weeks[0][0].day).toBeNull();
    expect(month.weeks[0][1].day).toBe(1);
    expect(month.weeks[month.weeks.length - 1].length).toBeLessThanOrEqual(7);
  });

  it('a day in the FUTURE is blank rather than a zero: it has not been missed', () => {
    const month = tasksMonth([a], {}, 2026, 8, '2026-09-03');
    const cells = month.weeks.flat();
    expect(cells.find((cell) => cell.date === '2026-09-04')?.isBlank).toBe(true);
    expect(cells.find((cell) => cell.date === '2026-09-03')?.isBlank).toBe(false);
    // ...and it is not in the month's totals either.
    expect(month.days).toBe(3);
  });

  it('counts the month up to today, excusals left out of the denominator', () => {
    const month = tasksMonth([a, b], marks, 2026, 8, '2026-09-02');
    expect(month.done).toBe(3);
    expect(month.asked).toBe(4);
  });
});
