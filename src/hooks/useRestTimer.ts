/**
 * Rest timer hook.
 *
 * The store holds an absolute deadline (or, while paused, a frozen remainder);
 * this hook turns it into a ticking number and owns the four things a gym timer
 * must get right:
 *
 *  1. ACCURACY ACROSS SUSPENSION — remaining time is recomputed from `Date.now()`
 *     on every tick and again on every foreground transition, so a timer that ran
 *     while the screen was off is still correct when it wakes.
 *  2. IT COUNTS THE LAST SECONDS OUT LOUD — `useCountdownBeeps` ticks through the
 *     final window and sounds a longer tone at zero. This is the cue that
 *     actually reaches someone lying on a bench looking at the ceiling; haptics
 *     don't travel and a notification arrives too late to get set.
 *  3. IT MUST STILL REACH A PHONE IN A POCKET — a local notification is scheduled
 *     for the deadline the moment rest starts, and cancelled if rest is skipped,
 *     paused or adjusted.
 *  4. IT MUST NOT WAKE THE PHONE FOR NOTHING — the interval only exists while a
 *     timer is actually running (a paused timer has no interval at all), and ticks
 *     at 250 ms rather than every frame: the display shows whole seconds.
 *
 * PAUSE vs SKIP, since the pill offers both: pausing freezes rest where it
 * stands and keeps the pill; skipping ends rest and dismisses it. Only one of
 * them loses the timer, and it's the one with the destructive-sounding name.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { tap, undo } from '../lib/feedback';
import { cancelTimerAlert, scheduleTimerAlert } from '../lib/notify';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { useCountdownBeeps } from './useCountdownBeeps';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'rest-timer';

function remainingSeconds(endsAt: number | null): number {
  if (!endsAt) return 0;
  return Math.max(0, (endsAt - Date.now()) / 1000);
}

export interface RestTimerApi {
  /** Seconds left, already clamped at 0. Fractional — round at render time. */
  remaining: number;
  /** 0 → 1, for the drain line. 1 when idle. */
  progress: number;
  /** The pill should be on screen: rest is counting, or frozen by a pause. */
  isActive: boolean;
  /** The clock is moving. False while paused, false at zero. */
  isRunning: boolean;
  isPaused: boolean;
  totalSeconds: number;
  /** The user's ± step, so the pill and Settings can never disagree. */
  stepSeconds: number;
  add: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  start: (seconds: number) => void;
}

export function useRestTimer(): RestTimerApi {
  const rest = useActiveWorkout((s) => s.rest);
  const adjustRest = useActiveWorkout((s) => s.adjustRest);
  const pauseRest = useActiveWorkout((s) => s.pauseRest);
  const resumeRest = useActiveWorkout((s) => s.resumeRest);
  const skipRest = useActiveWorkout((s) => s.skipRest);
  const startRest = useActiveWorkout((s) => s.startRest);

  const stepSeconds = useSettings((s) => s.adjustStepSeconds);
  const keepAwakeEnabled = useSettings((s) => s.keepAwakeEnabled);
  const notifyOnTimerEnd = useSettings((s) => s.notifyOnTimerEnd);

  const isPaused = rest.pausedRemainingMs != null;

  const [ticked, setTicked] = useState(() => remainingSeconds(rest.endsAt));
  const notificationId = useRef<string | null>(null);

  /*
   * While paused the frozen remainder IS the clock — deriving from `endsAt` would
   * read zero, because pausing is expressed as clearing the deadline.
   */
  const remaining = isPaused ? (rest.pausedRemainingMs ?? 0) / 1000 : ticked;
  const isRunning = rest.endsAt != null && ticked > 0;
  /*
   * The pill leaves the screen the moment rest is over rather than sitting at
   * 0:00 waiting to be dismissed — the cue that rest ended is the tone, the buzz
   * and the notification, none of which need a slab left behind them. A paused
   * timer is the one case where a stopped clock stays visible, because there the
   * user is the reason it isn't moving.
   *
   * The hook still runs while hidden (`RestTimerPill` returns null after calling
   * it), which is what lets the final tone fire on the tick that reaches zero.
   */
  const isActive = isRunning || isPaused;

  /* --- the count-in ---------------------------------------------------- */
  /*
   * Keyed on the deadline, so `+15` (a new deadline) re-arms the count and a
   * paused timer (`endsAt` null) stops speaking without any extra condition.
   */
  useCountdownBeeps({
    secondsLeft: rest.endsAt != null ? Math.ceil(remaining) : null,
    id: rest.endsAt,
  });

  /* --- tick ---------------------------------------------------------- */
  useEffect(() => {
    if (!rest.endsAt) {
      setTicked(0);
      return undefined;
    }

    setTicked(remainingSeconds(rest.endsAt));

    const interval = setInterval(() => {
      const next = remainingSeconds(rest.endsAt);
      setTicked(next);
      // Nothing left to recompute; the deadline stays in the store so the pill
      // keeps showing 0:00 until the user moves on.
      if (next <= 0) clearInterval(interval);
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [rest.endsAt]);

  /* --- resync when returning from background ------------------------- */
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') setTicked(remainingSeconds(rest.endsAt));
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [rest.endsAt]);

  /* --- background notification --------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    // Any change of deadline — including a pause, which clears it — invalidates
    // the pending alert.
    const clearPending = async () => {
      const id = notificationId.current;
      notificationId.current = null;
      await cancelTimerAlert(id);
    };

    void (async () => {
      await clearPending();
      if (!rest.endsAt || !notifyOnTimerEnd) return;

      const id = await scheduleTimerAlert({
        title: 'Rest over',
        body: 'Next set.',
        at: rest.endsAt,
      });
      if (cancelled) {
        await cancelTimerAlert(id);
        return;
      }
      if (id) notificationId.current = id;
    })();

    return () => {
      cancelled = true;
      void clearPending();
    };
  }, [notifyOnTimerEnd, rest.endsAt]);

  /* --- keep the screen on while resting ------------------------------ */
  useEffect(() => {
    if (!isRunning || !keepAwakeEnabled) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    // `deactivateKeepAwake` is async; a cleanup function must return void or a
    // destructor, never a Promise, so the result is discarded deliberately.
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isRunning, keepAwakeEnabled]);

  /* --- api ----------------------------------------------------------- */
  const add = useCallback(
    (seconds: number) => {
      tap();
      adjustRest(seconds);
    },
    [adjustRest],
  );

  const pause = useCallback(() => {
    undo();
    pauseRest();
  }, [pauseRest]);

  const resume = useCallback(() => {
    tap();
    resumeRest();
  }, [resumeRest]);

  const skip = useCallback(() => {
    undo();
    skipRest();
  }, [skipRest]);

  const start = useCallback((seconds: number) => startRest(seconds, 'manual'), [startRest]);

  return {
    remaining,
    progress: rest.totalSeconds > 0 ? 1 - remaining / rest.totalSeconds : 1,
    isActive,
    isRunning,
    isPaused,
    totalSeconds: rest.totalSeconds,
    stepSeconds,
    add,
    pause,
    resume,
    skip,
    start,
  };
}
