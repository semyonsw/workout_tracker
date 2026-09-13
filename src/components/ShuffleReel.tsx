/**
 * ShuffleReel — the 1.2 seconds between pressing the die and the routine.
 *
 *   ┌──────────────────────────────────────────┐
 *   │  Hanging leg raises        ▲ sliding up  │
 *   │  Weighted 90° pull-ups                   │
 *   │  Plank                     ▼ sliding down│
 *   │  Hammer curls                            │
 *   │  Wide pull-ups machine                   │
 *   └──────────────────────────────────────────┘
 *
 * ── WHY AN ANIMATION AT ALL, IN AN APP THAT HAS ALMOST NONE ───────────────
 *
 * `theme/tokens.ts` is strict about motion and `components/motion.tsx` keeps the
 * app's entrances to two. This is the exception and it earns it on the same
 * grounds a slot machine does: the die is the one control whose whole value is
 * that you do not know what it will give you, and an answer that simply appears
 * hides the only interesting thing about it. Watching names slide past and
 * settle is the app doing the shuffling where you can see it, which is what
 * makes the result feel drawn rather than decided.
 *
 * It is also the honest picture. The rows show REAL exercises out of the pool
 * the roll is actually drawing from (`drawablePool`), reordered — not invented
 * names, not exercises from clusters the user excluded. The reel is a preview of
 * the draw, running fast, and the last frame IS the answer.
 *
 * ── HOW IT SETTLES ────────────────────────────────────────────────────────
 *
 * Frames swap every `FRAME_MS`, each one a fresh shuffle, and each swap plays a
 * short slide: rows come in from alternating directions so the block reads as
 * churning rather than as a list being replaced. The frames slow down towards
 * the end — the gap between them widens — which is what a physical reel does and
 * what stops the result from arriving as an abrupt stop.
 *
 * The final frame is the ACTUAL result, held still, and `onSettled` fires once.
 * A caller that unmounts the reel on `onSettled` therefore never shows a frame
 * that is not the answer.
 *
 * Native-driven opacity and translateY only, so a shuffle cannot stutter because
 * the routine it is about to produce is being written to disk underneath it.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { Kicker } from './primitives';
import { tap } from '../lib/feedback';
import { useT } from '../hooks/useT';
import { shuffled } from '../lib/randomRoutine';

/** Frames before the reel stops. Enough to read as a shuffle, not a loading bar. */
const FRAMES = 9;
/** The first gap. Every frame after it is a little longer — the reel slowing. */
const FIRST_FRAME_MS = 70;
/** Added to the gap per frame, so frame 9 sits ~4× as long as frame 1. */
const SLOWDOWN_MS = 28;
/** How far a row travels as it arrives. Small: this is a slide, not a throw. */
const TRAVEL = 14;

interface ShuffleReelProps {
  /** Everything the roll could draw. Rows are taken from here while spinning. */
  pool: readonly string[];
  /** What the roll actually produced — the frame the reel stops on. */
  result: readonly string[];
  onSettled: () => void;
}

export function ShuffleReel({ pool, result, onSettled }: ShuffleReelProps) {
  const t = useT();
  const rows = Math.max(1, result.length);
  const [names, setNames] = useState<string[]>(() => frameFrom(pool, result, rows));
  const [done, setDone] = useState(false);

  /**
   * Which way each row slides in, flipped every frame.
   *
   * Alternating by ROW makes one frame read as a churn; alternating by FRAME as
   * well stops two consecutive frames from moving identically, which is what
   * turns a shuffle into a blink.
   */
  const slide = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      frame += 1;

      const last = frame >= FRAMES;
      setNames(last ? [...result] : frameFrom(pool, result, rows));
      setPhase((p) => p + 1);

      slide.setValue(0);
      Animated.timing(slide, {
        toValue: 1,
        duration: Math.min(160, FIRST_FRAME_MS + frame * SLOWDOWN_MS),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      if (last) {
        // One tick, on the frame that is the answer — the same commit feedback
        // every other decision in the app gives.
        tap();
        setDone(true);
        onSettled();
        return;
      }
      timer = setTimeout(step, FIRST_FRAME_MS + frame * SLOWDOWN_MS);
    };

    timer = setTimeout(step, FIRST_FRAME_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Runs ONCE per mount. The caller remounts it (a fresh `key`) to re-roll, so
    // re-running on a changed `result` would restart a reel mid-spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="rounded-surface border border-green-dim bg-surface p-lg">
      <Kicker tone="green">{done ? t('Random routine') : t('Rolling…')}</Kicker>
      <View className="mt-md">
        {names.slice(0, rows).map((name, index) => {
          const downwards = (index + phase) % 2 === 0;
          return (
            <Animated.View
              key={`${index}-${name}`}
              style={{
                opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
                transform: [
                  {
                    translateY: slide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [downwards ? -TRAVEL : TRAVEL, 0],
                    }),
                  },
                ],
              }}
            >
              <Text
                numberOfLines={1}
                className={[
                  'py-[5px] text-body',
                  done ? 'font-medium text-ink' : 'text-ink-muted',
                ].join(' ')}
              >
                {name}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * One spinning frame: names out of the pool, shuffled, padded from the result.
 *
 * The padding matters for a small pool — three exercises and five rows would
 * otherwise leave two rows blank and flickering, which reads as the list being
 * broken rather than as it being short.
 */
function frameFrom(pool: readonly string[], result: readonly string[], rows: number): string[] {
  const source = pool.length > 0 ? pool : result;
  const out = shuffled(source).slice(0, rows);
  while (out.length < rows) out.push(result[out.length] ?? source[0] ?? '');
  return out;
}
