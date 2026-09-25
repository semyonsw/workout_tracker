/**
 * THE LAUNCH SCREEN'S CLOCK — what it shows as loaded, and when it may leave.
 *
 * The animated splash is not decoration over a wait: its three chips are the
 * three stores the app reads on a cold start (the workout log, the tasks, the
 * money), and each one ticks when THAT STORE has actually finished. So two things
 * have to be decided, and both are decided here where they can be tested:
 *
 *  1. WHEN A CHIP TICKS. A store that finishes in 4 ms would tick before its chip
 *     has even faded in, and three that finish together would tick as one. So the
 *     k-th store to finish ticks at the later of its own finish and the k-th SLOT
 *     (700, 1150, 1600 ms — the design's pacing). The ORDER is the stores' real
 *     order; only the earliest moment each may be shown is paced.
 *
 *  2. WHEN THE SPLASH LEAVES. All three ticked and at least 2.3 s gone — the
 *     floor the choreography needs to read as one thing — or 6 s gone whatever
 *     the stores say. The ceiling matters more than the floor: a store that never
 *     reports ready must not be a launch that never ends, and every screen behind
 *     this one already has its own state for data that could not be read.
 */

export type LaunchStore = 'history' | 'tasks' | 'money';

export const LAUNCH_STORES: readonly LaunchStore[] = ['history', 'tasks', 'money'];

/** The earliest moment the first, second and third store may be shown ticked. */
export const LAUNCH_TICK_SLOTS_MS = [700, 1150, 1600] as const;

/** Below this the splash never leaves. */
export const LAUNCH_FLOOR_MS = 2300;

/** Past this the splash always leaves. */
export const LAUNCH_CEILING_MS = 6000;

export interface LaunchInput {
  historyReady: boolean;
  tasksReady: boolean;
  moneyReady: boolean;
  elapsedMs: number;
}

export interface LaunchState {
  /** How many stores are ready, 0–3. The ring around the mark is a third per stage. */
  stage: 0 | 1 | 2 | 3;
  /** Start the exit now. */
  exit: boolean;
}

export function launchReady({
  historyReady,
  tasksReady,
  moneyReady,
  elapsedMs,
}: LaunchInput): LaunchState {
  const stage = ((historyReady ? 1 : 0) + (tasksReady ? 1 : 0) + (moneyReady ? 1 : 0)) as
    0 | 1 | 2 | 3;
  const exit = (stage === 3 && elapsedMs >= LAUNCH_FLOOR_MS) || elapsedMs >= LAUNCH_CEILING_MS;
  return { stage, exit };
}

/**
 * Which chips show as ticked at `elapsedMs`, given when each store became ready
 * (ms since launch, or null while it has not).
 *
 * Ties are broken by the chips' own left-to-right order, so two stores that
 * finish in the same millisecond still tick one slot apart and in reading order.
 */
export function launchTicks(
  readyAtMs: Record<LaunchStore, number | null>,
  elapsedMs: number,
): Record<LaunchStore, boolean> {
  const finished = LAUNCH_STORES.filter((store) => readyAtMs[store] != null).sort(
    (a, b) =>
      (readyAtMs[a] as number) - (readyAtMs[b] as number) ||
      LAUNCH_STORES.indexOf(a) - LAUNCH_STORES.indexOf(b),
  );
  const ticked: Record<LaunchStore, boolean> = { history: false, tasks: false, money: false };
  finished.forEach((store, order) => {
    const at = Math.max(readyAtMs[store] as number, LAUNCH_TICK_SLOTS_MS[order]);
    ticked[store] = elapsedMs >= at;
  });
  return ticked;
}

/** The next moment `launchTicks` or `launchReady` can change its answer, or null. */
export function nextLaunchChangeMs(
  readyAtMs: Record<LaunchStore, number | null>,
  elapsedMs: number,
): number | null {
  const finished = LAUNCH_STORES.filter((store) => readyAtMs[store] != null).sort(
    (a, b) => (readyAtMs[a] as number) - (readyAtMs[b] as number),
  );
  const moments = [
    ...finished.map((store, order) =>
      Math.max(readyAtMs[store] as number, LAUNCH_TICK_SLOTS_MS[order]),
    ),
    LAUNCH_FLOOR_MS,
    LAUNCH_CEILING_MS,
  ].filter((at) => at > elapsedMs);
  return moments.length > 0 ? Math.min(...moments) : null;
}
