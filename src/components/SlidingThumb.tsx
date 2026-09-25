/**
 * SlidingThumb — the one lit pane under a row of choices, sliding between them.
 *
 *   ╭────────────────────────────────────╮
 *   │ ╭──────────╮                       │
 *   │ │  Easy    │   Right      Brutal   │   → the pane travels, the words stay
 *   │ ╰──────────╯                       │
 *   ╰────────────────────────────────────╯
 *
 * The motion pass replaced four controls that each lit the SELECTED segment in
 * place — the tab bar, the effort chips, the expenses/incomes pair, the balance
 * bubble's pills — with one pane drawn ONCE and moved. A pane that slides says
 * where the choice came from as well as where it went, which a segment switching
 * its own background cannot; and it is one native-driven translate instead of a
 * restyle of two segments.
 *
 * `spring` by default — `bezier(.34,1.25,.64,1)`, a slight overshoot — because a
 * thumb that lands is a position being reached, not an event being caught (that
 * is `pop`). Each caller passes its own duration and, where the design gives one,
 * its own curve.
 *
 * Absolutely positioned inside the caller's track: the track owns the padding
 * and the segments; this owns only the pane. Equal widths by default; the balance
 * bubble passes measured `offsets` because its pills are as wide as their names.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useMotionScale } from '../hooks/useMotionScale';
import { curve, motion } from '../theme/tokens';

export function SlidingThumb({
  index,
  count,
  trackWidth,
  inset = 4,
  gap = 0,
  offsets,
  duration = 380,
  bezier = motion.spring,
  style,
  children,
}: {
  /** Which segment is selected, or null for none — the pane then fades out. */
  index: number | null;
  count: number;
  /** The track's measured inner width (its own width minus nothing: `inset` is taken here). */
  trackWidth: number;
  /** Padding between the track's edge and the pane. */
  inset?: number;
  /** Space between segments. */
  gap?: number;
  /** Measured `{ x, width }` per segment, for segments that are not equal. */
  offsets?: readonly { x: number; width: number }[];
  duration?: number;
  bezier?: readonly [number, number, number, number];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const scale = useMotionScale();
  /*
   * Equal segments slide on the NATIVE driver — a translate, off the JS thread,
   * so a tab change mid-scroll cannot stutter. Measured segments change WIDTH as
   * well as position, and width is layout, so those two run on the JS driver
   * together (one node cannot mix the two).
   */
  const native = offsets == null;
  const equalWidth = count > 0 ? (trackWidth - inset * 2 - gap * (count - 1)) / count : 0;
  const target = offsets?.[index ?? 0];
  const x = target ? target.x : (index ?? 0) * (equalWidth + gap);
  const width = target ? target.width : equalWidth;

  const left = useRef(new Animated.Value(x)).current;
  const size = useRef(new Animated.Value(width)).current;
  const shown = useRef(new Animated.Value(index == null ? 0 : 1)).current;
  const measured = useRef(false);

  useEffect(() => {
    // The first real measurement lands in place; only a CHANGE slides.
    if (!measured.current) {
      if (trackWidth <= 0 || width <= 0) return;
      measured.current = true;
      left.setValue(x);
      size.setValue(width);
      return;
    }
    const easing = curve(bezier);
    const moves = [
      Animated.timing(left, {
        toValue: x,
        duration: duration * scale,
        easing,
        useNativeDriver: native,
      }),
    ];
    if (!native) {
      moves.push(
        Animated.timing(size, {
          toValue: width,
          duration: duration * scale,
          easing,
          useNativeDriver: false,
        }),
      );
    }
    Animated.parallel(moves).start();
    // `bezier` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, width, duration, scale, trackWidth]);

  useEffect(() => {
    Animated.timing(shown, {
      toValue: index == null ? 0 : 1,
      duration: 200 * scale,
      useNativeDriver: native,
    }).start();
  }, [index, native, scale, shown]);

  if (trackWidth <= 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        native
          ? {
              position: 'absolute',
              top: inset,
              bottom: inset,
              left: inset,
              width: equalWidth,
              opacity: shown,
              transform: [{ translateX: left }],
            }
          : {
              position: 'absolute',
              top: inset,
              bottom: inset,
              left: Animated.add(left, inset),
              width: size,
              opacity: shown,
            },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
