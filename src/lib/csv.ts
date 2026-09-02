/**
 * The log as a spreadsheet: one row per set.
 *
 *   date,workout,exercise,set,weight_kg,count,count_unit,load_mode,warmup
 *   2026-08-17,"Pull + swimming","Weighted 90° pull-ups",1,40,4,reps,added_bodyweight,false
 *
 * `backup.ts` argues that the JSON file is readable so "a script, a spreadsheet, a
 * future version of this app" can read the log out. Two of those three are true.
 * A spreadsheet cannot read nested JSON: the set rows live inside an array inside
 * a workout inside an array, and getting them into columns means writing the
 * script the file was supposed to make unnecessary.
 *
 * So this is the flat form, and it is deliberately NOT a second backup format:
 *
 *  • NOT A BACKUP FORMAT, AND STILL NOT ONE. This file said "there is no CSV import
 *    and there will not be one", on the grounds that a table of set rows carries no
 *    exercises, routines, sequence or settings — so importing one would produce a
 *    log referring to exercises that do not exist, which is the state `libraryStore`
 *    rule 1 exists to prevent.
 *
 *    That argument was right about RESTORING and there is still exactly one thing
 *    that restores: the JSON file. What `lib/csvImport.ts` does is different — it
 *    ADDS old workouts, and it answers the dangling-exercise objection rather than
 *    living with it, by creating the library rows a sheet refers to and does not
 *    contain. Routines, the sequence and the settings are untouched, because a set
 *    table genuinely says nothing about them.
 *  • DERIVED, NEVER AUTHORITATIVE. Every column comes off a `SetHistory` row or the
 *    workout snapshot around it. Nothing is computed, summarised or rounded, so a
 *    number in a cell is a number in the log.
 *
 * ── RFC 4180 ───────────────────────────────────────────────────────────────
 *
 * Quoting matters more than it looks like it should, because exercise names
 * contain commas by nature ("Row, stomach"), routine titles contain them
 * ("Pull + swimming, short"), and a user-created exercise can contain a quote or a
 * newline. The rule is the standard one: quote a field if it holds a comma, a
 * quote, a CR or an LF, and double any quote inside it. CRLF line endings, because
 * that is what the RFC says and what Excel expects.
 */

import type { CompletedWorkout } from './completedWorkout';

/** The header row, and the column order everything below it follows. */
export const CSV_COLUMNS = [
  'date',
  'workout',
  'exercise',
  'set',
  'weight_kg',
  'count',
  'count_unit',
  'load_mode',
  'warmup',
] as const;

/**
 * One field, quoted if it has to be.
 *
 * Only when it has to be, rather than always: an unquoted file is readable in a
 * terminal, and `diff`ing two exports is something somebody will want to do.
 */
export function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** `2026-08-17` — the calendar day, in the phone's own timezone. */
function csvDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  /*
   * LOCAL, matching `formatShortDate` and the date the history list prints. Using
   * UTC would date a workout logged before 04:00 in Yerevan to the day before, so
   * the spreadsheet and the screen would disagree about when it happened.
   */
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Every set in the log, oldest workout last — the order the store already keeps.
 *
 * ── THE EXERCISE NAME COMES FROM THE WORKOUT, NOT THE LIBRARY ──────────────
 *
 * Each `CompletedWorkout` carries a snapshot of the name of every exercise in it,
 * precisely so a rename or a delete cannot rewrite the log. This reads that
 * snapshot. An exercise deleted from the library since still exports under the name
 * it had when it was trained, which is the whole point of the snapshot existing —
 * and a row whose exercise is not even in the snapshot (a malformed record) exports
 * with its id, because a set that happened should reach the file with SOMETHING in
 * the column rather than being dropped.
 *
 * `set` is the row's own `setIndex + 1`, warm-ups included, so the numbers in the
 * column match the rows in the file. The `warmup` column is what tells you which
 * ones count.
 */
export function workoutsToCsv(workouts: readonly CompletedWorkout[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];

  for (const workout of workouts) {
    const nameById = new Map(workout.exercises.map((e) => [e.exerciseId, e.name]));
    const date = csvDate(workout.startedAt);

    for (const row of workout.sets) {
      lines.push(
        [
          csvField(date),
          csvField(workout.title),
          csvField(nameById.get(row.exerciseId) ?? row.exerciseId),
          String(row.setIndex + 1),
          // Empty rather than 0 for unweighted work: a spreadsheet summing this
          // column must not be told a push-up weighed nothing.
          row.weightKg == null ? '' : String(row.weightKg),
          String(row.count),
          csvField(row.countUnit),
          csvField(row.loadMode),
          row.isWarmup ? 'true' : 'false',
        ].join(','),
      );
    }
  }

  // Trailing CRLF: the last record may end with one, per the RFC, and every tool
  // that reads these expects the file to end at a line boundary.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * `workout-tracker-sets-2026-08-19-0912` — sortable, and it says what it is.
 *
 * Same shape as `backupBaseName` and deliberately a different stem: a folder with
 * both in it must not leave anybody guessing which one restores.
 */
export function csvBaseName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `workout-tracker-sets-${date}-${time}`;
}
