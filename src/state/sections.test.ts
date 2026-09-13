import { afterEach, describe, expect, it } from 'vitest';

import { applySection, currentSnapshot, exportSectionText } from './dataTransfer';
import { sanitizeMoney, seedCategories, useMoney } from './moneyStore';
import { seedTasks, useTasks } from './tasksStore';
import { applyBackup } from './dataTransfer';
import { parseBackup, serializeBackup } from '../lib/backup';
import { parseSection } from '../lib/sectionBackup';
import { dayKey } from '../lib/days';
import type { AmountWhen } from '../lib/money';
import { entryOf } from '../lib/tasks';

/**
 * THE SECTION SMOKE TEST — a log leaves the phone on its own and comes back.
 *
 * `smoke.test.ts` walks a workout from `▶` to `Finish` and proves a backup taken
 * afterwards restores it. This is the same idea for the two logs that arrived
 * later, and for the operation neither of them had: getting ONE of them out of
 * the app without taking the other two with it.
 *
 * The assertions that matter are the ones about BLAST RADIUS. Restoring the money
 * must not touch a task, restoring the tasks must not touch an amount, and a
 * whole-app backup written before either log existed must leave both of them
 * where they are rather than emptying them — which is the difference between
 * "restore my training from last year's file" and "delete a year of answered
 * days, silently, in the same tap".
 *
 * There is no renderer here, so a tap is the store action the component's
 * `onPress` calls, one line below the button. That is the whole of a press in
 * this codebase.
 */

const today = dayKey(new Date());

afterEach(() => {
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
  useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
});

/** The `+ Add task` sheet, saved. */
function addTask(name: string): string {
  const id = useTasks.getState().addTask(name, { kind: 'daily' });
  if (!id) throw new Error('the task was refused');
  return id;
}

/** The amount editor's `Save`. */
function addAmount(value: number, when: AmountWhen = { kind: 'day', date: today }) {
  return useMoney.getState().addAmount({
    categoryId: 'food',
    direction: 'expense',
    value,
    when,
    note: '',
  });
}

describe('a section travelling on its own', () => {
  it('writes the daily tasks out and reads them back onto an emptied phone', () => {
    const id = addTask('Cold shower');
    useTasks.getState().setMark(id, today, 'done');
    useTasks.getState().setNote(id, today, 'freezing');

    const file = exportSectionText('tasks');

    // Wipe the list the way `Replace` would, with something that is not it.
    useTasks.getState().importTasks({ tasks: [], log: {} });
    expect(useTasks.getState().tasks).toHaveLength(0);

    const parsed = parseSection(file, 'tasks');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const counts = applySection('tasks', parsed.envelope.data);

    const restored = useTasks.getState().tasks.find((task) => task.name === 'Cold shower');
    expect(restored).toBeDefined();
    expect(entryOf(useTasks.getState().log, id, today)).toEqual({ mark: 'done', note: 'freezing' });
    // What LANDED, counted from the store after its own validator ran.
    expect(counts.tasks).toBe(useTasks.getState().tasks.length);
    expect(counts.answeredDays).toBe(1);
  });

  it('writes the money out and reads it back', () => {
    addAmount(400);
    addAmount(60000, { kind: 'day', date: today });

    const file = exportSectionText('money');
    useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
    expect(useMoney.getState().amounts).toHaveLength(0);

    const parsed = parseSection(file, 'money');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const counts = applySection('money', parsed.envelope.data);

    expect(
      useMoney
        .getState()
        .amounts.map((a) => a.value)
        .sort((a, b) => a - b),
    ).toEqual([400, 60000]);
    expect(counts.amounts).toBe(2);
  });

  /* The whole point of the feature, in one assertion each way. */
  it('restoring the money does not touch a task', () => {
    const id = addTask('Cold shower');
    useTasks.getState().setMark(id, today, 'done');
    addAmount(400);
    const money = exportSectionText('money');

    useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });
    const parsed = parseSection(money, 'money');
    if (!parsed.ok) throw new Error(parsed.error);
    applySection('money', parsed.envelope.data);

    expect(useTasks.getState().tasks.some((task) => task.name === 'Cold shower')).toBe(true);
    expect(entryOf(useTasks.getState().log, id, today).mark).toBe('done');
  });

  it('restoring the tasks does not touch an amount', () => {
    addAmount(400);
    const tasks = exportSectionText('tasks');

    useTasks.getState().importTasks({ tasks: [], log: {} });
    const parsed = parseSection(tasks, 'tasks');
    if (!parsed.ok) throw new Error(parsed.error);
    applySection('tasks', parsed.envelope.data);

    expect(useMoney.getState().amounts).toHaveLength(1);
  });

  it('a file written as one section is refused by another section import', () => {
    const money = exportSectionText('money');
    const result = parseSection(money, 'tasks');
    expect(result.ok).toBe(false);
  });

  it('the exported file carries no settings, so restoring training cannot reset a timer', () => {
    const file = JSON.parse(exportSectionText('training'));
    expect(file.data.settings).toBeUndefined();
    expect(file.data.exercises).toBeInstanceOf(Array);
  });
});

describe('the whole-app backup, now that there are three logs in it', () => {
  it('carries the tasks and the money, and restores both', () => {
    const id = addTask('Cold shower');
    useTasks.getState().setMark(id, today, 'done');
    addAmount(400);

    const text = serializeBackup(currentSnapshot());
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The envelope states them, so a confirmation sheet can.
    expect(parsed.counts.amounts).toBe(1);
    expect(parsed.counts.tasks).toBe(useTasks.getState().tasks.length);

    useTasks.getState().importTasks({ tasks: [], log: {} });
    useMoney.getState().importMoney({ categories: seedCategories, amounts: [] });

    const applied = applyBackup(parsed.envelope);
    expect(useTasks.getState().tasks.some((task) => task.name === 'Cold shower')).toBe(true);
    expect(useMoney.getState().amounts).toHaveLength(1);
    expect(applied.amounts).toBe(1);
  });

  /*
   * THE ONE THAT COULD LOSE A YEAR. A version-1 file has no `tasks` key at all,
   * and reading that absence as "an empty list" turns a restore into a deletion.
   */
  it('leaves both logs ALONE when the file predates them, rather than emptying them', () => {
    const id = addTask('Cold shower');
    useTasks.getState().setMark(id, today, 'done');
    addAmount(400);

    const old = JSON.parse(serializeBackup(currentSnapshot()));
    delete old.tasks;
    delete old.money;
    old.version = 1;

    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Absent, not zero — so nothing about them is claimed in the sheet either.
    expect(parsed.counts.tasks).toBeUndefined();
    expect(parsed.counts.amounts).toBeUndefined();

    const applied = applyBackup(parsed.envelope);
    expect(applied.tasks).toBeUndefined();
    expect(useTasks.getState().tasks.some((task) => task.name === 'Cold shower')).toBe(true);
    expect(useMoney.getState().amounts).toHaveLength(1);
  });
});

describe('reordering the day list', () => {
  it('moves a row to where the finger stopped, and keeps `order` a dense 0..n', () => {
    useTasks.getState().importTasks({
      tasks: [
        { id: 'a', name: 'A', schedule: { kind: 'daily' }, startedOn: '2026-01-01', order: 0 },
        { id: 'b', name: 'B', schedule: { kind: 'daily' }, startedOn: '2026-01-01', order: 1 },
        { id: 'c', name: 'C', schedule: { kind: 'daily' }, startedOn: '2026-01-01', order: 2 },
      ],
      log: {},
    });

    useTasks.getState().reorderTasks(['a', 'b', 'c'], 'c', 0);

    expect(useTasks.getState().tasks.map((task) => [task.id, task.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('a row hidden on the day being reordered keeps its own slot', () => {
    useTasks.getState().importTasks({
      tasks: [
        { id: 'a', name: 'A', schedule: { kind: 'daily' }, startedOn: '2026-01-01', order: 0 },
        {
          id: 'h',
          name: 'Hidden',
          schedule: { kind: 'weekdays', days: [6] },
          startedOn: '2026-01-01',
          order: 1,
        },
        { id: 'b', name: 'B', schedule: { kind: 'daily' }, startedOn: '2026-01-01', order: 2 },
      ],
      log: {},
    });

    useTasks.getState().reorderTasks(['a', 'b'], 'b', 0);

    expect(useTasks.getState().tasks.map((task) => task.id)).toEqual(['b', 'h', 'a']);
  });
});

describe('an amount answering its own task', () => {
  it('ticks the expense task on the day the amount is FOR, not the day it was typed', () => {
    const yesterday = dayKey(new Date(Date.now() - 86_400_000));
    addAmount(400, { kind: 'day', date: yesterday });

    const moneyTask = useTasks.getState().tasks.find((task) => task.auto === 'money');
    expect(moneyTask).toBeDefined();
    if (!moneyTask) return;
    expect(entryOf(useTasks.getState().log, moneyTask.id, yesterday).mark).toBe('done');
    expect(entryOf(useTasks.getState().log, moneyTask.id, today).mark).toBeNull();
  });

  it('a whole-month amount has no day, so it ticks the day it was recorded', () => {
    const at = new Date();
    addAmount(60000, { kind: 'month', year: at.getFullYear(), month: at.getMonth() });

    const moneyTask = useTasks.getState().tasks.find((task) => task.auto === 'money');
    if (!moneyTask) throw new Error('no money task');
    expect(entryOf(useTasks.getState().log, moneyTask.id, today).mark).toBe('done');
  });

  it('does not overrule a day already answered "missed on purpose"', () => {
    const moneyTask = useTasks.getState().tasks.find((task) => task.auto === 'money');
    if (!moneyTask) throw new Error('no money task');
    useTasks.getState().setMark(moneyTask.id, today, 'missed');

    addAmount(400);

    expect(entryOf(useTasks.getState().log, moneyTask.id, today).mark).toBe('missed');
  });
});

describe('what the export writes', () => {
  it('sanitizes rather than spreading, so no action function reaches the file', () => {
    const snapshot = currentSnapshot();
    expect(Object.keys(snapshot.tasks as object).sort()).toEqual(['log', 'tasks']);
    expect(Object.keys(snapshot.money as object).sort()).toEqual(['amounts', 'categories']);
    // And it is JSON-clean: a function would be dropped silently and the file
    // would say something untrue about the format.
    expect(sanitizeMoney(snapshot.money as never)).toEqual(snapshot.money);
  });
});
