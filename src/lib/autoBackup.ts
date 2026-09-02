/**
 * When to write a backup nobody asked for.
 *
 *   last backup 8 days ago  ·  interval 7  ─────►  write one, now
 *   last backup 2 days ago  ·  interval 7  ─────►  nothing
 *   never backed up         ·  any         ─────►  write one, now
 *
 * `lib/backup.ts` opens with the reason this exists: everything the user owns lives
 * in three AsyncStorage keys on one phone, and "a backup is the only thing standing
 * between a year of training and a factory reset". It then made that backup a
 * BUTTON — which means the protection is only ever as good as the user's memory of
 * a screen they have no other reason to open. A log worth a year is not defended by
 * a menu item.
 *
 * So the write is automatic, and this file is the decision: nothing here touches the
 * file system, the store or the clock. It takes the last time a backup landed and
 * says whether another one is due, which makes "is the backup stale" a testable
 * question rather than a side effect.
 *
 * ── WHY IT IS A FOLDER THE USER PICKS, AND WHY THAT IS NOT OPTIONAL ────────
 *
 * Android gives an app two places to write: its own sandbox, and a folder the user
 * grants through the Storage Access Framework. The sandbox is useless for THIS job —
 * it is deleted with the app, which is one of the exact events a backup exists to
 * survive — so the only destination that means anything is the granted folder. That
 * grant is persistable, so it is asked for once and remembered
 * (`Settings.autoBackupFolderUri`).
 *
 * Which means automatic backup CANNOT be silently on by default: without a folder
 * there is nowhere to write, and an app claiming to back up into a directory that
 * dies with it is worse than one that admits it is not backing up. The setting is
 * therefore two facts — enabled, and where — and the screen states the second one.
 *
 * ── ROTATION ───────────────────────────────────────────────────────────────
 *
 * SAF cannot overwrite: `createFileAsync` appends ` (1)` rather than replacing, so
 * an unattended weekly write would leave fifty files a year in somebody's Download
 * folder. `KEEP` newest copies are kept and the rest are deleted by URI, so the
 * folder holds a short history instead of a pile — and a short history rather than
 * one file, because the failure this guards against includes "the most recent backup
 * is the corrupt one".
 */

/** ISO-8601 instants, as everywhere else in the app. */
export type ISOInstant = string;

/**
 * How many automatic copies to keep in the folder.
 *
 * Four, at the default weekly cadence, is a month of history: enough that a bad
 * backup (a crash mid-write, a library edited by mistake three weeks ago) is not the
 * only backup, and few enough that the folder stays readable. It is not a setting
 * because nobody wants to tune it, and the cost of being wrong is a few kilobytes.
 */
export const AUTO_BACKUP_KEEP = 4;

/** The cadence range. */
export const AUTO_BACKUP_INTERVAL_LIMITS = { min: 1, max: 30, step: 1 } as const;

/**
 * When a backup is old enough to say so out loud, in days.
 *
 * The Finish sheet is the one screen the user reliably reaches — it is the last tap
 * of every workout — so it is where a stale backup gets mentioned. Three weeks
 * rather than eight days: at a weekly cadence, a backup one interval late is a
 * phone that was off, and nagging about that is how a warning becomes furniture.
 */
export const BACKUP_STALE_DAYS = 21;

const MS_PER_DAY = 86_400_000;

/** A finite, positive instant, or null. */
function instant(at: ISOInstant | null | undefined): number | null {
  if (typeof at !== 'string' || at.trim() === '') return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/** Whole days between two instants, floored. Negative clock skew reads as 0. */
export function daysSince(
  at: ISOInstant | null | undefined,
  now: Date = new Date(),
): number | null {
  const then = instant(at);
  if (then == null) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
}

export interface AutoBackupState {
  enabled: boolean;
  /** The granted folder. Absent = nowhere to write, so nothing can happen. */
  folderUri?: string;
  /** When the last automatic OR manual backup landed. */
  lastAt?: ISOInstant;
  intervalDays: number;
}

/**
 * Is a backup due?
 *
 * A never-backed-up log is due immediately — that is the case with the most to lose
 * and the least excuse. Clock skew (a `lastAt` in the future, which a timezone
 * change or a hand-edited blob can produce) reads as zero days and therefore as not
 * due, rather than as a negative interval that would write on every launch.
 */
export function shouldBackUpNow(state: AutoBackupState, now: Date = new Date()): boolean {
  if (!state.enabled) return false;
  if (!state.folderUri) return false;
  const days = daysSince(state.lastAt, now);
  if (days == null) return true;
  return days >= Math.max(AUTO_BACKUP_INTERVAL_LIMITS.min, Math.round(state.intervalDays));
}

/** Has it been long enough to be worth mentioning where the user will see it? */
export function backupIsStale(
  state: Pick<AutoBackupState, 'lastAt'>,
  now: Date = new Date(),
): boolean {
  const days = daysSince(state.lastAt, now);
  return days == null || days >= BACKUP_STALE_DAYS;
}

/**
 * "Today" / "8 days ago" / "Never" — the age of the last backup, for a settings row.
 *
 * Words rather than a date, because the only question this row answers is "is it
 * recent enough", and a reader has to do the arithmetic on a date to find out.
 */
export function describeBackupAge(
  at: ISOInstant | null | undefined,
  now: Date = new Date(),
): string {
  const days = daysSince(at, now);
  if (days == null) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * The URIs to keep and the URIs to delete, newest first.
 *
 * Pure so the rotation is testable without a file system: the caller writes the new
 * file, prepends its URI, and deletes whatever comes back in `drop`. A delete that
 * fails is not an error worth surfacing — the copy stays, and the next rotation
 * tries again — so this returns a plan rather than performing one.
 */
export function rotateBackups(
  existing: readonly string[],
  newest: string,
  keep = AUTO_BACKUP_KEEP,
): { keep: string[]; drop: string[] } {
  // Deduplicated because SAF hands back a fresh URI per file, but a retried write
  // after a partial failure can produce the same one twice.
  const all = [newest, ...existing.filter((uri) => uri !== newest)];
  return { keep: all.slice(0, Math.max(1, keep)), drop: all.slice(Math.max(1, keep)) };
}

/** The file name for an automatic copy: dated, sortable, and obviously automatic. */
export function autoBackupBaseName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `workout-tracker-auto-${stamp}`;
}
