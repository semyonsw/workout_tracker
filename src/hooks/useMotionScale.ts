/**
 * How much motion this phone wants: 1 normally, 0 with Android's "Remove
 * animations" on. Every duration in the motion pass is multiplied by it.
 *
 * ── ONE SUBSCRIPTION FOR THE WHOLE APP ────────────────────────────────────
 *
 * The obvious version — each component asks `AccessibilityInfo` on mount and
 * listens for changes — is forty native calls and forty listeners on a session
 * screen of rolling digits, and every one of them starts at "motion on" for a
 * frame before the answer arrives, which is exactly one frame of the animation
 * the user asked not to see. So the answer lives at module scope, is asked for
 * once, and every hook reads the same value through `useSyncExternalStore`.
 *
 * ── WHY ZERO AND NOT "SHORTER" ────────────────────────────────────────────
 *
 * Somebody who turns animations off is not asking for faster ones. A duration
 * of 0 lands `Animated.timing` on its end value in the same frame, so every
 * helper still reaches the state it would have reached — the ✓ is there, the
 * thumb is on the right tab — without anything moving to get there. The two
 * loops that would otherwise run forever (the marquee, the breathing halos)
 * check for zero and do not start at all.
 */

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduceMotion = false;
let asked = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  if (next === reduceMotion) return;
  reduceMotion = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!asked) {
    asked = true;
    /* Wrapped: an accessibility query that throws on some ROM must not take a
       rolling digit down with it. Motion stays on, which is the default. */
    try {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then(publish)
        .catch(() => {});
      AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
    } catch {
      // Nothing to do: the app animates, as it did before this hook existed.
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The scale, outside React — for the few call sites that compute a duration in a callback. */
export function getMotionScale(): number {
  return reduceMotion ? 0 : 1;
}

/** 1 normally; 0 when "Remove animations" is on. Multiply durations by it. */
export function useMotionScale(): number {
  const reduce = useSyncExternalStore(subscribe, () => reduceMotion);
  return reduce ? 0 : 1;
}
