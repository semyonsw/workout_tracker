/**
 * The weight you just logged, remembered as this movement's starting weight.
 *
 * Sibling of `state/restSync.ts`, and here for the same reason: it spans two
 * stores, so something has to own the order and neither store gets to reach into
 * the other. `libraryStore` is the only import, so `activeWorkoutStore` can call
 * this without a cycle — the arrow runs session → library and never back.
 *
 * WHY THE LIBRARY LEARNS AT ALL. `Exercise.defaultWeightKg` is "where to start the
 * first time this is ever performed", and a number typed once on the create screen
 * and then never again is a number that is wrong within a fortnight. The user's
 * rule is simpler and better: the weight a set was actually completed at is the
 * weight this exercise starts at. It costs nothing — history already drives the
 * prefill everywhere it exists — and it fixes the one case history cannot, which
 * is a movement whose first session is still in progress.
 *
 * WHAT IT REFUSES. Everything `defaultWeightUpdate` refuses (an unweighted
 * movement, a blank cell, a number the row already carries) and one more: an
 * exercise that is not in the library at all. A session can outlive the row it was
 * built from — the library is editable mid-workout — and resurrecting a deleted
 * exercise because a set of it was logged would be the session writing history
 * backwards.
 */

import { useLibrary } from './libraryStore';
import type { ID } from '../types/models';

/** Write `weightKg` onto the library row as its new starting weight. */
export function rememberDefaultWeight(exerciseId: ID, weightKg: number): void {
  useLibrary.getState().setExerciseDefaultWeight(exerciseId, weightKg);
}
