import { afterEach, describe, expect, it } from 'vitest';

import { dayKey } from '../lib/days';
import { entryOf } from '../lib/tasks';
import { useSettings } from './settingsStore';
import { renameSeedTasks, sanitizeTasks, seedTasks, useTasks } from './tasksStore';

/**
 * The task store.
 *
 * Two things here are worth a test rather than a reading. The first is that the
 * log stays SPARSE — an entry cycled back to unanswered has to leave the blob
 * entirely, or a year of tapping leaves a record per task per day saying nothing.
 * The second is that `tickAuto` never overrules a deliberate answer: the app
 * noticing you trained is not grounds for it to erase "missed on purpose".
 */

afterEach(() => {
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
  useSettings.getState().setFlag('autoTickTasks', true);
});

describe('sanitizing', () => {
  it('throws away a row with no name and renumbers what is left', () => {
    const value = sanitizeTasks({
      tasks: [
        { id: 'a', name: 'Read', order: 5 },
        { id: 'b', name: '   ', order: 1 },
        { id: 'c', name: 'Sleep', order: 2 },
      ] as never,
      log: {},
    });
    expect(value.tasks.map((task) => [task.id, task.order])).toEqual([
      ['c', 0],
      ['a', 1],
    ]);
  });

  it('drops a weekday nobody could have meant, and keeps the rest sorted', () => {
    const [task] = sanitizeTasks({
      tasks: [
        { id: 'a', name: 'Gym', schedule: { kind: 'weekdays', days: [4, 9, 0, 4] } },
      ] as never,
      log: {},
    }).tasks;
    expect(task.schedule).toEqual({ kind: 'weekdays', days: [0, 4] });
  });

  it('drops a log belonging to a task that is gone', () => {
    const value = sanitizeTasks({
      tasks: [{ id: 'a', name: 'Read', startedOn: '2026-01-01' }] as never,
      log: {
        a: { '2026-09-12': { mark: 'done', note: '' } },
        ghost: { '2026-09-12': { mark: 'done', note: '' } },
      },
    });
    expect(Object.keys(value.log)).toEqual(['a']);
  });

  it('drops an entry that says nothing at all', () => {
    const value = sanitizeTasks({
      tasks: [{ id: 'a', name: 'Read', startedOn: '2026-01-01' }] as never,
      log: {
        a: { '2026-09-12': { mark: null, note: '' }, 'not-a-day': { mark: 'done', note: '' } },
      },
    });
    expect(value.log).toEqual({});
  });
});

describe('answering a day', () => {
  it('cycles unanswered, done, missed on purpose, and back', () => {
    const { cycleMark } = useTasks.getState();
    const id = useTasks.getState().tasks[0].id;

    cycleMark(id, '2026-09-13');
    expect(entryOf(useTasks.getState().log, id, '2026-09-13').mark).toBe('done');
    cycleMark(id, '2026-09-13');
    expect(entryOf(useTasks.getState().log, id, '2026-09-13').mark).toBe('missed');
    cycleMark(id, '2026-09-13');
    expect(entryOf(useTasks.getState().log, id, '2026-09-13').mark).toBeNull();
  });

  it('leaves no row behind when a day goes back to unanswered', () => {
    const { cycleMark } = useTasks.getState();
    const id = useTasks.getState().tasks[0].id;

    cycleMark(id, '2026-09-13');
    cycleMark(id, '2026-09-13');
    cycleMark(id, '2026-09-13');
    expect(useTasks.getState().log).toEqual({});
  });

  it('keeps a day that has only a note on it', () => {
    const id = useTasks.getState().tasks[0].id;
    useTasks.getState().setNote(id, '2026-09-13', 'travelling');
    expect(entryOf(useTasks.getState().log, id, '2026-09-13')).toEqual({
      mark: null,
      note: 'travelling',
    });
  });
});

describe('the automatic tick', () => {
  it('ticks the task its source feeds, and only that one', () => {
    useTasks.getState().tickAuto('workout', '2026-09-13');
    const { tasks, log } = useTasks.getState();
    for (const task of tasks) {
      expect(entryOf(log, task.id, '2026-09-13').mark).toBe(
        task.auto === 'workout' ? 'done' : null,
      );
    }
  });

  it('does not overrule a day you deliberately marked missed', () => {
    const gym = useTasks.getState().tasks.find((task) => task.auto === 'workout');
    if (!gym) throw new Error('the seed no longer ships an auto-ticked training task');

    useTasks.getState().setMark(gym.id, '2026-09-13', 'missed');
    useTasks.getState().tickAuto('workout', '2026-09-13');
    expect(entryOf(useTasks.getState().log, gym.id, '2026-09-13').mark).toBe('missed');
  });

  it('leaves an archived task alone', () => {
    const gym = useTasks.getState().tasks.find((task) => task.auto === 'workout');
    if (!gym) throw new Error('the seed no longer ships an auto-ticked training task');

    useTasks.getState().archiveTask(gym.id);
    useTasks.getState().tickAuto('workout', '2026-09-13');
    expect(entryOf(useTasks.getState().log, gym.id, '2026-09-13').mark).toBeNull();
  });
});

describe('archiving', () => {
  it('keeps the task and its marks, and takes it out of the live list', () => {
    const id = useTasks.getState().tasks[0].id;
    useTasks.getState().setMark(id, '2026-09-12', 'done');
    useTasks.getState().archiveTask(id);

    const task = useTasks.getState().tasks.find((row) => row.id === id);
    expect(task?.archivedAt).toBeTypeOf('string');
    expect(entryOf(useTasks.getState().log, id, '2026-09-12').mark).toBe('done');
  });
});

describe('the automatic tick can be switched off', () => {
  it('answers nothing at all while the setting is off', () => {
    const gym = useTasks.getState().tasks.find((task) => task.auto === 'workout');
    if (!gym) throw new Error('the seed no longer ships an auto-ticked training task');

    useSettings.getState().setFlag('autoTickTasks', false);
    useTasks.getState().tickAuto('workout', '2026-09-13');
    expect(entryOf(useTasks.getState().log, gym.id, '2026-09-13').mark).toBeNull();

    // ...and it is the SETTING and not the task: switched back on, the same call
    // answers the same row.
    useSettings.getState().setFlag('autoTickTasks', true);
    useTasks.getState().tickAuto('workout', '2026-09-13');
    expect(entryOf(useTasks.getState().log, gym.id, '2026-09-13').mark).toBe('done');
  });

  it('leaves marks already given exactly where they are', () => {
    const gym = useTasks.getState().tasks.find((task) => task.auto === 'workout');
    if (!gym) throw new Error('the seed no longer ships an auto-ticked training task');

    useTasks.getState().tickAuto('workout', '2026-09-13');
    useSettings.getState().setFlag('autoTickTasks', false);
    expect(entryOf(useTasks.getState().log, gym.id, '2026-09-13').mark).toBe('done');
  });
});

/**
 * Adding a task must not change a day that is already over.
 *
 * This is the single most damaging thing the tasks section could do quietly: a
 * habit written down on Sunday evening appearing on Saturday's list turns a day
 * the user finished — the bar full, 9 of 9 — into 9 of 10, weeks after the fact
 * and with no way to tell which row did it. `startedOn` has always been the
 * floor that prevents it; these pin that the control which now sets it cannot
 * be used to get under it by accident.
 */
describe('when a new task starts asking', () => {
  it('starts today unless it is told otherwise', () => {
    const today = dayKey(new Date());
    const id = useTasks.getState().addTask({ name: 'Read more', schedule: { kind: 'daily' } });
    const task = useTasks.getState().tasks.find((t) => t.id === id);
    expect(task?.startedOn).toBe(today);
    expect(task?.reminder).toBeNull();
  });

  it('starts where it was told, for a habit that genuinely began earlier', () => {
    const id = useTasks
      .getState()
      .addTask({ name: 'Running', schedule: { kind: 'daily' }, startedOn: '2026-09-01' });
    expect(useTasks.getState().tasks.find((t) => t.id === id)?.startedOn).toBe('2026-09-01');
  });

  it('keeps a one-day task’s two dates as one fact, whatever it was handed', () => {
    const id = useTasks.getState().addTask({
      name: 'Wash the dishes',
      schedule: { kind: 'once', day: '2026-09-20' },
      // Deliberately contradictory: the schedule wins, because `asksOn` reads it.
      startedOn: '2026-01-01',
    });
    const task = useTasks.getState().tasks.find((t) => t.id === id);
    expect(task?.startedOn).toBe('2026-09-20');
  });

  it('carries a reminder through, and lets an edit clear it', () => {
    const id = useTasks.getState().addTask({
      name: 'Stretch',
      schedule: { kind: 'daily' },
      reminder: { hour: 7, minute: 30 },
    });
    if (!id) throw new Error('the task was not added');
    expect(useTasks.getState().tasks.find((t) => t.id === id)?.reminder).toEqual({
      hour: 7,
      minute: 30,
    });

    // `null` clears it; `undefined` would mean "leave it alone", which is why
    // the patch type spells the two differently.
    useTasks.getState().updateTask(id, { reminder: null });
    expect(useTasks.getState().tasks.find((t) => t.id === id)?.reminder).toBeNull();
  });
});

describe('sanitizing the two new fields', () => {
  it('keeps a one-day schedule, and falls back to the start day for a junk date', () => {
    const [good, bad] = sanitizeTasks({
      tasks: [
        { id: 'a', name: 'Dishes', schedule: { kind: 'once', day: '2026-09-14' } },
        {
          id: 'b',
          name: 'Bins',
          startedOn: '2026-02-02',
          schedule: { kind: 'once', day: 'tomorrow' },
        },
      ] as never,
      log: {},
    }).tasks;
    expect(good.schedule).toEqual({ kind: 'once', day: '2026-09-14' });
    // Not dropped and not left un-askable: it lands on the only other date it has.
    expect(bad.schedule).toEqual({ kind: 'once', day: '2026-02-02' });
  });

  it('clamps a reminder into a real time, and refuses anything that is not one', () => {
    const [clamped, missing] = sanitizeTasks({
      tasks: [
        { id: 'a', name: 'A', reminder: { hour: 99, minute: -4 } },
        { id: 'b', name: 'B', reminder: { hour: 'seven' } },
      ] as never,
      log: {},
    }).tasks;
    expect(clamped.reminder).toEqual({ hour: 23, minute: 0 });
    expect(missing.reminder).toBeNull();
  });
});

describe('renameSeedTasks', () => {
  it('renames the nine shipped rows into the app’s language', () => {
    const migrated = renameSeedTasks({
      tasks: [{ id: 'task_8', name: 'Sleep before midnight' }],
    }) as { tasks: { name: string }[] };

    expect(migrated.tasks[0].name).toBe('Лечь спать до полуночи');
  });

  it('leaves a row the user reworded alone', () => {
    const migrated = renameSeedTasks({
      tasks: [{ id: 'task_8', name: 'Sleep before 11' }],
    }) as { tasks: { name: string }[] };

    expect(migrated.tasks[0].name).toBe('Sleep before 11');
  });

  it('survives a blob that is not the shape it expects', () => {
    expect(renameSeedTasks(null)).toBeNull();
    expect(renameSeedTasks({ tasks: 'nonsense' })).toEqual({ tasks: 'nonsense' });
    expect(renameSeedTasks({ tasks: [null, 7] })).toEqual({ tasks: [null, 7] });
  });
});
