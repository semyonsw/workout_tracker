/**
 * SparkBurst — fourteen dots leaving the day dial when the day closes.
 *
 *              ·       ·
 *          ·     ╭───╮     ·
 *        ·       │ ✓ │       ·
 *          ·     ╰───╯     ·
 *              ·       ·
 *
 * Fires ONCE, when the last unanswered task of a day is answered and at least
 * one of them was actually done. Not on every ✓ — a reward that happens eight
 * times a day is a reward that means nothing by Thursday — and not on a day
 * closed entirely by `on purpose`, because nothing was achieved and saying
 * otherwise is the one thing a habit tracker must never do.
 *
 * ── IT IS THE ONE ANIMATION IN THE APP THAT IS PURELY DECORATIVE ──────────
 *
 * Which is exactly why it is `pointerEvents="none"`, unmounts itself through the
 * caller's own timeout, and reads nothing from any store. A build that deleted
 * this file would lose a second of confetti and not one fact — the same test
 * `SectionGlow` had to pass before the lamps were allowed to exist.
 *
 * Dot `i` travels to `(cos(i/14 · 2π)·r, sin(...)·r)` where `r = 64 + (i·37 mod
 * 40)` — the modulus is what stops fourteen dots landing on one clean circle and
 * reading as a loading spinner. It scales 0.4 → 1 → 0.2 and fades out over
 * 900 ms, staggered 18 ms apiece.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

const COUNT = 14;
const DURATION = 900;
const STAGGER = 18;
/** `.2,.7,.3,1` — the base curve, slightly less eager at the end. */
const EASING = Easing.bezier(0.2, 0.7, 0.3, 1);

export function SparkBurst({ y = 170 }: { y?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: y, alignItems: 'center' }}
    >
      {Array.from({ length: COUNT }, (_, i) => (
        <Spark key={i} index={i} />
      ))}
    </View>
  );
}

function Spark({ index }: { index: number }) {
  const run = useRef(new Animated.Value(0)).current;
  const angle = (index / COUNT) * Math.PI * 2;
  const distance = 64 + ((index * 37) % 40);
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;

  useEffect(() => {
    Animated.timing(run, {
      toValue: 1,
      duration: DURATION,
      delay: index * STAGGER,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [index, run]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        height: 6,
        width: 6,
        borderRadius: 9999,
        backgroundColor: '#3FA96C',
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: 'rgba(63,169,108,0.9)' }],
        opacity: run.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateX: run.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: run.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: run.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.4, 1, 0.2] }) },
        ],
      }}
    />
  );
}

/** How long a caller must keep it mounted. The last dot's delay plus its run. */
export const SPARK_MS = DURATION + COUNT * STAGGER;
