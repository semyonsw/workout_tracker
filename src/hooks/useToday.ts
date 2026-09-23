/**
 * Today's `YYYY-MM-DD`, as STATE — so a component re-renders when it changes.
 *
 * `dayKey(new Date())` inline is only as fresh as the last render, and the shell
 * does not re-render on its own: left open overnight (Android keeps the process
 * alive for a phone that sleeps with the app up), the tasks section went on
 * saying `Today` over yesterday's list, and the first circle ticked in the
 * morning was filed on yesterday.
 *
 * Two triggers, and both are needed: a timer to the next local midnight for the
 * app that is on screen when the date turns, and the foreground transition for
 * the far commoner case of a phone that slept through it — timers do not run in
 * a suspended process, so the timer alone would fire late or not at all. Setting
 * the same key again is free: React skips a render for an unchanged value.
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dayKey } from '../lib/days';

/** Milliseconds from `now` to the next local midnight, plus a second of margin. */
function msToMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime() + 1000;
}

export function useToday(): string {
  const [today, setToday] = useState(() => dayKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      const now = new Date();
      setToday(dayKey(now));
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, msToMidnight(now));
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
