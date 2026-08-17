/**
 * When a countdown should speak.
 *
 *   secondsLeft:  8    7    6    5    4    3    2    1    0
 *   window = 5:                  ·    ·    ·    ·    ·   ▔▔▔
 *                               tick tick tick tick tick final
 *
 * The rules live here rather than in `useCountdownBeeps` because they are the
 * feature, not the plumbing: "beep the last five seconds" is three decisions that
 * all have to be right, and none of them need React to be tested.
 *
 *  1. ONE CUE PER SECOND, EVER. The timers tick at 4 Hz, so the naive version
 *     beeps four times a second. Cues are latched on the integer second, and a
 *     second that has already spoken stays quiet.
 *  2. A COUNTDOWN NEVER NARRATES ITS PAST. Both timers are absolute deadlines, so
 *     a plank that ended in the user's pocket reads as `0` on the first frame after
 *     relaunch. Sounding five ticks and a "go" at that moment would be the app
 *     announcing something that already happened, so the FIRST reading of a
 *     countdown only arms the latch — it never produces a cue.
 *  3. RE-ARMING IS EXPLICIT. `id` changes when the thing being counted changes: a
 *     new rest deadline, a different set's clock, a `+15` that moved the target.
 *     That resets the latch, which is what lets a pill already inside the window
 *     go quiet and count itself back down again.
 */

export type Cue = 'none' | 'tick' | 'final';

/** The identity of one countdown. Null means nothing is running. */
export type CueId = string | number | null;

export interface CueLatch {
  /** The id the two latches below belong to. */
  armedFor: CueId;
  /** The second already spoken for, so 4 Hz ticks collapse to 1 Hz cues. */
  spokenSecond: number | null;
  spokeFinal: boolean;
}

export const IDLE_LATCH: CueLatch = {
  armedFor: null,
  spokenSecond: null,
  spokeFinal: false,
};

export interface CueInput {
  id: CueId;
  /** Whole seconds left — the number the user is reading, not the raw float. */
  secondsLeft: number | null;
  /** Beep during the last N seconds. 0 disables ticking entirely. */
  window: number;
  /**
   * Sound the long tone at zero. False for a count-in that hands its final beat
   * to something else — the get-ready count's "go" belongs to the work clock.
   */
  finalTone: boolean;
}

/**
 * The cue to play right now, and the latch to remember.
 *
 * Pure: same latch and same input, same answer. The caller holds the latch across
 * ticks (a ref in the hook) and feeds it back in.
 */
export function nextCue(latch: CueLatch, input: CueInput): { cue: Cue; latch: CueLatch } {
  const { id, secondsLeft, window, finalTone } = input;

  if (id == null || secondsLeft == null) {
    return { cue: 'none', latch: IDLE_LATCH };
  }

  // Rule 2: first sight of this countdown arms and stays silent. The cost is that
  // a countdown shorter than one render says nothing, which is the right trade —
  // nobody is listening to a timer that never appeared.
  if (latch.armedFor !== id) {
    return {
      cue: 'none',
      latch: { armedFor: id, spokenSecond: secondsLeft, spokeFinal: secondsLeft <= 0 },
    };
  }

  if (secondsLeft <= 0) {
    if (!finalTone || latch.spokeFinal) return { cue: 'none', latch };
    return { cue: 'final', latch: { ...latch, spokeFinal: true } };
  }

  if (window <= 0) return { cue: 'none', latch };

  // `!==` rather than `<`: a `−15` that pushes the clock back up should be able to
  // speak the same number again on the way down.
  if (secondsLeft <= window && latch.spokenSecond !== secondsLeft) {
    return { cue: 'tick', latch: { ...latch, spokenSecond: secondsLeft } };
  }

  return { cue: 'none', latch };
}
