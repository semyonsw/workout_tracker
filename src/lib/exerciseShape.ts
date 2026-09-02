/**
 * An exercise's SHAPE — which inputs a set of it will render.
 *
 * `requiresWeight` and `countUnit` are two independent axes, and together they
 * fully determine the set row: whether there is a weight cell at all, and what
 * the second number counts. `loadMode` then says how to READ the weight.
 *
 * This is the single place those three flags get turned into words, so the
 * library list, the create-exercise preview and the set row can never disagree
 * about what an exercise is.
 *
 * A rep LADDER is the fourth axis, and it only ever SUBTRACTS: it owns the rep
 * target of every set, so the well that used to set one is not part of the shape
 * any more. See `ladderOwnsReps`.
 */

import type { CountUnit, Exercise, LoadMode, TimerMode } from '../types/models';
import { resolveTimerMode } from './setTimer';

export interface ShapeInput {
  requiresWeight: boolean;
  countUnit: CountUnit;
  loadMode: LoadMode;
  /** Absent = the number is typed. See `lib/setTimer.ts`. */
  timerMode?: TimerMode;
  /**
   * A rep ladder is running, so THE LADDER OWNS THE REP TARGET.
   *
   * It changes the shape: there is no per-set rep number to set, because the max
   * derives all of them (`lib/repLadder.ts`). The well is removed rather than
   * disabled, for the same reason the weight well is — and leaving it in is how the
   * screen ended up with two answers to one question, one of which silently stayed
   * at 12. See `lib/exerciseDraft.ts`.
   */
  ladderOn?: boolean;
}

/** Reps, and a ladder switched on to prescribe them. */
function ladderOwnsReps(exercise: ShapeInput): boolean {
  return exercise.ladderOn === true && exercise.countUnit === 'reps';
}

/** The count axis as a noun: "reps" / "time" / "metres" / "rounds". */
function countNoun(countUnit: CountUnit): string {
  switch (countUnit) {
    case 'seconds':
      return 'time';
    case 'meters':
      return 'metres';
    case 'rounds':
      return 'rounds';
    default:
      return 'reps';
  }
}

/**
 * The library list's micro line: `KG · REPS · ADDED BODYWEIGHT` / `REPS ONLY` /
 * `TIME · COUNTDOWN`.
 *
 * Load mode is stated only when there IS a load — an exercise with no weight
 * cell has no load mode worth naming. In its place, unweighted work states how
 * the number is produced: whether picking this gives you a clock that runs down,
 * one that runs up, or a field you type into. That is the thing you actually
 * want to know before adding a plank to a routine. Rendered uppercase by the
 * caller's style; uppercased here too so the string is correct in an
 * accessibility label.
 */
export function describeShape(exercise: ShapeInput | Exercise): string {
  const noun = countNoun(exercise.countUnit);
  if (!exercise.requiresWeight) {
    const timer = resolveTimerMode(exercise);
    if (timer === 'countdown') return `${noun} · countdown`.toUpperCase();
    if (timer === 'countup') return `${noun} · count up`.toUpperCase();
    return `${noun} only`.toUpperCase();
  }
  return `kg · ${noun} · ${exercise.loadMode.replace(/_/g, ' ')}`.toUpperCase();
}

/**
 * The create screen's kicker: `SET INPUTS · WEIGHT + REPS`.
 *
 * It sits directly above the wells it describes and goes `green-bright` because
 * flipping the toggle CHANGES it — the label is the receipt for the change.
 */
export function describeSetInputs(exercise: ShapeInput): string {
  const noun = countNoun(exercise.countUnit);
  // Named, not omitted: the reps well is gone from under this label and the label
  // is the receipt for that.
  if (ladderOwnsReps(exercise)) return exercise.requiresWeight ? 'weight + ladder' : 'ladder reps';
  if (exercise.requiresWeight) return `weight + ${noun}`;
  if (exercise.countUnit === 'meters') return 'distance + duration';
  if (exercise.countUnit === 'seconds') return 'duration only';
  return `${noun} only`;
}

export interface WellSpec {
  /** Micro label, e.g. `DEFAULT KG`. */
  label: string;
  /** Which field this well edits — the caller owns the value. */
  field: 'weight' | 'count' | 'duration';
  /** Trailing micro unit. Omitted where the value is self-evidently a clock. */
  unit?: string;
}

/**
 * The one or two numeric wells for an exercise's shape.
 *
 * The weight well is REMOVED when `requiresWeight` is false, never disabled — a
 * greyed-out input is a promise that it might come back, and this one won't.
 */
export function wellsFor(exercise: ShapeInput): WellSpec[] {
  // A ladder prescribes every rep of every set from its max, so there is no rep
  // target to well — the max's own ± is the control. An unweighted laddered
  // exercise therefore has no wells at all, which is correct: one number, and it is
  // in the ladder card.
  if (ladderOwnsReps(exercise)) {
    return exercise.requiresWeight ? [{ label: 'default kg', field: 'weight', unit: 'kg' }] : [];
  }

  if (exercise.requiresWeight) {
    const second: WellSpec =
      exercise.countUnit === 'reps'
        ? { label: 'target reps', field: 'count', unit: 'reps' }
        : exercise.countUnit === 'meters'
          ? { label: 'target distance', field: 'count', unit: 'm' }
          : { label: 'target time', field: 'count' };
    return [{ label: 'default kg', field: 'weight', unit: 'kg' }, second];
  }

  switch (exercise.countUnit) {
    case 'rounds':
      return [
        { label: 'rounds', field: 'count', unit: '×' },
        { label: 'round length', field: 'duration' },
      ];
    case 'seconds':
      return [{ label: 'duration', field: 'duration' }];
    case 'meters':
      return [
        { label: 'distance', field: 'count', unit: 'm' },
        { label: 'duration', field: 'duration' },
      ];
    default:
      return [{ label: 'target reps', field: 'count', unit: 'reps' }];
  }
}
