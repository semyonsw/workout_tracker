import { beforeEach, describe, expect, it } from 'vitest';

import { useTasks } from './taskStore';
import { seedTaskLog, seedTaskNotes, seedTasks } from '../data/tasksSeed';
import { isScheduled, tasksForDay } from '../lib/tasks';

beforeEach(() => {
  useTasks.setState({ tasks: [], log: {}, notes: {} });
});

describe('adding and editing', () => {
  it('appends a daily task and gives it a mark', () => {
    const task = useTasks.getState().addTask({
      name: 'Evening reading',
      schedule: 'daily',
      activeWeekdays: [],
    });
    expect(task.mark).toBe('ER');
    expect(task.order).toBe(0);
    expect(isScheduled(task, '2026-09-13')).toBe(true);
  });

  it('keeps only the weekdays a weekday task asked for', () => {
    const task = useTasks.getState().addTask({
      name: 'Gym',
      schedule: 'weekdays',
      activeWeekdays: [2, 4, 6],
    });
    expect(task.activeWeekdays).toEqual([2, 4, 6]);
    expect(isScheduled(task, '2026-09-15')).toBe(true);
    expect(isScheduled(task, '2026-09-14')).toBe(false);
  });

  it('drops the weekday list when a task stops being a weekday task', () => {
    const task = useTasks.getState().addTask({
      name: 'Gym',
      schedule: 'weekdays',
      activeWeekdays: [2],
    });
    useTasks.getState().updateTask(task.id, {
      name: 'Gym',
      schedule: 'daily',
      activeWeekdays: [2],
    });
    expect(useTasks.getState().tasks[0].activeWeekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('the three states of a day', () => {
  it('cycles unanswered to done to missed and back', () => {
    const task = useTasks
      .getState()
      .addTask({ name: 'Read', schedule: 'daily', activeWeekdays: [] });

    useTasks.getState().cycleDay(task.id, '2026-09-13');
    expect(useTasks.getState().log[task.id]['2026-09-13']).toBe(true);

    useTasks.getState().cycleDay(task.id, '2026-09-13');
    expect(useTasks.getState().log[task.id]['2026-09-13']).toBe(false);

    // Back to nothing recorded at all, which is NOT the same as "missed".
    useTasks.getState().cycleDay(task.id, '2026-09-13');
    expect(useTasks.getState().log[task.id]['2026-09-13']).toBeUndefined();
  });
});

describe('deleting', () => {
  it('removes a task nothing was ever recorded against', () => {
    const task = useTasks
      .getState()
      .addTask({ name: 'Read', schedule: 'daily', activeWeekdays: [] });
    useTasks.getState().deleteTask(task.id);
    expect(useTasks.getState().tasks).toHaveLength(0);
  });

  it('archives a task with history, so the history stays true', () => {
    const task = useTasks
      .getState()
      .addTask({ name: 'Read', schedule: 'daily', activeWeekdays: [] });
    useTasks.getState().setDay(task.id, '2026-09-12', true);
    useTasks.getState().deleteTask(task.id);

    expect(useTasks.getState().tasks[0].isArchived).toBe(true);
    expect(useTasks.getState().log[task.id]['2026-09-12']).toBe(true);
    expect(tasksForDay(useTasks.getState().tasks, '2026-09-12')).toHaveLength(0);
  });
});

describe('the automatic tick', () => {
  it('makes the task the first time a source fires, and reuses it after', () => {
    useTasks.getState().markAuto('workout', '2026-09-12');
    useTasks.getState().markAuto('workout', '2026-09-13');

    const workoutTasks = useTasks.getState().tasks.filter((t) => t.auto === 'workout');
    expect(workoutTasks).toHaveLength(1);
    expect(useTasks.getState().log[workoutTasks[0].id]).toEqual({
      '2026-09-12': true,
      '2026-09-13': true,
    });
  });

  /**
   * It only ever ticks UP. A second workout on a day already marked done writes the
   * same `true`; what it must never do is turn an answer into a different one.
   */
  it('does not un-tick a day it fires on twice', () => {
    useTasks.getState().markAuto('workout', '2026-09-12');
    useTasks.getState().markAuto('workout', '2026-09-12');
    const task = useTasks.getState().tasks[0];
    expect(useTasks.getState().log[task.id]['2026-09-12']).toBe(true);
  });

  it('ticks an existing task the user renamed rather than making a second one', () => {
    const task = useTasks
      .getState()
      .addTask({ name: 'Gym', schedule: 'daily', activeWeekdays: [] });
    useTasks.setState({
      tasks: [{ ...useTasks.getState().tasks[0], auto: 'workout' }],
    });
    useTasks.getState().markAuto('workout', '2026-09-12');

    expect(useTasks.getState().tasks).toHaveLength(1);
    expect(useTasks.getState().log[task.id]['2026-09-12']).toBe(true);
  });
});

describe('rehydration', () => {
  it('drops rows that cannot be rendered, and ticks for tasks that are gone', () => {
    const result = useTasks.getState().importTasks(
      [
        {
          id: 'a',
          name: 'Read',
          schedule: 'daily',
          activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
          order: 0,
        },
        { id: 'b', name: 'Broken', schedule: 'sometimes', activeWeekdays: [] },
      ],
      { a: { '2026-09-12': true, nonsense: true }, b: { '2026-09-12': true } },
      { a: { '2026-09-12': 'went fine' }, b: { '2026-09-12': 'x' } },
    );

    expect(result).toEqual({ tasks: 1 });
    expect(useTasks.getState().log).toEqual({ a: { '2026-09-12': true } });
    expect(useTasks.getState().notes).toEqual({ a: { '2026-09-12': 'went fine' } });
  });
});

/** The carried-over history is data the app ships with, so it has to be loadable. */
describe('the carried-over tasks', () => {
  it('are all renderable, and their ticks all belong to a task that exists', () => {
    const result = useTasks.getState().importTasks(seedTasks, seedTaskLog, seedTaskNotes);
    expect(result.tasks).toBe(seedTasks.length);

    const ticks = Object.values(useTasks.getState().log).reduce(
      (total, days) => total + Object.keys(days).length,
      0,
    );
    const shipped = Object.values(seedTaskLog).reduce(
      (total, days) => total + Object.keys(days).length,
      0,
    );
    expect(ticks).toBe(shipped);
  });

  it('wire the gym task to the training log and ship an expense task', () => {
    expect(seedTasks.filter((task) => task.auto === 'workout')).toHaveLength(1);
    expect(seedTasks.filter((task) => task.auto === 'expense')).toHaveLength(1);
  });
});
