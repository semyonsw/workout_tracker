import { describe, expect, it } from 'vitest';

import {
  dayProgress,
  describeSchedule,
  isScheduled,
  markFor,
  monthCells,
  monthScore,
  nextOrder,
  streakOf,
  tasksForDay,
} from './tasks';
import { AUTO_TASK_DEFAULTS, planAutoTick } from './taskSync';
import type { DailyTask, TaskLog } from '../types/tasks';

function task(over: Partial<DailyTask> = {}): DailyTask {
  return {
    id: over.id ?? 'task_1',
    name: over.name ?? 'Read',
    mark: over.mark ?? 'RE',
    schedule: over.schedule ?? 'daily',
    activeWeekdays: over.activeWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
    date: over.date,
    auto: over.auto,
    order: over.order ?? 0,
    isArchived: over.isArchived ?? false,
    createdAt: over.createdAt ?? '2026-09-01T00:00:00.000Z',
  };
}

// 2026-09-13 is a Sunday; 2026-09-14 a Monday.
describe('scheduling', () => {
  it('asks for a daily task every day', () => {
    expect(isScheduled(task(), '2026-09-13')).toBe(true);
  });

  it('asks for a weekday task only on its weekdays', () => {
    const gym = task({ schedule: 'weekdays', activeWeekdays: [2, 4, 6] });
    expect(isScheduled(gym, '2026-09-15')).toBe(true); // Tuesday
    expect(isScheduled(gym, '2026-09-14')).toBe(false); // Monday
  });

  it('asks for a one-off exactly once', () => {
    const once = task({ schedule: 'once', date: '2026-09-14' });
    expect(isScheduled(once, '2026-09-14')).toBe(true);
    expect(isScheduled(once, '2026-09-15')).toBe(false);
  });

  it('never asks for an archived task', () => {
    expect(isScheduled(task({ isArchived: true }), '2026-09-13')).toBe(false);
  });

  it('lists a day in the user order', () => {
    const list = tasksForDay(
      [task({ id: 'b', order: 2 }), task({ id: 'a', order: 1 })],
      '2026-09-13',
    );
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('a day', () => {
  const tasks = [
    task({ id: 'daily1' }),
    task({ id: 'daily2' }),
    task({ id: 'gym', schedule: 'weekdays', activeWeekdays: [2, 4, 6] }),
  ];
  const log: TaskLog = { daily1: { '2026-09-14': true }, gym: { '2026-09-14': true } };

  it('counts only what the day asked for', () => {
    // Monday: the gym task is not today's problem, and its stray tick does not count.
    expect(dayProgress(tasks, log, '2026-09-14')).toEqual({ done: 1, planned: 2 });
  });
});

describe('streaks', () => {
  const daily = task({ id: 'd' });
  const log: TaskLog = {
    d: { '2026-09-10': true, '2026-09-11': true, '2026-09-12': true },
  };

  it('counts back over consecutive completed days', () => {
    expect(streakOf(daily, log, '2026-09-12')).toBe(3);
  });

  it('does not let an unfinished today reset it', () => {
    expect(streakOf(daily, log, '2026-09-13')).toBe(3);
  });

  it('ends at an earlier day that was missed', () => {
    expect(streakOf(daily, { d: { ...log.d, '2026-09-11': false } }, '2026-09-12')).toBe(1);
  });

  it('skips days the task never asked for', () => {
    const gym = task({ id: 'g', schedule: 'weekdays', activeWeekdays: [2, 4, 6] });
    const gymLog: TaskLog = { g: { '2026-09-08': true, '2026-09-10': true, '2026-09-12': true } };
    expect(streakOf(gym, gymLog, '2026-09-12')).toBe(3);
  });
});

describe('the month grid', () => {
  const gym = task({ id: 'g', schedule: 'weekdays', activeWeekdays: [2, 4, 6] });
  const log: TaskLog = { g: { '2026-09-01': true, '2026-09-03': false } };

  it('has one cell per day, and knows which are asked for', () => {
    const cells = monthCells(gym, log, '2026-09');
    expect(cells).toHaveLength(30);
    expect(cells[0]).toEqual({ dayKey: '2026-09-01', day: 1, scheduled: true, status: true });
    expect(cells[1].scheduled).toBe(false);
    expect(cells[2].status).toBe(false);
  });

  it('scores only the scheduled days', () => {
    expect(monthScore(gym, log, '2026-09')).toEqual({ done: 1, planned: 13 });
  });

  it('handles February without inventing a 29th', () => {
    expect(monthCells(task(), {}, '2026-02')).toHaveLength(28);
  });
});

describe('small helpers', () => {
  it('appends new tasks to the end', () => {
    expect(nextOrder([task({ order: 0 }), task({ order: 4 })])).toBe(5);
    expect(nextOrder([])).toBe(0);
  });

  it('says what a schedule is in one line', () => {
    expect(describeSchedule(task())).toBe('Every day');
    expect(describeSchedule(task({ schedule: 'weekdays', activeWeekdays: [1, 3, 5] }))).toBe(
      'Mon · Wed · Fri',
    );
    expect(describeSchedule(task({ schedule: 'once', date: '2026-09-14' }))).toBe(
      'Once · 2026-09-14',
    );
  });

  it('makes a two-character mark out of a name', () => {
    expect(markFor('Evening Bible reading')).toBe('EB');
    expect(markFor('Workout')).toBe('WO');
    expect(markFor('   ')).toBe('··');
  });
});

describe('auto tick', () => {
  const now = '2026-09-13T10:00:00.000Z';

  it('ticks the task that already carries the source', () => {
    const tasks = [task({ id: 'w', auto: 'workout' }), task({ id: 'other' })];
    expect(planAutoTick(tasks, 'workout', 'new', now)).toEqual({ kind: 'tick', taskId: 'w' });
  });

  it('ignores an archived one and makes a fresh task', () => {
    const tasks = [task({ id: 'w', auto: 'workout', isArchived: true })];
    const plan = planAutoTick(tasks, 'workout', 'new', now);
    expect(plan.kind).toBe('create');
    if (plan.kind !== 'create') throw new Error('expected a create');
    expect(plan.task).toMatchObject({
      id: 'new',
      name: AUTO_TASK_DEFAULTS.workout.name,
      schedule: 'daily',
      auto: 'workout',
    });
  });

  it('makes the expense task with its own wording', () => {
    const plan = planAutoTick([], 'expense', 'new', now);
    if (plan.kind !== 'create') throw new Error('expected a create');
    expect(plan.task.name).toBe('Track expenses');
  });
});
