/**
 * The unattended backup: the one side effect behind `lib/autoBackup.ts`.
 *
 *   app opens ──► stores hydrated? ──► is one due? ──► write ──► rotate ──► stamp
 *                                          │
 *                                          └─ no ──► nothing at all
 *
 * ── WHY ON LAUNCH AND NOT ON A SCHEDULE ────────────────────────────────────
 *
 * Android does not let a sideloaded app reliably run code at a wall-clock instant
 * unless it is a notification (`lib/notify.ts` has that argument in full). A
 * `WorkManager` job would be the textbook answer and it is not reachable from this
 * codebase without a native module — and it would buy nothing: a backup exists to
 * be no more than a week or so behind, and the app is opened every training day.
 * Checking on launch is therefore both the simplest mechanism and an accurate one.
 *
 * ── AND WHY IT NEVER BLOCKS, NEVER RETRIES, AND NEVER SPEAKS ───────────────
 *
 * It runs after a delay, off the first render, so the home screen is never waiting
 * on a file write. Every failure is swallowed: a revoked folder permission, a full
 * disk, a provider that has gone away. That is not sloppiness — a backup that
 * cannot write must not become a modal in front of a user who came here to train,
 * and the *visible* consequence is already correct without any error handling at
 * all: `lastBackupAt` does not move, the Settings row keeps saying how old the last
 * copy is, and the Finish sheet starts mentioning it once it is properly stale.
 * The failure reports itself, in the one place that is honest, at the one time the
 * user can act on it.
 *
 * A failed write also does NOT stamp the clock, so the next launch tries again.
 */

import { useEffect } from 'react';

import { autoBackupBaseName, shouldBackUpNow } from '../lib/autoBackup';
import { deleteFile, writeToFolder } from '../lib/backupFile';
import { exportBackupText } from '../state/dataTransfer';
import { useSettings } from '../state/settingsStore';

/**
 * How long after launch to consider writing, in ms.
 *
 * Long enough that the stores have rehydrated and the first screen has painted —
 * `exportBackupText` reads all three of them, and reading them mid-hydration would
 * write a backup of an empty library, which is the worst possible file to keep.
 */
const DELAY_MS = 4000;

/** Ran the check already this launch. A ref would reset on remount; this does not. */
let attemptedThisLaunch = false;

/**
 * Write a backup if one is due. Safe to call at any time; returns what happened.
 *
 * Exported because the Settings screen's `Back up now` runs the same path, and a
 * second implementation of "write, rotate, stamp" is a second thing that can be
 * wrong about which files to delete.
 */
export async function runBackupNow(force = false): Promise<{ wrote: boolean; name?: string }> {
  const settings = useSettings.getState();
  const folderUri = settings.autoBackupFolderUri;
  if (!folderUri) return { wrote: false };
  /*
   * Mapped rather than passed whole: `AutoBackupState` names four facts and the
   * store's key names are longer, so the decision function stays readable without
   * knowing anything about a Zustand store.
   */
  const due = shouldBackUpNow({
    enabled: settings.autoBackupEnabled,
    folderUri,
    lastAt: settings.lastBackupAt,
    intervalDays: settings.autoBackupIntervalDays,
  });
  if (!force && !due) return { wrote: false };

  try {
    const text = exportBackupText();
    const { name, uri } = await writeToFolder(folderUri, autoBackupBaseName(), text);
    /*
     * Stamped only after the write resolved. The store hands back the copies that
     * have aged out; deleting them is best-effort, because a copy that will not
     * delete is a tidiness problem and losing the stamp over it would mean writing
     * a fresh backup on every single launch.
     */
    const { drop } = useSettings.getState().recordBackup(new Date().toISOString(), uri);
    for (const old of drop) await deleteFile(old);
    return { wrote: true, name };
  } catch {
    return { wrote: false };
  }
}

/**
 * Mount once, high in the tree. Does nothing on any render but the first.
 */
export function useAutoBackup(): void {
  useEffect(() => {
    if (attemptedThisLaunch) return;
    attemptedThisLaunch = true;

    const timer = setTimeout(() => {
      void runBackupNow();
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}
