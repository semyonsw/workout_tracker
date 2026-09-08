/**
 * Editing a workout that already happened.
 *
 *   #92  Pull + swimming      17 Aug · 74 min
 *        ├── retime ─────────► 16 Aug · 74 min      (every set re-dated with it)
 *        ├── rename ─────────► "Pull, short"
 *        ├── redurate ───────► 17 Aug · 61 min
 *        ├── add a set ──────► one more row on an exercise that is already in it
 *        ├── add an exercise ► a snapshot and its first row
 *        └── drop an exercise► every row of it, at once
 *
 * ── WHY HISTORY IS EDITABLE AT ALL ─────────────────────────────────────────
 *
 * `HistoryScreen` already argued half of this: "A TYPO IS NOT A WORKOUT". A 40 kg
 * typed where 4 was meant used to cost the whole session, because delete-and-re-enter
 * was the only route — and that also took those rows out of what the prefills and
 * the overload verdicts read. One field of one row became correctable for exactly
 * that reason.
 *
 * The other half is everything a session gets wrong that is NOT one number: a set
 * removed by a mis-tap, an exercise dropped by `Remove exercise` on the wrong card,
 * a workout finished an hour after it ended because the phone was in a bag, a
 * session logged on the wrong day because it ran past midnight. Every one of those
 * is a fact about training that happened, and the app's own position is that history
 * "must be true". A log you cannot correct is not more true than one you can — it is
 * just wrong in a way you have to remember rather than fix.
 *
 * ── AND WHY EVERY FUNCTION HERE RETURNS A WHOLE, RECOMPUTED WORKOUT ────────
 *
 * Not a patch. `CompletedWorkout` carries eight derived values — the set count, the
 * volume, the partial-volume flag, and per exercise a shorthand, a set count, a
 * total and a top weight — and every one of them is a function of the rows. So each
 * edit here rebuilds the rows and then hands the record to `recomputeWorkout`, which
 * reruns exactly the arithmetic that built it in the first place.
 *
 * That is the rule `HistoryScreen` states as "every number around the corrected row
 * is REGENERATED, never patched", applied to structural edits as well as to typos.
 * A function here that returned `{...workout, sets}` and left the summary alone
 * would produce a record whose shorthand disagrees with its own rows, which is the
 * one failure this whole file is supposed to make impossible.
 *
 * ── SET INDICES ARE POSITIONS, SO THEY ARE REBUILT ─────────────────────────
 *
 * `SetHistory.setIndex` is the row's position in the session, warm-ups included —
 * it is what orders the rows on disk (`ORDER BY session_id, set_index`) and what the
 * CSV prints in its `set` column. Appending a row for the first exercise of a
 * six-exercise session cannot just take "one past the highest index", or that row
 * sorts after the last exercise's. `reindexSets` renumbers the whole session from
 * the exercise order the record already has, so an index stays a position.
 */

import {
  recomputeWorkout,
  type CompletedExercise,
  type CompletedWorkout,
} from './completedWorkout';
import type { Exercise, ID, SetHistory } from '../types/models';

/**
 * What a workout's duration may be set to, in minutes.
 *
 * One because a workout that happened took at least a minute — the same floor
 * `buildCompletedWorkout` applies — and 600 because ten hours is past anything real
 * and a four-digit number in that row is a typo.
 */
export const DURATION_LIMITS = { min: 1, max: 600, step: 5 } as const;

const MS_PER_MINUTE = 60_000;

/** A title that will render: trimmed, capped, never empty. */
export function clampWorkoutTitle(value: string, fallback: string): string {
  const title = value.trim().slice(0, 80);
  return title === '' ? fallback : title;
}

/** Whole minutes inside the allowed range. */
export function clampDurationMinutes(value: number): number {
  const { min, max } = DURATION_LIMITS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Renumber every row by position: exercise order first, then the order the rows
 * already had inside each exercise.
 *
 * Rows belonging to no snapshot go last rather than being dropped — a malformed
 * record is not a reason to lose a set that happened, and `recomputeWorkout` is
 * where a row with nothing to describe it stops counting.
 */
export function reindexSets(workout: CompletedWorkout): SetHistory[] {
  const order = new Map(workout.exercises.map((exercise, index) => [exercise.exerciseId, index]));
  const orphanRank = workout.exercises.length;

  return [...workout.sets]
    .map((row, position) => ({ row, position }))
    .sort((a, b) => {
      const rankA = order.get(a.row.exerciseId) ?? orphanRank;
      const rankB = order.get(b.row.exerciseId) ?? orphanRank;
      if (rankA !== rankB) return rankA - rankB;
      if (a.row.setIndex !== b.row.setIndex) return a.row.setIndex - b.row.setIndex;
      // A stable tiebreak, so two rows that already share an index keep the order
      // they arrived in rather than swapping on every edit.
      return a.position - b.position;
    })
    .map(({ row }, index) => (row.setIndex === index ? row : { ...row, setIndex: index }));
}

/** Apply the rows and regenerate every number that describes them. */
function finish(
  workout: CompletedWorkout,
  bodyweightKg: number | null,
  next: Partial<CompletedWorkout>,
): CompletedWorkout {
  const merged = { ...workout, ...next };
  return recomputeWorkout({ ...merged, sets: reindexSets(merged) }, bodyweightKg);
}

/* ------------------------------------------------------------------ */
/* The whole workout                                                   */
/* ------------------------------------------------------------------ */

export function renameWorkout(
  workout: CompletedWorkout,
  title: string,
  bodyweightKg: number | null = null,
): CompletedWorkout {
  return finish(workout, bodyweightKg, { title: clampWorkoutTitle(title, workout.title) });
}

/**
 * Move a workout in time, keeping how long it took.
 *
 * EVERY ROW MOVES WITH IT. `SetHistory.performedAt` is copied off the session's
 * start so history sorts without a join (see `models.ts`), which means it is not
 * independent of the workout's date — it IS the workout's date, denormalised onto
 * every row. A retime that changed the header and left the rows behind would put a
 * session on Tuesday whose sets the overload engine, the trends and the exercise
 * history all still read as Wednesday's.
 *
 * The duration is preserved rather than recomputed: dragging a session onto the
 * right day says nothing about how long it took.
 */
export function retimeWorkout(
  workout: CompletedWorkout,
  startedAt: Date,
  bodyweightKg: number | null = null,
): CompletedWorkout {
  if (!Number.isFinite(startedAt.getTime())) return workout;

  const at = startedAt.toISOString();
  const endedAt = new Date(
    startedAt.getTime() + clampDurationMinutes(workout.durationMinutes) * MS_PER_MINUTE,
  ).toISOString();

  return finish(workout, bodyweightKg, {
    startedAt: at,
    endedAt,
    sets: workout.sets.map((row) => ({ ...row, performedAt: at })),
  });
}

/** Nudge a workout's start by whole minutes — the ± on the date and time rows. */
export function shiftWorkout(
  workout: CompletedWorkout,
  deltaMinutes: number,
  bodyweightKg: number | null = null,
): CompletedWorkout {
  const start = Date.parse(workout.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(deltaMinutes)) return workout;

  const moved = start + Math.round(deltaMinutes) * MS_PER_MINUTE;
  // A workout cannot be dragged into next week: the log is a record of the past,
  // and a session dated tomorrow sorts above everything and reads as a plan.
  const ceiling = Date.now();
  return retimeWorkout(workout, new Date(Math.min(moved, ceiling)), bodyweightKg);
}

/** Set how long it took. The start stays put; the end moves. */
export function setWorkoutDuration(
  workout: CompletedWorkout,
  minutes: number,
  bodyweightKg: number | null = null,
): CompletedWorkout {
  const start = Date.parse(workout.startedAt);
  if (!Number.isFinite(start)) return workout;

  const durationMinutes = clampDurationMinutes(minutes);
  return finish(workout, bodyweightKg, {
    durationMinutes,
    endedAt: new Date(start + durationMinutes * MS_PER_MINUTE).toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* Sets and exercises                                                  */
/* ------------------------------------------------------------------ */

/**
 * Add a row to an exercise the workout already contains.
 *
 * SEEDED FROM THAT EXERCISE'S LAST ROW, which is the same rule `addSet` follows in
 * a live session: the near-universal intent is "another one of those". Where the
 * exercise somehow has no rows left, the snapshot's own unit and load mode still
 * describe the shape, so the new row is a valid set of the right kind with nothing
 * on it.
 *
 * `null` when there is no such exercise in the record — the caller has asked for
 * something that is not there, and inventing a snapshot for it would be an `Add
 * set` that quietly created an exercise.
 */
export function addSetToWorkout(
  workout: CompletedWorkout,
  exerciseId: ID,
  rowId: ID,
  bodyweightKg: number | null = null,
): CompletedWorkout | null {
  const snapshot = workout.exercises.find((e) => e.exerciseId === exerciseId);
  if (!snapshot) return null;

  const existing = workout.sets
    .filter((row) => row.exerciseId === exerciseId)
    .sort((a, b) => a.setIndex - b.setIndex);
  const last = existing[existing.length - 1];

  const row: SetHistory = {
    id: rowId,
    sessionId: workout.id,
    exerciseId,
    // The workout's own instant, like every other row in it.
    performedAt: workout.startedAt,
    // A position past this exercise's rows; `reindexSets` turns it into the real one.
    setIndex: (last?.setIndex ?? -1) + 1,
    weightKg: last?.weightKg ?? null,
    count: last?.count ?? 1,
    countUnit: snapshot.countUnit,
    loadMode: snapshot.loadMode,
    /*
     * Never a warm-up. A row added by hand to a finished session is a set that
     * happened and was missed — and a warm-up counts towards nothing, so defaulting
     * to one would make `Add a set` look broken: the summary and the totals would
     * not move. The set editor's own chip is one tap away if it really was one.
     */
    isWarmup: false,
    isCompleted: true,
  };

  return finish(workout, bodyweightKg, { sets: [...workout.sets, row] });
}

/**
 * Put an exercise into a finished workout, with one row.
 *
 * The snapshot is taken from the LIBRARY row handed in, exactly as
 * `buildCompletedWorkout` takes it from the live entry — which is what keeps a later
 * rename or delete from rewriting this record (see `completedWorkout.ts`). The
 * derived four (`setCount`, `summary`, `totalCount`, `topWeightKg`) are placeholders
 * here and are overwritten by `recomputeWorkout` before this returns.
 *
 * `null` when the exercise is already in the record: `Add a set` is the operation
 * for that, and a second snapshot for one exercise would give the workout two rows
 * that both claim to summarise it.
 */
export function addExerciseToWorkout(
  workout: CompletedWorkout,
  exercise: Exercise,
  rowId: ID,
  bodyweightKg: number | null = null,
): CompletedWorkout | null {
  if (workout.exercises.some((e) => e.exerciseId === exercise.id)) return null;

  const snapshot: CompletedExercise = {
    exerciseId: exercise.id,
    name: exercise.name,
    countUnit: exercise.countUnit,
    loadMode: exercise.loadMode,
    setCount: 0,
    summary: '',
    totalCount: 0,
    topWeightKg: null,
  };

  const row: SetHistory = {
    id: rowId,
    sessionId: workout.id,
    exerciseId: exercise.id,
    performedAt: workout.startedAt,
    setIndex: workout.sets.length,
    /*
     * The exercise's own starting numbers, which is what the create screen was told
     * this movement starts at — the same fallback `buildDraftEntry` uses when there
     * is no history to prefill from. Better than a bare zero, which reads as a set
     * nobody did.
     */
    weightKg: exercise.requiresWeight ? (exercise.defaultWeightKg ?? null) : null,
    count: exercise.defaultCount ?? 1,
    countUnit: exercise.countUnit,
    loadMode: exercise.loadMode,
    isWarmup: false,
    isCompleted: true,
  };

  return finish(workout, bodyweightKg, {
    exercises: [...workout.exercises, snapshot],
    sets: [...workout.sets, row],
  });
}

/**
 * Take an exercise out of a finished workout, rows and all.
 *
 * REFUSED WHEN IT IS THE LAST ONE, and for the same reason `deleteWorkoutSet`
 * refuses the last row: a workout with nothing in it is not a workout, and the
 * operation the user wants there is `Delete this workout`, which is one tap away in
 * the same open row and asks first. A silent delete of a session from a control
 * labelled `Remove exercise` would be the one destructive action in the app that
 * does not say what it is doing.
 */
export function removeExerciseFromWorkout(
  workout: CompletedWorkout,
  exerciseId: ID,
  bodyweightKg: number | null = null,
): CompletedWorkout | null {
  if (!workout.exercises.some((e) => e.exerciseId === exerciseId)) return null;

  const sets = workout.sets.filter((row) => row.exerciseId !== exerciseId);
  // Counting WORKING rows, because a record whose only survivors are warm-ups has
  // nothing `recomputeWorkout` will keep either.
  if (sets.filter((row) => !row.isWarmup).length === 0) return null;

  return finish(workout, bodyweightKg, {
    exercises: workout.exercises.filter((e) => e.exerciseId !== exerciseId),
    sets,
  });
}

/**
 * `10:24` — the time of day a workout started, for the row that nudges it.
 *
 * Here rather than in `lib/units.ts` because it exists for one screen and one
 * control: `formatShortDate` carries the date half, and nothing else in the app has
 * ever needed to print a clock time (the timer pills print durations).
 */
export function formatTimeOfDay(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
