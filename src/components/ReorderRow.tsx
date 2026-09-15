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

import { rowOffsetMode } from '../lib/reorder';

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
  const mode = rowOffsetMode(lifted, dragging);

  useEffect(() => {
    /*
     * THE DROP SNAPS, IT DOES NOT SPRING, and getting this wrong is a flash on
     * every single reorder.
     *
     * While a row is in the air the gap is a LIE the offsets tell: a row shifted
     * −84 is drawn a slot above where it is laid out. Releasing makes the lie
     * true — the list re-splices and that row is now really in the slot it was
     * being drawn in. Springing to zero from there would animate it from where it
     * already is to where it already is, which on screen is a slide in from the
     * NEXT slot over: the list rearranging itself a second time, after the
     * rearrangement the user asked for.
     *
     * So the moment nothing is lifted, every offset is zero instantly. The splice
     * and this run in the same React batch — `useDragReorder.drop` clears the lift
     * and commits the move together — so there is no frame where the new order is
     * on screen with an old offset still applied.
     */
    if (!dragging) {
      /*
       * `stopAnimation` BEFORE the reset, and it is not belt and braces.
       *
       * The spring above runs on the native side. A `setValue` while it is still
       * in flight is two messages racing — the reset and the spring's next frame —
       * and when the frame wins, the row keeps the offset it was drawn with and
       * the list is left with a hole in it where that row should be and a row
       * sitting on top of whatever is under it. That is the gap this file's
       * whole point was to remove, made permanent, and it was the reorder bug:
       * intermittent, because a race is, and surviving until something else
       * happened to re-render the screen.
       */
      offset.stopAnimation(() => offset.setValue(0));
      offset.setValue(0);
      return;
    }
    Animated.spring(offset, {
      toValue: shift,
      ...SPRING,
      useNativeDriver: true,
    }).start();
  }, [dragging, offset, shift]);

  return (
    <Animated.View
      // While a row is in the air NOTHING in the list is tappable: a finger
      // sliding a row across a circle must not answer a task.
      pointerEvents={dragging ? 'none' : 'auto'}
      /*
       * AND THE OFFSET ONLY EXISTS WHILE SOMETHING IS LIFTED.
       *
       * With nothing in the air the row is drawn where the layout puts it, full
       * stop — no transform, no animated node attached to it, nothing that a
       * value left behind on the native side could still be saying. The reset
       * above is the tidy path; this is the one that cannot be raced, and both
       * are here because the failure it prevents is a list that keeps a gap in
       * it until the screen is left and come back to. `lib/reorder.ts` holds the
       * three-way choice and the test that remembers why there are three.
       */
      style={
        mode === 'finger'
          ? { transform: [{ translateY: dragY }], zIndex: 2, elevation: 2 }
          : mode === 'slot'
            ? { transform: [{ translateY: offset }] }
            : undefined
      }
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}
