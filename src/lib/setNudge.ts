/**
 * "Two and a half more kilos" — one ± chip's worth of arithmetic.
 *
 *   −2   −0.5   [ 42.5 KG ]   +0.5   +2
 *   −2   −1     [ 5 REPS  ]   +1     +2
 *
 * Two screens now offer these chips — `QuickAdjust` under a set row, and focus
 * mode's nudge under the working numbers — and they must not disagree about a
 * single one of the four decisions in here:
 *
 *  • WHICH STEPS. Weight is always ±0.5 / ±2 (`weightSteps`), never the exercise's
 *    own increment: an increment is a progression plan, and reading the chips off a
 *    2.5 kg one offered ±5 where nobody wanted it and put every half-kilo — the
 *    small disc on a dumbbell, the change plate on a bar — out of reach. A count
 *    doubles its unit's natural step: one rep and two, fifteen seconds and thirty.
 *  • IN THE USER'S OWN UNITS. Kilograms are the storage unit only, so an imperial
 *    lifter's `+2` is two POUNDS and the conversion happens on the way in and out.
 *  • NOTHING IS SNAPPED. 16.5 kg stays 16.5 rather than being rounded to something
 *    "loadable" by a machine the app has never seen — `QuickAdjust`'s header is
 *    explicit that this app never invents a weight, and this was the most tempting
 *    place in the codebase to break that. `toFixed(2)` is float hygiene, not
 *    rounding: it keeps `0.1 + 0.2` out of a 56 dp numeral.
 *  • ZERO IS THE FLOOR. A negative weight is not a lighter set, and a set of −1
 *    reps is not a set.
 */

import type { DraftSet } from './draft';
import { countStep, kgToLb, lbToKg, weightSteps } from './units';
import type { CountUnit, UnitSystem } from '../types/models';

/** Which of a set's two numbers a chip is nudging. */
export type NudgeField = 'weight' | 'count';

/**
 * The two step sizes for a field, in the user's own units.
 *
 * `fine` is the small disc, `coarse` is the plate — and the chips are laid out
 * `−coarse · −fine · value · +fine · +coarse`, so the biggest jumps sit at the
 * outside edges where a thumb finds them without aiming.
 */
export function nudgeSteps(
  field: NudgeField,
  countUnit: CountUnit,
  unitSystem: UnitSystem,
): { fine: number; coarse: number } {
  if (field === 'weight') return weightSteps(unitSystem);
  const step = countStep(countUnit);
  return { fine: step, coarse: step * 2 };
}

/**
 * The patch one chip press makes. `delta` is in the user's own units.
 *
 * A PATCH rather than a mutation, because both callers hand it straight to
 * `patchSet` — the store is the only thing that changes a set.
 */
export function nudgeSet(
  set: Pick<DraftSet, 'weightKg' | 'count'>,
  field: NudgeField,
  delta: number,
  unitSystem: UnitSystem,
): Partial<DraftSet> {
  if (field === 'count') return { count: Math.max(0, set.count + delta) };

  const imperial = unitSystem === 'imperial';
  /* An empty weight cell nudges from zero: the first `+2` on a bodyweight row
     that is about to have a plate hung off it means two kilos, not nothing. */
  const current = set.weightKg == null ? 0 : imperial ? kgToLb(set.weightKg) : set.weightKg;
  const next = Math.max(0, Number((current + delta).toFixed(2)));

  return { weightKg: imperial ? lbToKg(next) : next };
}
