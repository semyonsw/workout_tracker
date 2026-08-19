/**
 * Library store — the exercises and routines, on disk.
 *
 * These used to be `useState(seedExercises)` in `AppShell`, which was fine while
 * the library was read-only: the seed was the library, and nothing edited it. It
 * stops being fine the moment the user can ADD and DELETE exercises, because
 * state that lives in a component is state that is gone on the next cold launch —
 * and an exercise you created, filed under `chest`, and lost overnight is worse
 * than no create button at all.
 *
 * This is still not the database `ARCHITECTURE.md` promises. It is AsyncStorage
 * with the same shapes SQLite will hold, which buys durability now at the cost of
 * loading the whole library into memory — irrelevant at a few dozen rows, and the
 * day `src/db` is wired up every consumer of this store keeps its signature.
 *
 * The rules that matter here:
 *
 *  1. DELETING AN EXERCISE DELETES ITS ROUTINE ITEMS. A routine holding an
 *     `exerciseId` that no longer resolves is a routine that silently plans fewer
 *     sets than it says. `buildDraftSession` skips unresolvable items, so the
 *     alternative isn't a crash — it's a lie in the set count, which is worse.
 *  2. HISTORY IS NEVER TOUCHED. A deleted exercise's `SetHistory` rows stay: they
 *     record something that actually happened, and the log is the one thing in
 *     this app that must be true.
 *  3. REHYDRATION IS VALIDATED, not trusted — same doctrine as the session store.
 *     A row missing `countUnit` reaches `formatCount` and takes the library screen
 *     down with it, so malformed rows are dropped on the way in.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultTargetCount } from '../lib/draft';
import { seedExercises, seedRoutines, seedUser } from '../data/seed';
import type { Exercise, ID, MuscleGroup, Routine, RoutineItem } from '../types/models';

interface LibraryState {
  exercises: Exercise[];
  routines: Routine[];

  addExercise: (exercise: Exercise) => void;
  /**
   * Replace one exercise in place.
   *
   * IN PLACE is the point: the row keeps its id, so every set ever logged against
   * it stays attached and the history, the chart and the overload verdict all follow
   * the rename. Editing by delete-and-recreate — which is what the app forced before
   * this existed — silently orphans all of it.
   */
  updateExercise: (exerciseId: ID, next: Exercise) => void;
  /** Removes the exercise and every routine item pointing at it. */
  deleteExercise: (exerciseId: ID) => void;
  /**
   * A new, empty routine, appended to the list and returned so the caller can
   * open it. Empty on purpose: a routine is defined by the exercises in it, and
   * those are picked in the editor from the library.
   */
  createRoutine: (name?: string) => Routine;
  /** Replaces name + items on one routine. */
  updateRoutine: (routineId: ID, patch: { name: string; items: RoutineItem[] }) => void;
  deleteRoutine: (routineId: ID) => void;
  /** Appends an exercise to a routine with defaults from the exercise itself. */
  appendToRoutine: (routineId: ID, exerciseId: ID) => void;
  /** Back to the shipped library. The only way out of a library you've wrecked. */
  restoreSeedLibrary: () => void;
  /**
   * Replace the library from a restored backup. Returns what actually survived
   * validation, so the screen can report a number it can stand behind rather than
   * the number the file claimed.
   *
   * WHOLESALE, not merged. A backup is a photograph of a library at a moment, and
   * merging it with the current one would resurrect every exercise the user has
   * deleted since — silently, and with no way to tell which is which.
   */
  importLibrary: (raw: { exercises?: unknown; routines?: unknown }) => {
    exercises: number;
    routines: number;
  };
}

/** How many routines an exercise appears in — for the delete confirmation copy. */
export function routineUsageCount(routines: Routine[], exerciseId: ID): number {
  return routines.filter((r) => r.items.some((i) => i.exerciseId === exerciseId)).length;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * "New routine", or "New routine 2" if that name is taken.
 *
 * A placeholder rather than a prompt: the editor opens on the name field, so the
 * fastest path is to type over it. The counter exists because two untitled
 * routines in a list are indistinguishable, and the list is how you find them.
 */
function nextUntitledName(routines: readonly Routine[]): string {
  const base = 'New routine';
  const taken = new Set(routines.map((r) => r.name));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }
  return base;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      exercises: seedExercises,
      routines: seedRoutines,

      addExercise: (exercise) => set({ exercises: [...get().exercises, exercise] }),

      updateExercise: (exerciseId, next) =>
        set({
          exercises: get().exercises.map((e) =>
            // `next.id` is ignored in favour of the key being replaced: an edit can
            // change everything about an exercise except which exercise it is.
            e.id === exerciseId ? { ...next, id: exerciseId } : e,
          ),
        }),

      deleteExercise: (exerciseId) => {
        const { exercises, routines } = get();
        set({
          exercises: exercises.filter((e) => e.id !== exerciseId),
          // Re-`order` the survivors: the field is what the editor sorts by, and a
          // gap in it turns into a drag-and-drop that jumps.
          routines: routines.map((routine) => {
            const items = routine.items.filter((i) => i.exerciseId !== exerciseId);
            if (items.length === routine.items.length) return routine;
            return {
              ...routine,
              items: items.map((item, order) => ({ ...item, order })),
              updatedAt: nowIso(),
            };
          }),
        });
      },

      createRoutine: (name) => {
        const { routines } = get();
        const routine: Routine = {
          id: `r_${Date.now().toString(36)}`,
          ownerId: seedUser.id,
          name: name?.trim() || nextUntitledName(routines),
          items: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set({ routines: [...routines, routine] });
        return routine;
      },

      updateRoutine: (routineId, patch) =>
        set({
          routines: get().routines.map((r) =>
            r.id === routineId ? { ...r, ...patch, updatedAt: nowIso() } : r,
          ),
        }),

      deleteRoutine: (routineId) =>
        set({ routines: get().routines.filter((r) => r.id !== routineId) }),

      /**
       * The target comes from `defaultTargetCount` — the exercise's own number where
       * it has one, and a per-unit fallback where it doesn't. Shared with the
       * mid-workout add path so an exercise appended to a running session and the
       * same exercise appended to a routine plan the same set.
       */
      appendToRoutine: (routineId, exerciseId) => {
        const { exercises, routines } = get();
        const exercise = exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        const target = defaultTargetCount(exercise);
        const sets = exercise.countUnit === 'rounds' ? 12 : 4;

        set({
          routines: routines.map((routine) =>
            routine.id === routineId
              ? {
                  ...routine,
                  updatedAt: nowIso(),
                  items: [
                    ...routine.items,
                    {
                      id: `ri_${Date.now().toString(36)}`,
                      exerciseId: exercise.id,
                      order: routine.items.length,
                      targetSets: sets,
                      targetRepsMax: target,
                      restSeconds: exercise.defaultRestSeconds,
                    },
                  ],
                }
              : routine,
          ),
        });
      },

      restoreSeedLibrary: () => set({ exercises: seedExercises, routines: seedRoutines }),

      importLibrary: (raw) => {
        /*
         * The same validator rehydration uses, deliberately: a file off an SD card
         * has exactly the same trustworthiness as a blob off disk, and a second
         * validator for the same shape is a second thing to keep in step.
         */
        const { exercises, routines } = sanitizeLibrary(raw.exercises, raw.routines, {
          exercises: [],
          routines: [],
        });
        set({ exercises, routines });
        return { exercises: exercises.length, routines: routines.length };
      },
    }),
    {
      name: 'library',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ exercises: state.exercises, routines: state.routines }),
      /*
       * A first launch has nothing persisted, so `merge` isn't called and the
       * initializer's seeds stand. Every later launch replaces them wholesale
       * rather than merging — otherwise deleting a shipped exercise would undo
       * itself on restart.
       */
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<Pick<LibraryState, 'exercises' | 'routines'>>;
        return { ...current, ...sanitizeLibrary(raw.exercises, raw.routines, current) };
      },
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Rehydration guards                                                  */
/* ------------------------------------------------------------------ */

/**
 * A renderable library out of anything at all — a persisted blob, or a backup file.
 *
 * `fallback` is what a MISSING collection becomes: on rehydration that is the seed
 * (a first launch keeps the shipped library), and on an import it is empty (a backup
 * with no routines in it means the user has no routines, not that they get the
 * shipped ones back).
 *
 * Routine items pointing at an exercise that didn't survive are dropped, so the set
 * counts on the home screen match what a session will actually build.
 */
function sanitizeLibrary(
  rawExercises: unknown,
  rawRoutines: unknown,
  fallback: Pick<LibraryState, 'exercises' | 'routines'>,
): Pick<LibraryState, 'exercises' | 'routines'> {
  const exercises = Array.isArray(rawExercises)
    ? rawExercises.filter(isRenderableExercise)
    : fallback.exercises;
  const known = new Set(exercises.map((e) => e.id));
  const routines = Array.isArray(rawRoutines)
    ? rawRoutines.filter(isRenderableRoutine).map((routine) => ({
        ...routine,
        items: routine.items.filter((item) => known.has(item.exerciseId)),
      }))
    : fallback.routines;

  return { exercises, routines };
}

const COUNT_UNITS = new Set(['reps', 'seconds', 'meters', 'rounds']);
const LOAD_MODES = new Set(['external', 'added_bodyweight', 'assisted', 'none']);

/**
 * Does this row have everything the set row and the library list index into?
 *
 * Checked structurally because `SetRow` reaches straight for `exercise.countUnit`
 * and `exercise.loadMode` without asking, and `buildMuscleTree` reads
 * `muscleGroups`. One malformed row would otherwise take out the whole screen.
 */
function isRenderableExercise(value: unknown): value is Exercise {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<Exercise>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    Array.isArray(e.muscleGroups) &&
    e.muscleGroups.every((m): m is MuscleGroup => typeof m === 'string') &&
    typeof e.requiresWeight === 'boolean' &&
    typeof e.countUnit === 'string' &&
    COUNT_UNITS.has(e.countUnit) &&
    typeof e.loadMode === 'string' &&
    LOAD_MODES.has(e.loadMode)
  );
}

function isRenderableRoutine(value: unknown): value is Routine {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<Routine>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    Array.isArray(r.items) &&
    r.items.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const i = item as Partial<RoutineItem>;
      return (
        typeof i.id === 'string' &&
        typeof i.exerciseId === 'string' &&
        Number.isFinite(i.order) &&
        Number.isFinite(i.targetSets)
      );
    })
  );
}
