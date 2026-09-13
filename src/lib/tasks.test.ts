import { describe, expect, it } from 'vitest';

import {
  type Task,
  type TaskLog,
  asksOn,
  dayProgress,
  describeSchedule,
  describeTaskRow,
  streakOf,
  taskMonth,
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
