/**
 * Workout history — the finished sessions, on disk.
 *
 * Until now, finishing a workout logged a line to the console. Everything the
 * user did was assembled into `SetHistory` rows, printed, and dropped: the app
 * that exists to make progressive overload visible could not remember a single
 * session it had watched. This store is where a finished workout actually goes,
 * and it is what the History section reads.
 *
 * The rules, all of them the same doctrine as `libraryStore` and the session
 * store:
 *
 *  1. NEWEST FIRST, ALWAYS. The list is read backwards from today, so the array is
 *     kept in that order rather than sorted at render time by four different
 *     screens.
 *  2. NOTHING EMPTY IS RECORDED. A session where nothing was logged is not a
 *     workout; `buildCompletedWorkout` returns null and this store writes nothing.
 *  3. FINISHING TWICE IS ONE WORKOUT. A save for an id that is already present
 *     REPLACES it. The id is the session's own, so a double-tap on Finish, or a
 *     finish that raced a rehydration, cannot produce two rows for one workout.
 *  4. REHYDRATION IS VALIDATED, NOT TRUSTED. A half-written blob used to be a
 *     crash on the screen that read it, and because it is persisted, a crash that
 *     came back on every launch. Malformed workouts and malformed set rows are
 *     dropped on the way in; what survives is renderable by construction.
 *  5. THE LOG IS APPEND-MOSTLY. The only deletions are ones the user asks for by
 *     name — a single workout, or all of it from Settings. Nothing in here is
 *     rewritten by the app.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildCompletedWorkout, type CompletedExercise, type CompletedWorkout } from '../lib/completedWorkout';
import type { DraftSession } from '../lib/draft';
import type { ID, RecentSessionSummary, SetHistory } from '../types/models';

/**
 * How many workouts are kept.
 *
 * Not a product decision — a storage one. This store lives in AsyncStorage, which
 * is one string per key and has a real (platform-dependent) ceiling, and every
 * workout carries its set rows. 250 sessions is about two years of training four
 * times a week, which is far past the point where `src/db` (SQLite, already
 * schema'd) should have taken over. The cap exists so the failure mode at year
 * three is "the oldest workout falls off" rather than "the write silently fails
 * and the last month is gone".
 */
export const MAX_WORKOUTS = 250;

interface WorkoutHistoryState {
  /** Finished workouts, newest first. */
  workouts: CompletedWorkout[];

  /**
   * Record a finished session. Returns what was stored, or null if there was
   * nothing worth storing.
   */
  saveSession: (session: DraftSession, endedAt?: Date) => CompletedWorkout | null;
  deleteWorkout: (id: ID) => void;
  clearHistory: () => void;
}

export const useWorkoutHistory = create<WorkoutHistoryState>()(
  persist(
    (set, get) => ({
      workouts: [],

      saveSession: (session, endedAt) => {
        const workout = buildCompletedWorkout(session, endedAt);
        if (!workout) return null;

        const withoutDuplicate = get().workouts.filter((w) => w.id !== workout.id);
        set({
          workouts: [workout, ...withoutDuplicate]
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, MAX_WORKOUTS),
        });
        return workout;
      },

      deleteWorkout: (id) => set({ workouts: get().workouts.filter((w) => w.id !== id) }),

      clearHistory: () => set({ workouts: [] }),
    }),
    {
      name: 'workout-history',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ workouts: state.workouts }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<Pick<WorkoutHistoryState, 'workouts'>>;
        const workouts = Array.isArray(raw.workouts)
          ? raw.workouts
              .map(sanitizeWorkout)
              .filter((w): w is CompletedWorkout => w !== null)
              .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
              .slice(0, MAX_WORKOUTS)
          : current.workouts;
        return { ...current, workouts };
      },
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

const COUNT_UNITS = new Set(['reps', 'seconds', 'meters', 'rounds']);
const LOAD_MODES = new Set(['external', 'added_bodyweight', 'assisted', 'none']);

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isIsoish(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

/**
 * A workout the history screen can render, or null.
 *
 * Repaired rather than rejected wherever the damage is cosmetic — a missing
 * duration is a number, not a reason to lose the record of a session that
 * happened. Rejected only when the thing that identifies it (an id, a title, a
 * date) is not there, because a row that cannot say what or when it was is not a
 * record of anything.
 */
function sanitizeWorkout(value: unknown): CompletedWorkout | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<CompletedWorkout>;

  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  if (!isIsoish(raw.startedAt)) return null;

  const sets = Array.isArray(raw.sets)
    ? raw.sets.filter(isRenderableSet).map((row) => ({ ...row, isCompleted: true }))
    : [];
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map(sanitizeCompletedExercise)
        .filter((e): e is CompletedExercise => e !== null)
    : [];

  return {
    id: raw.id,
    title: raw.title,
    ...(typeof raw.routineId === 'string' ? { routineId: raw.routineId } : {}),
    startedAt: raw.startedAt,
    endedAt: isIsoish(raw.endedAt) ? raw.endedAt : raw.startedAt,
    durationMinutes: Math.max(1, Math.round(finiteOr(raw.durationMinutes, 1))),
    setCount: Math.max(0, Math.round(finiteOr(raw.setCount, sets.length))),
    totalVolumeKg: Math.max(0, Math.round(finiteOr(raw.totalVolumeKg, 0))),
    exercises,
    sets,
  };
}

function sanitizeCompletedExercise(value: unknown): CompletedExercise | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<CompletedExercise>;
  if (typeof raw.exerciseId !== 'string' || typeof raw.name !== 'string') return null;
  if (typeof raw.summary !== 'string') return null;

  return {
    exerciseId: raw.exerciseId,
    name: raw.name,
    countUnit: COUNT_UNITS.has(raw.countUnit as string) ? raw.countUnit! : 'reps',
    loadMode: LOAD_MODES.has(raw.loadMode as string) ? raw.loadMode! : 'none',
    setCount: Math.max(0, Math.round(finiteOr(raw.setCount, 0))),
    summary: raw.summary,
    topWeightKg:
      typeof raw.topWeightKg === 'number' && Number.isFinite(raw.topWeightKg)
        ? raw.topWeightKg
        : null,
  };
}

/**
 * Does this row have everything the overload engine and the shorthand read?
 *
 * Stricter than the workout itself: these rows are the input to every future
 * suggestion the app makes, and one row with a `NaN` count would poison a verdict
 * rather than break a screen — which is harder to notice and worse.
 */
function isRenderableSet(value: unknown): value is SetHistory {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<SetHistory>;
  return (
    typeof row.id === 'string' &&
    typeof row.sessionId === 'string' &&
    typeof row.exerciseId === 'string' &&
    isIsoish(row.performedAt) &&
    Number.isFinite(row.setIndex) &&
    Number.isFinite(row.count) &&
    (row.weightKg == null || Number.isFinite(row.weightKg)) &&
    COUNT_UNITS.has(row.countUnit as string) &&
    LOAD_MODES.has(row.loadMode as string) &&
    typeof row.isWarmup === 'boolean'
  );
}

/* ------------------------------------------------------------------ */
/* Derived                                                             */
/* ------------------------------------------------------------------ */

export interface HistoryTotals {
  workouts: number;
  sets: number;
  volumeKg: number;
}

/** The one line above the list: how much training is actually in here. */
export function historyTotals(workouts: readonly CompletedWorkout[]): HistoryTotals {
  let sets = 0;
  let volumeKg = 0;
  for (const workout of workouts) {
    sets += workout.setCount;
    volumeKg += workout.totalVolumeKg;
  }
  return { workouts: workouts.length, sets, volumeKg };
}

/**
 * The home screen's `RECENT` rows.
 *
 * A different type on purpose — four fields, no set rows. See the note on
 * `RecentSessionSummary`.
 */
export function recentSummaries(
  workouts: readonly CompletedWorkout[],
  limit = 4,
): RecentSessionSummary[] {
  return workouts.slice(0, limit).map((workout) => ({
    id: workout.id,
    title: workout.title,
    performedAt: workout.startedAt,
    durationMinutes: workout.durationMinutes,
  }));
}
