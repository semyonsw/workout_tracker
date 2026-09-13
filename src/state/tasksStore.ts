/**
 * The daily-task log, on disk.
 *
 * AsyncStorage rather than SQLite, like `libraryStore` and unlike
 * `workoutHistoryStore`: a dozen tasks and one small record per answered day is
 * a few hundred KB after a decade, it is read whole on every launch, and the
 * screens that read it want the whole month at once anyway. The write-heavy
 * table in this app is `set_history` and this is not it.
 *
 * ── THE LOG IS SPARSE AND IT IS KEYED BY DAY ──────────────────────────────
 *
 * `log[taskId][YYYY-MM-DD]`. Days nobody answered have no row at all, which is
 * what makes UNANSWERED the default rather than a value that has to be written
 * for every task every midnight by a job that will not run when the phone is
 * off. It also means the month grid is a lookup rather than a scan.
 *
 * ── THE SEED IS A LIST, NOT A PAST ────────────────────────────────────────
 *
 * `seedTasks()` ships the nine rows and NOT ONE MARK — the same rule
 * `data/seed.ts` states for training. It is also a function rather than a
 * constant because every task needs `startedOn` to be the day the app first
 * opened: a hard-coded date would draw months of unanswered squares for a phone
 * set up last week, and every one of them would read as a day you let go by.
 *
 * Rehydration is TOTAL and it replaces rather than merges, like `libraryStore`:
 * a first launch has nothing persisted, so `merge` is not called and the seeds
 * stand; every launch after that is the user's list, seeds included or deleted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dayKey } from '../lib/days';
import {
  reorderWithinVisible,
  type Task,
  type TaskAutoSource,
  type TaskLog,
  type TaskMark,
  type TaskSchedule,
  type Weekday,
} from '../lib/tasks';
import type { ID } from '../types/models';

export interface TasksValue {
  tasks: Task[];
  log: TaskLog;
}

/** The nine rows the app opens with, starting today. */
export function seedTasks(today = dayKey(new Date())): Task[] {
  const daily: TaskSchedule = { kind: 'daily' };
  const mwf: TaskSchedule = { kind: 'weekdays', days: [0, 2, 4] };
  const rows: [string, TaskSchedule, TaskAutoSource | null][] = [
    ['Morning Bible/Narek reading', daily, null],
    ['In-Work Task Report', mwf, null],
    ['Gym / Boxing', mwf, 'workout'],
    ['Productivity/Day Tasks', daily, null],
    ['Evening Bible reading', daily, null],
    ["Plan tomorrow's tasks", daily, null],
    ['Book reading before sleep', daily, null],
    ['Sleep before midnight', daily, null],
    ['Track expenses', daily, 'money'],
  ];
  return rows.map(([name, schedule, auto], order) => ({
    id: `task_${order + 1}`,
    name,
    schedule,
    auto,
    startedOn: today,
    archivedAt: null,
    order,
  }));
}

function sanitizeSchedule(raw: unknown): TaskSchedule {
  const value = raw as Partial<TaskSchedule> | undefined;
  if (value && value.kind === 'weekdays') {
    const days = Array.isArray(value.days) ? value.days : [];
    const kept = [
      ...new Set(
        days.filter((day): day is Weekday => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ];
    return { kind: 'weekdays', days: kept.sort((a, b) => a - b) };
  }
  return { kind: 'daily' };
}

function sanitizeTask(raw: unknown, index: number, today: string): Task | null {
  const value = raw as Partial<Task> | undefined;
  if (!value || typeof value.id !== 'string' || value.id === '') return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') return null;
  const auto = value.auto === 'workout' || value.auto === 'money' ? value.auto : null;
  return {
    id: value.id,
    name,
    schedule: sanitizeSchedule(value.schedule),
    auto,
    startedOn:
      typeof value.startedOn === 'string' && value.startedOn !== '' ? value.startedOn : today,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    order: Number.isFinite(value.order) ? Number(value.order) : index,
  };
}

function sanitizeLog(raw: unknown, tasks: readonly Task[]): TaskLog {
  const source = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(tasks.map((task) => task.id));
  const log: TaskLog = {};
  for (const [taskId, days] of Object.entries(source)) {
    // A log for a task that no longer exists is dropped: it can never be read
    // and it would otherwise grow forever behind a list the user has curated.
    if (!known.has(taskId) || !days || typeof days !== 'object') continue;
    const kept: TaskLog[string] = {};
    for (const [day, entry] of Object.entries(days as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const value = entry as { mark?: unknown; note?: unknown } | null;
      const mark =
        value?.mark === 'done' || value?.mark === 'missed' ? (value.mark as TaskMark) : null;
      const note = typeof value?.note === 'string' ? value.note : '';
      if (mark === null && note === '') continue;
      kept[day] = { mark, note };
    }
    if (Object.keys(kept).length > 0) log[taskId] = kept;
  }
  return log;
}

/** The one validator. Total: `unknown` in, a complete value out. */
export function sanitizeTasks(input: Partial<TasksValue> | undefined | null): TasksValue {
  const today = dayKey(new Date());
  const rawTasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const tasks = rawTasks
    .map((task, index) => sanitizeTask(task, index, today))
    .filter((task): task is Task => task !== null)
    .sort((a, b) => a.order - b.order)
    .map((task, order) => ({ ...task, order }));
  return { tasks, log: sanitizeLog(input?.log, tasks) };
}

interface TasksState extends TasksValue {
  addTask: (name: string, schedule: TaskSchedule) => ID | null;
  updateTask: (id: ID, patch: { name?: string; schedule?: TaskSchedule }) => void;
  archiveTask: (id: ID) => void;
  /**
   * Put `movedId` at `toIndex` within the rows the DAY SCREEN is showing.
   *
   * `visibleIds` rather than a bare index because the day screen shows a subset —
   * a Mon/Wed/Fri task is simply not there on a Tuesday, and "third row to the
   * top" has to mean third VISIBLE row. `reorderWithinVisible` in `lib/tasks.ts`
   * has the whole argument; this only renumbers afterwards, because `order` is
   * persisted and the list sorts by it, so it has to stay a dense 0..n.
   */
  reorderTasks: (visibleIds: readonly ID[], movedId: ID, toIndex: number) => void;
  setMark: (id: ID, day: string, mark: TaskMark | null) => void;
  /** The circle's tap: unanswered → done → missed on purpose → unanswered. */
  cycleMark: (id: ID, day: string) => void;
  setNote: (id: ID, day: string, note: string) => void;
  /**
   * Tick every live task fed by `source`, for `day`, if nobody has answered it.
   *
   * A deliberate answer WINS — training on a day you had already marked "missed
   * on purpose" leaves your mark alone, because the app watching you train is
   * not a reason for it to overrule you.
   */
  tickAuto: (source: TaskAutoSource, day?: string) => void;
  importTasks: (raw: unknown) => void;
}

function writeEntry(
  log: TaskLog,
  id: ID,
  day: string,
  patch: { mark?: TaskMark | null; note?: string },
): TaskLog {
  const current = log[id]?.[day] ?? { mark: null, note: '' };
  const next = {
    mark: patch.mark !== undefined ? patch.mark : current.mark,
    note: patch.note ?? current.note,
  };
  const days = { ...(log[id] ?? {}) };
  // An empty entry is deleted rather than stored, so the log stays sparse.
  if (next.mark === null && next.note === '') delete days[day];
  else days[day] = next;
  const updated = { ...log };
  if (Object.keys(days).length === 0) delete updated[id];
  else updated[id] = days;
  return updated;
}

export const useTasks = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: seedTasks(),
      log: {},

      addTask: (name, schedule) => {
        const trimmed = name.trim();
        if (trimmed === '') return null;
        const id = `task_${Date.now().toString(36)}`;
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id,
              name: trimmed,
              schedule,
              auto: null,
              startedOn: dayKey(new Date()),
              archivedAt: null,
              order: state.tasks.length,
            },
          ],
        }));
        return id;
      },

      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((task) => {
            if (task.id !== id) return task;
            const name = patch.name?.trim();
            return {
              ...task,
              name: name !== undefined && name !== '' ? name : task.name,
              schedule: patch.schedule ?? task.schedule,
            };
          }),
        })),

      // Archived, not deleted: the marks stay, and so does every month that
      // already drew them.
      archiveTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, archivedAt: new Date().toISOString() } : task,
          ),
        })),

      reorderTasks: (visibleIds, movedId, toIndex) =>
        set((state) => {
          const ordered = [...state.tasks].sort((a, b) => a.order - b.order);
          const nextIds = reorderWithinVisible(
            ordered.map((task) => task.id),
            visibleIds,
            movedId,
            toIndex,
          );
          const byId = new Map(ordered.map((task) => [task.id, task]));
          const tasks: Task[] = [];
          nextIds.forEach((id, order) => {
            const task = byId.get(id);
            if (task) tasks.push({ ...task, order });
          });
          return { tasks };
        }),

      setMark: (id, day, mark) =>
        set((state) => ({ log: writeEntry(state.log, id, day, { mark }) })),

      cycleMark: (id, day) => {
        const current = get().log[id]?.[day]?.mark ?? null;
        const next: TaskMark | null =
          current === null ? 'done' : current === 'done' ? 'missed' : null;
        set((state) => ({ log: writeEntry(state.log, id, day, { mark: next }) }));
      },

      setNote: (id, day, note) =>
        set((state) => ({ log: writeEntry(state.log, id, day, { note }) })),

      tickAuto: (source, day = dayKey(new Date())) => {
        const { tasks, log } = get();
        let next = log;
        for (const task of tasks) {
          if (task.auto !== source || task.archivedAt !== null) continue;
          if ((next[task.id]?.[day]?.mark ?? null) !== null) continue;
          next = writeEntry(next, task.id, day, { mark: 'done' });
        }
        if (next !== log) set({ log: next });
      },

      importTasks: (raw) =>
        set({ ...sanitizeTasks(raw as Partial<TasksValue> | undefined | null) }),
    }),
    {
      name: 'tasks',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ tasks: state.tasks, log: state.log }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeTasks(persisted as Partial<TasksValue> | undefined),
      }),
    },
  ),
);

/** Read path for code outside React — the auto-tick callers. */
export function tickTaskSource(source: TaskAutoSource, day?: string): void {
  useTasks.getState().tickAuto(source, day);
}
