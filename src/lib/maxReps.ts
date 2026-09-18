/**
 * `MAX` — the rep target that is not a number.
 *
 * ── WHY IT IS A FLAG AND NOT A ZERO ─────────────────────────────────────────
 *
 * The obvious encoding is `defaultCount = 0`, and it is wrong in the way that
 * costs data: zero is a real answer everywhere else in this app (a set of zero is
 * a set you failed), and every fallback in `lib/draft.ts` treats a missing target
 * as "use ten". A flag says the thing itself — this exercise has no per-set
 * number, and the number in the cell is a COUNTER rather than a plan.
 *
 * ── WHAT IT CHANGES, IN THREE PLACES AND NO MORE ───────────────────────────
 *
 *  1. THE PLAN. `4 × MAX` instead of `4 × 10 reps`, wherever a target is stated.
 *  2. THE PREFILL. Every set starts at 0 and nothing is copied from last session
 *     — see `Exercise.countToMax`. That is the whole point of the feature: a set
 *     you are doing to find out cannot open with last week's answer in it.
 *  3. THE CELL. It reads `MAX` until the first rep is counted, and then it reads
 *     the count. Not `0`: zero is what the counter holds, `MAX` is what is being
 *     asked for, and until a rep has happened the second one is the useful one.
 *
 * Everything else — the ± chips, the ✓, the history, the shorthand, the records —
 * sees an ordinary set with an ordinary count, because that is exactly what it is
 * by the time it is logged.
 *
 * ── REPS ONLY, AND NEVER WITH A LADDER ──────────────────────────────────────
 *
 * Time-counted work already has the honest version of this: a count-up clock that
 * runs until you stop it. And a ladder derives every rep of every set from a max,
 * which is the opposite claim about the same sets — so the two cannot both be on,
 * and this is the gate that says so, the same way `ladderOf` gates the ladder.
 */

import { t, type Language } from './i18n';
import type { CountUnit } from '../types/models';

/** The exercise's shape, as much of it as this decision needs. */
export interface MaxRepsSubject {
  countUnit: CountUnit;
  countToMax?: boolean;
  /** A ladder, present or not. Present wins: it owns the reps. */
  ladder?: unknown;
  /** The draft screen's own spelling of the same fact, before there is a ladder. */
  ladderOn?: boolean;
}

/** Is this exercise's per-set target `MAX` rather than a number? */
export function countsToMax(exercise: MaxRepsSubject): boolean {
  if (exercise.countToMax !== true) return false;
  if (exercise.countUnit !== 'reps') return false;
  return exercise.ladder == null && exercise.ladderOn !== true;
}

/** The word itself. Uppercased by the caller where the surface is uppercase. */
export function maxLabel(lang: Language = 'en'): string {
  return t('MAX', lang);
}

/**
 * What the count cell says: `MAX` while the counter is still at zero, the count
 * itself once there is one.
 *
 * A LOGGED set always shows its number, including a zero — a set you failed is a
 * fact, and showing `MAX` over it would be the app declining to record it.
 */
export function showsMaxLabel(
  exercise: MaxRepsSubject,
  set: { count: number; isCompleted: boolean },
): boolean {
  return countsToMax(exercise) && !set.isCompleted && set.count <= 0;
}
