/**
 * ReorderRow — one row of a list that is being reordered, including the ones
 * that are only getting out of the way.
 *
 *   ┌──────────────┐          ┌──────────────┐
 *   │ Bench press  │          │ Bench press  │
 *   ├──────────────┤          └──────────────┘   ← slid up
 *   │ Pull-up      │ lifted     ╭┈┈┈┈┈┈┈┈┈┈┈╮
 *   ├──────────────┤  ───────▶  ┊   gap     ┊    ← it lands here
 *   │ Row          │          ╰┈┈┈┈┈┈┈┈┈┈┈╯
 *   └──────────────┘          ┌──────────────┐
 *                             │ Row          │   ← slid down
 *
 * ── WHAT THIS FIXES ────────────────────────────────────────────────────────
 *
 * The drag moved one card and nothing else. The list rearranged itself on
 * RELEASE, which meant the only way to learn which two rows you were dropping
 * between was to drop and look — and correcting a wrong guess is another long
 * press. The gap now opens under the finger, so the drop is something you can
 * see before you commit to it.
 *
 * ── WHY A SPRING AND NOT A TIMING ──────────────────────────────────────────
 *
 * The rest of the app's motion is `Easing.bezier` over a fixed duration, because
 * everything else it animates is an ARRIVAL — it starts from rest and the
 * duration is the whole point. This starts from wherever the last shift left it:
 * a finger crossing back and forth over one midpoint retargets the row mid-flight,
 * and a timing restarted from a moving row is a visible stutter. A spring carries
 * its own velocity across the retarget, which is exactly the property needed and
 * the only reason this file disagrees with `motion.tsx`.
 *
 * No bounce (`overshootClamping`): a row that springs past the gap and back reads
 * as the list being unsure where the card goes.
 *
 * ── AND THE LIFTED ROW GOES THROUGH THE SAME COMPONENT ─────────────────────
 *
 * It is the one row whose offset is the finger rather than a slot, so it takes
 * `dragY` straight — no spring, because a spring between the finger and the card
 * is lag. One component for both so a list has one kind of row, and so
 * `pointerEvents`, `zIndex` and the dim are decided once instead of per screen.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type LayoutChangeEvent } from 'react-native';

/** How firmly a displaced row travels. Critically damped, no overshoot. */
const SPRING = { stiffness: 240, damping: 26, mass: 1 } as const;

interface ReorderRowProps {
  /** This row is the one under the finger. */
  lifted: boolean;
  /** Something in the list is in the air — not necessarily this row. */
  dragging: boolean;
  /** The finger's offset. Only read when `lifted`. */
  dragY: Animated.Value;
  /** Slots to move so the gap is open, in pixels. See `lib/reorder.rowShift`. */
  shift: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}

export function ReorderRow({
  lifted,
  dragging,
  dragY,
  shift,
  onLayout,
  children,
}: ReorderRowProps) {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(offset, {
      toValue: shift,
      ...SPRING,
      useNativeDriver: true,
    }).start();
  }, [offset, shift]);

  return (
    <Animated.View
      // While a row is in the air NOTHING in the list is tappable: a finger
      // sliding a row across a circle must not answer a task.
      pointerEvents={dragging ? 'none' : 'auto'}
      style={
        lifted
          ? { transform: [{ translateY: dragY }], zIndex: 2, elevation: 2 }
          : { transform: [{ translateY: offset }] }
      }
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}
