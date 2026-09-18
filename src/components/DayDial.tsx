/**
 * DayDial — the day, the fraction of it that is answered, and the light the two
 * of them throw.
 *
 *          ╭───────────╮
 *        ╱               ╲        the ring re-fills over 760 ms when a mark
 *       │      14         │       changes, and the halo behind it brightens
 *       │   SEP 2026      │       with it — 18% at nothing done, 46% at all
 *        ╲               ╱
 *          ╰───────────╯
 *
 * ── WHY IT IS NOT `ProgressRing` WITH A BIGGER `size` ─────────────────────
 *
 * `ProgressRing` draws a static arc, and it is right to: a category tile's share
 * of a month has nothing to animate, and six of them arriving at once want to be
 * cheap. This one is the hero of its screen and it has two things that one does
 * not — the arc TRAVELS to its new value, and the halo behind it is a function
 * of that value rather than a constant. Both are per-frame work, and putting
 * them behind a prop on the shared ring would make every tile pay for a
 * capability only the dial uses.
 *
 * ── AND WHY IT IS `Animated` RATHER THAN REANIMATED ───────────────────────
 *
 * The design asks for Reanimated, and the dependency is installed. Every other
 * animation in this app — the tab dot, the panel entrance, the press bubbles,
 * focus mode's whole sheet — is React Native's own `Animated`, and one file
 * reaching for a second animation runtime to move one number would be a second
 * thing to keep in sync for a difference nobody can see. `strokeDashoffset` is
 * not a native-driver property in either library (it is an SVG prop, not a
 * transform), so the thread it runs on is the same thread either way, and this
 * is one value changing over 760 ms on a screen whose list is idle.
 *
 * ── THE HALO IS THE REWARD ────────────────────────────────────────────────
 *
 * It is the only thing on the tasks screen that says "the day went well" without
 * a number. It carries no information the ring does not, which is the condition
 * on which it is allowed to exist — but it is what makes answering the last task
 * feel like something rather than like the ring reaching the top.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { palette } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The app's one curve, and the 760 ms the design gives a ring re-fill. */
const DAY_DIAL_MS = 760;
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

export function DayDial({
  fraction,
  size = 196,
  stroke = 10,
  children,
}: {
  /** 0–1. A day that asked for nothing is 1 — see `dayProgress`. */
  fraction: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;

  /* On a ref, so a parent re-render — a clock tick, a row being dragged — cannot
     restart the travel. Only the value changing does. */
  const progress = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: clamped,
      duration: DAY_DIAL_MS,
      easing: EASING,
      useNativeDriver: false,
    }).start();
  }, [clamped, progress]);

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Halo size={size - stroke * 2} fraction={clamped} />
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Twelve o'clock, so a ring that is a third full is a third of the way
        // round from the top and not from three o'clock.
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={palette.greenDim}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={offset}
        />
      </Svg>
      {children}
    </View>
  );
}

/**
 * The bloom behind the ring. Its own component so the alpha arithmetic is in one
 * place and the dial itself stays about the arc.
 *
 * A `boxShadow` on a circle rather than an SVG blur filter: a filter over a
 * 200 dp shape is an offscreen render target Android re-rasterises every time
 * the value changes, and this is the same light for nothing.
 */
function Halo({ size, fraction }: { size: number; fraction: number }) {
  const alpha = (0.18 + fraction * 0.28).toFixed(3);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: 9999,
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 60, color: `rgba(63,169,108,${alpha})` }],
      }}
    />
  );
}
