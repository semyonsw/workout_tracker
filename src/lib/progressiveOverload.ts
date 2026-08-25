/**
 * Progressive-overload engine.
 *
 * Pure, synchronous, dependency-free: takes rows of `SetHistory` and returns a
 * verdict. No React, no DB, no clock of its own (`now` is injectable) — so it is
 * trivially testable and can run inside a worker or on a server later.
 *
 * ── The model ──────────────────────────────────────────────────────────────
 * Progress is judged on the TOP WORKING WEIGHT PER SESSION, not per set. Real
 * sessions ramp and drop within an exercise ("15kg 5, 10kg 12 9 8"), so a
 * per-set view would see phantom plateaus. One number per session per exercise
 * is the honest signal.
 *
 * A "plateau run" is the streak of most-recent sessions that all share the same
 * top working weight. The nudge fires when that run is both LONG ENOUGH IN DAYS
 * (calendar staleness — the spec's "2 weeks") and DEEP ENOUGH IN SESSIONS
 * (so a 2-week holiday between two sessions isn't mistaken for stagnation).
 *
 * Two refinements over a naive "same weight for 14 days → +2.5 kg":
 *
 *  1. REPS BEFORE WEIGHT. If the user hasn't hit the rep target at the current
 *     weight, the correct progression is one more rep, not more load. The
 *     verdict says `add_reps` instead of `add_weight`.
 *  2. REGRESSION GUARD. If the user recently handled MORE than they're using
 *     now (deload, injury, fatigue), they are already working back up — a nudge
 *     there is noise, and worse, it's wrong. Verdict: `regressing`, stay quiet.
 *
 * ── THE COUNT AXIS ─────────────────────────────────────────────────────────
 *
 * Everything above describes the WEIGHT axis. Work with no weight axis used to
 * get a single line — `if (!exercise.requiresWeight) return empty` — on the
 * grounds that rep- and time-based progression was "handled by the routine's
 * target". Two things were wrong with that. The routine's target was not
 * editable at all until 0.12.0; and even now it is a number the user has to think
 * of themselves, while every weighted lift gets a nudge derived from its own
 * history. Push-ups, planks, dead hangs, hollow holds and boxing rounds are most
 * of the shipped library, and none of them ever progressed.
 *
 * So the same machinery runs on the COUNT: the top count per session, the same
 * plateau run, the same staleness test in days and sessions, the same regression
 * guard. One status, `due_count`, because there is no reps-before-weight
 * distinction when there is no weight to hold back — the count IS the axis. The
 * step comes from `countStep`, the same function the quick-adjust chips use, so a
 * nudge suggests a number a thumb could have produced.
 *
 * WHAT STILL RETURNS NOTHING, and why it is not an oversight: time-counted work
 * the phone did not time. A 50-minute swim is typed in from memory in a changing
 * room, and a 3-minute round somebody records by hand is a plan they wrote down,
 * not a measurement. "3 sessions at 50:00 — try 50:15" is the app pretending to
 * read a stopwatch that was never running. A hold the app DID time (a plank, a
 * dead hang, a bag round on the countdown) is a real measurement and progresses
 * like anything else. Distance is measured too — by the pool, not by the phone —
 * so metres progress; twenty-five of them is the step `countStep` already offers
 * on the row.
 */

import type { CountUnit, Exercise, OverloadPolicy, SetHistory, UnitSystem } from '../types/models';
import { countStep, daysBetween, formatCount, resolveIncrementKg, roundToStep } from './units';
import { resolveTimerMode } from './setTimer';
import { ladderOf } from './repLadder';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type OverloadStatus =
  /** Not enough logged history to say anything. */
  | 'insufficient_data'
  /** The axis moved up in the most recent session — already progressing. */
  | 'progressing'
  /** Plateau detected but still inside the policy window — watching. */
  | 'building'
  /** Working back up from a heavier / longer recent session. Stay silent. */
  | 'regressing'
  /** Plateaued long enough, but reps aren't there yet → chase a rep. */
  | 'due_reps'
  /** Plateaued long enough and reps are owned → add load. */
  | 'due_weight'
  /**
   * Unweighted work stuck at the same count → do one more, or hold it longer.
   *
   * ONE status, not two. On the weight axis reps come before load, so there are
   * two things a nudge can ask for; here the count is the only axis there is.
   */
  | 'due_count';

export interface OverloadVerdict {
  status: OverloadStatus;
  /** True only for the three `due_*` statuses — the single flag the UI checks. */
  shouldNudge: boolean;

  /** Top working weight of the most recent session (kg), null if unweighted. */
  currentWeightKg: number | null;
  /** Suggested next weight (kg), rounded to a loadable step. Null for `due_reps`. */
  suggestedWeightKg: number | null;
  /**
   * Top count of the most recent session, in the exercise's own unit — reps at
   * the top weight, or the longest hold / furthest distance. Null when there is
   * nothing to report.
   */
  currentCount: number | null;
  /**
   * Suggested next count, in the exercise's own unit. Set for `due_reps` (one
   * more rep at the same weight) and for `due_count` (one more rep, fifteen more
   * seconds, twenty-five more metres). Null otherwise.
   *
   * ONE field for both, because it is one thing: the number `acceptOverload`
   * writes into every unlogged set's `count`, exactly as `suggestedWeightKg` is
   * the number it writes into `weightKg`.
   */
  suggestedCount: number | null;

  /** Calendar days spanned by the current plateau run. */
  plateauDays: number;
  /** Number of sessions in the plateau run, on whichever axis is in play. */
  sessionsInRun: number;
  /** Best reps achieved at the current top weight in the latest session. */
  bestRepsAtWeight: number;
  /** ISO date the current weight or count was first reached. */
  since: string | null;

  /** One short line, already written for the UI. Never longer than ~40 chars. */
  message: string;
}

/**
 * One session, reduced to the only facts the engine cares about.
 *
 * Two axes on one row rather than two summarizers. The weight fields are null on
 * unweighted work and `topCount` is filled for everything, so the plateau-run
 * machinery below reads whichever axis the exercise actually has — and there is
 * one place that decides what "the top set of a session" means.
 */
interface SessionSummary {
  sessionId: string;
  performedAt: string;
  topWeightKg: number | null;
  /** Best reps achieved AT the top weight (not the best reps overall). */
  bestRepsAtTop: number;
  /**
   * The session's best count, ignoring weight entirely: the most reps, the
   * longest hold, the furthest distance.
   *
   * Deliberately the TOP set and not the total, for the same reason the weight
   * axis judges the top working weight: sessions ramp and taper, so a total moves
   * when the number of sets moves and says nothing about whether the work got
   * harder. Three planks of 2:00 / 2:00 / 1:31 is a 2:00 plank session.
   */
  topCount: number;
}

export const DEFAULT_OVERLOAD_POLICY: OverloadPolicy = {
  stalenessDays: 14,
  minSessions: 3,
  incrementKg: 2.5,
  requireRepTargetMet: true,
  repTarget: 8,
  regressionLookbackDays: 60,
};

/* ------------------------------------------------------------------ */
/* Step 1 — history → one summary row per session                      */
/* ------------------------------------------------------------------ */

/**
 * Collapse raw sets into one row per session, newest first.
 * Warm-ups, incomplete sets and other exercises are dropped here so every
 * downstream step can assume clean input.
 */
export function summarizeSessions(history: SetHistory[], exerciseId: string): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();

  for (const set of history) {
    if (set.exerciseId !== exerciseId) continue;
    if (set.isWarmup || !set.isCompleted) continue;
    if (set.count <= 0) continue;

    const existing = bySession.get(set.sessionId);
    const weight = set.weightKg ?? null;

    if (!existing) {
      bySession.set(set.sessionId, {
        sessionId: set.sessionId,
        performedAt: set.performedAt,
        topWeightKg: weight,
        bestRepsAtTop: set.count,
        topCount: set.count,
      });
      continue;
    }

    // The count axis is independent of the weight axis and simply takes the best
    // set: a plank session's number is its longest hold, whatever else was in it.
    existing.topCount = Math.max(existing.topCount, set.count);

    if (weight != null && (existing.topWeightKg == null || weight > existing.topWeightKg)) {
      // Heavier set found → it defines the session's top weight, and its reps
      // reset the rep tally (reps at a lighter weight tell us nothing about it).
      existing.topWeightKg = weight;
      existing.bestRepsAtTop = set.count;
    } else if (weight === existing.topWeightKg) {
      existing.bestRepsAtTop = Math.max(existing.bestRepsAtTop, set.count);
    }
  }

  return [...bySession.values()].sort(
    (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — the verdict                                                */
/* ------------------------------------------------------------------ */

export interface EvaluateOverloadParams {
  exercise: Pick<
    Exercise,
    'id' | 'requiresWeight' | 'incrementKg' | 'countUnit' | 'timerMode' | 'ladder'
  >;
  /** Completed sets for this exercise. Order doesn't matter; extras are filtered. */
  history: SetHistory[];
  policy?: OverloadPolicy;
  unitSystem?: UnitSystem;
  /** Injectable clock — keeps this function deterministic under test. */
  now?: Date;
}

export function evaluateOverload(params: EvaluateOverloadParams): OverloadVerdict {
  const {
    exercise,
    history,
    policy = DEFAULT_OVERLOAD_POLICY,
    unitSystem = 'metric',
    now = new Date(),
  } = params;

  const empty = emptyVerdict();

  /*
   * A LADDER OWNS THE REPS, so this engine stands down.
   *
   * Both of these read the same history and both answer "what should the next
   * session be", and when an exercise is running a ladder they answer it
   * differently: the nudge says "3 sessions at 16 — try 17" while the ladder is
   * mid-level and has already decided that this session's rep goes on the fourth
   * set. Two suggestions on one card, one of them wrong, and the user has to work
   * out which — for a prescription they switched on precisely so they would not
   * have to think about it.
   *
   * So the ladder wins wherever it exists, on both axes. Not only the count axis:
   * `due_reps` is "one more rep at the same weight", which is the ladder's job
   * stated in the ladder's own units. `CreateExerciseScreen` says so on the row
   * where the ladder is switched on, because a nudge that silently stops appearing
   * is indistinguishable from a broken one.
   */
  if (ladderOf(exercise)) return empty;

  const sessions = summarizeSessions(history, exercise.id);
  if (sessions.length === 0) return empty;

  /*
   * No weight axis → judge the COUNT instead of returning nothing.
   *
   * This used to be a single early return, and the comment on it said rep- and
   * time-based progression was "handled by the routine's target". It was not:
   * that target was not editable until 0.12.0, and even now it is a number the
   * user has to think of, while every weighted lift gets one derived from its own
   * history. See the file header for the whole argument, and for the one case that
   * still returns nothing.
   */
  if (!exercise.requiresWeight) return evaluateCountOverload(exercise, sessions, policy, now);

  const latest = sessions[0];
  if (latest.topWeightKg == null) return empty;

  const currentWeight = latest.topWeightKg;

  /* --- the plateau run: consecutive recent sessions at the same top weight --- */
  let run = 1;
  let oldestInRun = latest;
  for (let i = 1; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (s.topWeightKg == null || !nearlyEqual(s.topWeightKg, currentWeight)) break;
    run += 1;
    oldestInRun = s;
  }

  const plateauDays = daysBetween(oldestInRun.performedAt, now);
  const sinceDate = oldestInRun.performedAt;
  const bestReps = latest.bestRepsAtTop;

  /* --- guard 1: regression --------------------------------------------- */
  // Look past the run for a heavier top weight in the recent past. If the user
  // was heavier lately, they're rebuilding — never nudge into a deload.
  const heavierRecently = sessions
    .slice(run)
    .some(
      (s) =>
        s.topWeightKg != null &&
        s.topWeightKg > currentWeight &&
        daysBetween(s.performedAt, now) <= policy.regressionLookbackDays,
    );
  if (heavierRecently) {
    return {
      ...empty,
      status: 'regressing',
      currentWeightKg: currentWeight,
      currentCount: bestReps,
      plateauDays,
      sessionsInRun: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: 'Working back up — hold here',
    };
  }

  /* --- guard 2: already progressing ------------------------------------ */
  // The run is 1 session long and there is a lighter session behind it → the
  // most recent thing that happened was an increase. Let them enjoy it.
  if (run === 1 && sessions.length > 1) {
    const previous = sessions[1];
    if (previous.topWeightKg != null && currentWeight > previous.topWeightKg) {
      return {
        ...empty,
        status: 'progressing',
        currentWeightKg: currentWeight,
        plateauDays,
        sessionsInRun: 1,
        bestRepsAtWeight: bestReps,
        since: sinceDate,
        message: 'Moved up last session',
      };
    }
  }

  /* --- the actual staleness test --------------------------------------- */
  const stale = plateauDays >= policy.stalenessDays && run >= policy.minSessions;
  if (!stale) {
    return {
      ...empty,
      status: 'building',
      currentWeightKg: currentWeight,
      currentCount: bestReps,
      plateauDays,
      sessionsInRun: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: `${run}× at this weight`,
    };
  }

  /* --- reps before weight ---------------------------------------------- */
  if (policy.requireRepTargetMet && bestReps < policy.repTarget) {
    return {
      ...empty,
      status: 'due_reps',
      shouldNudge: true,
      currentWeightKg: currentWeight,
      currentCount: bestReps,
      suggestedCount: bestReps + 1,
      plateauDays,
      sessionsInRun: run,
      bestRepsAtWeight: bestReps,
      since: sinceDate,
      message: `${plateauDays}d here — chase ${bestReps + 1} reps`,
    };
  }

  /* --- add load --------------------------------------------------------- */
  const increment = resolveIncrementKg(exercise.incrementKg, policy.incrementKg, unitSystem);
  const suggested = roundToStep(currentWeight + increment, increment);

  return {
    ...empty,
    status: 'due_weight',
    shouldNudge: true,
    currentWeightKg: currentWeight,
    currentCount: bestReps,
    suggestedWeightKg: suggested,
    plateauDays,
    sessionsInRun: run,
    bestRepsAtWeight: bestReps,
    since: sinceDate,
    message: `Same weight ${plateauDays}d — try heavier`,
  };
}

/* ------------------------------------------------------------------ */
/* Step 3 — the same verdict, on the count axis                        */
/* ------------------------------------------------------------------ */

/**
 * Is this exercise's count a MEASUREMENT, or a number somebody typed?
 *
 * The distinction decides whether progression means anything. A plank, a dead
 * hang and a bag round on the countdown are all timed by the phone: the number in
 * the row is what the clock read, so "you have held 2:00 three times — try 2:15"
 * is a real suggestion about a real measurement. A 50-minute swim is typed from
 * memory in a changing room, and a round somebody records by hand is a plan they
 * wrote down. Nudging those is the app pretending to read a stopwatch that was
 * never running.
 *
 * Reps and metres are always in. Nobody types a rep count they did not do, and a
 * distance is measured by the pool or the track even though the phone is not the
 * thing measuring it.
 */
function countIsMeasured(exercise: Pick<Exercise, 'countUnit' | 'timerMode'>): boolean {
  const timeCounted = exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds';
  if (!timeCounted) return true;
  return resolveTimerMode(exercise) !== 'manual';
}

/**
 * The count-axis verdict: the same plateau run, staleness test and regression
 * guard as the weight axis, reading `topCount` instead of `topWeightKg`.
 *
 * Deliberately a second pass over the SAME `SessionSummary` rows rather than a
 * second summarizer — there is one definition of "the top set of a session" in
 * this file and it serves both axes.
 */
function evaluateCountOverload(
  exercise: Pick<Exercise, 'countUnit' | 'timerMode'>,
  sessions: SessionSummary[],
  policy: OverloadPolicy,
  now: Date,
): OverloadVerdict {
  const empty = emptyVerdict();
  if (!countIsMeasured(exercise)) return empty;

  const latest = sessions[0];
  const currentCount = latest.topCount;
  if (!Number.isFinite(currentCount) || currentCount <= 0) return empty;

  const base = { ...empty, currentCount };

  /* --- the plateau run: consecutive recent sessions at the same top count --- */
  let run = 1;
  let oldestInRun = latest;
  for (let i = 1; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (!nearlyEqual(s.topCount, currentCount)) break;
    run += 1;
    oldestInRun = s;
  }

  const plateauDays = daysBetween(oldestInRun.performedAt, now);
  const since = oldestInRun.performedAt;

  /* --- guard 1: regression --------------------------------------------- */
  // Held longer, or did more, in the recent past → they are working back up, and
  // a nudge there is both noise and wrong. Same rule as the weight axis.
  const moreRecently = sessions
    .slice(run)
    .some(
      (s) =>
        s.topCount > currentCount &&
        daysBetween(s.performedAt, now) <= policy.regressionLookbackDays,
    );
  if (moreRecently) {
    return {
      ...base,
      status: 'regressing',
      plateauDays,
      sessionsInRun: run,
      since,
      message: 'Working back up — hold here',
    };
  }

  /* --- guard 2: already progressing ------------------------------------ */
  if (run === 1 && sessions.length > 1 && sessions[1].topCount < currentCount) {
    return {
      ...base,
      status: 'progressing',
      plateauDays,
      sessionsInRun: 1,
      since,
      message: 'Moved up last session',
    };
  }

  /* --- the same staleness test ----------------------------------------- */
  const stale = plateauDays >= policy.stalenessDays && run >= policy.minSessions;
  if (!stale) {
    return {
      ...base,
      status: 'building',
      plateauDays,
      sessionsInRun: run,
      since,
      message: `${run}× at ${describeCount(currentCount, exercise.countUnit)}`,
    };
  }

  /*
   * The step is the count unit's own, straight from `countStep` — the same
   * function the quick-adjust chips read, so a nudge only ever suggests a number
   * a thumb could have produced on the row itself.
   */
  const suggestedCount = currentCount + countStep(exercise.countUnit);

  return {
    ...base,
    status: 'due_count',
    shouldNudge: true,
    suggestedCount,
    plateauDays,
    sessionsInRun: run,
    since,
    /*
     * A CLOCK, not a number of seconds. "3 sessions at 2:00 — try 2:15" is how
     * anyone says it; "try 135 seconds" is the storage unit leaking into copy that
     * somebody has to read between sets.
     */
    message: `${run}× at ${describeCount(currentCount, exercise.countUnit)} — try ${describeCount(
      suggestedCount,
      exercise.countUnit,
    )}`,
  };
}

/**
 * A count in the shortest form that still says what it is.
 *
 * Time reads as a clock, distance carries its unit, reps are bare — the unit is
 * obvious from the sentence around them ("3× at 14 — try 15" is reps or it is
 * nothing). Rounds read as a clock too, because `count` holds the LENGTH of a
 * round: the number of rounds is the number of SETS, which lives on the routine.
 *
 * Exported because `OverloadNudge` renders the same numbers this file writes
 * `message` from, and two functions deciding whether 135 is "135" or "2:15" is
 * two places for one answer. `formatCount` in `units.ts` is the SET ROW's
 * formatter: it fills a fixed-width cell that already has a unit label beside it,
 * so it never carries one.
 */
export function describeCount(count: number, countUnit: CountUnit): string {
  if (countUnit === 'seconds' || countUnit === 'rounds') return formatCount(count, countUnit);
  if (countUnit === 'meters') return `${count} m`;
  return String(count);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function emptyVerdict(): OverloadVerdict {
  return {
    status: 'insufficient_data',
    shouldNudge: false,
    currentWeightKg: null,
    suggestedWeightKg: null,
    currentCount: null,
    suggestedCount: null,
    plateauDays: 0,
    sessionsInRun: 0,
    bestRepsAtWeight: 0,
    since: null,
    message: '',
  };
}

/** Float-safe comparison — 22.5 kg round-tripped through lb must still match. */
function nearlyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Batch helper for list screens: evaluate many exercises in one pass so the
 * routine view can render badges without N queries.
 */
export function evaluateOverloadBatch(
  exercises: EvaluateOverloadParams['exercise'][],
  historyByExerciseId: Record<string, SetHistory[]>,
  options: Omit<EvaluateOverloadParams, 'exercise' | 'history'> = {},
): Record<string, OverloadVerdict> {
  const out: Record<string, OverloadVerdict> = {};
  for (const exercise of exercises) {
    out[exercise.id] = evaluateOverload({
      exercise,
      history: historyByExerciseId[exercise.id] ?? [],
      ...options,
    });
  }
  return out;
}
