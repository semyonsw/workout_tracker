/**
 * The two blocks every clock-driven state of focus mode is made of.
 *
 *   resting          ╭──────────────────────────────────╮
 *                    │ BETWEEN SETS                     │
 *                    │ 2:30                             │  ← 120 dp of numeral
 *                    │▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░│
 *                    │  −15    +15     ⏸       Skip     │
 *                    ╰──────────────────────────────────╯
 *
 *   holding          1:14                                  ← the same clock, bare
 *                    PLANK
 *                    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░
 *                    logs itself at the bell
 *
 *   up next          ╭──────────────────────────────────╮
 *                    │ UP NEXT                          │
 *                    │ Weighted 90° pull-ups            │
 *                    │ +32 KG × 5 REPS     SET 3 OF 4   │
 *                    ╰──────────────────────────────────╯
 *
 * ── WHY ONE COMPONENT AND NOT TWO CLOCKS ────────────────────────────────────
 *
 * Rest and a held set are the same instrument in two states — the argument
 * `TimerPill` makes for the session screen, and it holds twice as hard here where
 * the clock IS the screen. So the geometry, the drain line, the inversion in the
 * final ten seconds and every colour come from one place, and each state supplies
 * only its own content. `tone` is the pill's own `pillTone()` object, unchanged:
 * focus mode does not get a second palette for the same countdown.
 *
 * The only difference between the two is a background. Rest is a CARD, because it
 * carries four controls and they need an edge to belong to. A held set is BARE —
 * the clock sits on the page with the exercise's name under it and its controls at
 * the bottom of the screen where a hand can reach them mid-hold. Bare also means
 * the inversion at ten seconds is a colour change and nothing else: the slab
 * appears behind numerals that do not move.
 *
 * ── THE COLOURS ARE INLINE STYLES, AND THAT IS DELIBERATE ───────────────────
 *
 * Same reason `TimerPill` gives, and the same stakes: the inverted state swaps
 * foreground and background in one paint, and if half of that swap fails to apply
 * in a release bundle the countdown is near-black on near-black for exactly the
 * ten seconds anybody is watching it. `className` does the layout; `tone` does the
 * colour, through `style`, which cannot be dropped.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { describeSetPosition, type FocusTarget } from '../lib/focusPlan';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { glow as GLOW, palette, timerShadow } from '../theme/tokens';
import type { PillTone } from './TimerPill';
import type { UnitSystem } from '../types/models';

/**
 * The halo behind a focus-mode numeral.
 *
 * The app's one glow, at a wider radius than `SetRow`'s 16: these numerals are
 * twice the size, and a bloom that does not grow with the glyph reads as a
 * sharper edge rather than a lit one. Inline because a text glow is
 * `textShadow*`, which NativeWind has no utility for.
 */
export const FOCUS_GLOW = {
  textShadowColor: GLOW,
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 26,
} as const;

interface FocusClockBlockProps {
  /** Every colour in the block. `pillTone(inverted)` — see the file header. */
  tone: PillTone;
  /** The uppercase micro label: `BETWEEN SETS`, `PAUSED`, `PLANK`, `GET READY`. */
  label: string;
  /** Overrides the tone's label colour. State F's green `PAUSED` is the only user. */
  labelColor?: string;
  /** Above the numerals while resting, under them while holding. */
  labelPlacement?: 'above' | 'below';
  /** The numerals, already formatted. */
  value: string;
  /** `count` is the get-ready digit, one step larger again. */
  variant?: 'clock' | 'count';
  /** A halo behind the numerals. The get-ready count only. */
  glow?: boolean;
  /**
   * Fraction of the phase left to run, 0–1, or null for no line at all. Null is
   * an open-ended count-up, which has nothing to drain: a track with no fill would
   * read as a clock that has already finished. Same rule as `TimerPill`.
   */
  remainingFraction?: number | null;
  /** Overrides the drain's fill. State F freezes it to the track's own colour. */
  drainColor?: string;
  /** A hairline at the drain's head — the other half of "this bar is not live". */
  drainHead?: boolean;
  /** No card behind the clock: a held set, which sits on the page. */
  bare?: boolean;
  /**
   * Paint the tone's surface behind a BARE clock.
   *
   * One user: a prescribed hold in its final ten seconds, which inverts exactly as
   * rest does. The slab has to arrive without moving a numeral — a bare block that
   * grew a card's padding and corners would be a layout change wearing an alert's
   * clothes — so the background is switched on and nothing else about the block is.
   */
  filled?: boolean;
  /** The app's ONE shadow. The inverted rest slab, and nothing else. */
  shadow?: boolean;
  /** One line of `label`-size reference under everything. */
  note?: string;
  /**
   * What the numerals say, in words — "18 seconds of rest left".
   *
   * On the clock rather than on the block, and the same decision `PillClock`
   * makes: a screen reader should read the countdown once, as a sentence, not
   * announce a 120 dp glyph on every tick.
   */
  accessibilityLabel?: string;
  /** The controls row, inside the card under the drain. */
  children?: ReactNode;
}

export function FocusClockBlock({
  tone,
  label,
  labelColor,
  labelPlacement = 'above',
  value,
  variant = 'clock',
  glow = false,
  remainingFraction = null,
  drainColor,
  drainHead = false,
  bare = false,
  filled = false,
  shadow = false,
  note,
  accessibilityLabel,
  children,
}: FocusClockBlockProps) {
  const hasDrain = remainingFraction != null;
  // Clamped, so a `+15` that overshoots the original total cannot overflow.
  const left = hasDrain ? Math.min(100, Math.max(0, remainingFraction * 100)) : 0;

  const labelNode = (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      style={{ color: labelColor ?? tone.label }}
      className={`text-micro font-semibold uppercase ${labelPlacement === 'above' ? 'mb-xs' : 'mt-xs'}`}
    >
      {label}
    </Text>
  );

  return (
    <View
      style={[
        shadow ? timerShadow : null,
        bare
          ? filled
            ? { backgroundColor: tone.surface }
            : null
          : { backgroundColor: tone.surface, borderWidth: 1, borderColor: tone.border },
      ]}
      className={['mx-lg overflow-hidden', bare ? '' : 'rounded-surface'].join(' ')}
    >
      <View className={bare ? 'py-xs' : 'px-lg pb-md pt-lg'}>
        {labelPlacement === 'above' ? labelNode : null}
        <Text
          accessibilityLabel={accessibilityLabel}
          /*
           * `allowFontScaling={false}`, exactly as `PillClock` does it: the clock
           * is already sized to fill the width it has, and letting the OS scale it
           * on top of that pushes a five-character countdown past the edge in the
           * one stretch anybody is watching.
           */
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            { color: tone.clock, fontWeight: '600', fontVariant: ['tabular-nums'] },
            glow ? FOCUS_GLOW : null,
          ]}
          className={variant === 'count' ? 'text-focus-count' : 'text-focus-clock'}
        >
          {value}
        </Text>
        {labelPlacement === 'below' ? labelNode : null}
      </View>

      {hasDrain ? (
        /* 4 dp on a green-dim track, always — the inverted slab keeps the same
           track so it still reads as the same instrument. */
        <View className="h-xs w-full" style={{ backgroundColor: palette.greenDim }}>
          <View
            className="h-full"
            style={{
              width: `${left}%`,
              backgroundColor: drainColor ?? tone.drain,
              // The head of a frozen bar. A paused countdown has to stop LOOKING
              // live, and a bar the colour of its own track needs an edge or it
              // disappears.
              borderRightWidth: drainHead ? 1 : 0,
              borderRightColor: palette.greenBright,
            }}
          />
        </View>
      ) : null}

      {note ? (
        <Text
          numberOfLines={1}
          className={`text-label tabular-nums text-ink-faint ${bare ? 'mt-md' : 'px-lg pt-sm'}`}
        >
          {note}
        </Text>
      ) : null}

      {children ? <View className="flex-row p-sm">{children}</View> : null}
    </View>
  );
}

/**
 * `UP NEXT` — the set the countdown is FOR, under the clock it is counting.
 *
 * This block is the reason focus mode exists rather than a bigger timer pill:
 * when rest ends you have to already know what to walk to, without touching the
 * phone. So the same figures the clock replaced come back at `display` size in
 * ink — one step down from the 56 dp green they were at while they were the work,
 * which is the app's existing "this is a fact now" rule doing its normal job.
 *
 * A NEW EXERCISE IS A DIFFERENT EVENT, and it moves four channels at once, none of
 * them colour alone: the label's words, the label's colour, the block's ground,
 * and the name's size. Then it says the thing in words and NAMES THE EXERCISE YOU
 * ARE LEAVING — "which pull-up variant was I on" is the actual mid-workout
 * confusion, and it is the one question the session list answers by scrolling.
 */
export function FocusUpNext({
  target,
  unitSystem,
  isNewExercise,
  previousName,
  onPress,
  isOpen = false,
}: {
  target: FocusTarget;
  unitSystem: UnitSystem;
  isNewExercise: boolean;
  /** The exercise the last logged set was in, when it was a different one. */
  previousName?: string | null;
  /**
   * Make the block a control: open the ± on the set it is describing.
   *
   * Absent leaves it exactly what it was — a statement of what is coming. Present
   * is what turns REST from a screen you can only watch into a screen you can
   * plan on, which is the one thing a countdown is actually good for: the minute
   * before a set is when you decide the set is going to be lighter.
   */
  onPress?: () => void;
  /** The ± panel under this block is open — the affordance says so, and so does
   * the accessibility state. */
  isOpen?: boolean;
}) {
  const { exercise } = target.entry;

  const body = (
    <>
      <Text
        numberOfLines={1}
        className={[
          'text-micro font-semibold uppercase',
          isNewExercise ? 'text-green-bright' : 'text-ink-faint',
        ].join(' ')}
      >
        {isNewExercise ? 'next exercise' : 'up next'}
      </Text>

      <Text
        numberOfLines={2}
        className={[
          'mt-xs font-medium text-ink',
          isNewExercise ? 'text-title-lg' : 'text-title',
        ].join(' ')}
      >
        {exercise.name}
      </Text>

      <View className="mt-sm flex-row items-baseline">
        {exercise.requiresWeight ? (
          <>
            <Text className="text-display font-semibold tabular-nums text-ink">
              {formatWeight(target.set.weightKg, unitSystem, exercise.loadMode)}
            </Text>
            <Text className="ml-xs text-label font-semibold uppercase text-ink-muted">
              {unitLabel(unitSystem)}
            </Text>
            <Text className="mx-sm text-label text-ink-faint">×</Text>
          </>
        ) : null}

        <Text className="text-display font-semibold tabular-nums text-ink">
          {formatCount(target.set.count, exercise.countUnit)}
        </Text>
        <Text className="ml-xs text-label font-semibold uppercase text-ink-muted">
          {countUnitLabel(exercise.countUnit)}
        </Text>

        <View className="flex-1" />
        <Text className="text-micro font-semibold uppercase tabular-nums text-ink-faint">
          {describeSetPosition(target)}
        </Text>
        {/* The affordance, and only when there is one: `±` is the same mark the
            LIFT state uses for the same panel, so the gesture is learned once
            rather than twice. `×` while it is open, because the block is then the
            way back out of it. */}
        {onPress ? (
          <Text className="ml-md text-title text-ink-faint">{isOpen ? '×' : '±'}</Text>
        ) : null}
      </View>

      {isNewExercise && previousName ? (
        <Text className="mt-sm text-micro font-semibold uppercase text-green-bright">
          walk to a new machine · you were on {previousName}
        </Text>
      ) : null}
    </>
  );

  const style = {
    backgroundColor: isNewExercise ? palette.surfaceAlt : palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  } as const;
  const className = 'mx-lg rounded-surface px-lg pb-lg pt-lg';

  /*
   * A Pressable only when there is something to press. The children are built ONCE
   * above and handed to whichever container is needed, rather than through a
   * component declared in here: a component defined during render is a new type
   * every render, and this block re-renders four times a second while the rest it
   * sits under ticks. Same reasoning as `SetRow`'s `rowChildren`.
   */
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      accessibilityLabel={`Up next: ${exercise.name}. Adjust the weight or the count.`}
      style={style}
      className={`${className} mb-sm`}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style} className={`${className} mb-xl`}>
      {body}
    </View>
  );
}
