/**
 * ONE SECTION, IN ONE FILE.
 *
 *   {
 *     "format": "workout-tracker-section",
 *     "section": "tasks",
 *     "version": 1,
 *     "exportedAt": "2026-09-13T09:12:44.001Z",
 *     "counts": { "tasks": 9, "answeredDays": 341 },
 *     "data": { "tasks": [ ... ], "log": { ... } }
 *   }
 *
 * ── WHY THIS EXISTS BESIDE `lib/backup.ts` ─────────────────────────────────
 *
 * The whole-app backup is an all-or-nothing instrument: `Replace everything from
 * a file` makes this phone look like that file, which is exactly right for a new
 * phone and exactly wrong for "put my expenses back, leave my training alone".
 * The app is three logs now — training, the daily tasks and the money — and they
 * fail, and get rebuilt, independently of each other.
 *
 * So: one envelope, a `section` field, and a `data` blob the store that owns the
 * section already knows how to validate. The alternative — three near-identical
 * formats — is three places for the version rule to drift.
 *
 * ── THE THREE RULES ARE THE BACKUP'S THREE RULES ───────────────────────────
 *
 *  1. THE FILE IS THE FORMAT. Pretty JSON, the app's own field names.
 *  2. EXPORT WRITES THE ROWS AS STORED. No summarising: the `log` in a tasks file
 *     is the sparse record the store keeps, not a rendered month.
 *  3. IMPORT TRUSTS NOTHING. This module opens the ENVELOPE and hands `data` on as
 *     `unknown`. `sanitizeTasks` and `sanitizeMoney` are the one validator each —
 *     the same ones every rehydration from disk runs through.
 *
 * ── AND IT REFUSES A FILE FROM THE WRONG SECTION ───────────────────────────
 *
 * Importing a money file into the tasks screen would sanitize to "no tasks" and
 * report it as a successful restore of nothing, which is how somebody loses a
 * year of answered days to a mis-tap. The `section` field is checked before
 * anything is read, and the error says which file they picked.
 */

export const SECTION_FORMAT = 'workout-tracker-section';
export const SECTION_VERSION = 1;

/** The three logs that can travel on their own. */
export type SectionName = 'training' | 'tasks' | 'money';

export const SECTION_NAMES: readonly SectionName[] = ['training', 'tasks', 'money'];

/** What each section is called on screen, and in every sentence about a file. */
export const SECTION_LABELS: Record<SectionName, string> = {
  training: 'Training',
  tasks: 'Daily tasks',
  money: 'Money',
};

/**
 * Row counts, written for the reader and recounted on the way in.
 *
 * A plain record rather than a per-section interface: the three sections count
 * different things, the numbers are only ever printed, and one shape means one
 * `describe` instead of three.
 */
export type SectionCounts = Readonly<Record<string, number>>;

export interface SectionEnvelope {
  format: typeof SECTION_FORMAT;
  version: number;
  section: SectionName;
  exportedAt: string;
  counts: SectionCounts;
  /** The section's own value, exactly as its store holds it. */
  data: unknown;
}

export type SectionParseResult =
  | { ok: true; envelope: SectionEnvelope; counts: SectionCounts }
  /** `error` reaches the user verbatim, so it is written as a sentence. */
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null) return undefined;
  return (data as Record<string, unknown>)[key];
}

/**
 * What a section's data actually holds. TOTAL over `unknown`, because the same
 * function counts a file somebody found on an SD card and the stores on this
 * phone — and a count that only works on well-formed input is a count that
 * throws at the one moment it is needed.
 */
export function countSection(section: SectionName, data: unknown): SectionCounts {
  if (section === 'tasks') {
    const log = field(data, 'log');
    let answeredDays = 0;
    if (typeof log === 'object' && log !== null) {
      for (const days of Object.values(log as Record<string, unknown>)) {
        if (typeof days === 'object' && days !== null) answeredDays += Object.keys(days).length;
      }
    }
    return { tasks: asArray(field(data, 'tasks')).length, answeredDays };
  }

  if (section === 'money') {
    return {
      categories: asArray(field(data, 'categories')).length,
      amounts: asArray(field(data, 'amounts')).length,
    };
  }

  const workouts = asArray(field(data, 'workouts'));
  let sets = 0;
  for (const workout of workouts) sets += asArray(field(workout, 'sets')).length;
  return {
    exercises: asArray(field(data, 'exercises')).length,
    routines: asArray(field(data, 'routines')).length,
    workouts: workouts.length,
    sets,
  };
}

/** `answeredDays` → `answered days`; `sets` stays `sets`. */
function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** "9 tasks · 341 answered days". A one is singular, because "1 tasks" reads as a bug. */
export function describeSectionCounts(counts: SectionCounts): string {
  const parts = Object.entries(counts).map(([key, value]) => {
    const noun = humanize(key);
    return `${value} ${value === 1 ? noun.replace(/s$/, '') : noun}`;
  });
  return parts.length === 0 ? 'nothing' : parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export function buildSectionEnvelope(
  section: SectionName,
  data: unknown,
  now: Date = new Date(),
): SectionEnvelope {
  return {
    format: SECTION_FORMAT,
    version: SECTION_VERSION,
    section,
    exportedAt: now.toISOString(),
    counts: countSection(section, data),
    data,
  };
}

/** The file's text. Two-space indented, for the same reason the backup is. */
export function serializeSection(section: SectionName, data: unknown, now?: Date): string {
  return `${JSON.stringify(buildSectionEnvelope(section, data, now), null, 2)}\n`;
}

/**
 * `workout-tracker-tasks-2026-09-13-0912` — the section in the name, so a folder
 * of these can be told apart without opening one, and the date first so it sorts.
 */
export function sectionBaseName(section: SectionName, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `workout-tracker-${section}-${date}-${time}`;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

function isSection(value: unknown): value is SectionName {
  return SECTION_NAMES.includes(value as SectionName);
}

/**
 * Open the envelope, or say why it cannot be opened.
 *
 * Refuses four things, and every refusal is a sentence rather than a code:
 *
 *   • not JSON — a half-copied paste, usually
 *   • a NEWER envelope version, which may carry fields this build would drop
 *   • not a section file at all
 *   • the WRONG section, when the caller asked for one — see the file header
 */
export function parseSection(text: string, expected?: SectionName): SectionParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't valid JSON — the file or the paste is incomplete." };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'That file holds something other than an export.' };
  }

  const source = raw as Record<string, unknown>;
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) ? source.version : 1;
  if (version > SECTION_VERSION) {
    return {
      ok: false,
      error: `That file was written by a newer version of the app (format ${version}). Update the app first.`,
    };
  }

  const section = source.section;
  if (!isSection(section)) {
    return {
      ok: false,
      error: 'That file does not say which section it holds, so it is not one of these exports.',
    };
  }
  if (expected && section !== expected) {
    return {
      ok: false,
      error: `That is a ${SECTION_LABELS[section].toLowerCase()} file, and this is the ${SECTION_LABELS[
        expected
      ].toLowerCase()} import.`,
    };
  }

  const data = source.data;
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'That export is empty — there is nothing in it to restore.' };
  }

  const counts = countSection(section, data);
  return {
    ok: true,
    counts,
    envelope: {
      format: SECTION_FORMAT,
      version,
      section,
      exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : '',
      counts,
      data,
    },
  };
}
