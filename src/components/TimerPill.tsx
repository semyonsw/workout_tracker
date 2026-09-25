/**
 * TimerPill — the one instrument the whole gym-facing app is built around.
 *
 *   ╭───────────────────────────────────────╮
 *   │                                       │
 *   │   1:28                          ⏸     │  ← the clock owns the top
 *   │   BETWEEN SETS                        │
 *   │                    −15   +15    Skip  │  ← controls, underneath
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
 *   • IT SITS AT THE TOP OF THE SESSION, directly under the header, and it is the
 *     biggest thing on the screen. A rest countdown is read from three or four feet
 *     away — phone on a bench, you standing over it — and the top of the screen is
 *     where the eye lands and where nothing else competes. It used to float at the
 *     bottom over the thumb, which is the right place for a button and the wrong
 *     place for a display.
 *   • THE CONTENT IS A COLUMN, and that is what let the clock get big. It was one
 *     row — clock on the left, every control on the right — which capped the
 *     numerals at whatever was left after four thumb targets: about 114 dp on a
 *     360 dp phone, or 52 pt of type. Stacking the controls under the clock hands
 *     the numerals the full width, which is the only way to read a countdown from
 *     across a gym floor rather than from arm's length. The pill got taller in
 *     exchange, and the pill is the one thing on the screen that has earned it.
 *   • IT TAKES ITS OWN SPACE rather than floating over the rows: at this size an
 *     overlay would cover the set it belongs to. It still carries the app's single
 *     real shadow, so it reads as the layer above the list.
 *   • Under ten seconds it INVERTS to a solid `green-bright` slab, readable across
 *     a room without reading the numerals. Any alert is haptic and audible as well
 *     — never visual-only, because the phone is face-up on a bench.
 *   • The drain line shows time REMAINING, not elapsed: the bar empties as the
 *     phase does — CONTINUOUSLY. It used to step once a tick, which on a 90 s rest
 *     is a bar that visibly jumps; it is a linear animation now, from where it
 *     stands to empty over exactly the time that is left, restarted whenever
 *     that time changes (±15, pause, resume). Native-driven, as a `scaleX`.
 *   • THE DIGITS ROLL (`RollingNumber`, 320 ms), so a `+15` is seen to add fifteen
 *     seconds rather than the clock redrawing.
 *   • IN THE FINAL TEN SECONDS IT ALSO PULSES — scale 1 → 1.03 → 1 each second
 *     (`SecondPulse`) — the change you notice without reading anything, on top of
 *     the inversion that says it in colour.
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
 * Same reason, plus one more: `allowFontScaling={false}`. The clock is already by
 * some distance the biggest text in the app and it is sized to fill the width it
 * has; letting the OS scale it on top of that pushes a five-character clock past
 * the pill's edge on a narrow phone, which is the one stretch of the countdown
 * anybody is actually watching.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useMotionScale } from '../hooks/useMotionScale';
import { palette, size, timerShadow } from '../theme/tokens';
import { SecondPulse } from './motion';
import { RollingNumber } from './RollingNumber';

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
  /** The outline of the round controls — a hairline, or a darker green on the slab. */
  chipBorder: string;
}

const RESTING: PillTone = {
  surface: palette.surfaceAlt,
  border: palette.hairline,
  clock: palette.greenBright,
  label: palette.inkFaint,
  secondary: palette.inkMuted,
  primary: palette.ink,
  drain: palette.greenBright,
  chipBorder: palette.hairline,
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
  chipBorder: 'rgba(6,8,7,0.28)',
};

/** The colours for a pill in its normal or its final-ten-seconds state. */
export function pillTone(inverted: boolean): PillTone {
  return inverted ? FINAL : RESTING;
}

interface TimerPillProps {
  /** Solid `green-bright` slab instead of a `surface-alt` pill. */
  inverted?: boolean;
  /**
   * Fraction of the phase left to run, 0–1. `null` draws no line at all — an
   * open-ended count-up has nothing to drain, and a track with no fill on it
   * would read as a timer that is already finished.
   */
  remainingFraction?: number | null;
  /**
   * Milliseconds until the line reaches empty at the current rate — pass it while
   * the clock is running and the line drains continuously over exactly that long.
   * Null (paused, or a count that is not a countdown) holds it where it stands.
   */
  drainMs?: number | null;
  /**
   * Changes whenever the time left changes by anything other than time passing —
   * a new deadline from `±15`, a pause, a resume. The drain restarts from where it
   * is on each change. Usually the deadline itself.
   */
  drainKey?: string | number | null;
  /** The final ten seconds, running: the content pulses once a second. */
  pulse?: boolean;
  children: ReactNode;
}

export function TimerPill({
  inverted = false,
  remainingFraction,
  drainMs = null,
  drainKey = null,
  pulse = false,
  children,
}: TimerPillProps) {
  const tone = pillTone(inverted);
  const hasDrain = remainingFraction != null;

  return (
    // Under the header, inset by the page gutter, with air above and below it.
    <View className="mx-lg mb-sm mt-md">
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
        {/*
          A COLUMN, and a MINIMUM height rather than a fixed one.

          Each pill supplies exactly two children — the clock block and the
          controls block — and in a column those stack without either pill knowing
          it. Fixed height became wrong the moment the clock grew: `size.timer` is
          now the floor that stops a two-control pill reading as a different
          instrument from a four-control one, and the content sets the rest.
        */}
        <SecondPulse active={pulse}>
          <View
            style={{ minHeight: size.timer, paddingTop: 16, paddingBottom: 14 }}
            className="justify-center pl-[26px] pr-[22px]"
          >
            {children}
          </View>
        </SecondPulse>

        {hasDrain ? (
          /* 3 dp, always on a green-dim track so the inverted state still reads
             as the same instrument. */
          <DrainLine
            fraction={remainingFraction}
            drainMs={drainMs}
            drainKey={drainKey}
            color={tone.drain}
          />
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
  /* The clock ROLLS, 320 ms a column: fast enough to finish inside the second it
     is showing, slow enough that `+15` reads as fifteen seconds arriving. The
     get-ready count stays a plain numeral — one digit, replaced, is the count. */
  if (variant === 'clock') {
    return (
      <RollingNumber
        value={String(value)}
        lineHeight={88}
        duration={320}
        accessibilityLabel={accessibilityLabel}
        style={{
          fontSize: 84,
          letterSpacing: -2.5,
          fontWeight: '600',
          color: tone.clock,
        }}
      />
    );
  }
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={false}
      numberOfLines={1}
      style={{
        /*
         * The two biggest type sizes in the app by a wide margin, and the reason
         * the pill is 132 high with its controls stacked underneath.
         *
         * 84 is what a five-character clock (`12:05`) fits in across the pill's
         * full inner width on a 320 dp phone — the narrowest thing this app is
         * expected to run on — so the number never clips and never shrinks. The
         * get-ready count goes further still at 104: it is a single digit with
         * nothing beside it, and it is read off the floor while you are getting
         * into position under a bar.
         */
        fontSize: variant === 'count' ? 104 : 84,
        lineHeight: variant === 'count' ? 108 : 88,
        letterSpacing: -2.5,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
        color: tone.clock,
      }}
    >
      {value}
    </Text>
  );
}

/**
 * The micro label beside the clock — or under it: what this countdown is.
 *
 * `inline` is the default and puts it on the clock's baseline, which is where a
 * two-control pill has room for it. The rest pill sets it false and stacks the
 * label under the numerals, because it carries FOUR controls (−15, +15, pause,
 * skip) and on a 360 dp phone they leave the inline label about fifteen points to
 * live in — which renders as `BETW…`, a label that has stopped being one.
 *
 * Stacking rather than dropping it: `BETWEEN SETS` vs `NEXT EXERCISE` is how you
 * check, mid-workout, that the two rest settings are doing what they say.
 */
export function PillLabel({
  children,
  tone,
  inline = true,
}: {
  children: ReactNode;
  tone: PillTone;
  inline?: boolean;
}) {
  return (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      style={{ color: tone.label }}
      className={`text-micro font-semibold uppercase ${inline ? 'ml-md flex-1' : 'mt-xs'}`}
    >
      {children}
    </Text>
  );
}

/**
 * The drain, as a native-driven `scaleX` from the left edge.
 *
 * On every `drainKey` it jumps to where the clock actually is and, while a
 * `drainMs` is given, runs linearly to empty over exactly that long — so it moves
 * every frame without the JS thread doing anything, and a `+15` or a pause
 * re-anchors it instead of letting it drift. Clamped, because a `+15` that
 * overshoots the original total cannot draw past the end of the bar.
 *
 * With reduced motion on it follows the tick instead, which is the old stepped
 * line — the honest end state of "no animation".
 */
function DrainLine({
  fraction,
  drainMs,
  drainKey,
  color,
}: {
  fraction: number;
  drainMs: number | null;
  drainKey: string | number | null;
  color: string;
}) {
  const motionScale = useMotionScale();
  const clamped = Math.min(1, Math.max(0, fraction));
  const v = useRef(new Animated.Value(clamped)).current;
  const latest = useRef(clamped);
  latest.current = clamped;

  useEffect(() => {
    if (motionScale === 0 || drainMs == null) {
      v.setValue(latest.current);
      return undefined;
    }
    v.setValue(latest.current);
    const run = Animated.timing(v, {
      toValue: 0,
      duration: Math.max(0, drainMs),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
    // Keyed on the deadline, not on the fraction: see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drainKey, drainMs == null, motionScale]);

  /* Without a running drain, the line is simply where the clock is. */
  useEffect(() => {
    if (motionScale === 0 || drainMs == null) v.setValue(clamped);
  }, [clamped, drainMs, motionScale, v]);

  return (
    <View className="h-[3px] w-full" style={{ backgroundColor: palette.greenDim }}>
      <Animated.View
        style={{
          height: 3,
          width: '100%',
          backgroundColor: color,
          transformOrigin: 'left',
          transform: [{ scaleX: v }],
        }}
      />
    </View>
  );
}
