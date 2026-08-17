/**
 * Haptics and beeps behind the user's two switches.
 *
 * Every buzz and every tone in the app goes through here, for two reasons:
 * `Sound` and `Vibration` in Settings have to mean it everywhere (a switch that
 * silences four of five call sites is a bug report), and `expo-haptics` throws on
 * devices with no vibrator — which must never take a set down with it.
 *
 * The vocabulary is deliberately tiny, and each entry means one thing:
 *
 *   tap       a control acknowledged a press
 *   commit    a set was logged, or a clock started work
 *   success   a countdown reached zero — rest is over, or the bell rang
 *   countTick one second of a get-ready count
 */

import * as Haptics from 'expo-haptics';

import { playBeep } from './beeper';
import { useSettings } from '../state/settingsStore';

function hapticsOn(): boolean {
  return useSettings.getState().hapticsEnabled;
}

function soundOn(): boolean {
  return useSettings.getState().soundEnabled;
}

/** Light. A chip, a chevron, a start button — "I heard you". */
export function tap(): void {
  if (!hapticsOn()) return;
  Haptics.selectionAsync().catch(() => {});
}

/** Medium. A set logged, a clock going to work — the weight of a decision. */
export function commit(): void {
  if (!hapticsOn()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Light impact. An undo, a cancel — the same weight as `commit`, downward. */
export function undo(): void {
  if (!hapticsOn()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * A countdown hit zero. Success rather than warning: rest ending and a plank
 * finishing are both good news, and the app never buzzes at anyone in alarm.
 */
export function success(): void {
  if (!hapticsOn()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** One second of a count-in: a tick you can hear, and one you can feel. */
export function countTick(): void {
  if (soundOn()) playBeep('tick');
  if (hapticsOn()) Haptics.selectionAsync().catch(() => {});
}

/** Zero. The long tone plus the success pattern — "go", or "rest is over". */
export function countFinal(): void {
  if (soundOn()) playBeep('final');
  success();
}
