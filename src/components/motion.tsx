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
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

function useEnter(duration: number, riseFrom: number) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [duration, enter]);

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
 * Function form, not a plain object, because `Pressable` only exposes `pressed`
 * through its `style` callback.
 */
export function pressedStyle({ pressed }: { pressed: boolean }): ViewStyle | undefined {
  return pressed ? { opacity: 0.62, transform: [{ scale: 0.994 }] } : undefined;
}
