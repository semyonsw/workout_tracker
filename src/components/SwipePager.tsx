/**
 * SwipePager — a horizontal flick moves one section along.
 *
 *   Workout  ‹———›  Tasks  ‹———›  Expenses  ‹———›  Settings
 *
 * The tab bar is still there and still the fastest way to reach a section three
 * along. This is for the other case: the thumb is already on the screen, and the
 * next section is one flick away rather than a reach to the bottom edge.
 *
 * ── IT HAS TO LOSE EVERY ARGUMENT EXCEPT ITS OWN ───────────────────────────
 *
 * Three gestures live under this component and all three are older than it: a
 * `ScrollView` scrolling down, a long-press-then-slide reordering a list, and every
 * row's own tap. So the pager claims a touch only when the finger has said
 * something no other gesture in the app says — travelled `THRESHOLD` sideways, and
 * further sideways than down by a factor of `DOMINANCE`. A diagonal is a scroll; a
 * short sideways twitch is a tap that wobbled.
 *
 * It claims on CAPTURE, which is the only way to take a gesture off a
 * `ScrollView` — the scroll view is native and does not lose a bubble-phase
 * argument. That is also why the ratio test is strict rather than generous: a
 * capture that fires too easily makes the whole app feel like it is fighting the
 * thumb, and the failure is invisible in a simulator where drags are straight.
 *
 * ── AND WHY THERE IS NO RUBBER-BANDING CONTENT ─────────────────────────────
 *
 * A pager that drags the next screen in under the finger has to have that screen
 * mounted, which means four tab roots alive at once — four subscriptions, four
 * `useMemo` chains over the whole log, and a workout screen re-rendering while
 * somebody reads their expenses. The sections already animate in on arrival
 * (`PanelEnter`), so the flick gets the same entrance a tap gets. One mounted
 * screen is worth more than a gesture that tracks the finger.
 */

import { useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';

import { isReordering } from '../hooks/useDragReorder';
import { isOverlayOpen } from './overlay';

/** How far sideways before this is a swipe and not a tap that moved. */
const THRESHOLD = 24;
/** How much more sideways than vertical. A diagonal belongs to the scroll. */
const DOMINANCE = 2;

interface SwipePagerProps {
  /** +1 for the next section (content pulled left), −1 for the previous one. */
  onSwipe: (delta: 1 | -1) => void;
  children: ReactNode;
}

export function SwipePager({ onSwipe, children }: SwipePagerProps) {
  /*
   * `PanResponder.create` runs once and its handlers close over what was in scope
   * then, so the callback is read out of a ref — the same reason `useDragReorder`
   * keeps its lift in one.
   */
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // A press is never a swipe. Taps reach the rows untouched.
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          // A row in the air owns the finger, whichever way it is moving. Capture
          // runs parent-first, so without this a drag that wandered sideways would
          // change section and drop the row somewhere nobody chose.
          !isReordering() &&
          // Nor while a sheet is up: sheets are not `Modal`s, they live inside the
          // section, and a sideways drag across one changed section and unmounted
          // it with a half-typed task in it.
          !isOverlayOpen() &&
          Math.abs(gesture.dx) > THRESHOLD &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * DOMINANCE,
        /*
         * The section changes on RELEASE, not at the moment the touch is claimed.
         * Claiming is a guess about where the finger is going; the release is the
         * user having finished saying it, and a flick that curls back under itself
         * should land where it started.
         */
        onPanResponderRelease: (_event, gesture) => {
          if (isReordering() || isOverlayOpen()) return;
          if (Math.abs(gesture.dx) < THRESHOLD) return;
          if (Math.abs(gesture.dx) <= Math.abs(gesture.dy) * DOMINANCE) return;
          onSwipeRef.current(gesture.dx < 0 ? 1 : -1);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  return (
    <View className="flex-1" {...responder.panHandlers}>
      {children}
    </View>
  );
}
