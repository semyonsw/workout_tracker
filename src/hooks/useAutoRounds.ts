/**
 * The thing that makes a round chain actually happen: a clock, and nothing else.
 *
 * `lib/rounds.ts` answers "should a round start right now" as pure arithmetic over
 * the session, the rest deadline and the arming flag. That answer changes with the
 * passage of time and nothing else — no event fires when a deadline is reached,
 * because the rest timer is a deadline rather than a countdown (see the store) —
 * so something has to look. This is that something, and it is the whole hook:
 * tick, ask, start.
 *
 * WHY IT ONLY TICKS WHILE ARMED. A 1 Hz interval running for the whole of a
 * ninety-minute session, on a phone whose screen is off, to ask a question whose
 * answer is `null` every single time, is the kind of thing that turns up in a
 * battery report. The interval exists only while `roundsAuto` points somewhere,
 * which is only during a bag session.
 *
 * ONE INSTANCE, MOUNTED ON THE SESSION SCREEN. Focus mode is a sheet over that
 * screen rather than a route, so the screen is still mounted underneath it and the
 * chain keeps running while the user is in focus mode — which is exactly where
 * somebody watching rounds go by would be. Two instances would race to start the
 * same round; the store's `startSetTimer` is idempotent enough that the loser
 * would only restart the clock, but a round that silently restarts its own three
 * minutes is a bug nobody would report and everybody would feel.
 *
 * The spent rest is SKIPPED rather than left at 0:00, because the pill has to come
 * off the screen: the next thing on it is the round's own clock.
 */

import { useEffect } from 'react';

import { autoRoundToStart } from '../lib/rounds';
import { useActiveWorkout } from '../state/activeWorkoutStore';

/** How often the chain checks whether the rest it is waiting on has run out. */
const TICK_MS = 250;

export function useAutoRounds(): void {
  const roundsAuto = useActiveWorkout((s) => s.roundsAuto);

  useEffect(() => {
    if (!roundsAuto) return undefined;

    const check = () => {
      /*
       * Read through `getState` rather than through selectors. The values this
       * asks about change four times a second while a rest runs, and a hook that
       * re-rendered its host screen on each of them would be paying the cost this
       * whole app spends effort avoiding — see `ActiveWorkoutScreen`'s note on why
       * the ticking clock lives inside the pill.
       */
      const state = useActiveWorkout.getState();
      const next = autoRoundToStart({
        session: state.session,
        roundsAuto: state.roundsAuto,
        rest: state.rest,
        setTimer: state.setTimer,
        nowMs: Date.now(),
      });
      if (!next) return;

      // Order matters: the rest has to be off the pill before the round's clock
      // asks for it, and `startSetTimer` clears it anyway — this is what makes the
      // hand-off one frame rather than two.
      state.skipRest();
      state.startSetTimer(next.entryId, next.setId, { skipPrepare: true });
    };

    check();
    const interval = setInterval(check, TICK_MS);
    return () => clearInterval(interval);
  }, [roundsAuto]);
}
