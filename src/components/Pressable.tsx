/**
 * `Pressable`, with a `style` CALLBACK that actually arrives.
 *
 * React Native's `Pressable` accepts `style={({ pressed }) => …}`, and sixty-odd
 * call sites here use it — `pressedStyle` for the press dim, and the focus
 * controls for their glow. None of them rendered it. `jsxImportSource:
 * 'nativewind'` wraps every React Native component at the JSX call site, and
 * NativeWind's wrapper collects `style` as an inline rule so it can merge
 * `className` into it; a function is not a rule, so it goes on the floor
 * without a warning. `BubblePressable` found this first (see its note) and
 * resolves the callback itself; this is the same fix for the plain control.
 *
 * A drop-in: same props, same ref. The pressed state is tracked ONLY when
 * `style` is a function, so a `Pressable` with a static style costs no extra
 * render per touch. `children` as a function is left to React Native — it is
 * not a style, and the wrapper never touches it.
 */

import { forwardRef, useState } from 'react';
import {
  Pressable as NativePressable,
  type PressableProps,
  type PressableStateCallbackType,
  type View,
} from 'react-native';

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, onPressIn, onPressOut, ...rest },
  ref,
) {
  const [pressed, setPressed] = useState(false);
  const resolves = typeof style === 'function';

  return (
    <NativePressable
      ref={ref}
      {...rest}
      onPressIn={(event) => {
        if (resolves) setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (resolves) setPressed(false);
        onPressOut?.(event);
      }}
      style={resolves ? style({ pressed, hovered: false } as PressableStateCallbackType) : style}
    />
  );
});
