/**
 * FloatingBubble — a section's hero, carried along at the top once it has
 * scrolled away.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ EXPENSES                                  ⟲  │  ← the bar
 *   │        ╭──────────────────────────────╮      │
 *   │        │ (💵 CASH 9,020)(💳 ONLINE …) │      │  ← the bubble, top + 68
 *   │        ╰──────────────────────────────╯      │
 *   │  ░░ category tiles scrolling under ░░        │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * Each section is ABOUT one thing — the workout you are going to do, how the day
 * is going, what you have — and that thing is the hero at the top. Scrolling the
 * list under it used to take it away entirely: a category grid read with no
 * balance on screen, a task list with no idea how much of the day was done. The
 * bubble is the hero at a tenth of the size, and it is the SAME object in all
 * three sections — one shell, one trigger, one animation; only the contents
 * differ. That sameness is what lets it be learned once.
 *
 * ── THE MOTION ────────────────────────────────────────────────────────────
 *
 *   in    opacity 320 ms (base), translateY −18 → 0 and scale 0.82 → 1 over
 *         620 ms on `bezier(.34,1.45,.64,1)` — it drops in and overshoots —
 *         and then its children follow one after another, 120/190/260 ms late.
 *   out   faster and without the overshoot: opacity 220 ms ease-in, transform
 *         back over 300 ms on `bezier(.4,0,.8,.4)`, and no stagger. Something
 *         leaving should not ask to be watched.
 *
 * The design's blur-in (6 → 0) has no React Native equivalent and is left out;
 * the rest is exactly the design's.
 *
 * ── THE GLASS ─────────────────────────────────────────────────────────────
 *
 * Its own recipe rather than a `glassTier`, because it is the one pane in the app
 * that floats over MOVING content with nothing but the page behind it: a tint of
 * `rgba(14,18,17,.52)`, a vertical sheen, a `BlurView` at 22, a top specular and
 * a dark inner bottom edge, and a soft radial highlight on the top half. The blur
 * is mounted only while the bubble is on screen, so it counts against the
 * three-per-screen budget (`glass.tsx`) only while it is actually there.
 *
 * `pointerEvents` is off while hidden, so an invisible bubble never eats a tap
 * meant for the row under it.
 */

import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { curve, motion, radius } from '../theme/tokens';
import { Pane, SpecularEdge } from './glass';

const EASE = curve(motion.ease);
const DROP = Easing.bezier(0.34, 1.45, 0.64, 1);
const FOLLOW = Easing.bezier(0.34, 1.4, 0.64, 1);
const LIFT = Easing.bezier(0.4, 0, 0.8, 0.4);
const EASE_IN = Easing.in(Easing.quad);

/** Under the 56 + 8 top bar, with 4 of air. */
export const BUBBLE_TOP = 68;

/** The green halo every bubble carries. The tasks one grows it with the day. */
const HALO = { offsetX: 0, offsetY: 0, blurRadius: 26, color: 'rgba(63,169,108,0.20)' };
const DROP_SHADOW = { offsetX: 0, offsetY: 14, blurRadius: 32, color: 'rgba(0,0,0,0.55)' };

export function FloatingBubble({
  visible,
  children,
  delays = [120, 190, 260],
  contentStyle,
  haloFraction,
  accessibilityLabel,
  underlay,
  onItemLayout,
}: {
  visible: boolean;
  /** Each child gets its own staggered entrance, in order. */
  children: ReactNode;
  /** When each child follows the capsule in, ms. */
  delays?: readonly number[];
  /** Padding and gap inside the capsule — each bubble's own. */
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * 0–1: grow the green halo with it — blur 14 → 36, alpha 0.14 → 0.48 — the
   * tasks bubble's "the fuller the day, the brighter". Absent = the fixed halo.
   */
  haloFraction?: number;
  accessibilityLabel?: string;
  /** Drawn inside the capsule, under the children — the balance bubble's thumb. */
  underlay?: ReactNode;
  /** Where each child landed inside the capsule, for an underlay that follows one. */
  onItemLayout?: (index: number, layout: { x: number; width: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const scale = useMotionScale();
  const items = Children.toArray(children);

  const fade = useRef(new Animated.Value(0)).current;
  const move = useRef(new Animated.Value(0)).current;
  const itemValues = useRef<Animated.Value[]>([]);
  while (itemValues.current.length < items.length) itemValues.current.push(new Animated.Value(0));

  /** The blur stays mounted through the exit, and goes once it has finished. */
  const [blurred, setBlurred] = useState(visible);

  useEffect(() => {
    if (visible) setBlurred(true);
    const values = itemValues.current;
    const animation = visible
      ? Animated.parallel([
          Animated.timing(fade, {
            toValue: 1,
            duration: 320 * scale,
            easing: EASE,
            useNativeDriver: true,
          }),
          Animated.timing(move, {
            toValue: 1,
            duration: 620 * scale,
            easing: DROP,
            useNativeDriver: true,
          }),
          ...values.map((value, index) =>
            Animated.timing(value, {
              toValue: 1,
              duration: 520 * scale,
              delay: (delays[index] ?? delays[delays.length - 1] ?? 0) * scale,
              easing: FOLLOW,
              useNativeDriver: true,
            }),
          ),
        ])
      : Animated.parallel([
          Animated.timing(fade, {
            toValue: 0,
            duration: 220 * scale,
            easing: EASE_IN,
            useNativeDriver: true,
          }),
          Animated.timing(move, {
            toValue: 0,
            duration: 300 * scale,
            easing: LIFT,
            useNativeDriver: true,
          }),
          ...values.map((value) =>
            Animated.timing(value, {
              toValue: 0,
              duration: 220 * scale,
              easing: EASE_IN,
              useNativeDriver: true,
            }),
          ),
        ]);
    animation.start(({ finished }) => {
      if (finished && !visible) setBlurred(false);
    });
    return () => animation.stop();
    // `delays` is a literal at every call site; the animation keys on `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scale, fade, move]);

  /* The halo, cross-faded between its two ends rather than recomputed: a
     `boxShadow` cannot animate, and two fixed ones at interpolated opacity can. */
  const grows = haloFraction != null;
  const halo = useRef(new Animated.Value(haloFraction ?? 0)).current;
  useEffect(() => {
    if (haloFraction == null) return;
    Animated.timing(halo, {
      toValue: Math.max(0, Math.min(1, haloFraction)),
      duration: motion.ring * scale,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [halo, haloFraction, scale]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + BUBBLE_TOP,
        left: 0,
        right: 0,
        alignItems: 'center',
        // Over the scroll, under the top bar (`SectionTopBar` is 10): the drop
        // starts 18 dp up, and it should come out from under the glass.
        zIndex: 9,
      }}
    >
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        accessibilityLabel={accessibilityLabel}
        style={{
          opacity: fade,
          transformOrigin: 'top',
          transform: [
            { translateY: move.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
            { scale: move.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
          ],
        }}
      >
        {grows ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                HALO_LAYER,
                {
                  opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  boxShadow: [{ ...HALO, blurRadius: 14, color: 'rgba(63,169,108,0.14)' }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                HALO_LAYER,
                {
                  opacity: halo,
                  boxShadow: [{ ...HALO, blurRadius: 36, color: 'rgba(63,169,108,0.48)' }],
                },
              ]}
            />
          </>
        ) : null}
        <View
          style={{
            borderRadius: radius.pill,
            boxShadow: grows ? [DROP_SHADOW] : [DROP_SHADOW, HALO],
          }}
        >
          <View
            style={[
              {
                borderRadius: radius.pill,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(236,241,238,0.13)',
                flexDirection: 'row',
                alignItems: 'center',
                padding: 5,
              },
              contentStyle,
            ]}
          >
            {blurred ? <Pane intensity={22} /> : null}
            <View pointerEvents="none" style={[FILL, { backgroundColor: 'rgba(14,18,17,0.52)' }]} />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(236,241,238,0.11)', 'rgba(236,241,238,0.03)']}
              style={FILL}
            />
            <Highlight />
            <SpecularEdge color="rgba(236,241,238,0.24)" radius={radius.pill} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 1,
                backgroundColor: 'rgba(0,0,0,0.35)',
                borderBottomLeftRadius: radius.pill,
                borderBottomRightRadius: radius.pill,
              }}
            />
            {underlay}
            {items.map((child, index) => {
              const value = itemValues.current[index];
              return (
                <Animated.View
                  key={index}
                  onLayout={
                    onItemLayout
                      ? (e) =>
                          onItemLayout(index, {
                            x: e.nativeEvent.layout.x,
                            width: e.nativeEvent.layout.width,
                          })
                      : undefined
                  }
                  style={{
                    opacity: value,
                    transform: [
                      {
                        translateY: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-8, 0],
                        }),
                      },
                    ],
                  }}
                >
                  {child}
                </Animated.View>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const HALO_LAYER = { ...FILL, borderRadius: radius.pill } as const;

/**
 * The soft radial on the top 55%, inset a tenth from each side: where light from
 * above would pool on a curved pane. SVG because `expo-linear-gradient` cannot do
 * a radial, the same reason `Lamps` is SVG.
 */
function Highlight() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: '10%', right: '10%', top: 0, height: '55%' }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="bubbleHighlight" cx="50%" cy="0%" rx="50%" ry="100%">
            <Stop offset="0%" stopColor="#ECF1EE" stopOpacity={0.16} />
            <Stop offset="70%" stopColor="#ECF1EE" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="0" rx="50" ry="100" fill="url(#bubbleHighlight)" />
      </Svg>
    </View>
  );
}

/**
 * The hero, stepping back while its bubble is up: opacity 1 → 0.35 and scale
 * 1 → 0.96 from its top edge. It is already under the bar by then; this only
 * stops it competing with the bubble through the glass. Put the style on an
 * `Animated.View` around the hero.
 */
export function useHeroRecede(receded: boolean) {
  const scale = useMotionScale();
  const fade = useRef(new Animated.Value(receded ? 1 : 0)).current;
  const shrink = useRef(new Animated.Value(receded ? 1 : 0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: receded ? 1 : 0,
        duration: 420 * scale,
        easing: EASE,
        useNativeDriver: true,
      }),
      Animated.timing(shrink, {
        toValue: receded ? 1 : 0,
        duration: 520 * scale,
        easing: EASE,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, receded, scale, shrink]);
  return {
    opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
    transformOrigin: 'top' as const,
    transform: [{ scale: shrink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
  };
}
