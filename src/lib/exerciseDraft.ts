/**
 * The editable shape of an exercise, and the two directions it converts.
 *
 *   library row ──exerciseToDraft──► draft ──applyDraftToExercise──► same row, edited
 *                                     └─────draftToExercise───────► a new row
 *
 * This moved out of `CreateExerciseScreen` when that screen learned to EDIT as well
 * as create. The mapping stopped being screen detail at that moment: a mistake in it
 * no longer means a wrong default on a new exercise, it means silently rewriting a
 * row the user already has history against. So it lives here, pure and tested, next
 * to the other decisions.
 *
 * The one rule that needs stating twice, because it is the whole reason editing is
 * safe: `applyDraftToExercise` PRESERVES IDENTITY. `id` is what every logged set
 * points at, and `createdAt` is when the exercise entered the library, not when it
 * was last touched. Editing by delete-and-recreate — which is what the app forced
 * before there was an editor — orphans every set ever logged.
 *
 * The subtlety worth knowing: `Exercise.defaultCount` is in the exercise's own count
 * unit, while the draft splits that number across TWO wells (a count and a
 * duration). Which well holds it is decided once, by `targetIsDuration` below, and
 * both directions read that same rule — otherwise a round-trip through the editor
 * would quietly move a plank's 2:00 into its rep target.
 */

import type { CountUnit, Exercise, MuscleGroup, TimerMode } from '../types/models';
import { DEFAULT_PREPARE_SECONDS } from './setTimer';
import type { LoadMode } from '../types/models';

/** The editable shape of an exercise. A draft, not an `Exercise` yet. */
export interface ExerciseDraft {
  name: string;
  /** Primary first — the first one picked decides the cluster. */
  muscleGroups: MuscleGroup[];
  requiresWeight: boolean;
  countUnit: CountUnit;
  loadMode: LoadMode;
  timerMode: TimerMode;
  prepareSeconds: number;
  defaultWeightKg: number;
  /** Reps, metres, or the number of rounds — whatever `countUnit` counts. */
  targetCount: number;
  /** Seconds per set: a round length, or a swim duration. */
  durationSeconds: number;
  incrementKg: number;
  /**
   * Seconds of rest. Read from Settings by the caller and shown as a fact — rest
   * lengths are global now, so this is not an override, just the number a session
   * will actually run.
   */
  restSeconds: number;
}

/**
 * Does the target live in the DURATION well rather than the count well?
 *
 * Unweighted time-counted work — a plank's hold, a boxing round's length — is the
 * one shape where the number the user sets is a clock. Mirrors `wellsFor`.
 */
function targetIsDuration(shape: { requiresWeight: boolean; countUnit: CountUnit }): boolean {
  return !shape.requiresWeight && (shape.countUnit === 'seconds' || shape.countUnit === 'rounds');
}

/** A usable positive number, or the fallback. */
function positiveOr(value: number | undefined | null, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * A blank draft, named from whatever the user typed into the library search.
 *
 * `muscle` is the group the create flow was opened FROM — the library's tree hangs
 * an `+ Add exercise to chest` row off every muscle group, and arriving here with
 * `chest` already picked is the whole point of that row. It lands first in
 * `muscleGroups`, which makes it the primary and therefore decides where the
 * exercise files: the user is returned to exactly the group they were looking at.
 *
 * The chips are still live, so it is a starting point rather than a lock-in.
 */
export function emptyExerciseDraft(
  name: string,
  muscle?: MuscleGroup,
  restSeconds = 120,
): ExerciseDraft {
  return {
    name,
    muscleGroups: muscle ? [muscle] : [],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    timerMode: 'manual',
    prepareSeconds: DEFAULT_PREPARE_SECONDS,
    defaultWeightKg: 30,
    targetCount: 12,
    durationSeconds: 180,
    incrementKg: 2.5,
    restSeconds,
  };
}

/**
 * An existing library row, back into an editable draft.
 *
 * Every optional field gets a concrete value, because the wells and the segmented
 * controls have to render SOMETHING — and the value chosen is what that field means
 * when it is absent.
 */
export function exerciseToDraft(exercise: Exercise, restSeconds = 120): ExerciseDraft {
  const timeCounted = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';
  const inDuration = targetIsDuration(exercise);
  const target = positiveOr(exercise.defaultCount, timeCounted ? 60 : 12);

  return {
    name: exercise.name,
    muscleGroups: [...exercise.muscleGroups],
    requiresWeight: exercise.requiresWeight,
    countUnit: exercise.countUnit,
    // A weighted exercise always has a real load mode; `none` only means "no load".
    loadMode:
      exercise.loadMode === 'none' && exercise.requiresWeight ? 'external' : exercise.loadMode,
    timerMode: exercise.timerMode ?? 'manual',
    prepareSeconds: positiveOr(exercise.prepareSeconds, DEFAULT_PREPARE_SECONDS),
    defaultWeightKg: positiveOr(exercise.defaultWeightKg, 20),
    targetCount: inDuration ? 12 : target,
    durationSeconds: inDuration ? target : 180,
    incrementKg: positiveOr(exercise.incrementKg, 2.5),
    restSeconds,
  };
}

/**
 * Turn a finished draft into a library row.
 *
 * `durationSeconds` collapses into `defaultCount` for unweighted time-based units,
 * because in `SetHistory` a round IS its length — one row, one number, no second
 * column to keep in sync.
 */
export function draftToExercise(
  draft: ExerciseDraft,
  id: string,
  ownerId: string,
  now: Date = new Date(),
): Exercise {
  const timed = draft.timerMode !== 'manual';

  return {
    id,
    ownerId,
    name: draft.name.trim(),
    muscleGroups: draft.muscleGroups,
    requiresWeight: draft.requiresWeight,
    countUnit: draft.countUnit,
    /*
     * The invariant every reader depends on: there is a load mode exactly when
     * there is a load. `formatWeight` and `describeShape` both branch on it, so a
     * weighted row claiming `none` renders a weight cell with no way to read the
     * number in it. Repaired here rather than trusted, because a draft can arrive
     * from a rehydrated row as well as from the toggle that keeps the two in step.
     */
    loadMode: draft.requiresWeight
      ? draft.loadMode === 'none'
        ? 'external'
        : draft.loadMode
      : 'none',
    // Omitted rather than stored as 'manual': absent is the default, and a row
    // that says nothing about a timer is easier to read than one that says "off".
    timerMode: timed ? draft.timerMode : undefined,
    prepareSeconds: timed ? draft.prepareSeconds : undefined,
    isUnilateral: false,
    incrementKg: draft.requiresWeight ? draft.incrementKg : undefined,
    /*
     * The two numbers the wells set. These used to be dropped on the floor — the
     * create screen let you set a default weight and no field carried it, so the
     * first session of a new exercise opened with an empty weight cell whatever you
     * had typed.
     */
    defaultWeightKg: draft.requiresWeight ? draft.defaultWeightKg : undefined,
    defaultCount: targetIsDuration(draft) ? draft.durationSeconds : draft.targetCount,
    defaultRestSeconds: draft.restSeconds,
    isArchived: false,
    createdAt: now.toISOString(),
  };
}

/**
 * Apply an edited draft to an existing row, preserving what identifies it.
 *
 * Editing a SHIPPED exercise keeps `ownerId: null` too — where a row came from is a
 * fact, and rewriting it would make `Restore the shipped exercise library` lie about
 * what it restores. The fields this screen has no control over (aliases, equipment,
 * unilateral, archived) are carried across untouched rather than reset to a default
 * the editor never showed anyone.
 */
export function applyDraftToExercise(draft: ExerciseDraft, existing: Exercise): Exercise {
  return {
    ...draftToExercise(draft, existing.id, existing.ownerId ?? ''),
    ownerId: existing.ownerId,
    createdAt: existing.createdAt,
    isArchived: existing.isArchived,
    isUnilateral: existing.isUnilateral,
    aliases: existing.aliases,
    equipment: existing.equipment,
  };
}
