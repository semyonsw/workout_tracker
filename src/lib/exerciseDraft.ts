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
import { clampMax, ladderOf, supportsLadder } from './repLadder';
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

  /**
   * THE REP LADDER, as three fields rather than the model's optional object.
   *
   * A form cannot render an absence: the max stepper needs a number to show
   * whether the ladder is on or off, and the toggle needs somewhere to remember
   * the max it had when it was switched off — otherwise turning it off and back on
   * loses the number and there is no undo for that.
   *
   * `ladderEarned` is not editable and is not shown. It is carried through the
   * editor untouched so that renaming an exercise does not throw away the reps its
   * ladder has earned — the same reason `applyDraftToExercise` preserves `id` and
   * `createdAt`. It resets to zero only when the MAX is changed by hand, because
   * two reps earned against a max of 16 say nothing about a max of 18.
   */
  ladderOn: boolean;
  ladderMax: number;
  ladderEarned: number;
}

/**
 * Nudge the ladder's max, resetting the progress earned against the old one.
 *
 * Here rather than in the screen for the usual reason: "what happens to the reps
 * you have earned when you retest your max" is a decision about the scheme, and a
 * screen is composition. The answer is that they go — a max you just typed is a
 * fresh test, and carrying two earned reps into it would hand out a rung nobody
 * climbed.
 */
export function bumpLadderMax(draft: ExerciseDraft, delta: number): ExerciseDraft {
  const next = clampMax(draft.ladderMax + delta);
  if (next === draft.ladderMax) return draft;
  return { ...draft, ladderMax: next, ladderEarned: 0 };
}

/**
 * Switch the ladder on or off.
 *
 * Switching it ON seeds the max from the target reps already on the screen, which
 * is the closest thing the user has told us to a max — a movement they said they
 * do twelve of is a movement whose max is nearer twelve than the number a
 * constant in this file would have picked. Switching it OFF keeps the max, so the
 * toggle is reversible.
 */
export function toggleLadder(draft: ExerciseDraft, on: boolean): ExerciseDraft {
  if (!on) return { ...draft, ladderOn: false };
  const seeded = draft.ladderMax > 0 ? draft.ladderMax : draft.targetCount;
  return { ...draft, ladderOn: true, ladderMax: clampMax(seeded) };
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
  ladderOn = false,
): ExerciseDraft {
  const draft: ExerciseDraft = {
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
    /*
     * Off here, and switched on below when the caller says so — `Make every
     * exercise a rep ladder` in Settings, read by the caller because a `lib/`
     * function does not get to reach into a store.
     */
    ladderOn: false,
    ladderMax: 0,
    ladderEarned: 0,
  };

  // Through `toggleLadder` rather than by setting the two fields here, so a
  // ladder that arrives switched on gets its max seeded exactly the way one
  // switched on by hand does — see the comment above.
  return ladderOn ? toggleLadder(draft, true) : draft;
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
  // Through `ladderOf`, so a row whose count unit changed under it — or whose
  // ladder is a hand-edited `{ max: "16" }` — opens as off rather than as a form
  // holding a number the scheme would refuse.
  const ladder = ladderOf(exercise);

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
    ladderOn: ladder != null,
    ladderMax: ladder?.max ?? 0,
    ladderEarned: ladder?.earned ?? 0,
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
    /*
     * The ladder, only where the scheme applies. `supportsLadder` is checked here
     * as well as in `ladderOf` because a draft can leave this screen with the
     * toggle on and the count unit switched to seconds — flipping "requires
     * weight" rewrites the unit — and an exercise that stores a ladder its unit
     * cannot run is a row whose editor and whose session disagree.
     */
    ladder:
      draft.ladderOn && supportsLadder(draft.countUnit)
        ? { max: clampMax(draft.ladderMax), earned: Math.max(0, Math.round(draft.ladderEarned)) }
        : undefined,
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
