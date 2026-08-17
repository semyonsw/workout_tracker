/**
 * Timer notifications — the alert for a phone that is not in the user's hand.
 *
 * Everything about `expo-notifications` in this app goes through here, because
 * every call into it is a call that can fail in a way that must not matter:
 *
 *  • ANDROID NEEDS A CHANNEL. Without one, a scheduled notification on Android 8+
 *    is posted to a default channel the user has never seen and cannot tune, and
 *    on some OEM builds it is dropped silently. The channel is created once, with
 *    sound and vibration on, so "rest is over" can actually wake someone.
 *  • SCHEDULING CAN THROW SYNCHRONOUSLY. `scheduleNotificationAsync` validates
 *    its trigger before it returns a promise, so `.catch()` alone does not cover
 *    a bad date — the throw escapes the promise chain entirely. Everything here
 *    is inside `try`, not just `.catch`.
 *  • EXACT ALARMS ARE A PERMISSION. On Android 12+ a date-triggered notification
 *    wants `SCHEDULE_EXACT_ALARM`, which the user can revoke. A `SecurityException`
 *    coming back through the bridge is not a reason to lose a workout, so the
 *    failure is swallowed and the on-screen countdown remains the source of truth.
 *
 * The notification is a BACKUP, never the mechanism. The pill is always right
 * because it derives from a stored deadline; this file only tries to make the
 * phone speak up when nobody is looking at the pill.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const TIMER_CHANNEL_ID = 'timers';

let channelReady = false;

/** Create the Android timer channel once. No-op elsewhere, and never throws. */
export async function ensureTimerChannel(): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  channelReady = true;
  try {
    await Notifications.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
      name: 'Timers',
      description: 'Rest timers and timed sets.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 220, 120, 220],
      enableVibrate: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    channelReady = false; // let a later call try again
  }
}

/** Ask for permission. Silent on refusal — the app works fine without it. */
export async function requestNotificationPermission(): Promise<void> {
  try {
    await Notifications.requestPermissionsAsync();
  } catch {
    // Nothing to do: the countdown on screen is unaffected.
  }
}

export interface TimerAlert {
  title: string;
  body: string;
  /** Epoch ms the alert should fire. */
  at: number;
}

/**
 * Schedule one alert, returning its id or null.
 *
 * Anything under two seconds away is refused: the notification would land after
 * the user had already watched the pill hit zero, and a duplicate alert for an
 * event they just saw reads as a bug.
 */
export async function scheduleTimerAlert(alert: TimerAlert): Promise<string | null> {
  if (!Number.isFinite(alert.at) || (alert.at - Date.now()) / 1000 < 2) return null;

  try {
    await ensureTimerChannel();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body: alert.body,
        sound: true,
        interruptionLevel: 'timeSensitive', // iOS: pierces Focus modes
        ...(Platform.OS === 'android' ? { channelId: TIMER_CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(alert.at),
        ...(Platform.OS === 'android' ? { channelId: TIMER_CHANNEL_ID } : {}),
      },
    });
  } catch {
    return null;
  }
}

/** Cancel a scheduled alert. Safe with a stale id, a null, or no permission. */
export async function cancelTimerAlert(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired, already cancelled, or the module is unavailable.
  }
}
