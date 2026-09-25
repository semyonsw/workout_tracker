/**
 * RunningText — a one-line label that never resizes the control it is in.
 *
 *   ┌──────────────────────────────┐
 *   │ ▶ Open Pull + swimming (te░  │   ← still, then…
 *   │ ▶ imming (tension on back)   │   ← …slid left to show the end, and back
 *   └──────────────────────────────┘
 *
 * If it fits, it renders still and is indistinguishable from a plain `Text`. If
 * it overflows, it holds for 1.2 s, then loops: hold, ease left until the end of
 * the string clears the right-edge fade, hold, ease back. The timings and the
 * travel are `lib/marquee.ts`, where they are tested.
 *
 * ── WHY NOT AN ELLIPSIS, AND WHY NOT LET THE BUTTON GROW ──────────────────
 *
 * The two answers the app had. `Pull + swimming (tension on back)` and `Pull +
 * swimming (tension on legs)` are the same name up to the part an ellipsis hides,
 * and a floating action that grows to fit its routine is a target that moves under
 * the thumb every time the routine changes. The box is the constant; the text is
 * what gives way.
 *
 * ── THE INVISIBLE COPY ────────────────────────────────────────────────────
 *
 * `numberOfLines={1}` CLIPS the text, so its `onLayout` reports the clipped width
 * rather than the natural one — which is the one number this component needs. So
 * the same `Text`, with the same style and class, is rendered a second time inside
 * an absolutely positioned, very wide, fully transparent box, and that copy's
 * width is the truth.
 *
 * ── IT NEVER TAKES A TOUCH ────────────────────────────────────────────────
 *
 * `pointerEvents="none"` throughout, and the motion is an animation and never a
 * scroll view: the parent `Pressable` keeps the tap, and `SwipePager` keeps every
 * horizontal drag — a marquee that claimed a sideways gesture would turn every
 * long routine name into a place where swiping between sections stops working.
 *
 * ── THE FADE ──────────────────────────────────────────────────────────────
 *
 * An 18 dp `expo-linear-gradient` from transparent to the colour directly behind
 * the text — a mask would be the honest tool, but `@react-native-masked-view` is
 * not in this build and one fade is not worth a native module. So the caller says
 * what is behind it: `#1A6B42` on the commit gradient (its end colour), `#121615`
 * on card glass (the tint composited over the page), `#0E1211` on the bars. It is
 * drawn whenever the text overflows, including with reduced motion on, because it
 * is also the only sign that there is more to read.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useMotionScale } from '../hooks/useMotionScale';
import {
  MARQUEE_DELAY_MS,
  MARQUEE_FADE,
  MARQUEE_PX_PER_SECOND,
  marqueePhases,
  marqueeTravel,
} from '../lib/marquee';
import { curve, motion } from '../theme/tokens';

const EASE = curve(motion.ease);

/** Fade colours for the three surfaces running text sits on. See the file header. */
export const FADE_ON = {
  gradient: '#1A6B42',
  card: '#121615',
  bar: '#0E1211',
  page: '#060807',
  lit: '#0F1A15',
} as const;

export function RunningText({
  text,
  style,
  className,
  fadeColor,
  containerStyle,
  pxPerSecond = MARQUEE_PX_PER_SECOND,
  delayMs = MARQUEE_DELAY_MS,
  allowFontScaling,
  accessibilityLabel,
}: {
  text: string;
  /** The `Text` style. Both copies get it, so they measure the same. */
  style?: StyleProp<TextStyle>;
  className?: string;
  /**
   * The colour directly behind the text, as `#RRGGBB`, so the fade blends into
   * it. See `FADE_ON`.
   */
  fadeColor: string;
  /** The box — usually `flex: 1` or a fixed width, from the row it sits in. */
  containerStyle?: StyleProp<ViewStyle>;
  pxPerSecond?: number;
  delayMs?: number;
  allowFontScaling?: boolean;
  /** Defaults to the full string, which is the point: a reader gets all of it. */
  accessibilityLabel?: string;
}) {
  const motionScale = useMotionScale();
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const travel = marqueeTravel(textWidth, boxWidth);

  /*
   * The loop. Restarted from 0 whenever the string or either width changes, and
   * stopped on unmount — a label that kept sliding under a screen that has left
   * would be an animation nobody can see, costing frames on the one that can.
   */
  useEffect(() => {
    x.setValue(0);
    if (travel === 0 || motionScale === 0) return undefined;
    const phases = marqueePhases(travel, pxPerSecond);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(phases.holdStartMs),
        Animated.timing(x, {
          toValue: -travel,
          duration: phases.outMs,
          easing: EASE,
          useNativeDriver: true,
        }),
        Animated.delay(phases.holdEndMs),
        Animated.timing(x, {
          toValue: 0,
          duration: phases.backMs,
          easing: EASE,
          useNativeDriver: true,
        }),
        Animated.delay(phases.restMs),
      ]),
    );
    const start = setTimeout(() => loop.start(), delayMs);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [delayMs, motionScale, pxPerSecond, text, travel, x]);

  const onBox = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - boxWidth) > 0.5) setBoxWidth(width);
  };
  const onText = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - textWidth) > 0.5) setTextWidth(width);
  };

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? text}
      onLayout={onBox}
      pointerEvents="none"
      style={[{ overflow: 'hidden', minWidth: 0, flexShrink: 1 }, containerStyle]}
    >
      {/* The measuring copy — natural width, never clipped, never seen. */}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 }}
      >
        <View style={{ alignSelf: 'flex-start' }} onLayout={onText}>
          <Text style={style} className={className} allowFontScaling={allowFontScaling}>
            {text}
          </Text>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={{
          flexDirection: 'row',
          transform: [{ translateX: x }],
          // Wide enough to hold the whole string on one line while it slides.
          width: travel > 0 ? textWidth + MARQUEE_FADE : undefined,
        }}
      >
        <Text
          style={style}
          className={className}
          allowFontScaling={allowFontScaling}
          numberOfLines={1}
          ellipsizeMode={travel > 0 ? 'clip' : 'tail'}
        >
          {text}
        </Text>
      </Animated.View>

      {travel > 0 ? (
        <LinearGradient
          pointerEvents="none"
          colors={[`${fadeColor}00`, fadeColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: MARQUEE_FADE }}
        />
      ) : null}
    </View>
  );
}
