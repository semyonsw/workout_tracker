/**
 * Warm-up sets, derived from the weight you are actually going to lift.
 *
 *   working 100 kg, 20 kg bar, [25 20 15 10 5 2.5 1.25]
 *     →  40 kg × 5      (40%, loadable: 20 + 2×10)
 *        60 kg × 5      (60%, loadable: 20 + 2×20)
 *        80 kg × 3      (80%, loadable: 20 + 2×15 + 2×10 + ... )
 *
 * ── WHY THE APP DOES THIS AND NOT THE USER ─────────────────────────────────
 *
 * `SetRow` already has the warm-up flag: a set that reads `W`, is out of the volume,
 * out of the set count and out of every verdict. What it did not have is a way to
 * PUT one there — every warm-up was `Add set`, tap the weight, nudge it down eleven
 * times, tap the reps, mark it a warm-up. Five taps of arithmetic anybody can do and
 * nobody enjoys, repeated three times, before the first working set of every session.
 *
 * The percentages are the ordinary ones (40/60/80 at 5/5/3), which is also what
 * every other tracker's calculator defaults to. They are a starting point: the sets
 * land as normal rows and every number on them is editable.
 *
 * ── AND WHY IT ROUNDS DOWN, NEVER UP, AND ONLY ONTO PLATES THAT EXIST ──────
 *
 * This is the part that is specific to this app, and it is the whole reason the
 * feature is worth having here. `SetRow`'s header is explicit that a plate label
 * must never be a lie about the equipment: an unreachable target renders NO line
 * rather than the nearest loadable weight. A warm-up generator that ignores that
 * would hand you `62.5 kg` in a gym whose smallest plate is 5 — a number you cannot
 * load, printed as a plan.
 *
 * So on a barbell every rung is snapped to a weight this gym's plates can actually
 * make (`loadableAtOrBelow`), and DOWN rather than to the nearest: a warm-up that
 * came out heavier than intended is the one direction that costs you something on
 * the working set. Off a barbell — a machine, a dumbbell — there are no plates to
 * reason about, so the rung is rounded down to a multiple of the movement's own
 * `incrementKg`, which is the smallest real jump that equipment has.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 *
 *  • NOTHING FOR UNWEIGHTED WORK. There is no 40% of a push-up, and a warm-up set of
 *    "40% of a 2:00 plank" is a shorter plank, not a warm-up. Empty list.
 *  • NO DUPLICATE RUNGS. Snapping 40% and 60% of a light working weight onto a
 *    20 kg bar with big plates can produce the same number twice; the second one is
 *    dropped, because two identical warm-up sets is one warm-up set and a mistake.
 *  • NO RUNG AT OR ABOVE THE WORKING WEIGHT, and none at the bare bar when the bar
 *    IS the first rung — a "warm-up" you have to work for is a working set.
 */

import { platesFor } from './plates';
import type { Exercise } from '../types/models';

/** One generated row: a weight and a count, in the exercise's own unit. */
export interface WarmupSet {
  weightKg: number;
  count: number;
}

/** A rung of the scheme: a fraction of the working weight, and its reps. */
export interface WarmupRung {
  /** 0.4 = 40% of the working weight. */
  fraction: number;
  reps: number;
}

/**
 * The default scheme: 40% × 5, 60% × 5, 80% × 3.
 *
 * Three rungs because that is the shape everybody's calculator ships and everybody's
 * coach writes: two easy sets to move blood and rehearse the groove, one at a weight
 * heavy enough to feel like the real thing. The reps come DOWN as the weight goes up
 * for the obvious reason — a warm-up must not be the set that tires you out.
 */
export const WARMUP_SCHEME: readonly WarmupRung[] = [
  { fraction: 0.4, reps: 5 },
  { fraction: 0.6, reps: 5 },
  { fraction: 0.8, reps: 3 },
];

/** Only rep-counted work has a warm-up worth generating. See the file header. */
export function supportsWarmup(exercise: Pick<Exercise, 'requiresWeight' | 'countUnit'>): boolean {
  return exercise.requiresWeight && exercise.countUnit === 'reps';
}

/** The step this equipment actually moves in, when it is not a bar with plates. */
function stepFor(incrementKg: number | undefined): number {
  return typeof incrementKg === 'number' && Number.isFinite(incrementKg) && incrementKg > 0
    ? incrementKg
    : 2.5;
}

/**
 * The heaviest weight AT OR BELOW the target that these plates can actually load.
 *
 * A downward walk in the smallest step the plate set has, asking `platesFor` each
 * time — the same function the label under the weight cell uses, so a generated
 * warm-up can never be a weight whose own plate line would refuse to render. Null
 * when even the bare bar is over the target.
 *
 * A walk rather than arithmetic because "what can these plates make" is not a
 * formula: it depends on which sizes exist and how many of each are needed, and
 * `platesFor` is the one place in the app that knows.
 *
 * IT WALKS THE GRID, ANCHORED TO THE BAR. The candidates are `bar + n × step`,
 * counting `n` down — not `target − n × step`, which is the version that looks
 * right and misses: with 5 kg as the smallest plate the loadable weights are 20,
 * 30, 40…, and a walk starting from a target of 24 tries 24 then 14 and reports
 * that a 20 kg bar cannot be loaded to 20. Starting from the bar means every
 * candidate is on the grid by construction, so the first one `platesFor` accepts
 * is the answer and the loop is bounded by the grid rather than by a guard.
 */
export function loadableAtOrBelow(
  targetKg: number,
  barWeightKg: number,
  availablePlatesKg?: readonly number[],
): number | null {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barWeightKg)) return null;
  if (targetKg < barWeightKg) return null;

  const plates = (availablePlatesKg ?? []).filter((p) => Number.isFinite(p) && p > 0);
  // A pair of the smallest plate is the finest change the bar can make.
  const step = plates.length > 0 ? Math.min(...plates) * 2 : 2.5;

  // How many whole steps of headroom the target leaves above the bar. Capped so a
  // corrupt plate list (a 0.01 kg "plate", a 500 kg target) cannot spin.
  const MAX_STEPS = 400;
  const headroom = Math.min(MAX_STEPS, Math.floor((targetKg - barWeightKg) / step + 0.0001));

  for (let n = headroom; n >= 0; n -= 1) {
    const candidate = Number((barWeightKg + n * step).toFixed(2));
    if (candidate > targetKg + 0.0001) continue;
    if (platesFor(candidate, barWeightKg, availablePlatesKg) != null) return candidate;
  }
  return null;
}

/** Round down onto the equipment's own step — a machine pin, a dumbbell rack. */
function downToStep(targetKg: number, step: number): number {
  return Number((Math.floor(targetKg / step) * step).toFixed(2));
}

export interface WarmupParams {
  /** The weight the working sets are at — what the rungs are a fraction of. */
  workingWeightKg: number | null | undefined;
  exercise: Pick<
    Exercise,
    'requiresWeight' | 'countUnit' | 'barWeightKg' | 'incrementKg' | 'loadMode'
  >;
  /** The plates of the gym the user says they are in. */
  availablePlatesKg?: readonly number[];
  scheme?: readonly WarmupRung[];
}

/**
 * The warm-up sets for one exercise at one working weight, lightest first.
 *
 * An empty list is an ordinary answer and the caller renders nothing: unweighted
 * work, a missing working weight, or a weight so light that every rung snaps to the
 * bar. Nothing here throws.
 */
export function warmupSets(params: WarmupParams): WarmupSet[] {
  const { workingWeightKg, exercise, availablePlatesKg, scheme = WARMUP_SCHEME } = params;
  if (!supportsWarmup(exercise)) return [];

  const working = workingWeightKg;
  if (typeof working !== 'number' || !Number.isFinite(working) || working <= 0) return [];

  const bar = exercise.barWeightKg;
  const onABar = typeof bar === 'number' && Number.isFinite(bar) && bar > 0;
  const step = stepFor(exercise.incrementKg);

  const out: WarmupSet[] = [];
  for (const rung of scheme) {
    const raw = working * rung.fraction;

    const weightKg = onABar
      ? loadableAtOrBelow(raw, bar as number, availablePlatesKg)
      : downToStep(raw, step);

    if (weightKg == null || weightKg <= 0) continue;
    // A "warm-up" at or above the working weight is a working set.
    if (weightKg >= working) continue;
    // Two identical rungs is one rung and a mistake.
    if (out.some((set) => Math.abs(set.weightKg - weightKg) < 0.001)) continue;

    out.push({ weightKg, count: Math.max(1, Math.round(rung.reps)) });
  }

  return out.sort((a, b) => a.weightKg - b.weightKg);
}

/**
 * "40 × 5 · 60 × 5 · 80 × 3" — what the button is about to add, in one line.
 *
 * The same shorthand the history rows use, for the same reason: a lifter reads
 * `40 × 5` as a set without being taught to. Null when there is nothing to add, so
 * the caller can hide the control rather than offer an empty action.
 */
export function describeWarmup(sets: readonly WarmupSet[]): string | null {
  if (sets.length === 0) return null;
  return sets.map((set) => `${trim(set.weightKg)} × ${set.count}`).join(' · ');
}

/** 40 rather than "40.0", 2.5 rather than "2.50". */
function trim(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(2)));
}
