import { describe, expect, it } from 'vitest';

import {
  AUTO_BACKUP_KEEP,
  autoBackupBaseName,
  BACKUP_STALE_DAYS,
  backupIsStale,
  daysSince,
  describeBackupAge,
  rotateBackups,
  shouldBackUpNow,
  type AutoBackupState,
} from './autoBackup';

/**
 * When to write a backup nobody asked for.
 *
 * `lib/backup.ts` calls a backup "the only thing standing between a year of training
 * and a factory reset" and then made it a button. These are the rules that make it
 * happen on its own instead — and the one that matters most is the last group: a
 * clock that has gone backwards must not turn the app into something that writes a
 * file on every launch.
 */

const NOW = new Date('2026-09-02T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const state = (over: Partial<AutoBackupState> = {}): AutoBackupState => ({
  enabled: true,
  folderUri: 'content://tree/primary%3ADownload',
  lastAt: daysAgo(3),
  intervalDays: 7,
  ...over,
});

describe('whether a backup is due', () => {
  it('is due once the interval has passed', () => {
    expect(shouldBackUpNow(state({ lastAt: daysAgo(6) }), NOW)).toBe(false);
    expect(shouldBackUpNow(state({ lastAt: daysAgo(7) }), NOW)).toBe(true);
    expect(shouldBackUpNow(state({ lastAt: daysAgo(40) }), NOW)).toBe(true);
  });

  it('is due immediately when nothing has ever been backed up', () => {
    // The case with the most to lose and the least excuse.
    expect(shouldBackUpNow(state({ lastAt: undefined }), NOW)).toBe(true);
  });

  it('is never due while switched off', () => {
    expect(shouldBackUpNow(state({ enabled: false, lastAt: undefined }), NOW)).toBe(false);
  });

  it('is never due with nowhere to write', () => {
    /*
     * Android's only durable destination is a folder the user granted; the app's own
     * sandbox dies with the app, which is one of the events a backup exists to
     * survive. So no folder means the feature is inert, however keen the setting is.
     */
    expect(shouldBackUpNow(state({ folderUri: undefined, lastAt: undefined }), NOW)).toBe(false);
  });

  it('treats a stamp from the future as not due, rather than as overdue', () => {
    // A timezone change or a hand-edited blob can produce one. A negative interval
    // would otherwise write a file on every launch, forever.
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    expect(shouldBackUpNow(state({ lastAt: future }), NOW)).toBe(false);
  });

  it('refuses an interval below one day, however it reached the settings', () => {
    expect(shouldBackUpNow(state({ intervalDays: 0, lastAt: daysAgo(0) }), NOW)).toBe(false);
    expect(shouldBackUpNow(state({ intervalDays: -5, lastAt: daysAgo(0) }), NOW)).toBe(false);
  });

  it('ignores an unparseable stamp by treating it as never', () => {
    expect(shouldBackUpNow(state({ lastAt: 'yesterday-ish' }), NOW)).toBe(true);
  });
});

describe('the age of the last backup', () => {
  it('counts whole days, floored', () => {
    expect(daysSince(daysAgo(0), NOW)).toBe(0);
    expect(daysSince(daysAgo(1.9), NOW)).toBe(1);
    expect(daysSince(undefined, NOW)).toBeNull();
  });

  it('says it in words, because the row only answers "recent enough"', () => {
    expect(describeBackupAge(undefined, NOW)).toBe('Never');
    expect(describeBackupAge(daysAgo(0), NOW)).toBe('Today');
    expect(describeBackupAge(daysAgo(1), NOW)).toBe('Yesterday');
    expect(describeBackupAge(daysAgo(12), NOW)).toBe('12 days ago');
  });

  it('is stale only well past one missed interval', () => {
    /*
     * At a weekly cadence, a backup eight days old is a phone that was off. Nagging
     * about that is how a warning becomes furniture — so the Finish sheet stays
     * quiet until three weeks.
     */
    expect(backupIsStale({ lastAt: daysAgo(8) }, NOW)).toBe(false);
    expect(backupIsStale({ lastAt: daysAgo(BACKUP_STALE_DAYS) }, NOW)).toBe(true);
    expect(backupIsStale({ lastAt: undefined }, NOW)).toBe(true);
  });
});

describe('rotation', () => {
  it('keeps the newest few and hands back the rest to delete', () => {
    const { keep, drop } = rotateBackups(['c', 'b', 'a'], 'd', 3);
    expect(keep).toEqual(['d', 'c', 'b']);
    expect(drop).toEqual(['a']);
  });

  it('keeps a month of history by default', () => {
    const existing = Array.from({ length: 10 }, (_, i) => `uri-${i}`);
    expect(rotateBackups(existing, 'new').keep).toHaveLength(AUTO_BACKUP_KEEP);
  });

  it('does not list the same URI twice after a retried write', () => {
    const { keep, drop } = rotateBackups(['b', 'a'], 'a', 3);
    expect(keep).toEqual(['a', 'b']);
    expect(drop).toEqual([]);
  });

  it('always keeps at least one, however small the cap gets', () => {
    expect(rotateBackups(['a'], 'b', 0).keep).toEqual(['b']);
  });
});

describe('the file name', () => {
  it('is dated, sortable, and obviously automatic', () => {
    expect(autoBackupBaseName(new Date(2026, 8, 2))).toBe('workout-tracker-auto-2026-09-02');
    expect(autoBackupBaseName(new Date(2026, 0, 5))).toBe('workout-tracker-auto-2026-01-05');
  });
});
