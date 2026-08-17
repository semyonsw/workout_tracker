/**
 * The count-in, for any countdown in the app.
 *
 * One hook drives the rest timer, the get-ready count and a prescribed hold,
 * because "the last five seconds beep" should be one behaviour with one
 * implementation, not three that drift apart.
 *
 * All of the actual rules — one cue per second, never narrate a countdown that
 * finished while the app was dead, re-arm when the target moves — live in
 * `lib/countdownCue.ts`, which is pure and tested. What is left here is the two
 * things that need React: holding the latch across ticks, and playing the sound as
 * an effect rather than during render.
 */

import { useEffect, useRef } from 'react';

import { IDLE_LATCH, nextCue, type CueId, type CueLatch } from '../lib/countdownCue';
import { countFinal, countTick } from '../lib/feedback';
import { useSettings } from '../state/settingsStore';

interface CountdownBeepsParams {
  /**
   * Whole seconds left on the clock, or null when nothing is counting down.
   * Callers pass `Math.ceil(remaining)` — the number the user is reading.
   */
  secondsLeft: number | null;
  /**
   * Identity of THIS countdown. A new deadline means a new id, which re-arms the
   * hook. Null is equivalent to "nothing running".
   */
  id: CueId;
  /**
   * Sound the long tone at zero. False for a count-in that hands over to another
   * cue at zero (the get-ready count, whose "go" belongs to the work clock).
   */
  finalTone?: boolean;
}

export function useCountdownBeeps({
  secondsLeft,
  id,
  finalTone = true,
}: CountdownBeepsParams): void {
  const window = useSettings((s) => s.beepSeconds);
  const latch = useRef<CueLatch>(IDLE_LATCH);

  useEffect(() => {
    const { cue, latch: next } = nextCue(latch.current, {
      id,
      secondsLeft,
      window,
      finalTone,
    });
    latch.current = next;

    if (cue === 'tick') countTick();
    else if (cue === 'final') countFinal();
  }, [finalTone, id, secondsLeft, window]);
}
