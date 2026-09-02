/**
 * Reading a set table back IN — the training that happened before this app existed.
 *
 *   date,workout,exercise,set,weight_kg,count,count_unit,load_mode,warmup
 *   2024-03-11,Pull,Weighted pull-ups,1,20,8,reps,added_bodyweight,false
 *        │        │         │                              │
 *        │        │         └── matched by name, or CREATED
 *        │        └── rows sharing a date + title are one workout
 *        └── local calendar day
 *
 * ── THE OBJECTION THIS HAS TO ANSWER ───────────────────────────────────────
 *
 * `lib/csv.ts` states, in its header, that there is no CSV import and there will not
 * be one: "A backup has to restore exercises, routines, the sequence and the
 * settings, and a table of set rows carries none of them — importing one would
 * produce a log referring to exercises that do not exist, which is exactly the state
 * `libraryStore` rule 1 exists to prevent."
 *
 * That argument is correct and it is about RESTORING. This is not a restore, and the
 * distinction is the whole design:
 *
 *  • The JSON backup is still the only thing that restores. This adds workouts.
 *  • THE DANGLING-EXERCISE PROBLEM IS SOLVED RATHER THAN ACCEPTED. Every row is
 *    matched to a library exercise by name, and where there is no match ONE IS
 *    CREATED, with the shape the row itself describes (`weight_kg` present ⟹
 *    `requiresWeight`, `count_unit` and `load_mode` straight off the row). So the
 *    imported log cannot refer to an exercise that does not exist: the importer
 *    brings the library with it.
 *  • Routines, the sequence and the settings are NOT touched, because a set table
 *    says nothing about them. An imported workout has no `routineId`, which is
 *    already an ordinary state — every workout started outside a routine has none.
 *
 * ── WHY IT IS WORTH THE FILE ───────────────────────────────────────────────
 *
 * `HistoryScreen` numbers the log from a pin because "a log that starts at session
 * 91 — because ninety of them happened before this app existed — say so". Ninety
 * sessions of real training sitting in a spreadsheet is the difference between a
 * trend line that starts this year and one that starts three years ago, and the
 * overload engine reads history by date: given the rows, it can see a plateau that
 * predates the app.
 *
 * ── EVERYTHING IS A VALUE, NOTHING THROWS ──────────────────────────────────
 *
 * A hand-edited spreadsheet is the input, so every row can be wrong in every way.
 * Rows that cannot be read are COUNTED AND REPORTED rather than dropped silently or
 * allowed to fail the import: "412 sets, 38 workouts, 6 rows skipped" is a sentence
 * somebody can act on, and a half-applied import is not.
 */

import type { CountUnit, Exercise, ID, LoadMode, MuscleGroup, SetHistory } from '../types/models';
import type { CompletedExercise, CompletedWorkout } from './completedWorkout';
import { summarizeSessionSets } from './history';
import { effectiveLoadKg } from './units';

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

/** One parsed row, before it means anything. */
export interface CsvSetRow {
  date: string;
  workout: string;
  exercise: string;
  setIndex: number;
  weightKg: number | null;
  count: number;
  countUnit: CountUnit;
  loadMode: LoadMode;
  isWarmup: boolean;
}

const COUNT_UNITS: readonly CountUnit[] = ['reps', 'seconds', 'meters', 'rounds'];
const LOAD_MODES: readonly LoadMode[] = ['external', 'added_bodyweight', 'assisted', 'none'];

/**
 * RFC 4180, one line at a time.
 *
 * Written out rather than pulled from a library for the same reason `csvField` is:
 * the whole grammar is quotes, doubled quotes and commas, and a dependency for
 * thirty lines is a dependency to keep updated forever. Handles quoted fields
 * containing commas, escaped quotes, and CRLF or LF endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // A trailing newline produces one empty field; that is not a row.
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      // CRLF or a bare CR both end the record.
      if (text[i + 1] === '\n') i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

export interface ParsedCsv {
  rows: CsvSetRow[];
  /** Rows that could not be read. Reported, never dropped in silence. */
  skipped: number;
  /** Why the whole file was unusable, or null. */
  error: string | null;
}

/**
 * A set table into rows, matching the app's own export columns BY NAME.
 *
 * By header name rather than by position, so a spreadsheet that has had its columns
 * reordered — which is the first thing anybody does in Excel — still imports. The
 * four columns that must be present are the ones without which a row means nothing:
 * a date, an exercise, a count, and the set number.
 */
export function parseSetsCsv(text: string): ParsedCsv {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0, error: 'That file is empty.' };

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);

  const iDate = at('date');
  const iExercise = at('exercise');
  const iCount = at('count');
  if (iDate < 0 || iExercise < 0 || iCount < 0) {
    return {
      rows: [],
      skipped: 0,
      error: 'That file has no date, exercise and count columns — it is not a set table.',
    };
  }

  const iWorkout = at('workout');
  const iSet = at('set');
  const iWeight = at('weight_kg');
  const iUnit = at('count_unit');
  const iLoad = at('load_mode');
  const iWarmup = at('warmup');

  const rows: CsvSetRow[] = [];
  let skipped = 0;

  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const cell = (index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');

    const date = normalizeDate(cell(iDate));
    const exercise = cell(iExercise);
    const count = Number(cell(iCount));

    if (date == null || exercise === '' || !Number.isFinite(count) || count <= 0) {
      skipped += 1;
      continue;
    }

    const rawWeight = cell(iWeight);
    const weight = rawWeight === '' ? null : Number(rawWeight);
    const unit = cell(iUnit).toLowerCase();
    const load = cell(iLoad).toLowerCase();
    const setNumber = Number(cell(iSet));

    rows.push({
      date,
      // A missing title is normal in a hand-made sheet. `Imported` groups the day's
      // rows into one workout rather than inventing a name per exercise.
      workout: cell(iWorkout) === '' ? 'Imported workout' : cell(iWorkout),
      exercise,
      setIndex:
        Number.isFinite(setNumber) && setNumber >= 1 ? Math.round(setNumber) - 1 : rows.length,
      weightKg: weight != null && Number.isFinite(weight) && weight !== 0 ? weight : null,
      count,
      countUnit: (COUNT_UNITS as readonly string[]).includes(unit) ? (unit as CountUnit) : 'reps',
      /*
       * The load mode decides how the number is READ, so guessing it wrong changes
       * what the log says. Defaulted from the weight rather than to a constant: a
       * row with a weight and no stated mode is external work, and a row with no
       * weight cannot have a load at all.
       */
      loadMode: (LOAD_MODES as readonly string[]).includes(load)
        ? (load as LoadMode)
        : weight != null
          ? 'external'
          : 'none',
      isWarmup: /^(true|1|yes|y|w|warmup)$/i.test(cell(iWarmup)),
    });
  }

  return { rows, skipped, error: null };
}

/**
 * `2026-08-17`, `17/08/2026`, `2026-08-17T10:00:00Z` → `2026-08-17`, or null.
 *
 * Three formats because a spreadsheet will have reformatted the column: ISO is what
 * this app writes, and day-first and month-first slashes are what Excel produces
 * depending on the machine's locale. AMBIGUOUS SLASHED DATES ARE READ DAY-FIRST,
 * which is wrong for a US sheet and right for the rest of the world — and the
 * importer says so where the user can read it, rather than guessing silently.
 */
function normalizeDate(raw: string): string | null {
  if (raw === '') return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slashed = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    /*
     * Day-first, EXCEPT where only one reading is possible: `03/11` is ambiguous and
     * read as 3 November, while `11/03` with a second field above 12 can only be
     * November 3rd whatever the sheet meant. Guessing day-first is wrong for a US
     * spreadsheet, which is why the import screen says which way it read them
     * instead of leaving it to be discovered.
     */
    const [day, month] = second > 12 ? [second, first] : [first, second];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${slashed[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Planning                                                           */
/* ------------------------------------------------------------------ */

export interface CsvImportPlan {
  /** Workouts to add, newest first — the order the store keeps. */
  workouts: CompletedWorkout[];
  /** Library rows that have to exist first. See the file header. */
  newExercises: Exercise[];
  /** Rows that could not be read. */
  skipped: number;
  /** Distinct exercise names matched to something already in the library. */
  matched: number;
}

/** A name as it is compared: trimmed, folded, punctuation-insensitive. */
export function matchKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ԰-֏]+/g, ' ')
    .trim();
}

/**
 * Turn parsed rows into workouts, creating the exercises they need.
 *
 * ── GROUPING ───────────────────────────────────────────────────────────────
 *
 * One workout per (date, title). Not one per date: a sheet with `Pull` and `Swim` on
 * the same day is two sessions, and merging them would invent a workout nobody did.
 * Not one per exercise either, which would turn a six-exercise session into six
 * one-exercise workouts and make every "workouts per week" number wrong.
 *
 * ── IDS ────────────────────────────────────────────────────────────────────
 *
 * Derived from the date and the title (`imp_2024-03-11_pull`), which makes the
 * import IDEMPOTENT: running the same file twice produces the same ids, and
 * `mergeBackupWorkouts` skips a workout whose id is already in the log. Importing
 * the same sheet twice is a common mistake and this is the version of it that costs
 * nothing.
 */
export function planCsvImport(
  parsed: ParsedCsv,
  existing: readonly Exercise[],
  now: Date = new Date(),
): CsvImportPlan {
  const byKey = new Map<string, Exercise>();
  for (const exercise of existing) {
    byKey.set(matchKey(exercise.name), exercise);
    for (const alias of exercise.aliases ?? []) byKey.set(matchKey(alias), exercise);
  }

  const newExercises: Exercise[] = [];
  const matchedKeys = new Set<string>();

  /** The library row for a name, creating one where nothing matches. */
  const resolve = (row: CsvSetRow): Exercise => {
    const key = matchKey(row.exercise);
    const found = byKey.get(key);
    if (found) {
      matchedKeys.add(key);
      return found;
    }

    const created: Exercise = {
      id: `ex_imp_${slug(row.exercise)}`,
      // Owned by the user, because a row this app invented from a spreadsheet is
      // not one it shipped — `Restore the shipped exercise library` must not delete
      // an exercise that has imported history pointing at it.
      ownerId: 'imported',
      name: row.exercise.trim().slice(0, 80),
      /*
       * UNFILED. The muscle group is the one thing a set table genuinely cannot
       * say, and guessing it from a name would file half the library wrongly and
       * silently — `clusterOf` returns null for an empty list and the library has
       * an `Unfiled` section for exactly this. The user can assign it in one tap.
       */
      muscleGroups: [] as MuscleGroup[],
      requiresWeight: row.weightKg != null,
      countUnit: row.countUnit,
      loadMode: row.loadMode,
      isUnilateral: false,
      isArchived: false,
      createdAt: now.toISOString(),
    };
    byKey.set(key, created);
    newExercises.push(created);
    return created;
  };

  /** date + title → the rows of one session. */
  const sessions = new Map<string, { date: string; title: string; rows: CsvSetRow[] }>();
  for (const row of parsed.rows) {
    const key = `${row.date}|${matchKey(row.workout)}`;
    const bucket = sessions.get(key);
    if (bucket) bucket.rows.push(row);
    else sessions.set(key, { date: row.date, title: row.workout, rows: [row] });
  }

  const workouts: CompletedWorkout[] = [];

  for (const session of sessions.values()) {
    const id = `imp_${session.date}_${slug(session.title)}`;
    /*
     * Midday local, not midnight: a session dated by a spreadsheet has no clock on
     * it, and midnight is the one instant that lands on the wrong calendar day in
     * half the world's timezones once it round-trips through UTC.
     */
    const startedAt = new Date(`${session.date}T12:00:00`);
    if (!Number.isFinite(startedAt.getTime())) continue;

    const sets: SetHistory[] = [];
    const order: ID[] = [];
    const byExercise = new Map<ID, { exercise: Exercise; rows: SetHistory[] }>();

    session.rows.forEach((row, index) => {
      const exercise = resolve(row);
      const stored: SetHistory = {
        id: `${id}_s${index}`,
        sessionId: id,
        exerciseId: exercise.id,
        performedAt: startedAt.toISOString(),
        setIndex: index,
        weightKg: exercise.requiresWeight ? row.weightKg : null,
        count: row.count,
        countUnit: row.countUnit,
        loadMode: row.loadMode,
        isWarmup: row.isWarmup,
        isCompleted: true,
      };
      sets.push(stored);

      const bucket = byExercise.get(exercise.id);
      if (bucket) bucket.rows.push(stored);
      else {
        byExercise.set(exercise.id, { exercise, rows: [stored] });
        order.push(exercise.id);
      }
    });

    if (sets.length === 0) continue;

    const exercises: CompletedExercise[] = [];
    for (const exerciseId of order) {
      const bucket = byExercise.get(exerciseId);
      if (!bucket) continue;
      const working = bucket.rows.filter((r) => !r.isWarmup);
      if (working.length === 0) continue;

      // The same summarizer the app's own records use, so an imported row's
      // shorthand reads identically to a logged one.
      const { lead, drops, topWeightKg } = summarizeSessionSets(working, bucket.exercise);
      exercises.push({
        exerciseId,
        name: bucket.exercise.name,
        countUnit: bucket.exercise.countUnit,
        loadMode: bucket.exercise.loadMode,
        setCount: working.length,
        summary: drops ? `${lead}${drops}` : lead,
        totalCount: working.reduce((sum, r) => sum + r.count, 0),
        topWeightKg,
      });
    }

    const working = sets.filter((r) => !r.isWarmup);
    /*
     * Volume from the rows, with NO bodyweight: the sheet does not say what the
     * lifter weighed on a day three years ago, and `volumeIsPartial` is exactly the
     * flag that says "this total is known to undercount". Inventing today's
     * bodyweight for a set from 2024 is the bug `lib/bodyweightLog.ts` exists to
     * remove, not one to reintroduce here.
     */
    let volumeKg = 0;
    let unweighable = 0;
    for (const setRow of working) {
      if (setRow.countUnit !== 'reps') continue;
      const load = effectiveLoadKg(setRow.weightKg, setRow.loadMode, null);
      if (load == null) unweighable += 1;
      else volumeKg += load * setRow.count;
    }

    workouts.push({
      id,
      title: session.title.trim().slice(0, 80),
      startedAt: startedAt.toISOString(),
      endedAt: startedAt.toISOString(),
      // A sheet carries no duration. One minute is the floor the model already
      // uses, and it is visibly not a real duration rather than a plausible lie.
      durationMinutes: 1,
      setCount: working.length,
      totalVolumeKg: Math.round(volumeKg),
      volumeIsPartial: unweighable > 0,
      exercises,
      sets,
    });
  }

  workouts.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return { workouts, newExercises, skipped: parsed.skipped, matched: matchedKeys.size };
}

/** A name into something safe for an id: `Weighted 90° pull-ups` → `weighted-90-pull-ups`. */
function slug(name: string): string {
  const base = matchKey(name).replace(/\s+/g, '-').slice(0, 40);
  return base === '' ? 'workout' : base;
}

/** "412 sets in 38 workouts · 4 new exercises · 6 rows skipped". */
export function describeCsvPlan(plan: CsvImportPlan): string {
  const sets = plan.workouts.reduce((sum, w) => sum + w.sets.length, 0);
  const parts = [
    `${sets} ${sets === 1 ? 'set' : 'sets'} in ${plan.workouts.length} ${
      plan.workouts.length === 1 ? 'workout' : 'workouts'
    }`,
  ];
  if (plan.newExercises.length > 0) {
    parts.push(
      `${plan.newExercises.length} new ${plan.newExercises.length === 1 ? 'exercise' : 'exercises'}`,
    );
  }
  if (plan.matched > 0) parts.push(`${plan.matched} matched`);
  if (plan.skipped > 0)
    parts.push(`${plan.skipped} ${plan.skipped === 1 ? 'row' : 'rows'} skipped`);
  return parts.join(' · ');
}
