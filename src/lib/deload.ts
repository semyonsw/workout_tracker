/**
 * The back-off week — what to do when adding a rep has stopped working.
 *
 *   80 kg × 5   80 kg × 5   80 kg × 4        ← three sessions, nothing moving
 *   ──────────────────────────────────────
 *   "Three sessions at 80 kg without a rep. One session at 67.5 kg resets it."
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `progressiveOverload.ts` ──────────────
 *
 * The overload engine answers "is there more in you", and its two `due_*` verdicts
 * both say ADD SOMETHING. That is the right answer to a plateau and the wrong answer
 * to a STALL: after three sessions of being told to add a rep and not managing it,
 * a fourth nudge saying the same thing is the app not listening.
 *
 * They are also different KINDS of statement, which is the real reason not to add a
 * fourth status to `OverloadStatus`. A nudge is "your 80 kg is three weeks old" — a
 * fact about the log. A deload is a suggestion about a session that has not happened
 * yet, derived from the same rows but pointing the other way. Folding it in would
 * mean one function returning both, and one component rendering "do more" and "do
 * less" from the same enum.
 *
 * ── AND WHY THE LADDER IS EXCLUDED ─────────────────────────────────────────
 *
 * `lib/repLadder.ts` is explicit: "It does not deload on a miss. Repeating a target
 * you did not hit is the honest response to one bad day, and a program that cuts
 * your numbers because you slept badly is a program you stop trusting." That still
 * stands — a ladder holds its numbers until you meet them, by design, and it already
 * has a mechanism for a missed session. So a laddered exercise never gets a deload
 * suggestion; the ladder owns its own progression, exactly as `evaluateOverload`
 * stands down for the same reason.
 *
 * ── WHAT IT IS, PRECISELY ──────────────────────────────────────────────────
 *
 * A STALL is `minStallSessions` consecutive sessions at the same top weight where
 * the best reps at that weight did not improve on the best of the run. Not "did not
 * hit a target" — there is no target on the weight axis that the app is sure of —
 * but "did not get better", which is the same thing the overload engine measures
 * and needs no extra input.
 *
 * The suggestion is one session at `deloadFraction` of the working weight, rounded
 * DOWN onto something the equipment can load (`lib/warmup.ts` owns that walk, and
 * it is the same rule: never print a weight the plates cannot make).
 *
 * IT IS A SENTENCE, NOT AN ACTION. There is no "accept" — unlike the overload nudge,
 * which writes a number into every unlogged set. Cutting a session's weight is a
 * decision about a training block, and an app that did it on one tap would be
 * rewriting a plan off three data points. It says what it sees and stops.
 */

import { loadableAtOrBelow } from './warmup';
import { ladderOf } from './repLadder';
import { summarizeSessions } from './progressiveOverload';
import type { Exercise, RepLadder, SetHistory } from '../types/models';

export interface DeloadPolicy {
  /**
   * Consecutive sessions with no improvement before it is a stall.
   *
   * THREE, and the number matters. Two is a bad night's sleep and a busy gym; four
   * is a month of grinding before the app says anything. Three is also what
   * `OverloadPolicy.minSessions` uses for the mirror-image question, so the two
   * halves of the engine agree about what "a run" is.
   */
  minStallSessions: number;
  /**
   * What fraction of the working weight to suggest.
   *
   * 0.85 — the shallow end of every published deload. The point of a back-off
   * session is to do the movement with less load, not to take a week off: too deep
   * and it is a rest day with extra steps, too shallow and it is the same session.
   */
  deloadFraction: number;
}

export const DEFAULT_DELOAD_POLICY: DeloadPolicy = {
  minStallSessions: 3,
  deloadFraction: 0.85,
};

export interface DeloadVerdict {
  /** The one flag the UI checks. False = render nothing. */
  shouldSuggest: boolean;
  /** How many sessions the stall has run for. */
  stalledSessions: number;
  /** The weight it has stalled at, in kilograms. Null on unweighted work. */
  stuckWeightKg: number | null;
  /** The suggested back-off weight, loadable. Null when nothing sensible exists. */
  suggestedWeightKg: number | null;
  /** One line, already written for the UI. */
  message: string;
}

const NO_DELOAD: DeloadVerdict = {
  shouldSuggest: false,
  stalledSessions: 0,
  stuckWeightKg: null,
  suggestedWeightKg: null,
  message: '',
};

export interface EvaluateDeloadParams {
  exercise: Pick<
    Exercise,
    'id' | 'countUnit' | 'requiresWeight' | 'barWeightKg' | 'incrementKg'
  > & { ladder?: RepLadder };
  history: SetHistory[];
  /** The plates of the gym in force, so the suggestion is loadable. */
  availablePlatesKg?: readonly number[];
  policy?: DeloadPolicy;
}

/**
 * Is this movement stalled, and what would a back-off session look like?
 *
 * Weighted rep work only. On the count axis there is nothing to cut — "do 85% of a
 * plank" is a shorter plank, and a shorter plank is not a deload, it is a worse set.
 */
export function evaluateDeload(params: EvaluateDeloadParams): DeloadVerdict {
  const { exercise, history, availablePlatesKg, policy = DEFAULT_DELOAD_POLICY } = params;

  if (!exercise.requiresWeight || exercise.countUnit !== 'reps') return NO_DELOAD;
  // The ladder owns its own response to a missed session. See the file header.
  if (ladderOf(exercise)) return NO_DELOAD;

  const sessions = summarizeSessions(history, exercise.id);
  const minRun = Math.max(2, Math.round(policy.minStallSessions));
  if (sessions.length < minRun) return NO_DELOAD;

  // Newest first. The run is the leading block at one weight.
  const weight = sessions[0].topWeightKg;
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return NO_DELOAD;

  let run = 0;
  let bestReps = 0;
  let improved = false;
  for (const session of sessions) {
    if (session.topWeightKg !== weight) break;
    /*
     * Walking newest → oldest, so an OLDER session with more reps means the lifter
     * has gone backwards or sideways at this weight, and a NEWER one with more reps
     * means they improved. `improved` is set when the newest end of the run holds
     * the best result — in which case this is progress, not a stall, and the
     * overload engine's `progressing` verdict is the right one.
     */
    if (run === 0) bestReps = session.bestRepsAtTop;
    else if (session.bestRepsAtTop < bestReps) improved = true;
    run += 1;
  }

  if (improved || run < minRun) return NO_DELOAD;

  const target = weight * policy.deloadFraction;
  const bar = exercise.barWeightKg;
  const suggested =
    typeof bar === 'number' && Number.isFinite(bar) && bar > 0
      ? loadableAtOrBelow(target, bar, availablePlatesKg)
      : downToStep(target, exercise.incrementKg);

  // A suggestion that lands on the weight it is meant to be a break from is not a
  // suggestion, and one the plates cannot make must not be printed.
  if (suggested == null || suggested <= 0 || suggested >= weight) return NO_DELOAD;

  return {
    shouldSuggest: true,
    stalledSessions: run,
    stuckWeightKg: weight,
    suggestedWeightKg: suggested,
    message: `${run} sessions at ${trim(weight)} kg without a rep. One session at ${trim(suggested)} kg resets it.`,
  };
}

/** Round down onto the movement's own step, for anything that is not a bar. */
function downToStep(targetKg: number, incrementKg: number | undefined): number {
  const step =
    typeof incrementKg === 'number' && Number.isFinite(incrementKg) && incrementKg > 0
      ? incrementKg
      : 2.5;
  return Number((Math.floor(targetKg / step) * step).toFixed(2));
}

/** 80 rather than "80.0", 67.5 rather than "67.50". */
function trim(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(2)));
}
