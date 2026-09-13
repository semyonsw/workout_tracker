/**
 * Keep Android's notification queue matching the tasks.
 *
 * Mounted once, at the top of the app, beside `useAutoBackup` and for the same
 * reason it gives: launch is the only moment a sideloaded app can reliably run
 * anything, so the work that has to happen whether or not the user opens a
 * particular screen happens here.
 *
 * ── WHAT IT WATCHES, AND WHY IT IS EVERY INPUT ───────────────────────────
 *
 * The plan is a function of the tasks, the workout schedule and the language
 * (`lib/reminders.ts`), so all three are subscribed. Renaming a task has to
 * rewrite the alert that carries its name; turning a reminder off has to cancel
 * it; switching to English has to change what the phone says tomorrow morning.
 * Any of those being missed leaves the user looking at a setting that says one
 * thing while the phone does another — which is the failure that makes people
 * turn notifications off at the OS level and never turn them back on.
 *
 * ── AND WHY IT ALSO WATCHES THE FOREGROUND ───────────────────────────────
 *
 * Two things only the clock can change. A one-day task for tomorrow has to
 * become an armed alert once it is close enough, and a habit that begins on the
 * 1st has to pick up its weekly alerts once the 1st arrives — `planReminders`
 * deliberately emits nothing for either until then. Coming back to the app is
 * when that gets noticed, and it costs a dozen scheduling calls on a queue that
 * is usually unchanged.
 *
 * ── IT IS DEBOUNCED, BECAUSE TYPING A NAME IS TWENTY RENDERS ─────────────
 *
 * The task editor commits on Save, but renaming from the detail screen and
 * every other write into the store lands one state change at a time. Syncing on
 * each of them would be twenty cancel-and-reschedule passes across the bridge
 * for one edit. Half a second of quiet is the signal that the edit is over.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { planReminders } from '../lib/reminders';
import { syncReminders } from '../lib/notify';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';

/** Long enough to swallow a burst of edits, short enough to feel immediate. */
const DEBOUNCE_MS = 500;

export function useReminders(): void {
  const tasks = useTasks((s) => s.tasks);
  const language = useSettings((s) => s.language);
  const workoutReminderEnabled = useSettings((s) => s.workoutReminderEnabled);
  const workoutReminderDays = useSettings((s) => s.workoutReminderDays);
  const workoutReminderTime = useSettings((s) => s.workoutReminderTime);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void syncReminders(
        planReminders({
          tasks,
          workout: {
            enabled: workoutReminderEnabled,
            days: workoutReminderDays,
            time: workoutReminderTime,
          },
          lang: language,
          now: new Date(),
        }),
      );
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tasks, language, workoutReminderEnabled, workoutReminderDays, workoutReminderTime]);

  /*
   * Read from the stores rather than from the closure above: this fires whenever
   * the app comes back, which can be days later, and the values captured when
   * the subscription was set up are not the ones that should be scheduled.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const settings = useSettings.getState();
      void syncReminders(
        planReminders({
          tasks: useTasks.getState().tasks,
          workout: {
            enabled: settings.workoutReminderEnabled,
            days: settings.workoutReminderDays,
            time: settings.workoutReminderTime,
          },
          lang: settings.language,
          now: new Date(),
        }),
      );
    });
    return () => sub.remove();
  }, []);
}
