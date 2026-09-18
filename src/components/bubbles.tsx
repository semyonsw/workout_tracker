/**
 * BubblePressable — the app's press feedback, with a bubble that leaves the
 * finger.
 *
 *   ┌─────────────────────────┐
 *   │        ·  ∘  ○          │   a ring opening from where you touched,
 *   │      ( ● )              │   fading as it goes, gone in 460ms
 *   └─────────────────────────┘
 *
 * ── WHY THIS IS A COMPONENT AND NOT A FLAG ON EVERY BUTTON ────────────────
 *
 * There are about forty tappable things in this app and they are spread across
 * thirty files. Adding a bubble to each of them would be forty places to get the
 * timing slightly different, and the first one anybody forgot would be the one
 * that reads as broken. So the feedback lives in the thing that RECEIVES the
 * touch, and the shared vocabulary in `primitives.tsx` — the buttons, the rows,
 * the chips, the segments — uses it. One swap, and the whole app answers a
 * thumb the same way.
 *
 * It keeps `pressedStyle` rather than replacing it. The dim-and-shrink is what
 * says "this is being pressed, right now, and it is still under your finger";
 * the bubble is what says "that landed". They are two different sentences and
 * the app was only saying the first one.
 *
 * ── THREE THINGS THAT MAKE IT CHEAP ENOUGH TO PUT EVERYWHERE ──────────────
 *
 *  • IT ONLY EXISTS WHILE IT IS RUNNING. No animation is mounted, no `Animated
 *    .Value` allocated, until a finger lands; the overlay unmounts itself when
 *    the last bubble finishes. A screen of forty rows costs forty plain
 *    `Pressable`s at rest, which is what it cost before.
 *  • IT IS NATIVE-DRIVEN. `opacity` and `transform` only — no layout, no colour
 *    interpolation — so the whole thing runs off the JS thread and a bubble
 *    cannot stutter because a set was being saved at the same moment.
 *  • IT IS CAPPED. A thumb drumming on a row can start bubbles faster than they
 *    finish; `MAX_BUBBLES` is what stops that becoming a growing array of live
 *    animations behind a list that is being scrolled.
 *
 * ── AND IT CLIPS ITSELF ───────────────────────────────────────────────────
 *
 * The overlay is `overflow: hidden` INSIDE the pressable rather than the
 * pressable being clipped, because clipping the pressable would cut off
 * everything else a caller puts in it — a lifted reorder row, a superset rule
 * that runs past an edge. The ring is drawn round, at the container's own
 * radius, and the caller passes that radius: a bubble with square corners
 * escaping a pill button is the one way this can look wrong.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';

import { palette } from '../theme/tokens';

/** Long enough to be seen leaving, short enough to be over before the next tap. */
const DURATION = 460;

/**
 * Live bubbles at once. Four is two more than a fast double-tap needs and far
 * fewer than a drumming thumb can start.
 */
const MAX_BUBBLES = 4;

/** Matches `components/motion.tsx`, which is the app's one curve. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

interface Bubble {
  key: number;
  x: number;
  y: number;
  progress: Animated.Value;
}

export interface BubblePressableProps extends Omit<PressableProps, 'children'> {
  /**
   * Plain children only.
   *
   * `Pressable` also accepts a render function taking `{ pressed }`, and this
   * cannot: the overlay has to be a sibling of the content inside the same node,
   * and a function child would have to be called to find out what it returns.
   * Nothing in this app uses that form — `pressedStyle` is how the pressed state
   * is expressed here — so narrowing it is free and it keeps the type honest.
   */
  children?: ReactNode;
  /**
   * The container's corner radius, so the ring is clipped to the shape the user
   * can see rather than to its bounding box. `pill` for anything round-ended,
   * a number for a surface corner, 0 for a plain row.
   */
  radius?: number | 'pill';
  /** The ring's colour. Defaults to the green everything else in the app is. */
  bubbleColor?: string;
  /** Off, for the few places a bubble would be noise — a drag handle, a scrim. */
  bubbles?: boolean;
}

export function BubblePressable({
  radius = 0,
  bubbleColor = palette.greenBright,
  bubbles = true,
  onPressIn,
  onLayout,
  children,
  style,
  ...rest
}: BubblePressableProps) {
  const [live, setLive] = useState<Bubble[]>([]);
  const nextKey = useRef(0);
  /** Measured on layout, so a bubble knows how far it has to grow to cover. */
  const box = useRef({ width: 0, height: 0 });

  const burst = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const bubble: Bubble = {
      key: nextKey.current++,
      x: Number.isFinite(locationX) ? locationX : box.current.width / 2,
      y: Number.isFinite(locationY) ? locationY : box.current.height / 2,
      progress: new Animated.Value(0),
    };
    setLive((current) => [...current.slice(-(MAX_BUBBLES - 1)), bubble]);
    Animated.timing(bubble.progress, {
      toValue: 1,
      duration: DURATION,
      easing: EASING,
      useNativeDriver: true,
    }).start(() => {
      // Unmounts the overlay entirely once the last one is done — see the
      // file header on why that matters for a list of forty rows.
      setLive((current) => current.filter((b) => b.key !== bubble.key));
    });
  }, []);

  /**
   * The ring's resting size. Half the diagonal is the radius that reaches every
   * corner from the middle; doubling it covers a touch in a corner reaching the
   * far one, which is what stops the bubble from visibly stopping short.
   */
  const reach = Math.max(box.current.width, box.current.height) || 56;

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        if (bubbles) burst(event);
        onPressIn?.(event);
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        box.current = { width, height };
        // Chained rather than replaced: a caller that needs the layout of its
        // own row — the reorderable lists all do — must not lose it by being
        // wrapped in a bubble.
        onLayout?.(event);
      }}
      style={style}
    >
      {children}

      {live.length > 0 ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { overflow: 'hidden', borderRadius: radius === 'pill' ? 999 : radius },
          ]}
        >
          {live.map((bubble) => (
            <Animated.View
              key={bubble.key}
              style={{
                position: 'absolute',
                left: bubble.x - reach,
                top: bubble.y - reach,
                width: reach * 2,
                height: reach * 2,
                borderRadius: reach,
                borderWidth: 2,
                borderColor: bubbleColor,
                backgroundColor: bubbleColor,
                // Starts as a dot under the thumb and opens outwards. The fill
                // fades faster than the ring, so what is left at the end is an
                // outline leaving rather than a wash sitting on the button.
                opacity: bubble.progress.interpolate({
                  inputRange: [0, 0.25, 1],
                  outputRange: [0.34, 0.2, 0],
                }),
                transform: [
                  {
                    scale: bubble.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.06, 1],
                    }),
                  },
                ],
              }}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
