/**
 * The rep ladder — a whole session's reps derived from ONE number.
 *
 *   max 16, five sets  →  16 + 10 + 8 + 8 + 6      48 reps
 *   max 17, five sets  →  17 + 10 + 9 + 8 + 7      51 reps
 *
 * The first set is a max effort. Every set after it is a BACKOFF set, and the
 * backoffs are laid out around half the max — descending, spread ±2 reps — which
 * makes the session total exactly THREE TIMES THE MAX, every time, at every max.
 * That invariant is not a coincidence of the arithmetic; it is the scheme, and
 * `ladderTotal` is tested against it for every max from 1 to 60.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
 *
 * This is the family of pull-up progressions the user's own log is from — the
 * table they trained off for two years, reproduced here exactly (see the test
 * file: 26 rows, from `1 + 1 + 1` to `29 + 16 + 15 + 14 + 13`). It is the same
 * scheme as Pavel Tsatsouline's Fighter Pull-Up Program and the Recon Ron table,
 * and the published guidance agrees on all three of its parts:
 *
 *   • ONE ALL-OUT SET, then submaximal work. The top set is the only one taken
 *     near failure; everything after it is deliberately not.
 *   • BACKOFFS AT ABOUT HALF THE MAX. "Grease the groove" prescribes 50–60% of
 *     max reps for repeated sets, and Pavel's own instruction for the backoffs is
 *     half of max — which is what `ladderForMax` centres them on.
 *   • +1 REP PER SUCCESSFUL SESSION, FROM THE BOTTOM UP. The Fighter Pull-Up
 *     Program states it directly: "the next day add a rep to the last set, then a
 *     rep to the set before that". `ladderBumpOrder` derives that order rather
 *     than hardcoding it — see below, because the reason it is derived is the
 *     whole reason the ladder ever reaches a new max.
 *
 * ── THE SPREAD ──────────────────────────────────────────────────────────────
 *
 * `floor(max/2) + 2` down to `ceil(max/2) − 2`, which is ±2 around half and,
 * because of the floor and the ceiling, ±1.5 on an odd max. The two middles are
 * half the max itself. Four backoffs therefore read `+2, +0, −0, −2` — a steep
 * first drop, a flat middle, a steep last one — and not a straight ramp from +2 to
 * −2. That shape is in the reference table at every max and it is physiologically
 * the right one: the biggest fall comes immediately after the set that went to
 * failure, and the last set is the one you can always finish.
 *
 * Below a max of 9 the spread narrows, because ±2 around a small half is a last
 * set of one or zero. `ladderSpread` owns that and states the exceptions.
 *
 * ── WHY THE BUMP ORDER IS DERIVED AND NOT WRITTEN DOWN ──────────────────────
 *
 * A rep is added to one set per successful session, and after enough of them the
 * plan must arrive EXACTLY at the ladder for the next max — otherwise the scheme
 * drifts and the "new max" is a number the app made up. So the order is computed
 * by diffing this max's ladder against the next one:
 *
 *   16 + 10 + 8 + 8 + 6   ← the ladder for 16
 *   17 + 10 + 9 + 8 + 7   ← the ladder for 17
 *    ↑         ↑     ↑
 *    │         └─────┴─ two backoff reps to earn
 *    └─ ...and then the max itself: the personal record
 *
 * Three successful sessions, three reps, and the third one is a PR. That is why
 * the top set moves every five to eight workouts in practice rather than every
 * three: a session that misses its target earns nothing and comes back unchanged.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It does not deload on a miss. Repeating a target you did not hit is the honest
 * response to one bad day, and a program that cuts your numbers because you slept
 * badly is a program you stop trusting. It also never touches WEIGHT: the ladder
 * owns the rep prescription of a rep-counted exercise and nothing else, which is
 * exactly why `evaluateOverload` stands down when one is running — two systems
 * telling one exercise what to do next is one of them being wrong.
 */

import type { CountUnit, Exercise, ID, RepLadder } from '../types/models';

/* ------------------------------------------------------------------ */
/* Limits                                                             */
/* ------------------------------------------------------------------ */

/**
 * The believable range for a max.
 *
 * One because a ladder off a max of zero is five sets of nothing, and 100 because
 * the world record for strict pull-ups in a set is in the sixties: past that the
 * number is a typo, and clamping it is kinder than planning it.
 */
export const LADDER_MAX_LIMITS = { min: 1, max: 100 } as const;

/**
 * The set count the scheme is written for, and what a new ladder plans.
 *
 * Five is not a preference — every published version of this table is five sets,
 * and five is what makes the total come out at three times the max. Any other
 * count still works (`ladderForMax` generalises, and a routine is free to plan
 * three sets or eight), it just is not the scheme any more.
 */
export const LADDER_SETS = 5;

/* ------------------------------------------------------------------ */
/* Reading a ladder off an exercise                                    */
/* ------------------------------------------------------------------ */

/** Everything this module needs to know about an exercise. */
export type LadderSubject = Pick<Exercise, 'countUnit'> & { ladder?: RepLadder };

/**
 * A ladder that can be trusted, or null.
 *
 * TWO gates, and both of them matter:
 *
 *  1. REPS ONLY. A ladder is a rep prescription. "16 + 10 + 8 + 8 + 6" seconds of
 *     plank is not the scheme in another unit, it is nonsense with plus signs in
 *     it — the reason a hold gets longer is not the reason a set gets easier. The
 *     create screen only offers a ladder on rep-counted work and this is the gate
 *     behind that, so a count unit changed later turns the ladder off rather than
 *     letting it prescribe metres.
 *  2. THE NUMBERS ARE REPAIRED, NOT TRUSTED. This comes off a persisted library
 *     row and can therefore be anything at all — a `NaN` that survived a JSON
 *     round-trip, a hand-edited backup, a max of −3. `isRenderableExercise` in
 *     `libraryStore` is structural and does not look inside here, deliberately:
 *     there is one validator per shape in this app and for this shape it is this
 *     function, because every read goes through it.
 */
export function ladderOf(exercise: LadderSubject | undefined | null): RepLadder | null {
  if (!exercise || !supportsLadder(exercise.countUnit)) return null;
  return normalizeLadder(exercise.ladder);
}

/** Reps, and nothing else. See gate 1 above. */
export function supportsLadder(countUnit: CountUnit): boolean {
  return countUnit === 'reps';
}

/**
 * Where a max starts when nobody has typed one — the seed for a ladder switched on
 * in bulk rather than exercise by exercise.
 *
 * The exercise's own `defaultCount` first, which is the closest thing the user has
 * ever told the app to a max for that movement: a lift they said they do twelve of
 * has a max nearer twelve than any constant here would pick. Twelve is the fallback
 * because it is what a blank exercise starts at (`emptyExerciseDraft`), so the two
 * paths into a new ladder agree.
 *
 * It is a STARTING POINT, and the app says so: the create screen's max stepper is
 * one tap away, the first met session moves it, and the whole scheme is built to
 * walk a wrong max to a right one.
 */
export const AUTO_LADDER_SEED_REPS = 12;

/**
 * The ladder `Make every exercise a rep ladder` would put on this exercise, or null
 * where the scheme does not apply.
 *
 * Marked `auto` so switching the setting off can take back exactly what switching
 * it on gave — see `RepLadder.auto`. Never overwrites: an exercise that already
 * carries a usable ladder keeps the one it has, max, earned reps and all.
 */
export function autoLadderFor(
  exercise: LadderSubject & { defaultCount?: number },
): RepLadder | null {
  if (!supportsLadder(exercise.countUnit)) return null;
  const existing = ladderOf(exercise);
  if (existing) return existing;
  return { max: clampMax(exercise.defaultCount ?? AUTO_LADDER_SEED_REPS), earned: 0, auto: true };
}

/**
 * Is this a ladder the bulk setting put here and nothing has happened to since?
 *
 * The `earned` half is the whole reason this is a function rather than a field
 * read: a rep earned against a ladder is a session the user trained, and switching
 * a setting off must not delete one. Such a ladder stays, and stops being `auto`
 * the first time `ladderAdvance` rebuilds it.
 */
export function isAutoLadder(ladder: RepLadder | null | undefined): boolean {
  return ladder?.auto === true && (ladder.earned ?? 0) === 0;
}

/** A usable `{ max, earned }` out of anything at all, or null for "no ladder". */
export function normalizeLadder(value: unknown): RepLadder | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<RepLadder>;
  if (typeof raw.max !== 'number' || !Number.isFinite(raw.max)) return null;

  const max = clampMax(raw.max);
  const earned =
    typeof raw.earned === 'number' && Number.isFinite(raw.earned) && raw.earned > 0
      ? Math.min(Math.round(raw.earned), MAX_EARNED)
      : 0;
  // Present only when true, so a hand-made ladder round-trips as `{ max, earned }`
  // and the flag costs nothing on disk. See `RepLadder.auto`.
  return raw.auto === true ? { max, earned, auto: true } : { max, earned };
}

/**
 * A cap on `earned` so a garbage value cannot turn `ladderTargets` into a long
 * loop. Twenty maxima of progress past the one that is stored is already a
 * meaningless number; a million is a frozen screen.
 */
const MAX_EARNED = 200;

export function clampMax(value: number): number {
  const { min, max } = LADDER_MAX_LIMITS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/* The ladder itself                                                   */
/* ------------------------------------------------------------------ */

/**
 * How far the backoff sets spread either side of half the max.
 *
 * Two, once there are enough reps to spread. Below that ±2 puts the last set at
 * one rep or at zero — `4 + 4 + 2 + 2 + 0` is not a plan — so the spread narrows
 * to one, and at a max of two there is nothing left to spread at all: every set
 * is a single rep.
 *
 * The one asymmetry, and it is in the reference table rather than in this code's
 * opinion: an ODD max keeps the full spread from five up, because `5 + 4 + 3 + 2 +
 * 1` is the scheme's own first ladder and the floor/ceiling already narrow an odd
 * spread to ±1.5. An even max under ten does not, because there the last set
 * would land on a quarter of the max or less.
 */
export function ladderSpread(max: number): number {
  if (max >= 9) return 2;
  if (max >= 5 && max % 2 === 1) return 2; // 5 + 4 + 3 + 2 + 1, and 7 + 5 + 4 + 3 + 2
  if (max >= 3) return 1;
  return 0;
}

/**
 * The ladder for a max, at a given number of sets. THE function of this module.
 *
 * The first set is the max. The rest descend from `floor(max/2) + spread` to
 * `ceil(max/2) − spread` with halves in between, so they average half the max
 * whatever the set count is — five sets total three times the max, four sets two
 * and a half times, and the shape is the same in both.
 *
 * Never returns a zero or a negative: a set in a plan is work, and "do zero" is
 * the absence of a set rather than a light one. That clamp is also what produces
 * the table's `1 + 1 + 1` at a max of one.
 */
export function ladderForMax(rawMax: number, sets: number = LADDER_SETS): number[] {
  const max = clampMax(rawMax);
  const count = Math.max(1, Math.round(Number.isFinite(sets) ? sets : LADDER_SETS));
  if (count === 1) return [max];

  const hi = Math.ceil(max / 2);
  const lo = Math.floor(max / 2);
  const spread = ladderSpread(max);
  const backoffs = count - 1;
  /*
   * The middles alternate ceiling-then-floor so their mean is half the max on an
   * odd one too, and the ceilings come first so the whole run descends. At four
   * backoffs that is `+spread, ceil, floor, −spread` — the reference table's own
   * shape, and the reason this is not a straight ramp (see the file header).
   */
  const middles = backoffs - 2;
  const ceilings = Math.ceil(Math.max(0, middles) / 2);

  const out: number[] = [max];
  for (let i = 0; i < backoffs; i += 1) {
    const raw =
      i === 0 ? lo + spread : i === backoffs - 1 ? hi - spread : i - 1 < ceilings ? hi : lo;
    // Never above the max (a backoff heavier than the all-out set is not a
    // backoff) and never below one rep.
    const clamped = Math.min(max, Math.max(1, raw));
    // Non-increasing, always: the clamps above can lift a tail value above the
    // one before it at the very small maxima.
    out.push(Math.min(clamped, out[out.length - 1]));
  }
  return out;
}

/** The session total. Three times the max at five sets — see the file header. */
export function ladderTotal(targets: readonly number[]): number {
  return targets.reduce((sum, reps) => sum + reps, 0);
}

/**
 * Which sets earn the single rep, in the order they earn it.
 *
 * Derived by diffing this max's ladder against the next one, so the reps land on
 * the sets that actually differ and the plan arrives exactly at the next ladder.
 * Returned BOTTOM-UP (the last set first), which is both the Fighter Pull-Up
 * Program's instruction and the gentlest order: the set with the fewest reps in it
 * is the one with the most left in the tank.
 *
 * The top set is deliberately NOT in here. Its rep is the promotion — a new max —
 * and that is a different event, handled by `ladderAdvance`.
 */
export function ladderBumpOrder(max: number, sets: number = LADDER_SETS): number[] {
  const here = ladderForMax(max, sets);
  const next = ladderForMax(clampMax(max) + 1, sets);
  const order: number[] = [];
  for (let i = here.length - 1; i >= 1; i -= 1) {
    for (let rep = next[i] - here[i]; rep > 0; rep -= 1) order.push(i);
  }
  return order;
}

/**
 * The plan as it stands: the ladder for the stored max, plus the reps earned
 * since that max was set.
 *
 * `earned` past a whole level rolls over rather than overflowing — a set count
 * changed under a ladder mid-progress (five sets to four, so fewer backoffs to
 * earn) can leave more earned reps than the level has room for, and the honest
 * reading of that is that the max moved.
 */
export function ladderTargets(ladder: RepLadder, sets: number = LADDER_SETS): number[] {
  let max = clampMax(ladder.max);
  let earned = Math.min(Math.max(0, Math.round(ladder.earned) || 0), MAX_EARNED);

  // Bounded: every pass either consumes a level's worth of reps or exits.
  for (let guard = 0; guard <= MAX_EARNED; guard += 1) {
    const order = ladderBumpOrder(max, sets);
    if (earned <= order.length) {
      const targets = ladderForMax(max, sets);
      for (let i = 0; i < earned; i += 1) targets[order[i]] += 1;
      return targets;
    }
    earned -= order.length + 1; // the level's backoff reps, then the PR
    max = clampMax(max + 1);
  }
  return ladderForMax(max, sets);
}

/**
 * One successful session, applied.
 *
 * Either a backoff set gains a rep, or — when they have all gained theirs — the
 * max itself moves and the count starts again. The second case is the personal
 * record, and `ladderIsPR` is how a caller asks whether the next success will be
 * one without applying it.
 */
export function ladderAdvance(ladder: RepLadder, sets: number = LADDER_SETS): RepLadder {
  const max = clampMax(ladder.max);
  const earned = Math.max(0, Math.round(ladder.earned) || 0);
  const order = ladderBumpOrder(max, sets);

  if (earned >= order.length) return { max: clampMax(max + 1), earned: 0 };
  return { max, earned: earned + 1 };
}

/**
 * How many more met sessions until the max moves. 1 = the next one is the PR.
 *
 * The whole of "is the next session a personal record", too: there is no separate
 * predicate for that, because `=== 1` is the predicate and a second function would
 * be a second answer.
 *
 * Stated on the exercise's own screen, because "two more" is the answer to the
 * only question a scheme like this ever gets asked.
 */
export function sessionsToNextMax(ladder: RepLadder, sets: number = LADDER_SETS): number {
  const order = ladderBumpOrder(clampMax(ladder.max), sets);
  const earned = Math.max(0, Math.round(ladder.earned) || 0);
  return Math.max(1, order.length + 1 - Math.min(earned, order.length));
}

/* ------------------------------------------------------------------ */
/* Did the session earn it                                             */
/* ------------------------------------------------------------------ */

/**
 * Was the target MET — every prescribed set, or better.
 *
 * Per set, not on the total, and that is the whole strictness of the scheme:
 * `16 + 16 + 16 + 0 + 0` is 48 reps and it is not this session. Extra sets past
 * the plan are free (they cannot make a met target unmet), and a session with
 * fewer completed sets than the plan has not met it — an unlogged set is an
 * intention, exactly as it is everywhere else in this app.
 */
export function ladderMet(targets: readonly number[], performed: readonly number[]): boolean {
  if (performed.length < targets.length) return false;
  return targets.every((target, i) => performed[i] >= target);
}

/**
 * The counts a ladder is judged against: completed WORKING sets, in order.
 *
 * Warm-ups are dropped here for the same reason they are dropped from the
 * shorthand, the volume and every overload verdict — a warm-up is a set that does
 * not count, and counting one as the top set would hand out a rep for a rep
 * nobody did.
 */
export function performedLadderCounts(
  sets: readonly { count: number; isWarmup: boolean; isCompleted: boolean }[],
): number[] {
  return sets.filter((s) => s.isCompleted && !s.isWarmup).map((s) => s.count);
}

/* ------------------------------------------------------------------ */
/* Reshaping a session in flight                                       */
/* ------------------------------------------------------------------ */

/**
 * The ladder the REST of today's session should follow, given what the top set
 * actually produced.
 *
 * This is the feature that makes the scheme feel like it is paying attention. The
 * plan says 16 and you get 18: the sets below you are wrong, and they are wrong in
 * the direction that matters — too easy. The plan says 16 and you get 14: they are
 * wrong the other way, and grinding out backoffs built for a max you did not hit
 * today is how a bad day becomes a hurt shoulder.
 *
 * A top set that matched the max it was built from changes nothing, and it must
 * not: the reps earned so far are part of today's plan, and rebuilding from the
 * bare max would silently drop them.
 */
export function ladderAfterTopSet(
  ladder: RepLadder,
  topSetReps: number,
  sets: number = LADDER_SETS,
): number[] {
  const achieved = Math.round(topSetReps);
  if (!Number.isFinite(achieved) || achieved <= 0) return ladderTargets(ladder, sets);
  if (achieved === clampMax(ladder.max)) return ladderTargets(ladder, sets);
  // A fresh ladder off what actually happened. `earned` belongs to the old max and
  // says nothing about this one.
  return ladderTargets({ max: achieved, earned: 0 }, sets);
}

/** One row's worth of the reshape: the new count, or null to leave it alone. */
export type ReshapedCount = number | null;

/**
 * Apply a set of ladder targets to the rows of an exercise in flight.
 *
 * Three rules, and all three are about not overwriting something the user meant:
 *
 *  1. A LOGGED SET IS HISTORY. Never touched, whatever the ladder now says.
 *  2. A ROW THE USER EDITED IS THEIRS. `isPrefilled` is false the moment a value
 *     is nudged, and this respects it — the same rule the overload nudge follows.
 *  3. WARM-UPS ARE NOT IN THE LADDER. They keep their own numbers and do not
 *     consume a rung, so a warm-up single on top of five working sets still gets
 *     the whole `16 + 10 + 8 + 8 + 6` underneath it.
 *
 * Returns one entry per row, aligned with the input. Rows past the end of the
 * ladder keep what they have — an exercise can carry more sets than the plan.
 */
export function reshapeLadderSets(
  sets: readonly { count: number; isWarmup: boolean; isCompleted: boolean; isPrefilled: boolean }[],
  targets: readonly number[],
): ReshapedCount[] {
  let rung = 0;
  return sets.map((set) => {
    if (set.isWarmup) return null;
    const target = targets[rung];
    rung += 1;
    if (target == null) return null;
    if (set.isCompleted || !set.isPrefilled) return null;
    return target === set.count ? null : target;
  });
}

/* ------------------------------------------------------------------ */
/* What a finished session does to the ladders in it                   */
/* ------------------------------------------------------------------ */

/** One exercise in a finished session, as far as its ladder is concerned. */
export interface LadderEntryLike {
  exercise: { id: ID; name: string; countUnit: CountUnit; ladder?: RepLadder };
  sets: readonly { count: number; isWarmup: boolean; isCompleted: boolean }[];
}

/** A ladder that moved, and everything a caller needs to say so. */
export interface LadderOutcome {
  exerciseId: ID;
  name: string;
  before: RepLadder;
  after: RepLadder;
  /** What today asked for. */
  targets: number[];
  /** What next time will ask for. */
  nextTargets: number[];
  /** The max moved: a personal record. */
  isPersonalRecord: boolean;
}

/**
 * Every ladder in a finished session that earned its rep.
 *
 * AUTOMATIC, unlike the routine's set count, which is offered as a question on the
 * way out. The difference is what the two things are: a routine is a template the
 * user wrote and the app must not rewrite it behind their back, while a ladder is a
 * progression they switched on precisely so it would move on its own. Being pushed
 * one rep further than last time is the feature, not a side effect of it — and a
 * dialog asking permission to add the rep every single workout would be the app
 * asking whether the user meant to train.
 *
 * A session that missed its target produces nothing at all: no entry here, no
 * change, and the same numbers come back next time.
 *
 * ── A TOP SET THAT BEAT THE PLAN CAN BE THE NEW MAX OUTRIGHT ────────────────
 *
 * Somebody whose plan says 16 and who does 18 has tested a max, and handing them
 * 16 again next week is the app not watching. But a big first set on its own is
 * not a max either — it is one set, and the reason the ladder climbs in single
 * reps is that the backoffs are what make the top set repeatable.
 *
 * So the max jumps only when BOTH are true: the session met the plan it was given
 * at the start, AND it met the ladder for the number the top set actually produced
 * — which is the ladder the app re-shaped the rows to the moment that set was
 * logged (`ladderAfterTopSet`), so it is a target the user was actually shown and
 * actually finished. Then the stored max becomes what they proved, the earned reps
 * against the old one are dropped (they say nothing about the new one), and the
 * usual single rep is added on top.
 *
 * Otherwise the ladder climbs the ordinary way. 18 on the top set and the old
 * backoffs under it earns one rep and nothing more, because the 18 was not backed
 * up — and the app already acknowledged it on the day by re-shaping the rows.
 */
export function ladderOutcomes(entries: readonly LadderEntryLike[]): LadderOutcome[] {
  const outcomes: LadderOutcome[] = [];

  for (const entry of entries) {
    const before = ladderOf(entry.exercise);
    if (!before) continue;

    const working = entry.sets.filter((s) => !s.isWarmup);
    const targets = ladderTargets(before, working.length);
    const performed = performedLadderCounts(entry.sets);
    if (!ladderMet(targets, performed)) continue;

    /*
     * `performed[0]` is the top set: `ladderMet` has already refused any session
     * with fewer completed working sets than the plan has rungs, so a met session
     * always has one.
     */
    const proved = performed[0];
    const provedFully =
      proved > before.max &&
      ladderMet(ladderAfterTopSet(before, proved, working.length), performed);
    const after = ladderAdvance(provedFully ? { max: proved, earned: 0 } : before, working.length);

    outcomes.push({
      exerciseId: entry.exercise.id,
      name: entry.exercise.name,
      before,
      after,
      targets,
      nextTargets: ladderTargets(after, working.length),
      isPersonalRecord: after.max > before.max,
    });
  }

  return outcomes;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** `16 + 10 + 8 + 8 + 6` — the plan, in the notation the user already writes it in. */
export function describeLadder(targets: readonly number[]): string {
  return targets.join(' + ');
}

/**
 * What the ladders in a finished session did — one line, for the finish sheet.
 *
 * States the number and nothing about how it felt. "New max 17" is a fact; "great
 * work, new PR!" is the app taking a tone it does not take anywhere else.
 */
export function describeLadderOutcomes(outcomes: readonly LadderOutcome[]): string | null {
  if (outcomes.length === 0) return null;
  const [first] = outcomes;
  const head = first.isPersonalRecord
    ? `${first.name} · new max ${first.after.max} · ${describeLadder(first.nextTargets)} next time`
    : `${first.name} · ${describeLadder(first.nextTargets)} next time`;
  if (outcomes.length === 1) return head;
  const others = outcomes.length - 1;
  return `${head}, and ${others} ${others === 1 ? 'other' : 'others'} moved up too`;
}
