/**
 * Timer notifications — the cue for a phone that is not in the user's hand.
 *
 *   rest 2:00 ───────────────────────────► 0:05 ────────► 0:00
 *   in the app:                            tick tick …    long tone
 *   in a pocket:                           "Get set" ⏰    "Next set" ⏰
 *
 * ── WHY THIS IS THE MECHANISM WHEN THE APP IS NOT IN FRONT ─────────────────
 *
 * The in-app count-in is a JS `setInterval` playing a WAV. That is fine while the
 * app is on screen and unreliable the moment it isn't: Android throttles timers in
 * the background, Doze suspends them, "Restricted" battery usage and Samsung's
 * "Sleeping apps" list stop them outright, and a swipe-away kills the process
 * entirely. No amount of audio-session configuration fixes a beep that is never
 * reached. So the out-of-app cue is a SCHEDULED NOTIFICATION, which is the one
 * thing Android guarantees to deliver at a wall-clock instant — the alarm path,
 * not the app's.
 *
 * Two of them per timer, because "it's time" a beat too late is not a cue:
 *
 *   • `getset`  — a few seconds before the deadline, carrying the TICK tone.
 *   • `go`      — at the deadline, carrying the LONG tone.
 *
 * ── AND WHY THE CHANNELS CARRY THE APP'S OWN TONES ─────────────────────────
 *
 * On Android 8+ the SOUND BELONGS TO THE CHANNEL, not to the notification: a
 * per-notification sound is ignored. So there is one channel per tone, and each is
 * created with the same WAV the in-app cue plays (shipped into `res/raw` by the
 * `expo-notifications` config plugin — see `sounds` in `app.json`). The result is
 * that "rest is over" sounds identical whether the app is open or in a pocket.
 *
 * A channel's sound and importance are FROZEN once Android has seen it: updating a
 * channel silently keeps the old settings. That is why these ids are versioned —
 * changing a tone means a new id, and the old channel is deleted so it does not
 * linger in the system UI.
 *
 * Everything here can fail and none of it may throw:
 *  • SCHEDULING CAN THROW SYNCHRONOUSLY. `scheduleNotificationAsync` validates its
 *    trigger before returning a promise, so `.catch()` alone does not cover a bad
 *    date — the throw escapes the promise chain. Everything is inside `try`.
 *  • EXACT ALARMS ARE A PERMISSION. `USE_EXACT_ALARM` (declared in `app.json`) is
 *    granted at install on Android 13+ and cannot be revoked, which is what makes
 *    these land on time; on older phones `SCHEDULE_EXACT_ALARM` can be refused and
 *    a `SecurityException` comes back through the bridge. Swallowed: the on-screen
 *    countdown remains the source of truth.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** Bumped when a channel's SOUND or IMPORTANCE changes — Android freezes both. */
const CHANNEL_VERSION = 2;

/** The long tone: rest is over, the bell rang, go. */
export const CHANNEL_GO = `timer-go-v${CHANNEL_VERSION}`;
/** The tick: the last seconds before a deadline. */
export const CHANNEL_GETSET = `timer-getset-v${CHANNEL_VERSION}`;

/** Channels from earlier versions, deleted so the system UI stays honest. */
const RETIRED_CHANNELS = ['timers', 'timer-go-v1', 'timer-getset-v1'];

/**
 * How many seconds before a deadline the "get set" alert fires.
 *
 * Not the user's `beepSeconds`: that number is how long the in-app count-in TICKS,
 * and it can be 20. One advance notification is a warning, twenty would be a
 * denial-of-service on their own notification shade — so the alert is a single
 * beat, five seconds out, which is one deep breath and a re-grip.
 */
export const GETSET_LEAD_SECONDS = 5;

let channelsReady = false;

/**
 * Create the two Android channels once, and clear out retired ones.
 *
 * No-op elsewhere, and never throws. Safe to call on every launch; safe never to
 * be called at all, in which case Android posts to a default channel with a
 * default sound.
 */
export async function ensureTimerChannels(): Promise<void> {
  if (channelsReady || Platform.OS !== 'android') return;
  channelsReady = true;
  try {
    for (const id of RETIRED_CHANNELS) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    }

    await Notifications.setNotificationChannelAsync(CHANNEL_GO, {
      name: 'Timer finished',
      description: 'Rest is over, or a timed set rang its bell.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'beep_final.wav',
      vibrationPattern: [0, 220, 120, 220],
      enableVibrate: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(CHANNEL_GETSET, {
      name: 'Get set',
      description: `A tick ${GETSET_LEAD_SECONDS} seconds before a timer ends.`,
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'beep_tick.wav',
      vibrationPattern: [0, 120],
      enableVibrate: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    channelsReady = false; // let a later call try again
  }
}

/** Ask for permission. Silent on refusal — the app works fine without it. */
export async function requestNotificationPermission(): Promise<void> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return;
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
  /** Which tone. `go` is the long one; `getset` is the tick. */
  kind?: 'go' | 'getset';
}

/**
 * Schedule one alert, returning its id or null.
 *
 * Anything under a second away is refused: the notification would land after the
 * user had already watched the pill hit zero, and a duplicate alert for an event
 * they just saw reads as a bug.
 */
export async function scheduleTimerAlert(alert: TimerAlert): Promise<string | null> {
  if (!Number.isFinite(alert.at) || alert.at - Date.now() < 1000) return null;

  const channelId = alert.kind === 'getset' ? CHANNEL_GETSET : CHANNEL_GO;

  try {
    await ensureTimerChannels();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.title,
        body: alert.body,
        // Android ignores this in favour of the channel's sound; iOS uses it.
        sound: alert.kind === 'getset' ? 'beep_tick.wav' : 'beep_final.wav',
        interruptionLevel: 'timeSensitive', // iOS: pierces Focus modes
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(alert.at),
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
    });
  } catch {
    return null;
  }
}

/**
 * Schedule the pair for one deadline: the tick a few seconds out, then the tone.
 *
 * Returns every id that was actually scheduled, for the caller to cancel later.
 * The "get set" alert is skipped when the timer is already inside its lead — a
 * `+15` pressed at 0:02, or a rest shorter than the lead itself.
 */
export async function scheduleTimerAlertPair(params: {
  at: number;
  /** "Rest over" / "Time" — the headline at the deadline. */
  goTitle: string;
  goBody: string;
  /** "Get set" — the headline for the advance tick. */
  getSetTitle: string;
  getSetBody: string;
}): Promise<string[]> {
  const ids: string[] = [];

  const getSetId = await scheduleTimerAlert({
    title: params.getSetTitle,
    body: params.getSetBody,
    at: params.at - GETSET_LEAD_SECONDS * 1000,
    kind: 'getset',
  });
  if (getSetId) ids.push(getSetId);

  const goId = await scheduleTimerAlert({
    title: params.goTitle,
    body: params.goBody,
    at: params.at,
    kind: 'go',
  });
  if (goId) ids.push(goId);

  return ids;
}

/** Cancel scheduled alerts. Safe with stale ids, nulls, or no permission. */
export async function cancelTimerAlerts(ids: readonly (string | null)[]): Promise<void> {
  for (const id of ids) {
    if (!id) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired, already cancelled, or the module is unavailable.
    }
  }
}
