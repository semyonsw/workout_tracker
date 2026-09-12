/**
 * A round exercise runs itself.
 *
 *   ▶  ──15s──►  ROUND 1 ──3:00──► bell ──► REST 1:00 ──► ROUND 2 ──► …
 *      lead-in      the work       logged    the gap        no thumb
 *
 * ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
 *
 * Twelve rounds on a bag is twelve identical three-minute sets separated by
 * identical one-minute rests, performed in gloves. Every other exercise in this
 * app is logged with a thumb because every other exercise gives you a hand back
 * between sets; boxing does not. Pressing ▶ twenty-three times with a glove on is
 * how people end up using a wall clock instead of the app.
 *
 * So a round exercise is the one thing in here that advances without being asked:
 * the bell logs the round (that is `timerMode: 'countdown'`, which already
 * committed at zero), the rest starts (that is `completeSet`, unchanged), and when
 * the rest runs out the NEXT ROUND STARTS BY ITSELF. The only press in a twelve
 * round session is the first ▶.
 *
 * ── WHAT MAKES AN EXERCISE A ROUND EXERCISE ────────────────────────────────
 *
 * `countUnit: 'rounds'` AND a countdown clock, and both halves matter. Rounds is
 * what says the number on the row is a LENGTH rather than a count of repetitions;
 * the countdown is what says the phone is running that length. A hold — a plank, a
 * handstand, a front lever — is `seconds`, and it is deliberately NOT covered:
 * a handstand ends when your shoulders say so and the honest log is the number
 * that was on the clock when YOU stopped it, so it keeps its DONE button. Rounds
 * end on a bell. That is the whole difference and it is the difference the user
 * asked for.
 *
 * ── THE LEAD-IN IS ONLY EVER ONCE ──────────────────────────────────────────
 *
 * `Exercise.prepareSeconds` buys time to walk to the bag and get the gloves on.
 * It belongs to the moment you press ▶ and to nothing else: a round that starts
 * because the rest ended starts NOW, since the gap you have just finished WAS the
 * get-ready. So `autoRoundToStart` names a set to start with the prepare phase
 * already spent; the store's `startSetTimer` takes `skipPrepare` for exactly this.
 *
 * ── AND IT IS ARMED, NOT ASSUMED ───────────────────────────────────────────
 *
 * The chain only runs while `roundsAuto` points at the exercise — set when a round
 * clock is started, cleared the moment the user cancels one, removes the exercise,
 * or finishes the last round. Without that flag, opening a boxing routine and
 * walking away would have the phone start rounds at you on its own, and there
 * would be no way to stop the chain other than deleting the workout: ✕ on the
 * clock has to mean ✕.
 *
 * Pure, injectable `now`, no React: the whole of "should a round start right now"
 * is decided here and `hooks/useAutoRounds.ts` only makes time pass.
 */

import type { DraftEntry, DraftSession } from './draft';
import { resolveTimerMode } from './setTimer';
import type { Exercise, ID } from '../types/models';

/*
 * The two slices of store state this reads, declared STRUCTURALLY rather than
 * imported from `state/activeWorkoutStore`. The store imports this file, so
 * importing its types back would be a cycle — and a cycle in a type import is a
 * cycle a bundler still has to think about. What is needed here is three fields,
 * and naming them is also the documentation of what the decision depends on.
 */
export interface RestSlice {
  /** Epoch ms the rest ends, or null when idle or paused. */
  endsAt: number | null;
  /** What was left when the user froze it, or null when it is not frozen. */
  pausedRemainingMs: number | null;
}

/** Any running clock at all — the chain never talks over one. */
export type TimerSlice = object | null;

/** Round work: counted in rounds, and the phone rings the bell. */
export function isRoundExercise(exercise: Pick<Exercise, 'timerMode' | 'countUnit'>): boolean {
  return exercise.countUnit === 'rounds' && resolveTimerMode(exercise) === 'countdown';
}

export interface AutoRoundInput {
  session: DraftSession | null;
  /** The exercise whose round chain is armed, or null. */
  roundsAuto: ID | null;
  rest: RestSlice;
  setTimer: TimerSlice;
  nowMs: number;
}

/** The set to start a clock on right now, with the get-ready already spent. */
export interface AutoRoundStart {
  entryId: ID;
  setId: ID;
}

/**
 * The next round, if one is due this instant.
 *
 * Null in every other case, and the list of those is the specification:
 *
 *  • nothing is armed, or the armed exercise has gone;
 *  • a clock is already running (including one on another exercise — a hold
 *    started by hand outranks a chain, the same way it outranks rest);
 *  • the exercise is not a round exercise, or has no round left to run;
 *  • a rest is still counting, or is PAUSED. Pausing is the user saying "not
 *    yet", and a chain that started the next round through a paused clock would
 *    be the one control here that cannot be stopped.
 *
 * A rest that has reached zero does NOT block: the pill sits at 0:00 until
 * something moves it, and that something is this. The caller skips the spent rest
 * as it starts the round — see the hook.
 */
export function autoRoundToStart(input: AutoRoundInput): AutoRoundStart | null {
  const { session, roundsAuto, rest, setTimer, nowMs } = input;
  if (!session || !roundsAuto || setTimer) return null;

  const entry = session.entries.find((e) => e.localId === roundsAuto);
  if (!entry || !isRoundExercise(entry.exercise)) return null;

  // The chain is only a chain once a round has actually been logged: the first
  // round is the user's press, lead-in and all.
  if (!entry.sets.some((s) => s.isCompleted)) return null;

  const next = entry.sets.find((s) => !s.isCompleted);
  if (!next) return null;

  if (rest.pausedRemainingMs != null) return null;
  if (rest.endsAt != null && rest.endsAt > nowMs) return null;

  return { entryId: entry.localId, setId: next.localId };
}

/**
 * Does this entry still owe a round after the set that just landed?
 *
 * Used by the store to decide whether to keep the chain armed: the last round of
 * an exercise ends the chain rather than leaving a flag pointing at finished work,
 * so a set undone half an hour later cannot restart a bag session on its own.
 */
export function hasRoundLeft(entry: DraftEntry): boolean {
  return isRoundExercise(entry.exercise) && entry.sets.some((s) => !s.isCompleted);
}
