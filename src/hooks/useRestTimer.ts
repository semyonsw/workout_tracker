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
 *
 * ── ± ON THE PILL CHANGES THE REST, NOT JUST THIS ONE ──────────────────────
 *
 * `add` moves the running countdown AND writes the new length back as the rest
 * for every set that follows — through `state/restSync.ts`, so it lands in the
 * setting, the library and the live session together.
 *
 * That is a deliberate reading of what the gesture means. Nobody decides mid-rest
 * that this ONE gap should be 1:30 and the next one back to 2:00; they have
 * discovered that 2:00 is wrong for today, and the useful outcome is that every
 * rest afterwards is 1:30 without a trip to Settings between sets. The
 * alternative — an adjustment that evaporates when the pill does — is a control
 * you have to press again after every single set.
 *
 * Which number it writes follows which rest is running: `transition` is the
 * between-exercises setting, anything else is between-sets. The pill says which
 * one it is showing, so the two can't be confused.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { tap, undo } from '../lib/feedback';
import { cancelTimerAlerts, scheduleTimerAlertPair } from '../lib/notify';
import { useActiveWorkout, type RestSource } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { setRestBetweenExercises, setRestBetweenSets } from '../state/restSync';
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
  /** The pill should be on screen: rest is counting, or frozen by a pause. */
  isActive: boolean;
  /** The clock is moving. False while paused, false at zero. */
  isRunning: boolean;
  isPaused: boolean;
  /** Which rest this is, so the pill can name it. */
  source: RestSource | null;
  totalSeconds: number;
  /** The user's ± step, so the pill and Settings can never disagree. */
  stepSeconds: number;
  /**
   * Move the running rest by ±`seconds`, and make that the rest length from here
   * on. See the file header — this is not a one-off nudge.
   */
  add: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
}

export function useRestTimer(): RestTimerApi {
  const rest = useActiveWorkout((s) => s.rest);
  const adjustRest = useActiveWorkout((s) => s.adjustRest);
  const pauseRest = useActiveWorkout((s) => s.pauseRest);
  const resumeRest = useActiveWorkout((s) => s.resumeRest);
  const skipRest = useActiveWorkout((s) => s.skipRest);

  const stepSeconds = useSettings((s) => s.adjustStepSeconds);
  const keepAwakeEnabled = useSettings((s) => s.keepAwakeEnabled);
  const notifyOnTimerEnd = useSettings((s) => s.notifyOnTimerEnd);

  const isPaused = rest.pausedRemainingMs != null;

  /*
   * The ticking clock, and WHICH DEADLINE IT BELONGS TO.
   *
   * The pairing is the point. With a bare number, the first render after a new
   * rest starts still holds the previous timer's remainder — the interval that
   * corrects it is an effect, and effects run after render. That one stale frame
   * is what the count-in arms its latch from (`nextCue` treats a countdown's first
   * reading as "arm, stay silent"), so a fresh 2:00 rest could arm at whatever the
   * last one ended on and then skip or duplicate a second on the way down. Reading
   * the deadline directly whenever the pair is stale makes the first frame of a
   * countdown as correct as every frame after it.
   */
  const [clock, setClock] = useState(() => ({
    forEndsAt: rest.endsAt,
    left: remainingSeconds(rest.endsAt),
  }));
  const ticked = clock.forEndsAt === rest.endsAt ? clock.left : remainingSeconds(rest.endsAt);
  /** The scheduled alerts for the current deadline: the tick and the tone. */
  const notificationIds = useRef<string[]>([]);

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
    const endsAt = rest.endsAt;
    if (!endsAt) {
      setClock({ forEndsAt: null, left: 0 });
      return undefined;
    }

    setClock({ forEndsAt: endsAt, left: remainingSeconds(endsAt) });

    const interval = setInterval(() => {
      const next = remainingSeconds(endsAt);
      setClock({ forEndsAt: endsAt, left: next });
      // Nothing left to recompute; the deadline stays in the store so the pill
      // keeps showing 0:00 until the user moves on.
      if (next <= 0) clearInterval(interval);
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [rest.endsAt]);

  /* --- resync when returning from background ------------------------- */
  useEffect(() => {
    const endsAt = rest.endsAt;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') setClock({ forEndsAt: endsAt, left: remainingSeconds(endsAt) });
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [rest.endsAt]);

  /* --- the cue for a phone in a pocket -------------------------------- */
  /*
   * Two alerts, not one: a tick five seconds out and the tone at zero. This is the
   * ONLY cue that reaches the user when the app is not on screen — a JS interval
   * playing a WAV does not survive Doze, a restricted battery setting or a
   * swipe-away, while a scheduled alarm does. See `lib/notify.ts`.
   */
  useEffect(() => {
    let cancelled = false;

    // Any change of deadline — including a pause, which clears it — invalidates
    // the pending alerts.
    const clearPending = async () => {
      const ids = notificationIds.current;
      notificationIds.current = [];
      await cancelTimerAlerts(ids);
    };

    void (async () => {
      await clearPending();
      if (!rest.endsAt || !notifyOnTimerEnd) return;

      const ids = await scheduleTimerAlertPair({
        at: rest.endsAt,
        getSetTitle: 'Get set',
        getSetBody: 'Rest ends in 5 seconds.',
        goTitle: 'Rest over',
        goBody: 'Next set.',
      });
      if (cancelled) {
        await cancelTimerAlerts(ids);
        return;
      }
      notificationIds.current = ids;
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
      /*
       * The store has already clamped the new total (a `−15` on a 5 s rest cannot
       * go negative), so the length is READ BACK rather than recomputed here —
       * two clamps in two files is two answers waiting to disagree.
       */
      const { totalSeconds, source } = useActiveWorkout.getState().rest;
      if (source === 'transition') setRestBetweenExercises(totalSeconds);
      else setRestBetweenSets(totalSeconds);
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

  return {
    remaining,
    isActive,
    isRunning,
    isPaused,
    source: rest.source,
    totalSeconds: rest.totalSeconds,
    stepSeconds,
    add,
    pause,
    resume,
    skip,
  };
}
