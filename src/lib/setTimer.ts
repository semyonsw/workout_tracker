/**
 * The set timer — a plank, a dead hang, a boxing round.
 *
 *   press start ──► GET READY 5 4 3 2 1 ──► 2:00 ◄─ countdown ─► 0:00  bell
 *                                     └──► 0:00 ─── count up ──► 1:47  stop
 *
 * Pure math, zero state, injectable clock — same contract as the overload
 * engine, and for the same reason: this is the part that must be right, so it
 * must be testable without a phone.
 *
 * ── ONE STORED FACT: WHEN START WAS PRESSED ────────────────────────────────
 *
 * `SetTimerSpec` carries `startedAt` and two lengths. Everything else — which
 * phase we are in, what the clock reads, what would be logged if you stopped
 * now — is DERIVED from `now`. Nothing counts down in memory and nothing
 * advances a phase, so there is no state machine to get stuck in the wrong
 * state when iOS suspends the JS thread mid-plank. A timer read after two
 * minutes in a pocket returns exactly what it would have returned had the screen
 * stayed on. This is the same doctrine as the rest timer's absolute deadline,
 * extended to a two-phase clock.
 *
 * ── WHAT GETS LOGGED ──────────────────────────────────────────────────────
 *
 * `workedSeconds` is always the number the user SAW on the clock, never a
 * rounded-up intention:
 *
 *   • count up, stopped at 1:47      → 107   (what the clock read)
 *   • countdown 2:00, ran to the bell → 120   (they held to the bell)
 *   • countdown 2:00, stopped at 1:24 → 36    (36 seconds is what happened)
 *
 * That last line is the whole reason this file exists rather than a
 * `setTimeout`. A plank that was abandoned at 36 seconds and logged as 2:00
 * poisons every future comparison, and the app's one job is that the history is
 * true.
 */

import type { Exercise, TimerMode } from '../types/models';

/** Get-ready countdown when an exercise doesn't specify one. */
export const DEFAULT_PREPARE_SECONDS = 5;

/** Shortest prescribed hold an adjustment may leave behind. */
export const MIN_WORK_SECONDS = 5;

/** The timer modes that actually run a clock. */
export type RunningTimerMode = Exclude<TimerMode, 'manual'>;

export type TimerPhase =
  /** Get into position. The work clock has not started. */
  | 'prepare'
  /** Working: holding, hanging, or punching. */
  | 'work'
  /** A countdown that reached zero. Terminal — the set is ready to log. */
  | 'over';

export interface SetTimerSpec {
  mode: RunningTimerMode;
  /** Epoch ms when start was pressed. The only stored fact. */
  startedAt: number;
  /** Length of the get-ready countdown. 0 = straight to work. */
  prepareSeconds: number;
  /** Prescribed hold for `countdown`. Ignored for `countup`. */
  workSeconds: number;
}

export interface SetTimerReading {
  phase: TimerPhase;
  /**
   * Whole seconds on the clock right now: the get-ready count, the time left in
   * a countdown, or the time held in a count-up.
   */
  display: number;
  /**
   * Fraction of the phase still to run, 0–1, for the drain line.
   * Null in a count-up — an open hold has nothing to drain.
   */
  remainingFraction: number | null;
  /** Seconds of work to log if the timer is committed right now. */
  workedSeconds: number;
}

/**
 * Which way the clock runs for an exercise.
 *
 * Rep-counted work is always `manual`, whatever the row says: `count` holds reps
 * there, and a "12-second" set of twelve reps is the kind of nonsense a config
 * mistake would otherwise produce. Guarding here means the rest of the app can
 * trust `isTimed()` on its own.
 */
export function resolveTimerMode(exercise: Pick<Exercise, 'timerMode' | 'countUnit'>): TimerMode {
  const timeCounted = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';
  if (!timeCounted) return 'manual';
  return exercise.timerMode ?? 'manual';
}

/** Does this exercise's set row get a start button instead of just a ✓? */
export function isTimed(exercise: Pick<Exercise, 'timerMode' | 'countUnit'>): boolean {
  return resolveTimerMode(exercise) !== 'manual';
}

/**
 * Read the clock.
 *
 * `display` uses `ceil` while time runs DOWN and `floor` while it runs UP, which
 * is what both kinds of clock do in the physical world: a 2:00 countdown reads
 * "2:00" for the whole first second, and a stopwatch reads "0:00" for it. The
 * consequence worth knowing is that `workedSeconds` is always
 * `workSeconds − display` in a countdown, so the number logged and the number
 * shown can never disagree.
 */
export function readSetTimer(spec: SetTimerSpec, nowMs: number): SetTimerReading {
  const elapsed = Math.max(0, (nowMs - spec.startedAt) / 1000);

  if (elapsed < spec.prepareSeconds) {
    const left = spec.prepareSeconds - elapsed;
    return {
      phase: 'prepare',
      display: Math.ceil(left),
      remainingFraction: left / spec.prepareSeconds,
      workedSeconds: 0,
    };
  }

  const worked = elapsed - spec.prepareSeconds;

  if (spec.mode === 'countup') {
    const shown = Math.floor(worked);
    return { phase: 'work', display: shown, remainingFraction: null, workedSeconds: shown };
  }

  const left = spec.workSeconds - worked;
  if (left <= 0) {
    return {
      phase: 'over',
      display: 0,
      remainingFraction: 0,
      // They held to the bell, so the bell is the honest number.
      workedSeconds: spec.workSeconds,
    };
  }

  const display = Math.ceil(left);
  return {
    phase: 'work',
    display,
    remainingFraction: spec.workSeconds > 0 ? left / spec.workSeconds : 0,
    workedSeconds: spec.workSeconds - display,
  };
}

/** Epoch ms the bell rings. Null for a count-up, which has no end to schedule. */
export function workEndsAt(spec: SetTimerSpec): number | null {
  if (spec.mode === 'countup') return null;
  return spec.startedAt + (spec.prepareSeconds + spec.workSeconds) * 1000;
}

/**
 * Skip the get-ready count: rewind `startedAt` so the prepare phase is already
 * spent. Expressed as a shift of the one stored fact rather than as a phase
 * flag, which is what keeps this module state-machine-free.
 */
export function withPrepareSkipped(spec: SetTimerSpec, nowMs: number): SetTimerSpec {
  return { ...spec, startedAt: nowMs - spec.prepareSeconds * 1000 };
}

/**
 * `+15` on a running countdown.
 *
 * Extends the prescribed hold rather than pushing an end time, so the drain line
 * still measures against a real target and `workedSeconds` stays truthful. A
 * count-up has no target to extend, so it is returned untouched.
 */
export function withWorkAdjusted(spec: SetTimerSpec, deltaSeconds: number): SetTimerSpec {
  if (spec.mode === 'countup') return spec;
  return { ...spec, workSeconds: Math.max(MIN_WORK_SECONDS, spec.workSeconds + deltaSeconds) };
}
