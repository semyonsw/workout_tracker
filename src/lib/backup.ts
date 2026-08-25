/**
 * The backup file: what goes in it, and what it takes to trust one coming back.
 *
 *   {
 *     "format": "workout-tracker-backup",
 *     "version": 1,
 *     "exportedAt": "2026-08-19T09:12:44.001Z",
 *     "counts": { "exercises": 88, "routines": 6, "workouts": 42, "sets": 512 },
 *     "settings": { ... },
 *     "exercises": [ ... ],
 *     "routines":  [ ... ],
 *     "workouts":  [ ... ],
 *     "sequence":  { "isActive": false, "routineIds": [], "cursor": 0 },
 *     "numbering": { "workoutId": "d_session_x", "number": 91 }
 *   }
 *
 * WHY THIS EXISTS. Everything the user owns lives in three AsyncStorage keys on one
 * phone. An uninstall, a wiped device, a new phone, or a debug build installed over
 * a release one takes all of it — and the app's whole value is a log that goes back
 * far enough to show a plateau. A backup is the only thing standing between a year
 * of training and a factory reset.
 *
 * ── THREE RULES ─────────────────────────────────────────────────────────────
 *
 *  1. THE FILE IS THE FORMAT, AND IT IS READABLE. Pretty-printed JSON with the same
 *     field names the app's own types use. Not because a human should have to edit
 *     it, but because a backup you cannot read is a backup you cannot check, and
 *     one you cannot check is a promise rather than a file. It also means a broken
 *     import can be diagnosed by opening the file, and that anything else — a
 *     script, a spreadsheet, a future version of this app — can read the log out.
 *
 *  2. EXPORT WRITES THE ROWS AS THEY ARE STORED. No reshaping, no summarising, no
 *     dropping of fields that "look derived". `CompletedWorkout` carries both its
 *     rendered summary lines and the raw `SetHistory` rows, and the second of those
 *     is what every prefill and every overload verdict reads — a backup that kept
 *     only the pretty version would restore a history that looks right and teaches
 *     the app nothing.
 *
 *  3. IMPORT TRUSTS NOTHING. This module only opens the ENVELOPE — is it JSON, is it
 *     ours, is it from a version we understand — and hands the three collections on
 *     as `unknown`. Every row inside is validated by the store that owns it, by the
 *     same guards that already run on every rehydration from disk (`libraryStore`,
 *     `workoutHistoryStore`, `settingsStore`). There is exactly one validator per
 *     shape in this app, and a file off a user's SD card is not the place to add a
 *     second one that can disagree with it.
 */

/** The `format` field. A file without it is not ours; a file with it might be. */
export const BACKUP_FORMAT = 'workout-tracker-backup';

/**
 * The envelope version, NOT the app version.
 *
 * Bumped only when the shape around the collections changes. A file from a FUTURE
 * version is refused rather than half-read: the one thing worse than not restoring
 * a backup is restoring three quarters of it and reporting success.
 */
export const BACKUP_VERSION = 1;

/** Human-readable row counts. Written for the reader; never trusted on the way in. */
export interface BackupCounts {
  exercises: number;
  routines: number;
  workouts: number;
  sets: number;
}

/**
 * What export writes. The three collections are typed loosely on purpose — see
 * rule 3: this module's job is the envelope, and the stores own the rows.
 */
export interface BackupPayload {
  settings: unknown;
  exercises: unknown[];
  routines: unknown[];
  workouts: unknown[];
  /**
   * The training sequence, if this phone has one. Optional because it arrived
   * after the format did: a file written by an older build simply has no sequence,
   * which restores as "off and empty" — the same thing a fresh install has.
   */
  sequence?: unknown;
  /**
   * The pinned workout number ("this session was number 91"), if one is set. Also
   * optional, for the same reason — and worth carrying, because it is the one
   * fact in the app that cannot be recomputed from the sessions themselves.
   */
  numbering?: unknown;
}

export interface BackupEnvelope extends BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  counts: BackupCounts;
}

export type ParseResult =
  | { ok: true; envelope: BackupEnvelope; counts: BackupCounts }
  /** `error` is shown to the user verbatim, so it is written as a sentence. */
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/** Count what a payload actually holds, rather than what it claims to. */
export function countPayload(payload: BackupPayload): BackupCounts {
  let sets = 0;
  for (const workout of payload.workouts) {
    const rows = (workout as { sets?: unknown }).sets;
    if (Array.isArray(rows)) sets += rows.length;
  }
  return {
    exercises: payload.exercises.length,
    routines: payload.routines.length,
    workouts: payload.workouts.length,
    sets,
  };
}

export function buildBackupEnvelope(
  payload: BackupPayload,
  now: Date = new Date(),
): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    counts: countPayload(payload),
    ...payload,
  };
}

/**
 * The file's text. Two-space indented — see rule 1.
 *
 * A year of training is a few hundred kilobytes either way, and the cost of
 * indentation is bytes on a disk that has gigabytes of them.
 */
export function serializeBackup(payload: BackupPayload, now?: Date): string {
  return `${JSON.stringify(buildBackupEnvelope(payload, now), null, 2)}\n`;
}

/**
 * `workout-tracker-backup-2026-08-19-0912` — sortable, and it says what it is.
 *
 * Date FIRST after the name so a folder of these sorts chronologically by name, and
 * the minute is in there because "I exported before trying that" happens twice in
 * one evening. No extension: the SAF file creator appends one from the MIME type.
 */
export function backupBaseName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${BACKUP_FORMAT}-${date}-${time}`;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Open the envelope, or say why it can't be opened.
 *
 * Refuses in three cases and repairs everything else:
 *
 *   • not JSON at all — the usual cause is a half-copied paste
 *   • from a NEWER envelope version, which may mean fields this build would drop
 *   • no recognisable collections in it, which is how a JSON file that is simply
 *     something else announces itself
 *
 * A missing `format` on a file that does carry the collections is accepted: a
 * backup hand-edited into a file with the arrays intact is still a backup, and the
 * rows themselves are validated downstream either way.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't valid JSON — the file or the paste is incomplete." };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'That file holds something other than a backup.' };
  }

  const source = raw as Record<string, unknown>;
  const version =
    typeof source.version === 'number' && Number.isFinite(source.version) ? source.version : 1;
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `That backup was written by a newer version of the app (format ${version}). Update the app first.`,
    };
  }

  const hasCollections =
    Array.isArray(source.exercises) ||
    Array.isArray(source.routines) ||
    Array.isArray(source.workouts);
  if (source.format !== BACKUP_FORMAT && !hasCollections) {
    return { ok: false, error: 'That file has no exercises, routines or workouts in it.' };
  }
  if (!hasCollections) {
    return { ok: false, error: 'That backup is empty — there is nothing in it to restore.' };
  }

  const payload: BackupPayload = {
    settings: source.settings ?? null,
    exercises: asArray(source.exercises),
    routines: asArray(source.routines),
    workouts: asArray(source.workouts),
    // Passed through untouched — the stores own what these may be, and a file
    // from before either existed simply has neither.
    sequence: source.sequence ?? null,
    numbering: source.numbering ?? null,
  };
  const counts = countPayload(payload);

  return {
    ok: true,
    counts,
    envelope: {
      format: BACKUP_FORMAT,
      version,
      exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : '',
      counts,
      ...payload,
    },
  };
}

/** "42 workouts · 512 sets · 88 exercises · 6 routines" — one line for a sheet. */
export function describeCounts(counts: BackupCounts): string {
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(counts.workouts, 'workout'),
    plural(counts.sets, 'set'),
    plural(counts.exercises, 'exercise'),
    plural(counts.routines, 'routine'),
  ].join(' · ');
}
