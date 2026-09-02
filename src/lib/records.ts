/**
 * Bests — the facts in the log that nothing was reading.
 *
 *   Weighted 90° pull-ups     BEST  +32.5 kg × 5  ·  14 reps  ·  178 kg set
 *   Plank                     BEST  3:10
 *
 * ── WHY THESE FOUR AND NOT AN ESTIMATED 1RM ────────────────────────────────
 *
 * `ExerciseHistoryScreen` states the case against a 1RM directly and it is right:
 * an Epley estimate is a number that goes up on its own and tells you nothing about
 * whether to add a plate. `SetHistory` used to carry one, computed on every rep set
 * and displayed nowhere, and it was deleted for exactly that reason.
 *
 * These are the opposite kind of number. Every one of them is a set that HAPPENED —
 * a row you can point at in the log — and none of them is a model of anything:
 *
 *  `heaviest`     the most weight ever moved on this movement, and the reps it went
 *                 for. The number you actually want before loading a bar.
 *  `mostCount`    the most reps (or the longest hold, or the furthest distance) in
 *                 one set. The other axis, and the one that moves first on
 *                 bodyweight work.
 *  `bestSetLoad`  the heaviest single set by weight × reps. It is the only one that
 *                 is a product rather than a reading, and it earns its place because
 *                 it is the one that distinguishes `100 × 3` from `85 × 8` — which
 *                 the two above cannot, and which is the whole question on a day
 *                 you are deciding whether to go heavy or long.
 *
 * ── AND WHY THERE IS NO BADGE ──────────────────────────────────────────────
 *
 * `HistoryScreen`'s header: "THE TOTALS LINE IS A FACT, NOT A GOAL. No streaks, no
 * badges, no weekly target." A best is the same kind of thing — it is what the log
 * says, not a prize the app awards — so it renders as one micro line and nothing
 * else. No medal on the row, no notification mid-set, no confetti. Other trackers
 * fire a banner the moment you tap ✓; that is a different product's idea of why
 * somebody trains.
 *
 * ── BODYWEIGHT WORK IS COMPARED HONESTLY ───────────────────────────────────
 *
 * `heaviest` and `bestSetLoad` read the EFFECTIVE load (`effectiveLoadKg`), so a
 * pull-up at `+20 kg` when you weighed 78 and the same set at `+20` when you weigh
 * 82 are not tied — the second is 4 kg heavier and it wins. That needs the
 * bodyweight of the day each set happened, which is why the caller passes a lookup
 * rather than a number (`lib/bodyweightLog.ts`).
 *
 * Where no bodyweight is known at all the effective load is null, those two records
 * are absent, and `mostCount` carries the exercise on its own. That is the same
 * silence `sessionVolume` keeps rather than printing a figure it knows undercounts.
 */

import { effectiveLoadKg } from './units';
import type { CountUnit, Exercise, ID, SetHistory } from '../types/models';

/** One record: the number, and enough of the set to recognise it. */
export interface RecordSet {
  /** The record value — kilograms, or reps/seconds/metres depending on the axis. */
  value: number;
  /** The set's own logged weight, for rendering `+32.5 kg × 5`. Null if unweighted. */
  weightKg: number | null;
  count: number;
  /** When it happened, so the row can say how long the record has stood. */
  at: string;
}

export interface ExerciseBests {
  /** Heaviest effective load ever moved on this movement, in one set. */
  heaviest: RecordSet | null;
  /** Most reps / longest hold / furthest distance in one set. */
  mostCount: RecordSet | null;
  /** Heaviest single set by effective load × reps. Rep-counted work only. */
  bestSetLoad: RecordSet | null;
}

/** How the app asks what the lifter weighed on the day of a set. */
export type BodyweightLookup = (at: string) => number | null;

const NO_BESTS: ExerciseBests = { heaviest: null, mostCount: null, bestSetLoad: null };

/** A row that actually happened and is worth comparing. */
function counts(row: SetHistory): boolean {
  return !row.isWarmup && row.isCompleted !== false && Number.isFinite(row.count) && row.count > 0;
}

/**
 * The standing bests for one exercise.
 *
 * Warm-ups and unlogged rows are excluded — the same rule the overload engine and
 * every chart applies, so a best can never come from a set that did not count.
 *
 * TIES GO TO THE OLDER SET. A record is "when did this last move", and re-doing
 * your best set does not move it: reporting today's date for a number you first hit
 * in June would make the age of every record meaningless.
 */
export function exerciseBests(
  history: readonly SetHistory[],
  exercise: Pick<Exercise, 'id' | 'countUnit' | 'loadMode'>,
  bodyweightAtDate: BodyweightLookup = () => null,
): ExerciseBests {
  const rows = history.filter((row) => row.exerciseId === exercise.id && counts(row));
  if (rows.length === 0) return NO_BESTS;

  // Oldest first, so a strict `>` leaves the earliest of equal values standing.
  const ordered = [...rows].sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt));

  let heaviest: RecordSet | null = null;
  let mostCount: RecordSet | null = null;
  let bestSetLoad: RecordSet | null = null;

  for (const row of ordered) {
    const as = (value: number): RecordSet => ({
      value,
      weightKg: row.weightKg,
      count: row.count,
      at: row.performedAt,
    });

    if (mostCount == null || row.count > mostCount.value) mostCount = as(row.count);

    // The load ON THE BODY, so bodyweight work compares across a changed bodyweight.
    const load = effectiveLoadKg(row.weightKg, row.loadMode, bodyweightAtDate(row.performedAt));
    if (load == null || !Number.isFinite(load) || load <= 0) continue;

    if (heaviest == null || load > heaviest.value) heaviest = as(Number(load.toFixed(2)));

    // Weight × reps only means something when the count IS reps: `80 kg × 120
    // seconds` is not a set load, it is two units multiplied together.
    if (row.countUnit === 'reps') {
      const setLoad = Number((load * row.count).toFixed(2));
      if (bestSetLoad == null || setLoad > bestSetLoad.value) bestSetLoad = as(setLoad);
    }
  }

  return { heaviest, mostCount, bestSetLoad };
}

/** Which axes a set beat. Empty = an ordinary good set. */
export interface BeatenRecords {
  heaviest: boolean;
  mostCount: boolean;
  bestSetLoad: boolean;
}

const NOTHING_BEATEN: BeatenRecords = {
  heaviest: false,
  mostCount: false,
  bestSetLoad: false,
};

/** Did any axis move? */
export function beatSomething(beaten: BeatenRecords): boolean {
  return beaten.heaviest || beaten.mostCount || beaten.bestSetLoad;
}

/**
 * Does this set beat the standing bests?
 *
 * STRICTLY. Equalling your best is not beating it, and a card that says "new best"
 * for a set you have done four times is a card nobody believes the fifth time.
 *
 * The set is described loosely (a weight, a count, a load mode) rather than as a
 * `SetHistory`, because the live session's rows are `DraftSet`s that have no id, no
 * `performedAt` and no exercise id yet — and the whole value of this function is
 * being able to ask the question mid-workout.
 */
export function recordsBeatenBy(
  set: { weightKg: number | null; count: number; isWarmup?: boolean },
  bests: ExerciseBests,
  exercise: Pick<Exercise, 'countUnit' | 'loadMode'>,
  bodyweightKg: number | null,
): BeatenRecords {
  if (set.isWarmup) return NOTHING_BEATEN;
  if (!Number.isFinite(set.count) || set.count <= 0) return NOTHING_BEATEN;

  const load = effectiveLoadKg(set.weightKg, exercise.loadMode, bodyweightKg);
  const usable = load != null && Number.isFinite(load) && load > 0 ? load : null;

  return {
    heaviest: usable != null && (bests.heaviest == null || usable > bests.heaviest.value),
    mostCount: bests.mostCount == null || set.count > bests.mostCount.value,
    bestSetLoad:
      exercise.countUnit === 'reps' &&
      usable != null &&
      (bests.bestSetLoad == null || usable * set.count > bests.bestSetLoad.value),
  };
}

/**
 * "+32.5 kg × 5 · 14 reps · 178 kg set" — the standing bests in one line.
 *
 * Null when the log has nothing to say, so the caller drops the row rather than
 * rendering a label with nothing after it. Deliberately the same `×` and `·`
 * separators the history shorthand uses.
 */
export function describeBests(
  bests: ExerciseBests,
  countUnit: CountUnit,
  formatWeight: (kg: number) => string,
  formatCount: (count: number) => string,
): string | null {
  const parts: string[] = [];

  if (bests.heaviest) {
    parts.push(`${formatWeight(bests.heaviest.value)} × ${formatCount(bests.heaviest.count)}`);
  }
  if (bests.mostCount) {
    // Named only when it is a different set from the heaviest — otherwise the line
    // states the same row twice.
    const sameSet = bests.heaviest?.at === bests.mostCount.at;
    if (!sameSet) parts.push(formatCount(bests.mostCount.value));
  }
  if (bests.bestSetLoad && countUnit === 'reps') {
    parts.push(`${formatWeight(bests.bestSetLoad.value)} set`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Every exercise's bests in one pass, keyed by id.
 *
 * The same shape and the same reason as `evaluateOverloadBatch`: a screen that needs
 * this for eighteen exercises should not filter the whole history eighteen times.
 */
export function exerciseBestsBatch(
  historyByExerciseId: Record<ID, SetHistory[]>,
  exercisesById: Record<ID, Exercise>,
  bodyweightAtDate?: BodyweightLookup,
): Record<ID, ExerciseBests> {
  const out: Record<ID, ExerciseBests> = {};
  for (const [id, exercise] of Object.entries(exercisesById)) {
    out[id] = exerciseBests(historyByExerciseId[id] ?? [], exercise, bodyweightAtDate);
  }
  return out;
}
