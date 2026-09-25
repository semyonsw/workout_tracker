/**
 * Motion — the app's shared entrance and press feedback, so five screens don't
 * each invent their own timing.
 *
 *   PanelEnter    a tab root arriving — fade + rise 10dp, 300ms. Keyed by the
 *                 caller (`AppShell` keys it on the active tab), so switching
 *                 tabs remounts it and the entrance replays.
 *   Reveal        a disclosure opening — fade + rise 6dp, 220ms. For content
 *                 that was not there a moment ago: an expanded library group, a
 *                 workout's detail, a set's history.
 *   pressedStyle  a `Pressable`'s `style` prop — dim plus a hair of scale on
 *                 contact, the same feedback `FocusRest`'s rest controls already
 *                 give, now everywhere a row or button in the app is tappable.
 *
 * The curve is `FocusMode.tsx`'s `EASING` — the app already shipped one bezier
 * for "something arriving", and a second one here would be a second thing to
 * keep in sync for no reason anybody could see on screen.
 *
 * Both entrances animate once, on mount, and never again: they read `Animated
 * .Value` off a ref rather than state, so a parent re-render (a set logged
 * elsewhere, a clock ticking) cannot replay them. An entrance that replays on
 * every unrelated render is a flicker, not an arrival.
 *
 * ── THE MOTION PASS ADDED SIX MORE, AND ONE RULE FOR ALL OF THEM ──────────
 *
 *   Pop           scale 0 → 1 on the overshoot curve: a ✓, the Done pill, an
 *                 edit-mode `−`. Something CAUGHT.
 *   Stagger       Reveal with a delay, for lists that arrive one after another.
 *   Flash         a logged set's green wash, 0.30 → 0.
 *   Ripple        focus mode's DONE ring leaving the button.
 *   SecondPulse   the final ten seconds, once per second.
 *   GrowIn        a row arriving by opening its own height, or leaving by
 *                 closing it — `Add set`, `Warm-up`, Undo, and the `−`.
 *   usePressScale the sink under a finger, released on the overshoot curve.
 *
 * Every duration comes from `motion` in `theme/tokens.ts` and is multiplied by
 * `useMotionScale()`, so with "Remove animations" on each of these renders its
 * END STATE on the first frame. None of them owns a fact: the store is written
 * first and the animation follows it, so a slow frame can never delay a commit.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useMotionScale } from '../hooks/useMotionScale';
import { curve, motion, palette } from '../theme/tokens';

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = curve(motion.ease);
const POP = curve(motion.pop);

function useEnter(duration: number, riseFrom: number, delay = 0) {
  const scale = useMotionScale();
  const enter = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: duration * scale,
      delay: delay * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // Mount only — see the file header on why an entrance never replays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);

  return {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [riseFrom, 0] }) },
    ],
  };
}

export function PanelEnter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const enterStyle = useEnter(300, 10);
  return <Animated.View style={[style, enterStyle]}>{children}</Animated.View>;
}

export function Reveal({ children }: { children: ReactNode }) {
  const enterStyle = useEnter(220, -6);
  return <Animated.View style={enterStyle}>{children}</Animated.View>;
}

/**
 * The session arriving: from the right, 24 dp and a fade, over 360 ms. A workout
 * is pushed rather than switched to, and a push travels sideways.
 */
export function SlideIn({ children }: { children: ReactNode }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 360 * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Function form, not a plain object, because `Pressable` only exposes `pressed`
 * through its `style` callback.
 */
export function pressedStyle({ pressed }: { pressed: boolean }): ViewStyle | undefined {
  return pressed ? { opacity: 0.62, transform: [{ scale: 0.994 }] } : undefined;
}

/* ------------------------------------------------------------------ */
/* The motion pass                                                     */
/* ------------------------------------------------------------------ */

/**
 * Scale 0 → 1 on the overshoot curve, on mount. The overshoot is the point: at
 * `pop` a mark swells past its size by about a fifth and settles, which is what
 * reads as "caught" rather than "appeared".
 */
export function Pop({
  children,
  duration = 320,
  style,
}: {
  children: ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: duration * scale,
      easing: POP,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}

/**
 * Fade and rise after a delay — `Reveal`, for a list. Routine rows stagger by 70,
 * category tiles by 40: the list arrives in reading order instead of as a slab.
 */
export function Stagger({
  children,
  delay = 0,
  rise = 10,
  duration = 380,
  style,
}: {
  children: ReactNode;
  delay?: number;
  rise?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const enterStyle = useEnter(duration, rise, delay);
  return <Animated.View style={[style, enterStyle]}>{children}</Animated.View>;
}

/**
 * A logged set's flash: a green wash over the row, 0.30 → 0 over `motion.flash`.
 * Mounted with a fresh key per ✓ so every log replays it. It takes no touches.
 */
export function Flash({ radius = 0 }: { radius?: number }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(scale === 0 ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 0,
      duration: motion.flash * scale,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius,
        backgroundColor: 'rgba(63,169,108,0.30)',
        opacity: v,
      }}
    />
  );
}

/**
 * Focus mode's DONE ripple: a 3 dp ring that grows 1 → 1.9 while it fades
 * 0.7 → 0. Mount it with a fresh key per press. Nothing at all with reduced
 * motion — a ring frozen at its end state is an invisible ring anyway.
 */
export function Ripple({ size }: { size: number }) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return;
    Animated.timing(v, {
      toValue: 1,
      duration: motion.ripple * scale,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [scale, v]);
  if (scale === 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: palette.greenBright,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
      }}
    />
  );
}

/**
 * The final ten seconds: scale 1 → 1.03 → 1 once per second while `active`.
 *
 * Out to 1.03 in the first quarter of the beat and back over the rest, ease-out —
 * a tick, not a throb. It is the change you notice without reading anything,
 * which is the job the inversion already does in colour.
 */
export function SecondPulse({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || scale === 0) {
      v.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: motion.pulseMs * 0.25,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: motion.pulseMs * 0.75,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, v]);
  return (
    <Animated.View
      style={[
        style,
        { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A row that arrives by opening its own height, and leaves by closing it.
 *
 *   in    height 0 → natural, opacity 0 → 1, translateY −6 → 0      `motion.enter`
 *   out   height → 0,         opacity → 0,   translateX 0 → 28      280 ms
 *
 * ── WHY TWO NODES ─────────────────────────────────────────────────────────
 *
 * Height is layout, so it can only animate on the JS thread; opacity and the
 * slide can run natively. One `Animated.View` cannot mix the two drivers, so the
 * outer node owns the height and the clip and the inner one owns the rest.
 *
 * The natural height is read off the inner node's own layout — a child of a
 * clipped parent is still laid out at its content height, because nothing here
 * flexes — and once the entrance is over the outer height is released back to
 * `auto`, so a plate line appearing under a weight later does not get cut off by
 * a number measured before it existed.
 *
 * `leaving` is how a caller removes one: set it, and delete the row from the
 * store in `onLeft`. The row is gone from the screen before it is gone from the
 * data, which is the order the design asks for; with reduced motion `onLeft`
 * fires on the next frame.
 */
export function GrowIn({
  children,
  appear = true,
  leaving = false,
  onLeft,
  duration = motion.enter,
}: {
  children: ReactNode;
  /** False for a row that was already there — it renders at rest. */
  appear?: boolean;
  leaving?: boolean;
  onLeft?: () => void;
  duration?: number;
}) {
  const scale = useMotionScale();
  /* Latched at mount: a caller that stops calling a row "new" on its next render
     must not strand it half-open. */
  const animateIn = useRef(appear && scale > 0).current;
  const [natural, setNatural] = useState<number | null>(null);
  const [settled, setSettled] = useState(!animateIn);
  const height = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  /* In: once the content has a height to open to. */
  useEffect(() => {
    if (!animateIn || natural == null || settled) return;
    height.setValue(0);
    Animated.parallel([
      Animated.timing(height, {
        toValue: natural,
        duration: duration * scale,
        easing: EASING,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) setSettled(true);
    });
    Animated.timing(fade, {
      toValue: 1,
      duration: duration * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  /* Out: close from wherever it stands, then tell the caller. */
  useEffect(() => {
    if (!leaving) return;
    if (scale === 0) {
      const frame = requestAnimationFrame(() => onLeftRef.current?.());
      return () => cancelAnimationFrame(frame);
    }
    height.setValue(natural ?? 0);
    setSettled(false);
    const out = 280 * scale;
    Animated.timing(height, {
      toValue: 0,
      duration: out,
      easing: EASING,
      useNativeDriver: false,
    }).start();
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: out, easing: EASING, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 1, duration: out, easing: EASING, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onLeftRef.current?.();
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && h !== natural) setNatural(h);
    },
    [natural],
  );

  return (
    <Animated.View
      style={settled && !leaving ? undefined : { height, overflow: 'hidden' }}
      pointerEvents={leaving ? 'none' : 'auto'}
    >
      <Animated.View
        style={{
          opacity: fade,
          transform: [
            {
              translateY: leaving
                ? 0
                : fade.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
            },
            { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) },
          ],
        }}
      >
        <View onLayout={onLayout}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The sink under a finger, and the release on the overshoot curve.
 *
 * Returns the handlers to put on the `Pressable` and the style to put on an
 * `Animated.View` inside it. Down is `motion.press` on the base curve; up is a
 * little longer on `pop`, so the control settles past its size and back — the
 * same acknowledgement a ✓ gives, at a tenth of the amplitude.
 *
 * `rotate` is the ✎'s own flourish: a −12° tilt with the sink, as if the pencil
 * were being picked up.
 */
export function usePressScale(to = 0.94, rotate = 0) {
  const scale = useMotionScale();
  const v = useRef(new Animated.Value(0)).current;
  const onPressIn = useCallback(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: motion.press * scale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [scale, v]);
  const onPressOut = useCallback(() => {
    Animated.timing(v, {
      toValue: 0,
      duration: 220 * scale,
      easing: POP,
      useNativeDriver: true,
    }).start();
  }, [scale, v]);
  const sink = { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, to] }) };
  const tilt = {
    rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${rotate}deg`] }),
  };
  return {
    onPressIn,
    onPressOut,
    style: { transform: rotate === 0 ? [sink] : [sink, tilt] },
  };
}
