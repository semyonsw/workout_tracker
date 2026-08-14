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
  bodyweightKg?: number;
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
  defaultRestSeconds?: number;

  equipment?: string;
  isArchived: boolean;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Split (the week / cycle view)                                       */
/* ------------------------------------------------------------------ */

export type SplitDayKind = 'routine' | 'rest' | 'freeform';

export interface SplitDay {
  id: ID;
  order: number;
  /** Short label for the timeline chip: "Push", "Pull", "Boxing", "Rest". */
  label: string;
  kind: SplitDayKind;
  routineId?: ID;
  /** Optional weekday pin for `weekly` cycles (0 = Sunday). */
  weekday?: number;
}

export interface WorkoutSplit {
  id: ID;
  ownerId: ID;
  name: string; // "PPL + Boxing"
  /**
   * `weekly`  — days are pinned to weekdays.
   * `rolling` — a repeating queue that advances only when a session completes.
   *             This is what a real log looks like: an unbroken chain of
   *             pull -> push -> boxing -> pull ... that ignores the calendar.
   */
  cycleMode: 'weekly' | 'rolling';
  days: SplitDay[];
  /** Index into `days` for `rolling` cycles. */
  cursor: number;
  startedOn: ISODateTime;
  isActive: boolean;
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
  /** Same string = same superset; rest only fires after the last member. */
  supersetGroup?: string;
  notes?: string;
}

export interface Routine {
  id: ID;
  ownerId: ID;
  name: string; // "Pull + Swimming"
  /** Links a template to its slot in the split timeline. */
  splitTag?: string;
  items: RoutineItem[];
  estimatedMinutes?: number;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Session (the performance)                                           */
/* ------------------------------------------------------------------ */

export type SessionStatus = 'active' | 'completed' | 'abandoned';

/**
 * One logged set. This is the atom of the whole app — everything else is
 * scaffolding around producing and reading these rows.
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

  /** Trailing partials / cheat reps: "+25kg 12 + 1" -> count 12, partials 1. */
  partials?: number;
  side?: 'both' | 'left' | 'right';
  rpe?: number; // 1–10, optional, never required

  /** Warm-ups are excluded from every analysis. */
  isWarmup: boolean;
  isCompleted: boolean;
  /** Actual rest taken before this set — feeds future rest suggestions. */
  restTakenSeconds?: number;

  /** Denormalized Epley estimate, null for non-weighted work. */
  estimated1RM: number | null;
  notes?: string;
}

export interface SessionExercise {
  id: ID;
  sessionId: ID;
  exerciseId: ID;
  order: number;
  sets: SetHistory[];
  /** Overrides routine rest for this session only. */
  restSecondsOverride?: number;
  notes?: string;
}

export interface WorkoutSession {
  id: ID;
  ownerId: ID;
  routineId?: ID;
  splitDayId?: ID;
  title: string;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  status: SessionStatus;
  entries: SessionExercise[];
  /** Rolled up on completion so the history list never recomputes. */
  totalVolumeKg?: number;
  bodyweightKg?: number;
  notes?: string;
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

/* ------------------------------------------------------------------ */
/* Derived / cache                                                     */
/* ------------------------------------------------------------------ */

/**
 * Optional per-exercise rollup, recomputed on session completion.
 * Pure cache: it can be dropped and rebuilt from `SetHistory` at any time.
 * Exists so the routine list can render overload badges without scanning history.
 */
export interface ExerciseStat {
  exerciseId: ID;
  lastPerformedAt: ISODateTime;
  /** Heaviest completed working weight in the most recent session. */
  lastTopWeightKg: number | null;
  /** First session date at which `lastTopWeightKg` became the top weight. */
  topWeightSince: ISODateTime | null;
  sessionsAtTopWeight: number;
  bestE1RM: number | null;
  updatedAt: ISODateTime;
}
