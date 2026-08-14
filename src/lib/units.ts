/**
 * Unit + number helpers.
 *
 * Storage is always kilograms. Display is converted at the very edge (render /
 * input commit) so a unit-system toggle can never corrupt history.
 */

import type { CountUnit, LoadMode, UnitSystem } from '../types/models';

export const KG_PER_LB = 0.45359237;

/** Smallest jump the user can actually make, per unit system. */
export const DEFAULT_INCREMENT_KG = 2.5;
export const DEFAULT_INCREMENT_LB = 5;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/**
 * Round to the nearest achievable plate/pin step.
 * `roundToStep(26.4, 2.5) === 27.5` (up), `roundToStep(26.1, 2.5) === 25`.
 */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  // toFixed guards against 0.1 + 0.2 style float drift on 2.5 / 1.25 steps.
  return Number((Math.round(value / step) * step).toFixed(4));
}

/** The increment to use for an exercise, in kg, honouring the user's unit system. */
export function resolveIncrementKg(
  exerciseIncrementKg: number | undefined,
  policyIncrementKg: number,
  unitSystem: UnitSystem,
): number {
  if (exerciseIncrementKg && exerciseIncrementKg > 0) return exerciseIncrementKg;
  // Imperial lifters progress in 5 lb jumps; converting 2.5 kg gives an
  // unloadable 5.5 lb, so derive the increment in the user's own units.
  if (unitSystem === 'imperial') return lbToKg(DEFAULT_INCREMENT_LB);
  return policyIncrementKg;
}

/**
 * Display weight as the user thinks about it, not as it is stored.
 * Dips with a 30 kg belt read "+30", assisted pull-ups read "−20".
 */
export function formatWeight(
  kg: number | null,
  unitSystem: UnitSystem,
  loadMode: LoadMode = 'external',
): string {
  if (kg == null) return '—';
  const value = unitSystem === 'imperial' ? kgToLb(kg) : kg;
  // Trim trailing ".0" but keep ".5" — 22.5 kg is a real dumbbell, 22.50 is noise.
  const n = Number(value.toFixed(1));
  const body = Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (loadMode === 'added_bodyweight') return `+${body}`;
  if (loadMode === 'assisted') return `−${body}`;
  return body;
}

export function unitLabel(unitSystem: UnitSystem): string {
  return unitSystem === 'imperial' ? 'lb' : 'kg';
}

/**
 * Micro-label for the count cell: REPS / MIN / M / ROUND.
 *
 * Singular for `rounds` because the cell labels ONE row, and one row is one
 * round — "3:00 ROUND", not "3:00 ROUNDS". Rendered uppercase by the caller.
 */
export function countUnitLabel(countUnit: CountUnit): string {
  switch (countUnit) {
    case 'seconds':
      return 'min';
    case 'meters':
      return 'm';
    case 'rounds':
      return 'round';
    default:
      return 'reps';
  }
}

/**
 * The count as it appears in a set row.
 *
 * Time-based units read as a clock ("3:00"), because that is what the wall
 * clock and the round bell say. Reps and metres are plain integers.
 */
export function formatCount(count: number, countUnit: CountUnit): string {
  if (countUnit === 'seconds' || countUnit === 'rounds') return formatClock(count);
  return String(count);
}

/** "3 min" / "45 sec" — a duration in the coarsest unit that stays exact. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'no rest';
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  if (seconds < 60) return `${seconds} sec`;
  return formatClock(seconds);
}

/**
 * Sensible ± steps for the quick-adjust chips, per count unit.
 * Time steps in 15 s because that is the smallest change anyone makes to a
 * round or a swim; reps step by one because one rep is the whole point.
 */
export function countStep(countUnit: CountUnit): number {
  switch (countUnit) {
    case 'seconds':
    case 'rounds':
      return 15;
    case 'meters':
      return 25;
    default:
      return 1;
  }
}

/**
 * Epley 1RM estimate. Only meaningful for rep-based, externally-loaded work,
 * and only sane in the 1–12 rep range — above that it inflates badly, so we
 * clamp rather than pretend.
 */
export function estimate1RM(weightKg: number | null, reps: number): number | null {
  if (weightKg == null || weightKg <= 0 || reps <= 0) return null;
  const cappedReps = Math.min(reps, 12);
  return Number((weightKg * (1 + cappedReps / 30)).toFixed(2));
}

/** "1:30" / "12:05" — used by the rest timer and session clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "8 Aug" — the shortest unambiguous form for a training log.
 *
 * No year: a workout log is read backwards from today, and by the time the year
 * matters you are on the history screen looking at a chart. No weekday either —
 * the split is a queue, so which weekday it was is not information.
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "8 AUG" — the chart's axis form. */
export function formatChartDate(iso: string): string {
  return formatShortDate(iso).toUpperCase();
}

/**
 * CALENDAR days between two instants, order-independent.
 *
 * Deliberately not `floor(msDiff / 86_400_000)`: a set logged at 18:00 and read
 * at 12:00 twenty-three dates later is 22.75 raw days, and telling the user
 * "same weight for 22 days" when the log shows 23 dates reads like a bug.
 * Time-of-day is dropped and whole dates are differenced instead.
 *
 * Normalized in UTC to stay deterministic — all timestamps are stored as UTC
 * ISO strings, so this is consistent everywhere except for sessions logged
 * within a few hours of local midnight, where a ±1 day skew is harmless.
 */
export function daysBetween(a: Date | string, b: Date | string): number {
  const startOfDayUTC = (d: Date | string) => {
    const date = new Date(d);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  return Math.round(Math.abs(startOfDayUTC(a) - startOfDayUTC(b)) / 86_400_000);
}
