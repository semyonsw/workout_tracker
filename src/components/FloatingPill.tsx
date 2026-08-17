/**
 * FloatingPill — the one thing in this app that hovers, and the only shadow.
 *
 *   ╭───────────────────────────────────────╮
 *   │  1:28            +15      Skip        │  ← 66-high content row
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
 *
 * ── WHY THE COLOURS ARE INLINE STYLES AND NOT `className` ──────────────────
 *
 * The inverted state is the one place in the app where the FOREGROUND and the
 * BACKGROUND swap in the same paint: near-black numerals arrive on a green slab.
 * If either half of that swap fails to apply — a class that didn't make it into
 * the compiled stylesheet, a variable that didn't resolve in a release bundle —
 * the result is not a wrong colour, it is near-black on near-black: the countdown
 * VANISHES for exactly the last ten seconds, which is the only stretch anyone is
 * actually watching it.
 *
 * That is not a risk worth carrying for a styling convenience, so the pill's
 * surface and every colour inside it come from `palette` through `style`, which
 * cannot be dropped. `className` still does all the layout. `pillTone()` below is
 * the single source for those colours, so a timer cannot invert its background
 * without inverting its ink.
 *
 * ── AND WHY THE CLOCK SIZES ITSELF IN `style` ──────────────────────────────
 *
 * Same reason, plus one more: `allowFontScaling={false}`. The row is a fixed
 * height that clips, so a phone set to a large system font would otherwise push
 * the numerals out of a pill that cannot grow. The clock is already the biggest
 * text in the app; it does not need the OS to make it bigger.
 */

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, size, timerShadow } from '../theme/tokens';

/** Below this a countdown inverts. Ten seconds is one deep breath and a re-grip. */
export const FINAL_SECONDS = 10;

/** Every colour inside a pill, for one of its two states. */
export interface PillTone {
  /** The pill's own fill. */
  surface: string;
  /** A hairline, or nothing at all on the inverted slab. */
  border: string;
  /** The numerals. */
  clock: string;
  /** The micro label beside them ("PLANK", "PAUSED", "BETWEEN SETS"). */
  label: string;
  /** A secondary action: `+15`, `Start now`. */
  secondary: string;
  /** The action you are most likely to want, and its glyphs: `Skip`, `Stop`. */
  primary: string;
  /** The drain line's fill. */
  drain: string;
}

const RESTING: PillTone = {
  surface: palette.surfaceAlt,
  border: palette.hairline,
  clock: palette.greenBright,
  label: palette.inkFaint,
  secondary: palette.inkMuted,
  primary: palette.ink,
  drain: palette.greenBright,
};

const FINAL: PillTone = {
  surface: palette.greenBright,
  border: 'transparent',
  // Near-black on bright green: the same pairing the app uses for text on a
  // green fill everywhere else, and the only one that holds contrast here.
  clock: palette.bg,
  label: palette.greenWash,
  secondary: palette.greenWash,
  primary: palette.bg,
  drain: palette.bg,
};

/** The colours for a pill in its normal or its final-ten-seconds state. */
export function pillTone(inverted: boolean): PillTone {
  return inverted ? FINAL : RESTING;
}

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
  const tone = pillTone(inverted);
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
        style={[
          timerShadow,
          {
            backgroundColor: tone.surface,
            borderWidth: 1,
            borderColor: tone.border,
          },
        ]}
        className="overflow-hidden rounded-pill"
      >
        <View
          style={{ height: size.timer }}
          className="flex-row items-center justify-between px-xl"
        >
          {children}
        </View>

        {hasDrain ? (
          /* 2px, always on a green-dim track so the inverted state still reads
             as the same instrument. */
          <View className="h-[2px] w-full" style={{ backgroundColor: palette.greenDim }}>
            <View className="h-full" style={{ width: `${left}%`, backgroundColor: tone.drain }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The numerals. The biggest text in the app, and the only text sized in a style
 * rather than a class — see the file header.
 *
 * `count` is the get-ready number: a bare 5 · 4 · 3 · 2 · 1 you should be able to
 * read from the floor while you get into position, so it is bigger still.
 */
export function PillClock({
  value,
  tone,
  variant = 'clock',
  accessibilityLabel,
}: {
  value: string | number;
  tone: PillTone;
  variant?: 'clock' | 'count';
  accessibilityLabel: string;
}) {
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={false}
      numberOfLines={1}
      style={{
        fontSize: variant === 'count' ? 44 : 34,
        lineHeight: variant === 'count' ? 48 : 38,
        letterSpacing: -1,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
        color: tone.clock,
      }}
    >
      {value}
    </Text>
  );
}

/** The micro label beside the clock: what this countdown is. */
export function PillLabel({ children, tone }: { children: ReactNode; tone: PillTone }) {
  return (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      style={{ color: tone.label }}
      className="ml-sm flex-1 text-micro font-semibold uppercase"
    >
      {children}
    </Text>
  );
}
