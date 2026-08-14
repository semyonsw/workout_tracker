/**
 * FloatingPill — the one thing in this app that hovers, and the only shadow.
 *
 *   ╭───────────────────────────────────────╮
 *   │  1:28            +15      Skip        │  ← 54-high content row
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░ │  ← drain line
 *   ╰───────────────────────────────────────╯
 *
 * Two timers live in this slot — rest between sets, and the clock on a plank —
 * and they must read as ONE instrument in two states, not as two components that
 * happen to look similar. So the geometry, the elevation, the inversion in the
 * final ten seconds and the drain line are declared once, here, and each timer
 * supplies only its own content.
 *
 * The shared decisions:
 *   • It FLOATS rather than pushing layout, so the row the user just logged never
 *     moves out from under their thumb. That is what earns it the app's single
 *     real shadow — it has to read as hovering.
 *   • Under ten seconds it INVERTS to a solid `green-bright` slab, readable from
 *     three feet without reading the numerals. Any alert is haptic and audible
 *     as well — never visual-only, because the phone is face-up on a bench.
 *   • The drain line shows time REMAINING, not elapsed: the bar empties as the
 *     phase does. A ring would need a second colour and a third radius.
 *   • Only one pill exists at a time. You cannot be resting and holding.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, timerShadow } from '../theme/tokens';

/** Below this a countdown inverts. Ten seconds is one deep breath and a re-grip. */
export const FINAL_SECONDS = 10;

interface FloatingPillProps {
  /** Solid `green-bright` slab instead of a `surface-alt` pill. */
  inverted?: boolean;
  /**
   * Fraction of the phase left to run, 0–1. `null` draws no line at all — an
   * open-ended count-up has nothing to drain, and a track with no fill on it
   * would read as a timer that is already finished.
   */
  remainingFraction?: number | null;
  children: ReactNode;
}

export function FloatingPill({ inverted = false, remainingFraction, children }: FloatingPillProps) {
  const insets = useSafeAreaInsets();
  const hasDrain = remainingFraction != null;
  // Clamped so a "+15" that overshoots the original total can't overflow the bar.
  const left = hasDrain ? Math.min(100, Math.max(0, remainingFraction * 100)) : 0;

  return (
    <View
      pointerEvents="box-none"
      // 16 above the gesture bar: the spec's `bottom: 40` on a 390×844 frame.
      style={{ bottom: insets.bottom + 16 }}
      className="absolute left-lg right-lg"
    >
      <View
        style={timerShadow}
        className={[
          'overflow-hidden rounded-pill',
          inverted ? 'bg-green-bright' : 'border border-hairline bg-surface-alt',
        ].join(' ')}
      >
        <View className="h-timer flex-row items-center justify-between px-xl">{children}</View>

        {hasDrain ? (
          /* 2px, always on a green-dim track so the inverted state still reads
             as the same instrument. */
          <View className="h-[2px] w-full" style={{ backgroundColor: palette.greenDim }}>
            <View
              className="h-full"
              style={{
                width: `${left}%`,
                backgroundColor: inverted ? palette.bg : palette.greenBright,
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
