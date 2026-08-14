/**
 * Rest timer hook.
 *
 * The store holds an absolute deadline; this hook turns it into a ticking
 * number and owns the three things a gym timer must get right:
 *
 *  1. ACCURACY ACROSS SUSPENSION — remaining time is recomputed from
 *     `Date.now()` on every tick and again on every foreground transition, so a
 *     timer that ran while the screen was off is still correct when it wakes.
 *  2. IT MUST REACH THE USER WITH THE PHONE IN A POCKET — a local notification
 *     is scheduled for the deadline the moment rest starts, and cancelled if
 *     rest is skipped or adjusted. Haptics fire if the app is foregrounded.
 *  3. IT MUST NOT WAKE THE PHONE FOR NOTHING — the interval only exists while a
 *     timer is actually running, and ticks at 250 ms (not 16 ms): the display
 *     shows whole seconds, a render loop would just burn battery.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useActiveWorkout } from '../state/activeWorkoutStore';

const TICK_MS = 250;
const KEEP_AWAKE_TAG = 'rest-timer';

function remainingSeconds(endsAt: number | null): number {
  if (!endsAt) return 0;
  return Math.max(0, (endsAt - Date.now()) / 1000);
}

export interface RestTimerApi {
  /** Seconds left, already clamped at 0. Fractional — round at render time. */
  remaining: number;
  /** 0 → 1, for the progress ring. 1 when idle. */
  progress: number;
  isRunning: boolean;
  totalSeconds: number;
  add: (seconds: number) => void;
  skip: () => void;
  start: (seconds: number) => void;
}

export function useRestTimer(): RestTimerApi {
  const rest = useActiveWorkout((s) => s.rest);
  const adjustRest = useActiveWorkout((s) => s.adjustRest);
  const skipRest = useActiveWorkout((s) => s.skipRest);
  const startRest = useActiveWorkout((s) => s.startRest);

  const [remaining, setRemaining] = useState(() => remainingSeconds(rest.endsAt));
  /** Guards against firing the "rest over" feedback twice for one deadline. */
  const firedForDeadline = useRef<number | null>(null);
  const notificationId = useRef<string | null>(null);

  const isRunning = rest.endsAt != null && remaining > 0;

  /* --- tick ---------------------------------------------------------- */
  useEffect(() => {
    if (!rest.endsAt) {
      setRemaining(0);
      return;
    }

    setRemaining(remainingSeconds(rest.endsAt));

    const interval = setInterval(() => {
      const next = remainingSeconds(rest.endsAt);
      setRemaining(next);

      if (next <= 0 && firedForDeadline.current !== rest.endsAt) {
        firedForDeadline.current = rest.endsAt;
        // Success pattern, not a warning buzz: rest ending is a good thing.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        clearInterval(interval);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [rest.endsAt]);

  /* --- resync when returning from background ------------------------- */
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') setRemaining(remainingSeconds(rest.endsAt));
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [rest.endsAt]);

  /* --- background notification --------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    // Any change of deadline invalidates the pending notification.
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
      if (!rest.endsAt) return;

      const secondsAway = (rest.endsAt - Date.now()) / 1000;
      // Under ~2 s the notification would land after the user already saw zero.
      if (secondsAway < 2) return;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Rest over',
          body: 'Next set.',
          sound: true,
          interruptionLevel: 'timeSensitive', // iOS: pierces Focus modes
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: rest.endsAt },
      }).catch(() => null);

      if (!cancelled && id) notificationId.current = id;
    })();

    return () => {
      cancelled = true;
      void clearPending();
    };
  }, [rest.endsAt]);

  /* --- keep the screen on while resting ------------------------------ */
  useEffect(() => {
    if (isRunning) {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      // `deactivateKeepAwake` is async; a cleanup function must return void or a
      // destructor, never a Promise, so the result is discarded deliberately.
      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    return undefined;
  }, [isRunning]);

  /* --- api ----------------------------------------------------------- */
  const add = useCallback(
    (seconds: number) => {
      Haptics.selectionAsync().catch(() => {});
      adjustRest(seconds);
    },
    [adjustRest],
  );

  const skip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    skipRest();
  }, [skipRest]);

  const start = useCallback((seconds: number) => startRest(seconds, 'manual'), [startRest]);

  return {
    remaining,
    progress: rest.totalSeconds > 0 ? 1 - remaining / rest.totalSeconds : 1,
    isRunning,
    totalSeconds: rest.totalSeconds,
    add,
    skip,
    start,
  };
}
