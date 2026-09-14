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

import { t, term, type Language } from './i18n';
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
function countNoun(countUnit: CountUnit, lang: Language): string {
  switch (countUnit) {
    case 'seconds':
      return t('time', lang);
    case 'meters':
      return t('metres', lang);
    case 'rounds':
      return t('rounds', lang);
    default:
      return t('reps', lang);
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
export function describeShape(exercise: ShapeInput | Exercise, lang: Language = 'en'): string {
  const noun = countNoun(exercise.countUnit, lang);
  if (!exercise.requiresWeight) {
    const timer = resolveTimerMode(exercise);
    if (timer === 'countdown') return `${noun} · ${t('countdown', lang)}`.toUpperCase();
    if (timer === 'countup') return `${noun} · ${t('count up', lang)}`.toUpperCase();
    return t('{noun} only', lang, { noun }).toUpperCase();
  }
  // The load mode is stored with an underscore in it (`added_bodyweight`), so it
  // is looked up as the spaced phrase the catalogue actually carries.
  const load = t(exercise.loadMode.replace(/_/g, ' '), lang);
  return `${term('unit', 'kg', lang)} · ${noun} · ${load}`.toUpperCase();
}

/**
 * The create screen's kicker: `SET INPUTS · WEIGHT + REPS`.
 *
 * It sits directly above the wells it describes and goes `green-bright` because
 * flipping the toggle CHANGES it — the label is the receipt for the change.
 */
export function describeSetInputs(exercise: ShapeInput, lang: Language = 'en'): string {
  const noun = countNoun(exercise.countUnit, lang);
  // Named, not omitted: the reps well is gone from under this label and the label
  // is the receipt for that.
  if (ladderOwnsReps(exercise)) {
    return exercise.requiresWeight ? t('weight + ladder', lang) : t('ladder reps', lang);
  }
  if (exercise.requiresWeight) return t('weight + {noun}', lang, { noun });
  if (exercise.countUnit === 'meters') return t('distance + duration', lang);
  if (exercise.countUnit === 'seconds') return t('duration only', lang);
  return t('{noun} only', lang, { noun });
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
export function wellsFor(exercise: ShapeInput, lang: Language = 'en'): WellSpec[] {
  const kg = term('unit', 'kg', lang);
  const m = term('unit', 'm', lang);
  const reps = term('unit', 'reps', lang);
  // A ladder prescribes every rep of every set from its max, so there is no rep
  // target to well — the max's own ± is the control. An unweighted laddered
  // exercise therefore has no wells at all, which is correct: one number, and it is
  // in the ladder card.
  if (ladderOwnsReps(exercise)) {
    return exercise.requiresWeight
      ? [{ label: t('default {unit}', lang, { unit: kg }), field: 'weight', unit: kg }]
      : [];
  }

  if (exercise.requiresWeight) {
    const second: WellSpec =
      exercise.countUnit === 'reps'
        ? { label: t('target reps', lang), field: 'count', unit: reps }
        : exercise.countUnit === 'meters'
          ? { label: t('target distance', lang), field: 'count', unit: m }
          : { label: t('target time', lang), field: 'count' };
    return [{ label: t('default {unit}', lang, { unit: kg }), field: 'weight', unit: kg }, second];
  }

  switch (exercise.countUnit) {
    case 'rounds':
      return [
        { label: t('rounds', lang), field: 'count', unit: '×' },
        { label: t('round length', lang), field: 'duration' },
      ];
    case 'seconds':
      return [{ label: t('duration', lang), field: 'duration' }];
    case 'meters':
      return [
        { label: t('distance', lang), field: 'count', unit: m },
        { label: t('duration', lang), field: 'duration' },
      ];
    default:
      return [{ label: t('target reps', lang), field: 'count', unit: reps }];
  }
}
