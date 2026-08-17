/**
 * Set timer hook — the plank / hang / round clock.
 *
 * Sibling of `useRestTimer`, and deliberately built the same way: the store owns
 * one absolute fact, `lib/setTimer.ts` derives everything from it, and this hook
 * exists only to make time pass and to reach the user when the phone is not in
 * their hand.
 *
 * What it adds over the rest timer, and why:
 *
 *  1. TWO PHASES, ONE CLOCK. Get-ready then work. The transition is derived, not
 *     scheduled, so a timer that started while the app was backgrounded is in the
 *     right phase the moment it is read again.
 *  2. IT SPEAKS THROUGH BOTH COUNTDOWNS. The get-ready count ticks down out loud
 *     and lands on a long "go" tone; a prescribed hold ticks its own final
 *     seconds and lands on the bell. During either of those windows the user is
 *     walking to the bar or staring at the ceiling — not at the screen — so the
 *     cue has to be audible, not visual.
 *  3. A COUNTDOWN LOGS ITSELF. Nobody breaks a two-minute plank to tap a
 *     checkmark. When the bell rings the set is committed, rest starts, and the
 *     phone buzzes. Stopping early still logs what was actually held (see
 *     `lib/setTimer.ts`).
 *  4. THE SCREEN STAYS ON for the whole hold. A plank that goes dark at 45 s is a
 *     plank you stop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { commit, countFinal, success, tap, undo } from '../lib/feedback';
import { cancelTimerAlert, scheduleTimerAlert } from '../lib/notify';
import { readSetTimer, workEndsAt, type SetTimerReading } from '../lib/setTimer';
import { useActiveWorkout, type SetTimerState } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { useCountdownBeeps } from './useCountdownBeeps';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'set-timer';

export interface SetTimerApi {
  /** The running timer, or null. */
  timer: SetTimerState | null;
  /** Derived clock. Null when nothing is running. */
  reading: SetTimerReading | null;
  /** The user's ± step on a prescribed hold. */
  stepSeconds: number;
  /** ±seconds on a prescribed hold. */
  add: (seconds: number) => void;
  /** Spend the get-ready count now — "I'm already up there". */
  startNow: () => void;
  /** Stop and log what the clock read. */
  stop: () => void;
  /** Abandon without logging. */
  cancel: () => void;
}

export function useSetTimer(): SetTimerApi {
  const timer = useActiveWorkout((s) => s.setTimer);
  const adjustSetTimer = useActiveWorkout((s) => s.adjustSetTimer);
  const skipPrepare = useActiveWorkout((s) => s.skipSetTimerPrepare);
  const cancelSetTimer = useActiveWorkout((s) => s.cancelSetTimer);
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);

  const stepSeconds = useSettings((s) => s.adjustStepSeconds);
  const keepAwakeEnabled = useSettings((s) => s.keepAwakeEnabled);
  const notifyOnTimerEnd = useSettings((s) => s.notifyOnTimerEnd);

  const [now, setNow] = useState(() => Date.now());
  const notificationId = useRef<string | null>(null);
  /** Guards the one-shot events against a second tick for the same timer. */
  const committedFor = useRef<number | null>(null);
  const wentToWorkFor = useRef<number | null>(null);

  const reading = useMemo(() => (timer ? readSetTimer(timer, now) : null), [timer, now]);

  /* --- the two count-ins ---------------------------------------------- */
  /*
   * Separate hooks rather than one, because they are two different countdowns
   * that happen to share a clock: they re-arm independently, and the get-ready
   * count hands its final beat to the work phase below (`finalTone: false`) so
   * "go" is sounded once, by the thing that actually starts.
   */
  useCountdownBeeps({
    secondsLeft: reading?.phase === 'prepare' ? reading.display : null,
    id: timer ? `prepare:${timer.startedAt}` : null,
    finalTone: false,
  });
  useCountdownBeeps({
    secondsLeft:
      reading?.phase === 'work' && timer?.mode === 'countdown' ? reading.display : null,
    // `workSeconds` is in the id so a `+15` mid-hold re-arms the count: the user
    // moved the target, and the seconds already spoken are no longer the last ones.
    id: timer?.mode === 'countdown' ? `work:${timer.startedAt}:${timer.workSeconds}` : null,
  });

  /* --- tick ---------------------------------------------------------- */
  useEffect(() => {
    if (!timer) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [timer]);

  /* --- resync when returning from background ------------------------- */
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') setNow(Date.now());
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  /* --- phase changes -------------------------------------------------- */
  useEffect(() => {
    if (!timer || !reading) return;

    /*
     * "Go." The long tone plus a medium impact — the same weight as logging a
     * set, because this is the moment the set actually starts. Guarded on `work`
     * rather than on "not prepare": a timer rehydrated after the app was killed
     * mid-plank is already over, and announcing "go" a beat before the bell would
     * be a lie.
     */
    if (reading.phase === 'work' && wentToWorkFor.current !== timer.startedAt) {
      wentToWorkFor.current = timer.startedAt;
      // A count-up has no bell of its own, so its start is the one cue it gets.
      if (timer.prepareSeconds > 0 || timer.mode === 'countup') countFinal();
      else commit();
    }

    if (reading.phase === 'over' && committedFor.current !== timer.startedAt) {
      committedFor.current = timer.startedAt;
      // The bell's tone is sounded by `useCountdownBeeps` reaching zero; this is
      // the wrist-level confirmation that the set went into the log.
      success();
      commitSetTimer();
    }
  }, [commitSetTimer, reading, timer]);

  /* --- the bell, for a phone in a pocket ------------------------------ */
  useEffect(() => {
    let cancelled = false;

    const clearPending = async () => {
      const id = notificationId.current;
      notificationId.current = null;
      await cancelTimerAlert(id);
    };

    void (async () => {
      await clearPending();
      if (!timer || !notifyOnTimerEnd) return;

      const endsAt = workEndsAt(timer);
      if (endsAt == null) return; // an open hold has no bell to ring

      const id = await scheduleTimerAlert({
        title: 'Time',
        body: 'Set logged — rest.',
        at: endsAt,
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
    // `workSeconds` is in the dep list via `timer` identity: every ± replaces the
    // object, which reschedules the bell.
  }, [notifyOnTimerEnd, timer]);

  /* --- keep the screen on for the whole hold -------------------------- */
  useEffect(() => {
    if (!timer || !keepAwakeEnabled) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwakeEnabled, timer]);

  /* --- api ----------------------------------------------------------- */
  const add = useCallback(
    (seconds: number) => {
      tap();
      adjustSetTimer(seconds);
    },
    [adjustSetTimer],
  );

  const startNow = useCallback(() => {
    tap();
    skipPrepare();
  }, [skipPrepare]);

  const stop = useCallback(() => {
    commit();
    commitSetTimer();
  }, [commitSetTimer]);

  const cancel = useCallback(() => {
    undo();
    cancelSetTimer();
  }, [cancelSetTimer]);

  return { timer, reading, stepSeconds, add, startNow, stop, cancel };
}
