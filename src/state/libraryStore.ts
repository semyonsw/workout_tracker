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
 * AsyncStorage rather than SQLite: the whole library is a few dozen rows, so
 * loading it into memory costs nothing and every consumer of this store keeps its
 * signature the day it moves.
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
 *  4. THE TRAINING SEQUENCE LIVES HERE TOO, because it is a list of routine ids
 *     and it has to stay in step with them: deleting a routine drops its steps,
 *     and a step pointing at nothing never survives a rehydrate.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultTargetCount, defaultTargetSets } from '../lib/draft';
import { autoLadderFor, isAutoLadder, ladderOf } from '../lib/repLadder';
import { clearExerciseRest } from '../lib/rest';
import { seedExercises, seedRoutines, seedUser } from '../data/seed';
import type {
  Exercise,
  ID,
  MuscleGroup,
  Routine,
  RoutineItem,
  TrainingSequence,
} from '../types/models';

/** Off and empty. A sequence is something the user builds, never a default. */
export const NO_SEQUENCE: TrainingSequence = { isActive: false, routineIds: [], cursor: 0 };

interface LibraryState {
  exercises: Exercise[];
  routines: Routine[];
  /** The optional running order of routines. Off by default — see `NO_SEQUENCE`. */
  sequence: TrainingSequence;

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
  /**
   * `Make every exercise a rep ladder`, applied to the library — see the Settings
   * flag of the same name. Reversible, and that is the whole design of it.
   */
  setLadderOnAllExercises: (on: boolean) => void;
  /**
   * Drop every per-exercise rest override, so the whole library follows the
   * between-sets setting again. See `state/restSync.ts`.
   */
  followGlobalRestOnAllExercises: () => void;
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

  /* --- the training sequence --- */
  /** Turn the sequence on or off. Off is the default and hides it everywhere. */
  setSequenceActive: (isActive: boolean) => void;
  /** Append one step: push → pull → push is three steps, two of them the same. */
  addSequenceStep: (routineId: ID) => void;
  /** Drop the step at `index`, keeping the cursor pointing at the same step. */
  removeSequenceStep: (index: number) => void;
  /** Move a step one place up or down. The only reorder a short list needs. */
  moveSequenceStep: (index: number, direction: -1 | 1) => void;
  /** Point the cursor at a step by hand — "I'm doing pull today, not push". */
  setSequenceCursor: (index: number) => void;
  /**
   * A workout from the current step is finished, so the queue moves on. A no-op
   * when the sequence is off, empty, or the finished routine isn't the step the
   * cursor is on — starting something else never advances the queue.
   */
  advanceSequence: (routineId: ID | undefined) => void;
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
  importLibrary: (raw: { exercises?: unknown; routines?: unknown; sequence?: unknown }) => {
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
      sequence: NO_SEQUENCE,

      addExercise: (exercise) => set({ exercises: [...get().exercises, exercise] }),

      updateExercise: (exerciseId, next) =>
        set({
          exercises: get().exercises.map((e) =>
            // `next.id` is ignored in favour of the key being replaced: an edit can
            // change everything about an exercise except which exercise it is.
            e.id === exerciseId ? { ...next, id: exerciseId } : e,
          ),
        }),

      /**
       * Put an `auto` ladder on every rep-counted exercise, or take back exactly
       * the ones that were put there.
       *
       * THREE things it refuses to touch, and each is a bug it would otherwise be:
       *
       *  1. An exercise that already runs a ladder. Its max is a number the user
       *     tested and its earned reps are sessions they trained; overwriting that
       *     with a seed would throw away the progression this feature is FOR.
       *  2. Anything that is not rep-counted. A plank does not have a ladder —
       *     `ladderOf` is the gate and `autoLadderFor` goes through it, so a hold,
       *     a round and a distance are all left alone rather than handed a rep
       *     prescription in the wrong unit.
       *  3. On the way back off: a ladder that has earned a rep. It stopped being
       *     the setting's to remove the moment a session met it — see
       *     `isAutoLadder`.
       *
       * The `set` is skipped entirely when nothing changed, so toggling this on a
       * library of planks does not rewrite the blob on disk for no reason.
       */
      setLadderOnAllExercises: (on) => {
        const { exercises } = get();
        let changed = false;

        const next = exercises.map((exercise) => {
          if (on) {
            // Already running one: rule 1. `autoLadderFor` would hand the existing
            // ladder straight back, but as a fresh object — writing it would mark
            // the library dirty for a change that isn't one.
            if (ladderOf(exercise)) return exercise;
            const ladder = autoLadderFor(exercise);
            if (!ladder) return exercise; // not rep-counted: rule 2
            changed = true;
            return { ...exercise, ladder };
          }
          if (!isAutoLadder(ladderOf(exercise))) return exercise;
          changed = true;
          const { ladder: _dropped, ...rest } = exercise;
          return rest as Exercise;
        });

        if (changed) set({ exercises: next });
      },

      /**
       * Every exercise goes back to following the between-sets setting.
       *
       * The library half of "setting the global rest sets it everywhere" — see
       * `state/restSync.ts`, which is the only caller and which also reaches the
       * live session. It CLEARS rather than writes the number into each row, and
       * the difference matters: cleared exercises track the setting the next time
       * it moves, while thirty copies of today's value would have to be rewritten
       * again tomorrow.
       *
       * Same shape as `setLadderOnAllExercises` above, for the same reason: a
       * setting that edits the library is worth having when doing it by hand thirty
       * times is how a good default goes unused.
       */
      followGlobalRestOnAllExercises: () => {
        const { exercises } = get();
        let changed = false;

        const next = exercises.map((exercise) => {
          const cleared = clearExerciseRest(exercise);
          if (cleared === exercise) return exercise;
          changed = true;
          return cleared;
        });

        if (changed) set({ exercises: next });
      },

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

      /**
       * Deleting a routine also drops every step that pointed at it: a sequence
       * step whose routine is gone is a queue position with nothing to start.
       */
      deleteRoutine: (routineId) => {
        const { routines, sequence } = get();
        const routineIds = sequence.routineIds.filter((id) => id !== routineId);
        set({
          routines: routines.filter((r) => r.id !== routineId),
          sequence:
            routineIds.length === sequence.routineIds.length
              ? sequence
              : withSteps(sequence, routineIds, sequence.cursor),
        });
      },

      /**
       * A new routine item, starting from what the EXERCISE says about itself.
       *
       * The target comes from `defaultTargetCount` — the exercise's own number
       * where it has one, and a per-unit fallback where it doesn't. Shared with the
       * mid-workout add path so an exercise appended to a running session and the
       * same exercise appended to a routine plan the same set.
       *
       * The set count used to be a hardcoded 4 (12 for rounds), which is where
       * "every plan is four sets forever" came from: nothing else in the app wrote
       * `targetSets`, so 4 was not a starting point, it was the answer. It comes
       * from `defaultTargetSets` now — a per-unit decision that lives in `lib/`
       * beside `defaultTargetCount` — and the editor can change it afterwards,
       * which is what makes it a starting point rather than the answer.
       *
       * NO REST IS COPIED. It used to seed `item.restSeconds` from the exercise,
       * which froze that exercise's rest into the row at the moment it was added —
       * so editing the exercise's rest afterwards changed nothing, and the shipped
       * routines carried three-minute rests nobody had chosen. Rest is resolved
       * from the exercise every time it starts (`lib/rest.ts`); a routine has no
       * opinion about it.
       */
      appendToRoutine: (routineId, exerciseId) => {
        const { exercises, routines } = get();
        const exercise = exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        const target = defaultTargetCount(exercise);
        const sets = defaultTargetSets(exercise);

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
                    },
                  ],
                }
              : routine,
          ),
        });
      },

      // A sequence with no steps cannot be on: there is nothing for it to suggest.
      setSequenceActive: (isActive) => {
        const { sequence } = get();
        set({ sequence: { ...sequence, isActive: isActive && sequence.routineIds.length > 0 } });
      },

      addSequenceStep: (routineId) => {
        const { routines, sequence } = get();
        if (!routines.some((r) => r.id === routineId)) return;
        set({ sequence: { ...sequence, routineIds: [...sequence.routineIds, routineId] } });
      },

      removeSequenceStep: (index) => {
        const { sequence } = get();
        if (index < 0 || index >= sequence.routineIds.length) return;
        set({
          sequence: withSteps(
            sequence,
            sequence.routineIds.filter((_, i) => i !== index),
            // Removing a step ABOVE the cursor shifts everything below it up, so
            // the step that was next up is still next up.
            sequence.cursor - (index < sequence.cursor ? 1 : 0),
          ),
        });
      },

      moveSequenceStep: (index, direction) => {
        const { sequence } = get();
        const target = index + direction;
        if (index < 0 || index >= sequence.routineIds.length) return;
        if (target < 0 || target >= sequence.routineIds.length) return;
        const routineIds = [...sequence.routineIds];
        [routineIds[index], routineIds[target]] = [routineIds[target], routineIds[index]];
        set({ sequence: { ...sequence, routineIds } });
      },

      setSequenceCursor: (index) =>
        set((state) => ({
          sequence: {
            ...state.sequence,
            cursor: clampCursor(index, state.sequence.routineIds.length),
          },
        })),

      advanceSequence: (routineId) => {
        const { sequence } = get();
        const { isActive, routineIds, cursor } = sequence;
        if (!isActive || routineIds.length === 0 || !routineId) return;
        if (routineIds[clampCursor(cursor, routineIds.length)] !== routineId) return;
        // The queue wraps: a sequence is a cycle, not a course you finish.
        set({ sequence: { ...sequence, cursor: (cursor + 1) % routineIds.length } });
      },

      restoreSeedLibrary: () =>
        set({ exercises: seedExercises, routines: seedRoutines, sequence: NO_SEQUENCE }),

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
        /*
         * The sequence comes from the FILE, not from this phone: a restore is
         * "make this phone look like that backup", and keeping the local order on
         * top of an imported routine list would be a sequence whose steps point at
         * whatever ids happened to match. A file written before sequences existed
         * has none, which sanitizes to off-and-empty.
         */
        set({ exercises, routines, sequence: sanitizeSequence(raw.sequence, routines) });
        return { exercises: exercises.length, routines: routines.length };
      },
    }),
    {
      name: 'library',
      /*
       * 2 — REST OVERRIDES ARE STRIPPED ON THE WAY IN, ONCE.
       *
       * Every device that ran an earlier build has a library full of rests nobody
       * chose: `defaultRestSeconds` stamped onto every exercise the editor ever
       * saved, and `restSeconds` on every routine item the shipped routines carried
       * or `appendToRoutine` copied. Those are precisely what made `Between sets
       * 1:30` produce a 3:00 countdown, and leaving them would mean the fix only
       * arrived for someone who went and set the global rest a second time.
       *
       * Deleting user data in a migration is a serious thing to do, so: NONE of
       * these values was ever entered by a user. There was no control anywhere in
       * the app that set a per-exercise rest, and the only per-item control seeded
       * itself from a number that came from the same place. What is being dropped
       * is app-generated noise; what the user actually chose — the setting — is the
       * thing that starts working. Both overrides are settable by hand from this
       * version on, and those survive, because migrations run once.
       */
      version: 2,
      migrate: stripInheritedRest,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        exercises: state.exercises,
        routines: state.routines,
        sequence: state.sequence,
      }),
      /*
       * A first launch has nothing persisted, so `merge` isn't called and the
       * initializer's seeds stand. Every later launch replaces them wholesale
       * rather than merging — otherwise deleting a shipped exercise would undo
       * itself on restart.
       */
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<
          Pick<LibraryState, 'exercises' | 'routines' | 'sequence'>
        >;
        const library = sanitizeLibrary(raw.exercises, raw.routines, current);
        return {
          ...current,
          ...library,
          sequence: sanitizeSequence(raw.sequence, library.routines),
        };
      },
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Migrations                                                          */
/* ------------------------------------------------------------------ */

/**
 * v1 → v2: drop every rest the app wrote behind the user's back. See the note on
 * `version` above for why this is safe, and `lib/rest.ts` for what it fixes.
 *
 * Deliberately tolerant of shape — it runs on a raw blob from disk, before
 * `merge` sanitizes anything, so an array that isn't one is left exactly as it is
 * for the validator below to reject in the normal way.
 *
 * Exported for the test that pins it. It runs once per device and then never
 * again, which is exactly the kind of code that is wrong for a year before anyone
 * notices.
 */
export function stripInheritedRest(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted;
  const state = persisted as { exercises?: unknown; routines?: unknown };

  const exercises = Array.isArray(state.exercises)
    ? state.exercises.map((exercise) =>
        typeof exercise === 'object' && exercise !== null
          ? clearExerciseRest(exercise as Exercise)
          : exercise,
      )
    : state.exercises;

  const routines = Array.isArray(state.routines)
    ? state.routines.map((routine) => {
        if (typeof routine !== 'object' || routine === null) return routine;
        const items = (routine as { items?: unknown }).items;
        if (!Array.isArray(items)) return routine;
        return {
          ...routine,
          items: items.map((item) => {
            if (typeof item !== 'object' || item === null) return item;
            const { restSeconds: _dropped, ...rest } = item as Record<string, unknown>;
            return rest;
          }),
        };
      })
    : state.routines;

  return { ...state, exercises, routines };
}

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

/**
 * A sequence with a new step list: the cursor clamped into it, and the whole
 * thing switched OFF if nothing is left. An active sequence with no steps would
 * be a home screen promising a next workout it cannot name.
 */
function withSteps(sequence: TrainingSequence, routineIds: ID[], cursor: number): TrainingSequence {
  return {
    isActive: sequence.isActive && routineIds.length > 0,
    routineIds,
    cursor: clampCursor(cursor, routineIds.length),
  };
}

/** An index that is inside a list of `length`, or 0 for an empty one. */
function clampCursor(value: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.round(value)), length - 1);
}

/**
 * A usable sequence out of anything at all.
 *
 * Steps pointing at a routine that no longer exists are dropped — the whole
 * point of the sequence is that its next step can be STARTED, and an id that
 * resolves to nothing is a home screen suggesting a workout that isn't there.
 */
function sanitizeSequence(value: unknown, routines: readonly Routine[]): TrainingSequence {
  if (typeof value !== 'object' || value === null) return NO_SEQUENCE;
  const raw = value as Partial<TrainingSequence>;
  const known = new Set(routines.map((r) => r.id));
  const routineIds = Array.isArray(raw.routineIds)
    ? raw.routineIds.filter((id): id is ID => typeof id === 'string' && known.has(id))
    : [];
  return {
    isActive: raw.isActive === true && routineIds.length > 0,
    routineIds,
    cursor: clampCursor(typeof raw.cursor === 'number' ? raw.cursor : 0, routineIds.length),
  };
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
