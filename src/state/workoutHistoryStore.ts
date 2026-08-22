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

import {
  buildCompletedWorkout,
  workoutNumbers,
  type CompletedExercise,
  type CompletedWorkout,
  type WorkoutNumberAnchor,
} from '../lib/completedWorkout';
import type { DraftSession } from '../lib/draft';
import type { ID, RecentSessionSummary, SetHistory } from '../types/models';

/**
 * How many workouts are kept.
 *
 * Not a product decision — a storage one. This store lives in AsyncStorage, which
 * is one string per key and has a real (platform-dependent) ceiling, and every
 * workout carries its set rows. 250 sessions is about two years of training four
 * times a week, which is far past the point where SQLite should have taken over.
 * The cap exists so the failure mode at year three is "the oldest workout falls off" rather than "the write silently fails
 * and the last month is gone".
 */
export const MAX_WORKOUTS = 250;

interface WorkoutHistoryState {
  /** Finished workouts, newest first. */
  workouts: CompletedWorkout[];
  /**
   * The one pinned workout number, or null for "the oldest one is 1".
   *
   * See `WorkoutNumberAnchor`: people arrive with a training history the app has
   * never seen, and one pinned pair — "this session was number 91" — is what makes
   * every other workout land on the right ordinal without editing ninety rows.
   */
  numbering: WorkoutNumberAnchor | null;

  /**
   * Record a finished session. Returns what was stored, or null if there was
   * nothing worth storing.
   */
  saveSession: (session: DraftSession, endedAt?: Date) => CompletedWorkout | null;
  deleteWorkout: (id: ID) => void;
  clearHistory: () => void;
  /**
   * Pin one workout's number. Everything before and after renumbers from it.
   *
   * A number below 1 is refused rather than clamped: "this is workout 0" is a typo
   * every time, and silently storing 1 instead would make the row the user was
   * looking at disagree with what they typed.
   */
  setWorkoutNumber: (id: ID, number: number) => void;
  /** Back to "the oldest workout is 1". */
  clearWorkoutNumbering: () => void;
  /**
   * Replace the log from a restored backup, returning how many workouts actually
   * survived validation — the honest number for the screen to report, which is not
   * necessarily the number the file claimed.
   *
   * WHOLESALE, not merged. Merging two logs sounds generous and produces a history
   * nobody can audit: the same session from two devices would appear twice unless
   * every id matched, and rule 3 of this store says finishing twice is one workout.
   * A restore is "make this phone look like that backup".
   */
  importWorkouts: (raw: unknown, numbering?: unknown) => number;
}

export const useWorkoutHistory = create<WorkoutHistoryState>()(
  persist(
    (set, get) => ({
      workouts: [],
      numbering: null,

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

      /**
       * Delete one workout.
       *
       * If it was the workout the numbering was pinned to, the pin MOVES to a
       * neighbour carrying the number that neighbour already had — otherwise
       * deleting the one session someone had numbered would silently reset the
       * whole column to "the oldest is 1". The other workouts' numbers are
       * unaffected by the move, which is the point of it.
       */
      deleteWorkout: (id) => {
        const { workouts, numbering } = get();
        const remaining = workouts.filter((w) => w.id !== id);

        if (!numbering || numbering.workoutId !== id) {
          set({ workouts: remaining });
          return;
        }

        const numbers = workoutNumbers(workouts, numbering);
        const index = workouts.findIndex((w) => w.id === id);
        // The workout just newer than the one going, or just older if it was the
        // newest. Both keep every surviving number exactly where it was.
        const heir = workouts[index - 1] ?? workouts[index + 1] ?? null;
        set({
          workouts: remaining,
          numbering: heir ? { workoutId: heir.id, number: numbers[heir.id] } : null,
        });
      },

      // The pin points at a workout that is about to stop existing.
      clearHistory: () => set({ workouts: [], numbering: null }),

      setWorkoutNumber: (id, number) => {
        const rounded = Math.round(number);
        if (!Number.isFinite(rounded) || rounded < 1) return;
        if (!get().workouts.some((w) => w.id === id)) return;
        set({ numbering: { workoutId: id, number: rounded } });
      },

      clearWorkoutNumbering: () => set({ numbering: null }),

      importWorkouts: (raw, numbering) => {
        // The same guard rehydration uses: a file off an SD card is exactly as
        // trustworthy as a blob off disk, and one validator cannot disagree with
        // itself. See `sanitizeWorkouts`.
        const workouts = sanitizeWorkouts(raw, []);
        set({ workouts, numbering: sanitizeNumbering(numbering, workouts) });
        return workouts.length;
      },
    }),
    {
      name: 'workout-history',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ workouts: state.workouts, numbering: state.numbering }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<
          Pick<WorkoutHistoryState, 'workouts' | 'numbering'>
        >;
        const workouts = sanitizeWorkouts(raw.workouts, current.workouts);
        return { ...current, workouts, numbering: sanitizeNumbering(raw.numbering, workouts) };
      },
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

/**
 * A renderable, newest-first, capped log out of anything at all — a persisted blob
 * or a backup file. `fallback` is what a MISSING array becomes.
 */
function sanitizeWorkouts(raw: unknown, fallback: CompletedWorkout[]): CompletedWorkout[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .map(sanitizeWorkout)
    .filter((w): w is CompletedWorkout => w !== null)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, MAX_WORKOUTS);
}

/**
 * A pin that still points at something, or null.
 *
 * Dropped rather than repaired when the workout is gone: the anchor's whole
 * meaning is "THIS session is number N", and keeping the number while losing the
 * session it belonged to would renumber the log by an arbitrary offset.
 */
function sanitizeNumbering(
  value: unknown,
  workouts: readonly CompletedWorkout[],
): WorkoutNumberAnchor | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<WorkoutNumberAnchor>;
  if (typeof raw.workoutId !== 'string') return null;
  if (typeof raw.number !== 'number' || !Number.isFinite(raw.number)) return null;
  const number = Math.round(raw.number);
  if (number < 1) return null;
  if (!workouts.some((w) => w.id === raw.workoutId)) return null;
  return { workoutId: raw.workoutId, number };
}

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
        .map((exercise) => sanitizeCompletedExercise(exercise, sets))
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

/**
 * `rows` are the workout's own set rows, and they are what makes `totalCount`
 * survive an upgrade: the field was added in 0.10.0, so every workout logged
 * before it has a summary and no total. Summing the rows recovers the real number
 * rather than showing a 0 for training that happened.
 */
function sanitizeCompletedExercise(
  value: unknown,
  rows: readonly SetHistory[],
): CompletedExercise | null {
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
    totalCount: Math.max(
      0,
      finiteOr(
        raw.totalCount,
        rows
          .filter((row) => row.exerciseId === raw.exerciseId)
          .reduce((sum, row) => sum + row.count, 0),
      ),
    ),
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
