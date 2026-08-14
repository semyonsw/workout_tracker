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
 *     scheduled, so a timer that started while the app was backgrounded is in
 *     the right phase the moment it is read again.
 *  2. IT SPEAKS DURING THE COUNT-IN. A selection tick on every second of the
 *     get-ready count and a medium impact on "go" — because during those five
 *     seconds the user is walking to the bar, not watching the screen.
 *  3. A COUNTDOWN LOGS ITSELF. Nobody breaks a two-minute plank to tap a
 *     checkmark. When the bell rings the set is committed, rest starts, and the
 *     phone buzzes — the same success pattern rest ending uses. Stopping early
 *     still logs what was actually held (see `lib/setTimer.ts`).
 *  4. THE SCREEN STAYS ON for the whole hold. A plank that goes dark at 45 s is
 *     a plank you stop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { readSetTimer, workEndsAt, type SetTimerReading } from '../lib/setTimer';
import { useActiveWorkout, type SetTimerState } from '../state/activeWorkoutStore';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'set-timer';

export interface SetTimerApi {
  /** The running timer, or null. */
  timer: SetTimerState | null;
  /** Derived clock. Null when nothing is running. */
  reading: SetTimerReading | null;
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

  const [now, setNow] = useState(() => Date.now());
  const notificationId = useRef<string | null>(null);
  /** Guards the one-shot events against a second tick for the same timer. */
  const committedFor = useRef<number | null>(null);
  const wentToWorkFor = useRef<number | null>(null);
  const lastPrepareTick = useRef<number | null>(null);

  const reading = useMemo(
    () => (timer ? readSetTimer(timer, now) : null),
    [timer, now],
  );

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

  /* --- the audible parts --------------------------------------------- */
  useEffect(() => {
    if (!timer || !reading) return;

    if (reading.phase === 'prepare') {
      // One tick per second of the count-in: the cue to get into position.
      if (lastPrepareTick.current !== reading.display) {
        lastPrepareTick.current = reading.display;
        Haptics.selectionAsync().catch(() => {});
      }
      return;
    }

    // "Go." Medium impact — the same weight as logging a set, because this is
    // the moment the set actually starts.
    if (wentToWorkFor.current !== timer.startedAt) {
      wentToWorkFor.current = timer.startedAt;
      lastPrepareTick.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    if (reading.phase === 'over' && committedFor.current !== timer.startedAt) {
      committedFor.current = timer.startedAt;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      commitSetTimer();
    }
  }, [commitSetTimer, reading, timer]);

  /* --- the bell, for a phone in a pocket ------------------------------ */
  useEffect(() => {
    let cancelled = false;

    const clearPending = async () => {
      if (notificationId.current) {
        await Notifications.cancelScheduledNotificationAsync(notificationId.current).catch(
          () => {},
        );
        notificationId.current = null;
      }
    };

    (async () => {
      await clearPending();
      if (!timer) return;

      const endsAt = workEndsAt(timer);
      if (endsAt == null) return; // an open hold has no bell to ring
      // Under ~2 s away the notification lands after the user already saw zero.
      if ((endsAt - Date.now()) / 1000 < 2) return;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Time',
          body: 'Set logged — rest.',
          sound: true,
          interruptionLevel: 'timeSensitive', // iOS: pierces Focus modes
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt },
      }).catch(() => null);

      if (!cancelled && id) notificationId.current = id;
    })();

    return () => {
      cancelled = true;
      void clearPending();
    };
    // `workSeconds` is in the dep list via `timer` identity: every ±15 s
    // replaces the object, which reschedules the bell.
  }, [timer]);

  /* --- keep the screen on for the whole hold -------------------------- */
  useEffect(() => {
    if (!timer) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [timer]);

  /* --- api ----------------------------------------------------------- */
  const add = useCallback(
    (seconds: number) => {
      Haptics.selectionAsync().catch(() => {});
      adjustSetTimer(seconds);
    },
    [adjustSetTimer],
  );

  const startNow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    skipPrepare();
  }, [skipPrepare]);

  const stop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    commitSetTimer();
  }, [commitSetTimer]);

  const cancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    cancelSetTimer();
  }, [cancelSetTimer]);

  return { timer, reading, add, startNow, stop, cancel };
}
