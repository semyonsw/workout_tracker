/**
 * Long-press-then-slide reordering, in `PanResponder` and one `Animated.Value`.
 *
 * ── WHY IT IS BUILT THIS WAY ────────────────────────────────────────────────
 *
 * `react-native-gesture-handler` is not a dependency and this is not worth adding
 * one for, so the reorder is plain `PanResponder`, arranged around the one thing
 * that is genuinely awkward without a gesture library: a long press and the slide
 * that follows it are ONE touch, and the press is owned by the row while the slide
 * has to be owned by the list.
 *
 *   1. The long press sets `lifted`. That is a MODE, not a gesture in flight — so
 *      releasing the finger without moving leaves the row in the air rather than
 *      dropping it somewhere the user never chose, and `Drop` in the header is
 *      always a way out.
 *   2. One `PanResponder` wraps the whole list and claims the touch on MOVE, but
 *      only while something is lifted. Before that it claims nothing, so every ✓,
 *      every value cell and the scroll itself behave exactly as they always did.
 *   3. While lifted the caller stops the rows accepting touches (`pointerEvents`)
 *      and stops the ScrollView scrolling, so the two gestures can't fight.
 *   4. The lifted row follows the finger through an `Animated.Value` driven
 *      natively — a `useState` per touch-move would re-render the whole list at
 *      60 Hz to move one row.
 *
 * The drop index is computed from the ROW MIDPOINTS captured on layout, not from a
 * row height: an expanded card is several times the height of a collapsed one, so
 * anything that divides a distance by a constant lands on the wrong row. That
 * arithmetic is `lib/reorder.ts` and not this file — it is the one genuinely tricky
 * calculation in the reorder, it has four edge cases, and none of them can be
 * reached from a test that has to render a screen. What stays here is the gesture.
 *
 * One honest limitation of doing it this way: the list does not scroll while a row
 * is in the air, so a single slide can only reach as far as the finger can. Moving
 * a row past the edge of the screen is two moves — drop, scroll, lift again — which
 * is what the mode makes natural, and is the reason `Drop` is always in the header
 * rather than only under the finger.
 *
 * ── WHY IT IS A HOOK AND NOT A SCREEN'S PRIVATE BUSINESS ────────────────────
 *
 * Both reorderable lists in the app use it: the session's exercise cards and the
 * routine editor's rows. They were two different interactions for two releases — a
 * drag here, lift-then-TAP-a-row there — which meant the same job had two muscle
 * memories depending on which screen you were on. It is one gesture now, and one
 * implementation, because the second copy is how the two drift apart again.
 *
 * The refs are not an optimisation: `PanResponder.create` is called once (its
 * handlers close over whatever was in scope then), so every handler reads the
 * CURRENT lift, target and geometry out of a ref rather than a captured value.
 * Rebuilding the responder on each state change instead would drop the gesture
 * mid-drag, because the responder that was granted the touch is the one that no
 * longer exists.
 *
 * `targetIndex` is state as well as a ref because the header reads it. It only
 * changes when the finger crosses a row's midpoint — a handful of renders per drag
 * rather than one per pixel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

import { commit, undo } from '../lib/feedback';
import { dropIndex, liftIndex, liftedSlotHeight, rowShift, type CardLayout } from '../lib/reorder';

export type { CardLayout };

/**
 * Is a row in the air ANYWHERE in the app.
 *
 * A module-level flag, which is a thing this codebase does not otherwise do, and
 * it earns it: the swipe that moves between sections lives above every screen
 * (`components/SwipePager.tsx`) and claims touches on CAPTURE, which is the only
 * way to take a gesture off a `ScrollView` — and capture runs parent-first. So a
 * drag that wandered sideways while a row was lifted could be claimed by the pager,
 * switching section and dropping the row somewhere nobody chose.
 *
 * The pager could not ask, because the lift is state inside whichever screen is
 * mounted and the pager is above all of them. Threading a callback up through four
 * screens to answer one yes-or-no would put the same flag in four more places.
 *
 * There is at most one lift at a time — the gesture is one finger and the list
 * stops accepting touches while it is up — so a boolean is honest here. It is set
 * on lift and cleared on every path out of one, including an unmount mid-drag.
 */
let liftedSomewhere = false;

export function isReordering(): boolean {
  return liftedSomewhere;
}

export interface DragReorder {
  /** The row in the air, or null. */
  lifted: string | null;
  /** Native-driven offset for the lifted row. */
  dragY: Animated.Value;
  /** Where it would land, as an index into the list without it. */
  targetIndex: number;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  lift: (id: string) => void;
  drop: () => void;
  /**
   * How far a row that is NOT in the air has to move, in pixels, so the gap the
   * finger is over is actually open. Zero for every row while nothing is lifted.
   *
   * A number rather than an `Animated.Value` per row: the value changes a handful
   * of times per drag (only when the finger crosses a midpoint), and the spring
   * that carries a row there belongs to the row — see `components/ReorderRow.tsx`.
   */
  shiftFor: (id: string) => number;
}

/**
 * @param ids       every row, in list order.
 * @param layouts   a ref the caller fills from each row's `onLayout`, keyed by id.
 *                  Offsets only ever get compared to each other, so any consistent
 *                  origin works — the list wrapper is the natural one.
 * @param move      commit: put `id` at `toIndex`, an index into the list WITHOUT it.
 */
export function useDragReorder(
  ids: readonly string[],
  layouts: React.MutableRefObject<Record<string, CardLayout>>,
  move: (id: string, toIndex: number) => void,
): DragReorder {
  const [lifted, setLifted] = useState<string | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);

  const liftedRef = useRef<string | null>(null);
  const targetRef = useRef(0);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const moveRef = useRef(move);
  moveRef.current = move;

  const dragY = useRef(new Animated.Value(0)).current;

  const lift = useCallback(
    (id: string) => {
      commit();
      const index = liftIndex(idsRef.current, id);
      liftedRef.current = id;
      liftedSomewhere = true;
      // The row starts where it already is, so its own index is the first target.
      targetRef.current = index;
      setTargetIndex(index);
      setLifted(id);
      dragY.setValue(0);
    },
    [dragY],
  );

  const drop = useCallback(() => {
    const id = liftedRef.current;
    liftedRef.current = null;
    liftedSomewhere = false;
    dragY.setValue(0);
    setLifted(null);
    if (!id) return;
    undo();
    moveRef.current(id, targetRef.current);
  }, [dragY]);

  /**
   * Which gap the lifted row is over. The maths is `lib/reorder.ts`.
   *
   * All this does is hand it the four things only a component knows — the current
   * ids, the layouts captured on layout, which row is in the air, and where it came
   * from — and it reads them out of refs so the `PanResponder` built once at mount
   * never sees a stale copy.
   */
  const targetFor = useCallback(
    (dy: number): number => {
      const id = liftedRef.current;
      if (!id) return 0;
      return dropIndex({
        ids: idsRef.current,
        liftedId: id,
        layouts: layouts.current,
        dy,
        fallbackIndex: targetRef.current,
      });
    },
    [layouts],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Nothing is claimed until a row is lifted: taps, scrolls and the ✓ all
        // behave exactly as they do when this hook isn't doing anything.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => liftedRef.current != null,
        // Capture, so the list wins the slide even though the row under the finger
        // is what the touch started on.
        onMoveShouldSetPanResponderCapture: () => liftedRef.current != null,
        onPanResponderMove: (_event, gesture) => {
          if (!liftedRef.current) return;
          dragY.setValue(gesture.dy);
          const next = targetFor(gesture.dy);
          if (next !== targetRef.current) {
            targetRef.current = next;
            setTargetIndex(next);
          }
        },
        onPanResponderRelease: () => drop(),
        // A drag cut short by the OS (a call, a notification shade) still has to put
        // the row down somewhere, and where the finger left it is the only honest
        // answer.
        onPanResponderTerminate: () => drop(),
        onPanResponderTerminationRequest: () => false,
      }),
    [dragY, drop, targetFor],
  );

  /* A row that left the list (removed, or the screen reset) is not liftable. */
  useEffect(() => {
    if (lifted && !ids.includes(lifted)) {
      liftedRef.current = null;
      liftedSomewhere = false;
      dragY.setValue(0);
      setLifted(null);
    }
  }, [dragY, ids, lifted]);

  /* Unmounted mid-drag — the screen was left, or the tab changed under it. The
     flag is global, so leaving it set would disable the section swipe for good. */
  useEffect(
    () => () => {
      liftedSomewhere = false;
    },
    [],
  );

  /**
   * THE GAP. `rowShift` says which way a row goes and `liftedSlotHeight` says how
   * far; multiplying them here keeps both facts in `lib/reorder.ts` where they are
   * tested, and hands the screen one number it can animate.
   */
  const shiftFor = useCallback(
    (id: string): number => {
      if (!lifted) return 0;
      const direction = rowShift({ ids, liftedId: lifted, targetIndex, id });
      if (direction === 0) return 0;
      return direction * liftedSlotHeight(ids, lifted, layouts.current);
    },
    [ids, layouts, lifted, targetIndex],
  );

  return {
    lifted,
    dragY,
    targetIndex,
    panHandlers: responder.panHandlers,
    lift,
    drop,
    shiftFor,
  };
}
