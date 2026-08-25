/**
 * Core domain models.
 *
 * Design rules that drive this schema:
 *
 * 1. `SetHistory` is the ONLY write-heavy table and it is deliberately
 *    denormalized (it carries `exerciseId` + `performedAt` + `weightKg`).
 *    Progressive-overload analysis is therefore ONE indexed range scan:
 *      SELECT * FROM set_history
 *      WHERE exercise_id = ? AND is_warmup = 0 AND is_completed = 1
 *      ORDER BY performed_at DESC LIMIT 200;
 *    No joins, no session hydration, instant on-device.
 *
 * 2. Load and count are two independent axes, not one enum:
 *      - `requiresWeight` -> render the weight input at all?
 *      - `countUnit`      -> is the second input reps / seconds / meters / rounds?
 *      - `loadMode`       -> how to *read* the weight (added to bodyweight vs.
 *                            absolute stack weight vs. assistance).
 *    This models real logs like "weighted dips +30kg 8 6 5 4" (added_bodyweight),
 *    "wide pull-ups machine 80kg 8 6 5 5" (external), "wide knuckle push-ups
 *    14 13 10 10" (none), and "12 rounds 3min boxing bag" (rounds).
 *
 * 3. Weight lives on the SET, never on the exercise. Real sessions drop weight
 *    mid-exercise ("15kg 5, then 10kg 12 9 8") and the overload engine needs the
 *    true per-set load to detect a plateau.
 *
 * All weights are stored in KILOGRAMS. Imperial is a presentation concern only
 * (see `src/lib/units.ts`) so history never gets corrupted by a unit toggle.
 */

export type ID = string;
/** ISO-8601 UTC timestamp, e.g. "2026-08-11T18:31:14.000Z". */
export type ISODateTime = string;

/* ------------------------------------------------------------------ */
/* User + preferences                                                  */
/* ------------------------------------------------------------------ */

export type UnitSystem = 'metric' | 'imperial';

/**
 * Tunables for the progressive-overload engine. Exposed in Settings so the
 * "2 weeks" in the spec is a default, not a hard-coded assumption.
 */
export interface OverloadPolicy {
  /** A weight is "stale" once it has been the top working weight this long. */
  stalenessDays: number; // default 14
  /** ...and has been repeated at least this many separate sessions. */
  minSessions: number; // default 3
  /** Default jump when no exercise-specific increment is set. */
  incrementKg: number; // default 2.5
  /**
   * Only suggest MORE WEIGHT once the rep target is met at the current weight.
   * Otherwise the nudge suggests one more REP first — the correct progression
   * order, and it stops the app from pushing weight the user can't yet own.
   */
  requireRepTargetMet: boolean; // default true
  /** Reps on the top set that count as "owning" the weight. */
  repTarget: number; // default 8
  /** Ignore history older than this when looking for a recent regression. */
  regressionLookbackDays: number; // default 60
}

export interface User {
  id: ID;
  displayName: string;
  unitSystem: UnitSystem;
  /**
   * NOTE: bodyweight is NOT here. It used to be, unset by the seed and read by
   * nothing, and it is a preference the user types — so it lives in
   * `settingsStore` beside the unit system, which is the only place the app can
   * actually be told it. Two homes for one number is one of them being stale.
   */
  /** Fallback rest when neither exercise nor routine specifies one. */
  defaultRestSeconds: number;
  overloadPolicy: OverloadPolicy;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Exercise library                                                    */
/* ------------------------------------------------------------------ */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'traps'
  | 'neck'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'cardio';

/**
 * The movement family a muscle group belongs to — the second level of the
 * library's two-level hierarchy: `back` sits under `pull`, `chest` under `push`.
 *
 * This is what makes "pull day" a fact about a routine rather than a name
 * someone typed: a routine whose exercises are mostly `back` + `biceps` IS a
 * pull day, and the app can say so without being told.
 *
 * Every `MuscleGroup` belongs to exactly ONE cluster. The mapping — and the
 * compile-time proof that it is total — lives in `src/lib/muscles.ts`.
 */
export type MuscleCluster = 'push' | 'pull' | 'legs' | 'core' | 'cardio';

/** What the number in the second input actually counts. */
export type CountUnit = 'reps' | 'seconds' | 'meters' | 'rounds';

/**
 * How a time-counted set is PERFORMED. Orthogonal to `countUnit`, which says
 * what the number means — this says who produces it, the phone or the user.
 *
 *  `manual`    — the number is typed. A 50-minute swim is not timed by an app
 *                that is in a locker.
 *  `countdown` — a prescribed hold: a 2:00 plank. The clock runs to zero, the
 *                bell rings, and the target is logged. Stopping early logs
 *                what was actually held, never the target.
 *  `countup`   — an open hold: a dead hang to failure. The clock runs up until
 *                the user stops, and logs the time they saw.
 *
 * Both timed modes are preceded by a get-ready countdown (`prepareSeconds`),
 * because nobody is hanging off a bar when they press start.
 */
export type TimerMode = 'manual' | 'countdown' | 'countup';

/**
 * How the logged weight relates to the load on the body.
 * Matters for e1RM math and for how the weight is rendered ("+30 kg" vs "80 kg").
 */
/**
 * A rep ladder: a whole session's reps derived from one max.
 *
 *   { max: 16, earned: 0 }  →  16 + 10 + 8 + 8 + 6
 *   { max: 16, earned: 2 }  →  16 + 10 + 9 + 8 + 7
 *   { max: 17, earned: 0 }  →  17 + 10 + 9 + 8 + 7   ← the third met session
 *
 * TWO NUMBERS, not a list of targets, because the list is derived and a stored one
 * would be a second answer that can disagree with `lib/repLadder.ts`. The whole
 * scheme — the shape of the backoffs, which set earns the next rep, when the max
 * moves — is arithmetic over these two.
 *
 *  `max`    the top set: an all-out effort, and the number everything else is a
 *           fraction of.
 *  `earned` single reps added to the backoff sets since that max was set. Reset to
 *           zero by a promotion, and by the user setting a new max by hand — reps
 *           earned against 16 say nothing about 17.
 *
 * PRESENT MEANS ON. There is no `isActive`: a ladder the user switched off is a
 * ladder that is not there, and a flag would leave the app deciding what a stale
 * max means.
 */
export interface RepLadder {
  max: number;
  earned: number;
}

export type LoadMode =
  | 'external' // barbell, dumbbell, machine stack — the number IS the load
  | 'added_bodyweight' // dips / pull-ups with a belt — bodyweight + number
  | 'assisted' // assisted machine — bodyweight MINUS number
  | 'none'; // push-ups, boxing, swimming

export interface Exercise {
  id: ID;
  ownerId: ID | null; // null = shipped with the app, non-null = user-created
  name: string;
  /** Free-text search aliases, incl. non-English names ("pull to փոր"). */
  aliases?: string[];
  /**
   * Muscles worked, PRIMARY FIRST. The order is load-bearing: the first entry
   * decides which cluster the exercise files under, so a face pull listed as
   * `['traps', 'shoulders']` is pull work and a lateral raise listed as
   * `['shoulders', 'traps']` is push work. Same two muscles, different day.
   */
  muscleGroups: MuscleGroup[];

  /** THE flag from the spec: drives whether the weight input renders at all. */
  requiresWeight: boolean;
  countUnit: CountUnit;
  loadMode: LoadMode;

  /**
   * Whether the phone runs the clock for this exercise, and which way it runs.
   * Only meaningful for time-counted work (`seconds` / `rounds`); a rep-counted
   * exercise is always `manual`, and `resolveTimerMode` enforces that.
   */
  timerMode?: TimerMode;
  /**
   * Get-ready countdown before the work clock starts, in seconds. The gap
   * between pressing start and being in position on the bar.
   */
  prepareSeconds?: number;

  /** "each hand" / "each leg" exercises — logged once, flagged for clarity. */
  isUnilateral: boolean;

  /** Smallest plate/pin jump available for THIS movement (dumbbells: 2.5, cable stack: 5). */
  incrementKg?: number;

  /**
   * The empty bar, in kilograms — and the switch that turns the plate label on.
   *
   * Present ⟹ this movement is loaded with plates on a bar, so the weight cell
   * gets a micro-label reading `20 + 2×10 + 2×2.5`. Absent ⟹ nothing renders, which
   * is what a machine, a dumbbell and a cable stack want: a "plate breakdown" for a
   * pin position is a lie about the equipment.
   *
   * On the exercise rather than in Settings because it is a fact about the
   * movement — an Olympic bar is 20, a women's bar is 15, a trap bar is whatever it
   * says on it — and one number in Settings would put a 20 kg bar under a hex bar.
   * Which PLATES exist is the opposite kind of fact, about the gym rather than the
   * lift, so that one does live in Settings.
   */
  barWeightKg?: number;

  /**
   * Where to START, the first time this exercise is ever performed.
   *
   * Prefills come from HISTORY as soon as there is any — that is the whole
   * one-tap promise — so these two only matter for a movement that has never been
   * logged. Without them a brand-new exercise opens its first session with an
   * empty weight cell and a made-up rep target, and the number the user typed on
   * the create screen ("this machine starts at 30") is thrown away.
   *
   * `defaultCount` is in the exercise's own `countUnit`: reps, seconds, metres or
   * the number of rounds.
   */
  defaultWeightKg?: number;
  defaultCount?: number;

  /**
   * The rep ladder this movement runs, if it runs one. Absent = off.
   *
   * ON THE EXERCISE, not on the routine item, and the reason is that a max is a
   * fact about the lifter and the movement — you have one pull-up max, not one per
   * routine that contains pull-ups. Putting it on the item would give the same
   * exercise two ladders in two routines, both of them advancing separately and
   * neither of them your actual max, and would leave an exercise added mid-session
   * with no ladder at all.
   *
   * What the ROUTINE still owns is how many sets: the ladder shapes whatever set
   * count the plan asks for. Only rep-counted work can carry one — see
   * `ladderOf`, which is the gate every read goes through.
   */
  ladder?: RepLadder;

  defaultRestSeconds?: number;

  equipment?: string;
  isArchived: boolean;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Training sequence (the order of routines, when you want one)         */
/* ------------------------------------------------------------------ */

/**
 * An optional running order for the routines: push → pull → push …
 *
 * OFF BY DEFAULT, and off means off: every routine is listed on the home screen
 * and any of them can be started. A sequence is a convenience for someone who
 * does follow a fixed order, not a schedule the app imposes — so when it is
 * inactive nothing about it is rendered, and when it is active it only ever
 * SUGGESTS the next routine.
 *
 * It is a queue, not a calendar: `cursor` advances when a workout from the
 * current step is finished, never when the week does.
 */
export interface TrainingSequence {
  isActive: boolean;
  /** Routine ids in the order they are trained. Repeats are allowed and normal. */
  routineIds: ID[];
  /** Index into `routineIds` of the next routine up. */
  cursor: number;
}

/* ------------------------------------------------------------------ */
/* Routine (the template)                                              */
/* ------------------------------------------------------------------ */

export interface RoutineItem {
  id: ID;
  exerciseId: ID;
  order: number;
  targetSets: number;
  /** Range renders as "8–10"; a single number renders as "8". */
  targetRepsMin?: number;
  targetRepsMax?: number;
  /** Seconds of rest after each set of this exercise. */
  restSeconds?: number;
  /** Extra rest after the LAST set, before moving on. */
  transitionRestSeconds?: number;
  /**
   * Same string = same superset; rest only fires after the last member.
   *
   * Set by the routine editor's one superset control — a toggle reading "with the
   * exercise above" — so the string itself is never shown to anybody and is only
   * ever compared. `lib/superset.ts` owns whose turn is next, `completeSet` owns
   * the no-rest branch, and `lib/routinePlan.ts` owns joining and splitting.
   *
   * ADJACENCY IS THE MODEL. Two items sharing a group but separated by a third are
   * read as no superset at all: a bracket that skips a row is a lie about what
   * happens in the gym, and it is reachable just by reordering a routine.
   */
  supersetGroup?: string;
}

export interface Routine {
  id: ID;
  ownerId: ID;
  name: string; // "Pull + Swimming"
  items: RoutineItem[];
  estimatedMinutes?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Session (the performance)                                           */
/* ------------------------------------------------------------------ */

/**
 * One logged set. This is the atom of the whole app — everything else is
 * scaffolding around producing and reading these rows.
 *
 * WHAT IS NOT ON IT, and why. Five fields were declared here and read by nothing,
 * which is the most expensive kind of field: it looks like a feature to whoever
 * reads the type next, and it is written to disk forever.
 *
 *  `estimated1RM` — an Epley estimate, computed on every rep set and displayed
 *    nowhere. `ExerciseHistoryScreen` states the case against it directly: it is a
 *    number that goes up on its own and tells you nothing about whether to add a
 *    plate. A derived number that no screen shows is a number that cannot be wrong
 *    in a way anybody notices.
 *  `rpe` — nothing collected it. Rate of perceived exertion is a real training
 *    tool and a different product: it asks the user to grade every set, which is
 *    the opposite of a log that costs one tap.
 *  `notes` — nothing wrote it, and prose per set is a search feature this app has
 *    no screen for.
 *  `side` — a per-set left/right split. `Exercise.isUnilateral` already says "each
 *    side", and it says it once on the card instead of on every row.
 *  `partials` — rendered on the set row and writable from nowhere, which is worse
 *    than absent: the one place it could appear was a value only a hand-edited
 *    backup could produce.
 *
 * They are gone rather than kept "in case". The one that stayed is
 * `restTakenSeconds`, because `completeSet` now writes it: the store knows when
 * rest started and when the next ✓ landed, so the number is free and the median
 * of it is a fact about the lifter that Settings can offer back.
 */
export interface SetHistory {
  id: ID;

  /* --- denormalized keys: keep these, they are what make overload fast --- */
  sessionId: ID;
  exerciseId: ID;
  /** Copied from the session's start time so history sorts without a join. */
  performedAt: ISODateTime;

  setIndex: number; // 0-based, warm-ups included
  /** null when `exercise.requiresWeight === false`. */
  weightKg: number | null;
  /** Reps, seconds, meters or rounds — see `exercise.countUnit`. */
  count: number;
  countUnit: CountUnit;
  loadMode: LoadMode;

  /** Warm-ups are excluded from every analysis. */
  isWarmup: boolean;
  isCompleted: boolean;
  /** Actual rest taken before this set — feeds future rest suggestions. */
  restTakenSeconds?: number;
}

/**
 * One row of the home screen's `RECENT` list.
 *
 * Deliberately not a `WorkoutSession`: the list needs four fields and hydrating
 * every entry and set to render "8 Aug · 74 min" would read the whole history
 * table to draw four rows.
 */
export interface RecentSessionSummary {
  id: ID;
  title: string;
  performedAt: ISODateTime;
  durationMinutes: number;
}
