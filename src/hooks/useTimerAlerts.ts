/**
 * The two timers' cues for a phone in a pocket — mounted ONCE, in the shell.
 *
 * ── WHY THEY LEFT THE PILLS ───────────────────────────────────────────────
 *
 * These effects used to live inside `useRestTimer` and `useSetTimer`, which run
 * in the rest and set-timer pills on the session screen (and in focus mode). The
 * shell renders only the top of the navigation stack, so the moment anything was
 * pushed over the session — `Add an exercise`, an exercise's own editor — or the
 * user backed out to the home screen with a workout running, the pill unmounted
 * and its cleanup CANCELLED the scheduled alarms. Rest, tap `Add an exercise`,
 * pocket the phone: no "Rest over", ever. That is exactly the case the alarms
 * exist for.
 *
 * Everything they need is already outside any component — the deadline is in the
 * store, the switch and the language are settings — so they belong where the
 * session's other always-on pieces are: one instance, alive whenever the app is,
 * which also removes the "two live instances would double the alarms" hand-off the
 * pills and focus mode had to coordinate for this part.
 *
 * What stays in the pills is what is only meaningful ON SCREEN: the ticking
 * number, the in-app count-in and the keep-awake lock.
 */

import { useEffect, useRef } from 'react';

import { cancelTimerAlerts, scheduleTimerAlertPair } from '../lib/notify';
import { workEndsAt } from '../lib/setTimer';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { useLanguage, useT } from './useT';

export function useTimerAlerts(): void {
  const restEndsAt = useActiveWorkout((s) => s.rest.endsAt);
  const timer = useActiveWorkout((s) => s.setTimer);
  const notifyOnTimerEnd = useSettings((s) => s.notifyOnTimerEnd);
  const t = useT();
  const lang = useLanguage();

  const restIds = useRef<string[]>([]);
  const setIds = useRef<string[]>([]);

  /*
   * REST. Two alerts, not one: a tick five seconds out and the tone at zero. This
   * is the ONLY cue that reaches the user when the app is not on screen — a JS
   * interval playing a WAV does not survive Doze, a restricted battery setting or
   * a swipe-away, while a scheduled alarm does. See `lib/notify.ts`.
   *
   * Any change of deadline — including a pause or a skip, which clear it —
   * invalidates the pending pair.
   */
  useEffect(() => {
    let cancelled = false;
    const clearPending = async () => {
      const ids = restIds.current;
      restIds.current = [];
      await cancelTimerAlerts(ids);
    };

    void (async () => {
      await clearPending();
      if (!restEndsAt || !notifyOnTimerEnd) return;
      const ids = await scheduleTimerAlertPair({
        at: restEndsAt,
        getSetTitle: t('Get set'),
        getSetBody: t('Rest ends in 5 seconds.'),
        goTitle: t('Rest over'),
        goBody: t('Next set.'),
        lang,
      });
      if (cancelled) {
        await cancelTimerAlerts(ids);
        return;
      }
      restIds.current = ids;
    })();

    return () => {
      cancelled = true;
      void clearPending();
    };
  }, [lang, notifyOnTimerEnd, restEndsAt, t]);

  /*
   * THE SET TIMER'S BELL. A plank is the case that needs this most: the phone is
   * on the floor under you, the screen is off, and the interval that plays the
   * in-app count-in may not be running at all.
   *
   * `workSeconds` is in the dependency list via `timer` identity: every ±
   * replaces the object, which reschedules the bell.
   */
  useEffect(() => {
    let cancelled = false;
    const clearPending = async () => {
      const ids = setIds.current;
      setIds.current = [];
      await cancelTimerAlerts(ids);
    };

    void (async () => {
      await clearPending();
      if (!timer || !notifyOnTimerEnd) return;
      const endsAt = workEndsAt(timer);
      if (endsAt == null) return; // an open hold has no bell to ring
      const ids = await scheduleTimerAlertPair({
        at: endsAt,
        getSetTitle: t('Almost'),
        getSetBody: t('5 seconds left.'),
        goTitle: t('Time'),
        goBody: t('Set logged — rest.'),
        lang,
      });
      if (cancelled) {
        await cancelTimerAlerts(ids);
        return;
      }
      setIds.current = ids;
    })();

    return () => {
      cancelled = true;
      void clearPending();
    };
  }, [lang, notifyOnTimerEnd, t, timer]);
}
