/**
 * First launch — the one moment this app writes somebody's past into itself.
 *
 * `semyonsw` is three apps' worth of history in one, and two of those histories
 * already existed somewhere else. The tasks arrive as the task store's DEFAULT
 * state, because they are small and the store is the only thing that reads them.
 * The training cannot: workouts live in SQLite, and a default value cannot put rows
 * in a database. So they arrive here, through exactly the same path a restored
 * backup file takes — `applyBackup` — and for the same reason: there is one import
 * path in this app, it is the one that has been validating rows since the format
 * existed, and a second one written for the seed would be a second one to get wrong.
 *
 * ── IT RUNS ONCE, AND "ONCE" IS THE WHOLE DESIGN ───────────────────────────
 *
 * The flag is written BEFORE the import, not after. That is the unusual choice and
 * it is deliberate: if the import throws halfway, the alternative — flag after —
 * retries it on the next launch and applies it OVER whatever the user has since
 * done, replacing their library and their log with the carried copy again. A seed
 * that half-landed is recoverable by hand (the file is right there in Settings'
 * restore flow); a seed that re-lands every launch is an app that eats your work.
 *
 * The flag also means DELETION STICKS. Somebody who clears the carried log and
 * relaunches gets an empty app, not their history resurrected — the same rule
 * `historyDb`'s `USER_CLEARED_FLAG` exists to enforce, arrived at from the other
 * direction.
 *
 * Quiet either way. A launch is not the moment to explain a data migration, and
 * nothing here is load-bearing: an app that starts empty still works.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { carriedTraining } from '../data/carriedTraining';
import { applyBackup } from './dataTransfer';

/** Bumped only if there is ever a second thing to carry over. */
export const FIRST_RUN_KEY = 'semyonsw:carried-over:v1';

/**
 * Apply the carried training log, unless this phone has already had it.
 *
 * Returns whether it ran, which is for the tests: nothing on screen reads it.
 */
export async function carryOverIfNeeded(): Promise<boolean> {
  try {
    const done = await AsyncStorage.getItem(FIRST_RUN_KEY);
    if (done) return false;
    await AsyncStorage.setItem(FIRST_RUN_KEY, new Date().toISOString());
    applyBackup(carriedTraining);
    return true;
  } catch {
    // A seed that could not be written is an app that starts empty. That is a
    // worse first launch and not a broken one, and there is no screen yet to say
    // it on.
    return false;
  }
}
