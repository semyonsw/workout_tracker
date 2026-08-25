/**
 * A finished workout, as history keeps it.
 *
 *   ┌ Pull + swimming ─────────────── 17 Aug · 74 min ┐
 *   │ 6 exercises · 18 sets · 4 720 kg                │
 *   │ Weighted 90° pull-ups      +40 kg · 4 4 4 3     │
 *   │ Plank                      2:00 · 2:00 · 1:31   │
 *   └─────────────────────────────────────────────────┘
 *
 * Turning the live draft into this shape is the last thing a session does, and it
 * is pure so that the one write the app makes to permanent history can be tested
 * without a phone.
 *
 * ── WHY THIS IS A SNAPSHOT, NOT A SET OF FOREIGN KEYS ──────────────────────
 *
 * Each exercise's NAME, count unit and load mode are copied into the record
 * rather than looked up when the history screen renders. An exercise can be
 * renamed or deleted afterwards, and a log that silently re-renders itself to
 * match today's library — or shows "Unknown exercise" for work that definitely
 * happened — is a log that is no longer a record. `libraryStore` already promises
 * that deleting an exercise never touches its history; this is what makes that
 * promise renderable.
 *
 * The raw `SetHistory` rows ride along too, because they are what the prefill and
 * the overload engine read. The summary line beside them is derived from those
 * same rows through the shared shorthand (`summarizeSessionSets`), so a workout in
 * the history list and the same workout on the exercise-history screen can never
 * word themselves differently.
 */

import type { CountUnit, ID, ISODateTime, LoadMode, SetHistory } from '../types/models';
import { draftToSetHistory, sessionPerformedAt, sessionVolume, type DraftSession } from './draft';
import { effectiveLoadKg } from './units';
import { summarizeSessionSets } from './history';

/** One exercise inside a finished workout. */
export interface CompletedExercise {
  exerciseId: ID;
  /** Snapshot — see the file header. */
  name: string;
  countUnit: CountUnit;
  loadMode: LoadMode;
  /** Completed sets only. A planned set that never happened is not history. */
  setCount: number;
  /** "+40 kg · 4 4 4 3" — the same shorthand every other screen uses. */
  summary: string;
  /**
   * Every set's count added up — 4 + 4 + 4 + 3 = 15 reps, or 2:00 + 2:00 + 1:31
   * of plank. The number you actually compare between sessions, and the one thing
   * a list of per-set counts makes you do in your head.
   */
  totalCount: number;
  topWeightKg: number | null;
}

export interface CompletedWorkout {
  id: ID;
  title: string;
  routineId?: ID;
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  /** Whole minutes, floor 1: a workout that happened took at least a minute. */
  durationMinutes: number;
  setCount: number;
  totalVolumeKg: number;
  /**
   * True when `totalVolumeKg` is KNOWN TO UNDERCOUNT: this session contained
   * rep-counted bodyweight or assisted work and there was no bodyweight in
   * Settings to weigh it with (see `sessionVolume`).
   *
   * Stored rather than derived, because it is a fact about the moment the workout
   * was recorded and nothing later can recover it. Volume is computed once, at
   * Finish, from the bodyweight the app had then — which is right, because history
   * is not rewritten when a setting changes. That leaves the screens with a number
   * and no way to tell whether it is the whole session or the external half of it,
   * and a volume figure that quietly omits every push-up is worse than a row with
   * no volume clause on it. So the record says which it is, and the screens drop
   * the clause when it cannot be stood behind.
   */
  volumeIsPartial: boolean;
  exercises: CompletedExercise[];
  /** The rows the overload engine and next session's prefills read. */
  sets: SetHistory[];
}

/**
 * Build the record for a finished session, or null if there is nothing to record.
 *
 * A session with no completed WORKING sets returns null: the user started
 * something and logged nothing that counts, and an empty row in the history list
 * is worse than no row — it claims a workout happened. Warming up and going home
 * is one of those cases, now that a warm-up is a thing the user can actually
 * mark.
 *
 * ── WHAT A WARM-UP DOES AND DOES NOT COUNT TOWARDS ─────────────────────────
 *
 * Its ROW is kept: `sets` carries every completed set, warm-ups included, because
 * that is the record of what happened and because `isWarmup` is what every
 * consumer downstream filters on. Everything DERIVED counts working sets only —
 * `setCount`, the shorthand `summary`, `totalCount`, `topWeightKg` and the volume.
 * That is not a new rule; it is the rule `progressiveOverload` and `sessionRows`
 * have always followed, applied at the one place that was still summing raw rows.
 * A heavy warm-up single used to become the session's top weight in the history
 * line, which is the same bug that drove a wrong nudge.
 */
export function buildCompletedWorkout(
  session: DraftSession,
  endedAt: Date = new Date(),
  /**
   * The user's bodyweight at the moment this workout was finished, from Settings.
   * Null — the default, and every existing user — means bodyweight and assisted
   * sets cannot be weighed, and the record says so through `volumeIsPartial`.
   */
  bodyweightKg: number | null = null,
): CompletedWorkout | null {
  const sets = draftToSetHistory(session);
  if (sets.length === 0) return null;

  const working = sets.filter((row) => !row.isWarmup);
  if (working.length === 0) return null;

  const startedAt = sessionPerformedAt(session);
  const startedMs = new Date(startedAt).getTime();
  const endedMs = endedAt.getTime();
  const durationMinutes =
    Number.isFinite(startedMs) && endedMs > startedMs
      ? Math.max(1, Math.round((endedMs - startedMs) / 60_000))
      : 1;

  const volume = sessionVolume(session, bodyweightKg);

  const exercises: CompletedExercise[] = [];
  for (const entry of session.entries) {
    // Same rule as `draftToSetHistory`: only what actually happened.
    const done = entry.sets.filter((s) => s.isCompleted);
    if (done.length === 0) continue;

    const rows = working.filter((row) => row.exerciseId === entry.exercise.id);
    // An exercise where only the warm-ups were ticked gets no line: there is
    // nothing to summarize, and "0 sets" under a name is not a record of anything.
    if (rows.length === 0) continue;
    const { lead, drops, topWeightKg } = summarizeSessionSets(rows, entry.exercise);

    exercises.push({
      exerciseId: entry.exercise.id,
      name: entry.exercise.name,
      countUnit: entry.exercise.countUnit,
      loadMode: entry.exercise.loadMode,
      setCount: rows.length,
      summary: drops ? `${lead}${drops}` : lead,
      totalCount: rows.reduce((sum, row) => sum + (Number.isFinite(row.count) ? row.count : 0), 0),
      topWeightKg,
    });
  }

  return {
    // The draft's own id: a session is one thing from first set to history row,
    // and `SetHistory.sessionId` already points at it.
    id: session.localId,
    title: session.title,
    ...(session.routineId ? { routineId: session.routineId } : {}),
    startedAt,
    endedAt: endedAt.toISOString(),
    durationMinutes,
    setCount: working.length,
    totalVolumeKg: volume.kg,
    volumeIsPartial: volume.unweighable > 0,
    exercises,
    sets,
  };
}

/**
 * A workout with its derived numbers RECOMPUTED from its own set rows.
 *
 * The one function that exists so a correction cannot be a lie. A workout record
 * carries a rendered summary, a set count, a per-exercise total and a volume
 * figure, and every one of them is derived from `sets` — so editing a row and
 * patching the strings around it would produce a record whose parts disagree.
 * This runs the SAME functions `buildCompletedWorkout` ran (`summarizeSessionSets`
 * for the shorthand, `effectiveLoadKg` for the load), over the rows as they now
 * are.
 *
 * WHAT IT DOES NOT TOUCH: the id, the title, the dates, the duration, or the
 * order and identity of the exercises. A correction is a correction of a number,
 * not a re-derivation of what the workout was — and the exercise SNAPSHOTS are
 * the whole reason a renamed or deleted exercise does not rewrite history, so
 * they are carried through rather than looked up again.
 *
 * `exercises` is rebuilt from the surviving rows in the order the record already
 * had them, using each entry's own snapshot of name / unit / load mode. An
 * exercise whose last row was deleted drops out; nothing is added.
 */
export function recomputeWorkout(
  workout: CompletedWorkout,
  bodyweightKg: number | null = null,
): CompletedWorkout {
  const working = workout.sets.filter((row) => !row.isWarmup);

  const exercises: CompletedExercise[] = [];
  for (const snapshot of workout.exercises) {
    const rows = working
      .filter((row) => row.exerciseId === snapshot.exerciseId)
      .sort((a, b) => a.setIndex - b.setIndex);
    if (rows.length === 0) continue;

    /*
     * The snapshot IS enough: `summarizeSessionSets` reads `countUnit` and
     * `loadMode` and nothing else, and those are two of the three fields the
     * record copies out of the library. Not a coincidence — they were copied in so
     * the shorthand could be regenerated after a rename or a delete.
     */
    const { lead, drops, topWeightKg } = summarizeSessionSets(rows, snapshot);

    exercises.push({
      ...snapshot,
      setCount: rows.length,
      summary: drops ? `${lead}${drops}` : lead,
      totalCount: rows.reduce((sum, row) => sum + (Number.isFinite(row.count) ? row.count : 0), 0),
      topWeightKg,
    });
  }

  const volume = rowsVolume(working, bodyweightKg);

  return {
    ...workout,
    setCount: working.length,
    totalVolumeKg: volume.kg,
    volumeIsPartial: volume.unweighable > 0,
    exercises,
  };
}

/**
 * Volume straight from stored rows, rather than from a live draft.
 *
 * `sessionVolume` reads a `DraftSession`; this reads `SetHistory`. They are the
 * same rule — rep-counted work only, `effectiveLoadKg` for the load, a set whose
 * load will not resolve counted as unweighable rather than as zero — and they
 * have to stay the same rule, which is why both go through `effectiveLoadKg` and
 * neither does the arithmetic itself.
 */
function rowsVolume(
  rows: readonly SetHistory[],
  bodyweightKg: number | null,
): { kg: number; unweighable: number } {
  let kg = 0;
  let unweighable = 0;

  for (const row of rows) {
    if (row.countUnit !== 'reps') continue;
    const load = effectiveLoadKg(row.weightKg, row.loadMode, bodyweightKg);
    if (load == null) {
      unweighable += 1;
      continue;
    }
    kg += load * row.count;
  }

  return { kg: Math.round(kg), unweighable };
}

/**
 * Every logged set, keyed by exercise — the shape `buildDraftSession` and the
 * overload engine want.
 *
 * This is the ONE read every consumer of history goes through: the prefills, the
 * nudges, the exercise chart. `extra` used to carry the shipped fixture sessions
 * and now carries nothing in the app — the parameter stays because the tests feed
 * the fixture through it, and because it is the seam a SQLite read slots into.
 */
export function historyByExerciseId(
  workouts: readonly CompletedWorkout[],
  extra: Record<ID, SetHistory[]> = {},
): Record<ID, SetHistory[]> {
  const merged: Record<ID, SetHistory[]> = {};
  for (const [exerciseId, rows] of Object.entries(extra)) merged[exerciseId] = [...rows];

  for (const workout of workouts) {
    for (const row of workout.sets) {
      const bucket = merged[row.exerciseId];
      if (bucket) bucket.push(row);
      else merged[row.exerciseId] = [row];
    }
  }

  return merged;
}

/**
 * Exercise ids in the order they were last trained, newest first — the library's
 * `RECENTLY USED` card.
 *
 * Derived rather than listed. This was a hard-coded array of three ids, which is a
 * reasonable fixture and a lie the moment the user trains: "recently used" that
 * never changes is worse than no card, because it looks like a feature.
 *
 * Workouts arrive newest-first, so first sighting wins and no sorting is needed.
 */
export function recentlyUsedExerciseIds(workouts: readonly CompletedWorkout[], limit = 6): ID[] {
  const seen: ID[] = [];
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (seen.length >= limit) return seen;
      if (!seen.includes(exercise.exerciseId)) seen.push(exercise.exerciseId);
    }
  }
  return seen;
}

/* ------------------------------------------------------------------ */
/* Workout numbers                                                     */
/* ------------------------------------------------------------------ */

/**
 * "This workout is number N." One workout is pinned; every other one counts from
 * it.
 *
 * Why an anchor rather than a number stored on every row: most people arrive with
 * a training history the app has never seen — "my last session was workout 91" —
 * and what they want is to say that ONCE and have everything before and after fall
 * into place. Numbering each row would mean editing ninety of them, and the first
 * session inserted or deleted would put the whole column out of step. One pinned
 * pair cannot disagree with itself.
 */
export interface WorkoutNumberAnchor {
  workoutId: ID;
  number: number;
}

/**
 * The number of every workout, keyed by id.
 *
 * `workouts` must be NEWEST FIRST — the order the store keeps them in. Numbers are
 * ORDINALS, so they are positional by definition: without an anchor the oldest
 * workout is 1, and with one every workout is the anchor's number plus however many
 * sessions separate the two. Deleting a session therefore closes the gap it left:
 * a workout that did not happen does not hold a place in the count.
 *
 * A number can come out below 1 — pin "1" to the newest of five workouts and the
 * four before it have nowhere to go. Those are left unnumbered by the UI rather
 * than shown as 0 or −3, which reads as a bug rather than as a choice.
 */
export function workoutNumbers(
  workouts: readonly CompletedWorkout[],
  anchor: WorkoutNumberAnchor | null = null,
): Record<ID, number> {
  const numbers: Record<ID, number> = {};
  if (workouts.length === 0) return numbers;

  /* Chronological position, oldest = 0, out of a newest-first array. */
  const chrono = (index: number) => workouts.length - 1 - index;

  const anchorIndex = anchor ? workouts.findIndex((w) => w.id === anchor.workoutId) : -1;
  // No anchor, or one pinned to a workout that has since been deleted: the oldest
  // workout the app knows about is number 1.
  const base = anchorIndex === -1 || !anchor ? 1 : anchor.number;
  const baseChrono = anchorIndex === -1 ? 0 : chrono(anchorIndex);

  workouts.forEach((workout, index) => {
    numbers[workout.id] = base + (chrono(index) - baseChrono);
  });
  return numbers;
}

/**
 * Grouping key for the history list: the month a workout belongs to.
 *
 * The phone's own months, matching the dates the rows print (`formatShortDate`).
 * Grouping in UTC while dating in local time put a workout logged just after
 * midnight under the previous month's heading with next month's date on it.
 */
export function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
