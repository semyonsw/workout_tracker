/**
 * The numbers a routine PLANS, and the two ways they change.
 *
 * A routine item carries four of them — how many sets, the rep or duration
 * target, its low end, and how long to rest — and for two releases none of them
 * could be changed by anybody. `appendToRoutine` hardcoded four sets, the editor
 * rendered `4 × 8–10 · rest 2:00` as text, and `+ Add set` fixed it for one
 * session and forgot. So every plan in the app was four sets forever.
 *
 * This module owns both directions:
 *
 *  1. EDITED. `bumpTargetSets` and friends are what the per-item editor's ± chips
 *     call. Every one of them clamps, because a target of `NaN` reaches
 *     `buildDraftSession` as a set count and a target of 0 is a plan with no work
 *     in it. They live here rather than in the screen for the usual reason: a
 *     screen is composition, and "how many sets may a routine plan" is a decision.
 *  2. PULLED BACK. `plannedSetDiff` compares what a finished session actually did
 *     against what its routine said, so `FinishSheet` can offer the one tap that
 *     makes the plan match reality. Derived from what you did rather than typed
 *     into a form — the app's own idiom.
 *
 * ── THE REST CASCADE ───────────────────────────────────────────────────────
 *
 * `resolveItemRest` is the one place the cascade lives, and it is deliberately
 * two levels, not three: the ITEM's override if it has one, otherwise the value
 * in Settings. `Exercise.defaultRestSeconds` is not in it. That is the whole
 * lesson of the bug this replaces — a cascade through a number the user cannot
 * see or change means the two rest controls in Settings silently do nothing on
 * almost every exercise, and a setting that does nothing is indistinguishable
 * from a broken one. An item override is different now, because the editor can
 * set it, shows which of the two is in force, and can clear it again.
 */

import type { CountUnit, Exercise, ID, RoutineItem } from '../types/models';
import { countStep } from './units';

/* ------------------------------------------------------------------ */
/* Limits                                                             */
/* ------------------------------------------------------------------ */

/**
 * How many sets a routine may plan.
 *
 * One because a plan with no work in it is not a plan, and 20 because a routine
 * item is one exercise: twelve boxing rounds is the honest ceiling anyone has
 * ever reached and eight more is room to be wrong in.
 */
export const TARGET_SETS_LIMITS = { min: 1, max: 20 } as const;

/** Rest, in seconds. The same range Settings allows, for the same reasons. */
export const ITEM_REST_LIMITS = { min: 0, max: 900, step: 15 } as const;

/**
 * The believable range for the per-set target, PER COUNT UNIT.
 *
 * Four ranges rather than one, because `targetRepsMax` does not hold reps for
 * time-counted work — it holds SECONDS. One shared 1–100 would cap a boxing round
 * at a minute and forty seconds and let somebody plan a 100-metre swim as a
 * session. The ceilings are "past anything real", not opinions: an hour of
 * anything, 20 km of swimming, 100 reps.
 */
export const TARGET_COUNT_LIMITS: Record<CountUnit, { min: number; max: number }> = {
  reps: { min: 1, max: 100 },
  seconds: { min: 5, max: 3600 },
  rounds: { min: 5, max: 3600 },
  meters: { min: 25, max: 20_000 },
};

/** The ± step for the target control — the count unit's own natural step. */
export function targetCountStep(countUnit: CountUnit): number {
  return countStep(countUnit);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/* Editing one item                                                    */
/* ------------------------------------------------------------------ */

/** Nudge the planned set count. */
export function bumpTargetSets(item: RoutineItem, delta: number): RoutineItem {
  const { min, max } = TARGET_SETS_LIMITS;
  return { ...item, targetSets: clamp(item.targetSets + delta, min, max) };
}

/**
 * Nudge the per-set target — reps, or the length of a hold or a round.
 *
 * The low end of the range follows it DOWN but never up: a range of "10–8" is not
 * a range, and the user nudging the target below the floor they set means the
 * floor moved. Nudging the target back up leaves the floor where it was, because
 * that is the range they asked for.
 */
export function bumpTargetCount(
  item: RoutineItem,
  countUnit: CountUnit,
  delta: number,
): RoutineItem {
  const { min, max } = TARGET_COUNT_LIMITS[countUnit];
  const current = item.targetRepsMax ?? item.targetRepsMin ?? min;
  const next = clamp(current + delta, min, max);
  const floor = item.targetRepsMin;
  return {
    ...item,
    targetRepsMax: next,
    ...(floor != null && floor > next ? { targetRepsMin: next } : {}),
  };
}

/**
 * Nudge the LOW end of the rep range, or turn it off.
 *
 * The range is optional, and off is the common case: "4 × 10" is what most plans
 * say. It is stored as `targetRepsMin`, and `undefined` renders as a single
 * number rather than as a range with one end missing. Nudging below the unit's
 * floor clears it, which is how the control is switched off without a second
 * affordance — one chip does both.
 */
export function bumpTargetMin(item: RoutineItem, countUnit: CountUnit, delta: number): RoutineItem {
  const { min, max } = TARGET_COUNT_LIMITS[countUnit];
  const ceiling = item.targetRepsMax ?? max;
  // Starting from the target itself: the first `−` on a plain "4 × 10" opens the
  // range at the number already on screen rather than at the unit's floor.
  const current = item.targetRepsMin ?? ceiling;
  const next = Math.round(current + delta);

  if (next < min) {
    const { targetRepsMin: _dropped, ...rest } = item;
    return rest;
  }
  // A floor at or above the target is not a range — it IS the target.
  if (next >= ceiling) {
    const { targetRepsMin: _dropped, ...rest } = item;
    return rest;
  }
  return { ...item, targetRepsMin: next };
}

/**
 * Nudge this item's rest override — creating one from the value currently in
 * force, so the first tap moves the number the row is showing rather than
 * jumping to somewhere else.
 *
 * `settingsRestSeconds` is what Settings says right now; it is only used as the
 * starting point. Once an override exists it is a fact about the item and
 * Settings no longer reaches it.
 */
export function bumpItemRest(
  item: RoutineItem,
  delta: number,
  settingsRestSeconds: number,
): RoutineItem {
  const { min, max } = ITEM_REST_LIMITS;
  const current = item.restSeconds ?? settingsRestSeconds;
  return { ...item, restSeconds: clamp(current + delta, min, max) };
}

/**
 * Drop the override, so this item follows Settings again — LIVE, not as a copy of
 * whatever Settings happens to say today. That distinction is the point of having
 * a clear action at all: `completeSet` re-reads Settings every time it starts a
 * rest, so an item with no override tracks the setting as it changes, and an
 * item with an override of the same number does not.
 */
export function clearItemRest(item: RoutineItem): RoutineItem {
  const { restSeconds: _dropped, ...rest } = item;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Reading the cascade                                                 */
/* ------------------------------------------------------------------ */

export interface ResolvedRest {
  seconds: number;
  /**
   * Which of the two is in force. The row states it, because "rest 3:00" with no
   * source is the exact ambiguity that made the old behaviour unreadable: there
   * was no way to tell a routine's number from the user's own.
   */
  source: 'item' | 'settings';
}

/** The rest this item will actually run. Two levels — see the file header. */
export function resolveItemRest(
  item: Pick<RoutineItem, 'restSeconds'>,
  settingsRestSeconds: number,
): ResolvedRest {
  const own = item.restSeconds;
  if (typeof own === 'number' && Number.isFinite(own) && own >= 0) {
    return { seconds: Math.round(own), source: 'item' };
  }
  return { seconds: Math.max(0, Math.round(settingsRestSeconds)), source: 'settings' };
}

/* ------------------------------------------------------------------ */
/* Pulling the session's shape back into the plan                       */
/* ------------------------------------------------------------------ */

/** One exercise whose finished set count disagrees with what the routine plans. */
export interface PlannedSetChange {
  /** The routine item to rewrite. */
  itemId: ID;
  exerciseId: ID;
  /** For the sentence the sheet says. */
  name: string;
  plannedSets: number;
  completedSets: number;
}

/**
 * Where a finished session and its routine disagree about how many sets an
 * exercise gets.
 *
 * Four rules, all of them about not putting words in the user's mouth:
 *
 *  1. ONLY COMPLETED SETS COUNT. A planned row nobody ticked is an intention, and
 *     `draftToSetHistory` already refuses to write those to history — the plan
 *     must not learn from them either.
 *  2. AN EXERCISE ADDED MID-SESSION IS NOT A ROUTINE EDIT. Deciding to do neck
 *     work halfway through pull day says something about today, not about the
 *     template. It has no routine item, so it produces no change here, and it
 *     must never silently join the routine.
 *  3. AN EXERCISE THE ROUTINE PLANS AND THE SESSION SKIPPED ENTIRELY IS NOT A
 *     CHANGE EITHER. Zero completed sets is "I did not get to it", not "take it
 *     out of my plan" — and rewriting `targetSets` to 0 would be a routine that
 *     plans nothing.
 *  4. ONE ITEM PER EXERCISE. A routine can list the same exercise twice; matching
 *     each session entry to the item it came from would need an id the draft does
 *     not carry, so the FIRST unclaimed item for that exercise is the one that
 *     learns. Claimed rather than reused, so two entries of one exercise never
 *     both rewrite the same item.
 */
export function plannedSetDiff(
  items: readonly RoutineItem[],
  performed: readonly { exerciseId: ID; name: string; completedSets: number }[],
): PlannedSetChange[] {
  const claimed = new Set<ID>();
  const changes: PlannedSetChange[] = [];

  for (const entry of performed) {
    if (entry.completedSets <= 0) continue; // rules 1 and 3

    const item = items.find((i) => i.exerciseId === entry.exerciseId && !claimed.has(i.id));
    if (!item) continue; // rule 2, and rule 4's second entry
    claimed.add(item.id);

    if (item.targetSets === entry.completedSets) continue;
    changes.push({
      itemId: item.id,
      exerciseId: entry.exerciseId,
      name: entry.name,
      plannedSets: item.targetSets,
      completedSets: entry.completedSets,
    });
  }

  return changes;
}

/** The routine's items with each change applied. Nothing else is touched. */
export function applyPlannedSetDiff(
  items: readonly RoutineItem[],
  changes: readonly PlannedSetChange[],
): RoutineItem[] {
  const byId = new Map(changes.map((c) => [c.itemId, c]));
  return items.map((item) => {
    const change = byId.get(item.id);
    if (!change) return item;
    const { min, max } = TARGET_SETS_LIMITS;
    return { ...item, targetSets: clamp(change.completedSets, min, max) };
  });
}

/**
 * "Dips did 5 sets, not 4" / "Dips and 2 others" — the sheet's one line.
 *
 * States the fact and nothing else. No "great work", no "you exceeded your
 * target": the number changed, and the user is being asked whether the plan
 * should say so.
 */
export function describePlannedSetDiff(changes: readonly PlannedSetChange[]): string | null {
  if (changes.length === 0) return null;
  const [first] = changes;
  const head = `${first.name} did ${first.completedSets} ${
    first.completedSets === 1 ? 'set' : 'sets'
  }, not ${first.plannedSets}`;
  if (changes.length === 1) return head;
  const others = changes.length - 1;
  return `${head}, and ${others} ${others === 1 ? 'other' : 'others'} changed too`;
}

/** Completed-set counts per exercise, in session order — `plannedSetDiff`'s input. */
export function performedSetCounts(
  entries: readonly {
    exercise: Pick<Exercise, 'id' | 'name'>;
    sets: readonly { isCompleted: boolean }[];
  }[],
): { exerciseId: ID; name: string; completedSets: number }[] {
  return entries.map((entry) => ({
    exerciseId: entry.exercise.id,
    name: entry.exercise.name,
    completedSets: entry.sets.filter((s) => s.isCompleted).length,
  }));
}
