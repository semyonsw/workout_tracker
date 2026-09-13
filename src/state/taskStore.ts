/**
 * Task store — what is supposed to happen on a day, and what did.
 *
 * AsyncStorage, like `libraryStore` and for the same reason: a decade of ticks for
 * a dozen tasks is a few hundred kilobytes, it is read whole on every launch, and
 * nothing here is queried by range. The training log went to SQLite because it grows
 * without a ceiling and is read by exercise; this does neither.
 *
 * ── THREE RULES ────────────────────────────────────────────────────────────
 *
 *  1. THE LOG IS APPEND-SHAPED, NOT DESTRUCTIVE. Deleting a task archives it while
 *     it still has ticks against it, exactly as a category is archived in
 *     `financeStore`: the ticks record days that happened, and the row is the only
 *     thing that says what they were. A task nobody has ever ticked is deleted
 *     outright, because there is nothing to protect.
 *  2. REHYDRATION IS VALIDATED, not trusted. A task missing `schedule` reaches
 *     `isScheduled` and takes the Tasks screen down with it, so malformed rows are
 *     dropped on the way in. Same doctrine as every other store here.
 *  3. THE AUTO TICK IS A STORE ACTION, not a screen effect. `markAuto` is called
 *     from the finance store and from the workout-finish path — neither of which is
 *     a component — so it has to work when no Tasks screen has ever been mounted.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { uid } from '../lib/draft';
import { nextOrder } from '../lib/tasks';
import { planAutoTick } from '../lib/taskSync';
import { seedTaskLog, seedTaskNotes, seedTasks } from '../data/tasksSeed';
import type { DailyTask, TaskAuto, TaskLog, TaskNotes, TaskSchedule } from '../types/tasks';
import type { ID } from '../types/models';

/** What the add/edit sheet collects. Everything else about a task is bookkeeping. */
export interface TaskDraft {
  name: string;
  schedule: TaskSchedule;
  activeWeekdays: number[];
  /** `YYYY-MM-DD`, for a one-off. */
  date?: string;
}

interface TaskState {
  tasks: DailyTask[];
  log: TaskLog;
  notes: TaskNotes;

  addTask: (draft: TaskDraft) => DailyTask;
  updateTask: (taskId: ID, draft: TaskDraft) => void;
  /** Archives a task that has history, removes one that does not. See rule 1. */
  deleteTask: (taskId: ID) => void;
  /** Move a task one place up or down. The only reorder a dozen rows needs. */
  moveTask: (taskId: ID, direction: -1 | 1) => void;

  /** Cycle one day: not answered → done → missed → not answered. */
  cycleDay: (taskId: ID, dayKey: string) => void;
  /** Set one day outright. What the auto tick and the month grid both use. */
  setDay: (taskId: ID, dayKey: string, status: boolean | undefined) => void;
  setNote: (taskId: ID, dayKey: string, note: string) => void;

  /**
   * A workout was finished, or an amount was recorded, on `dayKey`. Tick the task
   * that stands for it — creating one if this app has never had one.
   */
  markAuto: (source: TaskAuto, dayKey: string) => void;

  /** Replace everything. The restore path, and the first-run seed. */
  importTasks: (tasks: unknown, log: unknown, notes: unknown) => { tasks: number };
}

export const useTasks = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: seedTasks,
      log: seedTaskLog,
      notes: seedTaskNotes,

      addTask: (draft) => {
        const task: DailyTask = {
          id: uid('task'),
          name: draft.name.trim() || 'Task',
          mark: markOf(draft.name),
          schedule: draft.schedule,
          activeWeekdays:
            draft.schedule === 'weekdays' ? [...draft.activeWeekdays].sort() : ALL_DAYS,
          date: draft.schedule === 'once' ? draft.date : undefined,
          order: nextOrder(get().tasks),
          isArchived: false,
          createdAt: new Date().toISOString(),
        };
        set({ tasks: [...get().tasks, task] });
        return task;
      },

      updateTask: (taskId, draft) =>
        set({
          tasks: get().tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  name: draft.name.trim() || task.name,
                  mark: markOf(draft.name) || task.mark,
                  schedule: draft.schedule,
                  activeWeekdays:
                    draft.schedule === 'weekdays' ? [...draft.activeWeekdays].sort() : ALL_DAYS,
                  date: draft.schedule === 'once' ? draft.date : undefined,
                }
              : task,
          ),
        }),

      deleteTask: (taskId) => {
        const hasHistory = Object.keys(get().log[taskId] ?? {}).length > 0;
        if (!hasHistory) {
          const { [taskId]: _dropped, ...log } = get().log;
          set({ tasks: get().tasks.filter((task) => task.id !== taskId), log });
          return;
        }
        set({
          tasks: get().tasks.map((task) =>
            task.id === taskId ? { ...task, isArchived: true } : task,
          ),
        });
      },

      moveTask: (taskId, direction) => {
        const ordered = [...get().tasks].sort((a, b) => a.order - b.order);
        const index = ordered.findIndex((task) => task.id === taskId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return;
        const swapped = [...ordered];
        swapped[index] = ordered[target];
        swapped[target] = ordered[index];
        set({ tasks: swapped.map((task, i) => ({ ...task, order: i })) });
      },

      cycleDay: (taskId, dayKey) => {
        const current = get().log[taskId]?.[dayKey];
        const next = current === undefined ? true : current === true ? false : undefined;
        get().setDay(taskId, dayKey, next);
      },

      setDay: (taskId, dayKey, status) => {
        const forTask = { ...(get().log[taskId] ?? {}) };
        if (status === undefined) delete forTask[dayKey];
        else forTask[dayKey] = status;
        set({ log: { ...get().log, [taskId]: forTask } });
      },

      setNote: (taskId, dayKey, note) => {
        const forTask = { ...(get().notes[taskId] ?? {}) };
        const trimmed = note.trim();
        if (!trimmed) delete forTask[dayKey];
        else forTask[dayKey] = trimmed;
        set({ notes: { ...get().notes, [taskId]: forTask } });
      },

      markAuto: (source, dayKey) => {
        const plan = planAutoTick(get().tasks, source, uid('task'), new Date().toISOString());
        if (plan.kind === 'create') set({ tasks: [...get().tasks, plan.task] });
        const taskId = plan.kind === 'create' ? plan.task.id : plan.taskId;
        /*
         * Only ever UP. An auto source firing twice on a day the user has explicitly
         * marked missed would overwrite their answer — but a second workout on a day
         * that is already ticked writes the same `true` it found, which costs
         * nothing. The one thing it must not do is un-tick.
         */
        get().setDay(taskId, dayKey, true);
      },

      importTasks: (tasks, log, notes) => {
        const clean = sanitizeTasks(tasks, []);
        set({
          tasks: clean,
          log: sanitizeLog(log, new Set(clean.map((task) => task.id))),
          notes: sanitizeNotes(notes, new Set(clean.map((task) => task.id))),
        });
        return { tasks: clean.length };
      },
    }),
    {
      name: 'daily-tasks',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ tasks: state.tasks, log: state.log, notes: state.notes }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<TaskState>;
        // A blob with no `tasks` key at all is a first launch, not an empty list:
        // the seed stands. An explicitly empty array is a user who deleted everything.
        const tasks = sanitizeTasks(raw.tasks, current.tasks);
        const known = new Set(tasks.map((task) => task.id));
        return {
          ...current,
          tasks,
          log: raw.tasks === undefined ? current.log : sanitizeLog(raw.log, known),
          notes: raw.tasks === undefined ? current.notes : sanitizeNotes(raw.notes, known),
        };
      },
    },
  ),
);

/** Called from outside React — the finance store and the workout-finish path. */
export function markAutoTask(source: TaskAuto, dayKey: string): void {
  useTasks.getState().markAuto(source, dayKey);
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function markOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

const SCHEDULES = new Set<TaskSchedule>(['daily', 'weekdays', 'once']);

function sanitizeTasks(value: unknown, fallback: DailyTask[]): DailyTask[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(isRenderableTask).map((task, index) => ({
    ...task,
    mark: typeof task.mark === 'string' && task.mark ? task.mark : markOf(task.name),
    activeWeekdays: task.activeWeekdays.filter((day) => day >= 0 && day <= 6),
    order: Number.isFinite(task.order) ? task.order : index,
    isArchived: task.isArchived === true,
  }));
}

function isRenderableTask(value: unknown): value is DailyTask {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Partial<DailyTask>;
  return (
    typeof task.id === 'string' &&
    typeof task.name === 'string' &&
    typeof task.schedule === 'string' &&
    SCHEDULES.has(task.schedule) &&
    Array.isArray(task.activeWeekdays) &&
    task.activeWeekdays.every((day) => typeof day === 'number')
  );
}

/** Ticks for tasks that no longer exist are dropped: they can never be rendered. */
function sanitizeLog(value: unknown, known: ReadonlySet<ID>): TaskLog {
  if (typeof value !== 'object' || value === null) return {};
  const log: TaskLog = {};
  for (const [taskId, days] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(taskId) || typeof days !== 'object' || days === null) continue;
    const clean: Record<string, boolean> = {};
    for (const [dayKey, status] of Object.entries(days as Record<string, unknown>)) {
      if (typeof status === 'boolean' && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) clean[dayKey] = status;
    }
    log[taskId] = clean;
  }
  return log;
}

function sanitizeNotes(value: unknown, known: ReadonlySet<ID>): TaskNotes {
  if (typeof value !== 'object' || value === null) return {};
  const notes: TaskNotes = {};
  for (const [taskId, days] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(taskId) || typeof days !== 'object' || days === null) continue;
    const clean: Record<string, string> = {};
    for (const [dayKey, note] of Object.entries(days as Record<string, unknown>)) {
      if (typeof note === 'string' && note.trim()) clean[dayKey] = note;
    }
    notes[taskId] = clean;
  }
  return notes;
}
