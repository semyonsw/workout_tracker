/**
 * RestTimerPill — the rest countdown, at the top of the session.
 *
 *   running   ╭───────────────────────────────────────╮
 *             │  1:28                          ( ⏸ )  │  ← pause beside the clock
 *             │  BETWEEN SETS                         │
 *             │                 (−15) (+15) ( Skip )  │  ← right-aligned, the thumb
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *             ╰───────────────────────────────────────╯
 *
 *   paused    ╭───────────────────────────────────────╮
 *             │  1:28                          ( ▶ )  │
 *             │  BETWEEN SETS · PAUSED                │
 *             │                 (−15) (+15) ( Skip )  │
 *             ╰───────────────────────────────────────╯
 *
 * The pill's geometry, elevation, inversion, drain line and every colour in it
 * belong to `TimerPill`, which the set timer shares — see that file for those
 * decisions. What is specific to REST is only this:
 *
 *   • FOUR CONTROLS, ALL ON THE PILL, all one tap. `−15` and `+15` change the
 *     rest, `⏸` stops the clock without losing it, `Skip` ends rest now. Nothing
 *     is behind a tap-to-expand, because every one of them is something people do
 *     mid-rest with one hand while holding a water bottle in the other.
 *   • THEY ARE WHERE THE RIGHT THUMB IS. The pause is a 52 dp circle on the
 *     clock's own row, at its right end; `−15 +15 Skip` are 40 dp pills
 *     right-aligned under the label. The three frequent controls sit in the arc a
 *     thumb sweeps without the hand moving, and the one that freezes the clock sits
 *     beside the clock it freezes.
 *   • `−15` IS NOT DECORATION, AND IT IS NOT THE OPPOSITE OF `+15` EITHER. Both
 *     of them set the rest for every set that follows (see `useRestTimer`), and
 *     the minus is the one that was missing: the pill could only ever make a rest
 *     longer, so "I'm warm, 1:30 is enough now" meant leaving the gym floor for
 *     Settings, or waiting out a countdown you had already decided was wrong.
 *     The label is a real `−`, not a hyphen, so it pairs with the `+` above it.
 *   • STOP AND SKIP ARE DIFFERENT, AND THE PILL SAYS SO. Pausing keeps the pill and
 *     freezes the number; skipping dismisses it. The paused state relabels itself
 *     `BETWEEN SETS · PAUSED` and swaps ⏸ for ▶, so a frozen 1:28 can never be
 *     mistaken for a timer that has stalled — and still says which rest it is.
 *   • IT SAYS WHICH REST THIS IS. `BETWEEN SETS` and `NEXT EXERCISE` are two
 *     different lengths the user sets separately, and a countdown that doesn't say
 *     which one it is running is a setting you cannot check. This label is how you
 *     can see, mid-workout, that the two numbers in Settings are doing what they
 *     say.
 *   • THE ± STEP IS THE USER'S. Read from Settings rather than hard-coded at 15,
 *     so the chip's label and what it does can never drift apart.
 *   • THE LABEL SITS UNDER THE CLOCK, not beside it. Four controls and an inline
 *     label do not both fit on a 360 dp phone — see `PillLabel` — and at the size
 *     the clock is now, nothing fits beside it at all.
 *   • It renders only while resting and unmounts cleanly. No permanent chrome.
 */

import type { ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { formatClock } from '../lib/units';
import { useRestTimer } from '../hooks/useRestTimer';
import type { RestSource } from '../state/activeWorkoutStore';
import {
  FINAL_SECONDS,
  PillClock,
  PillLabel,
  pillTone,
  TimerPill,
  type PillTone,
} from './TimerPill';
import { Icon } from './Icon';
import { usePressScale } from './motion';
import { useT, type Translate } from '../hooks/useT';

/**
 * What kind of rest is running, in the fewest words that distinguish them.
 *
 * Exported for focus mode, which shows the same countdown at four times the size
 * and must not word it differently: `BETWEEN SETS` and `NEXT EXERCISE` are the two
 * lengths the user sets separately, and this label is how you check, mid-workout,
 * that the two numbers in Settings are doing what they say.
 */
export function restLabel(source: RestSource | null, isPaused: boolean, t: Translate): string {
  const which =
    source === 'transition' ? t('next exercise') : source === 'set' ? t('between sets') : t('rest');
  return isPaused ? `${which} · ${t('paused')}` : which;
}

export function RestTimerPill() {
  const t = useT();
  const {
    remaining,
    isActive,
    isPaused,
    isRunning,
    source,
    totalSeconds,
    stepSeconds,
    endsAt,
    add,
    pause,
    resume,
    skip,
  } = useRestTimer();

  if (!isActive) return null;

  // A paused pill never inverts: the slab means "act now", and the whole point of
  // a pause is that nothing is being demanded of the user yet.
  const finalTen = !isPaused && remaining <= FINAL_SECONDS;
  const tone = pillTone(finalTen);
  const secondsLeft = Math.ceil(remaining);

  return (
    <TimerPill
      inverted={finalTen}
      remainingFraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
      /* Continuous while it runs, frozen while paused; re-anchored on every new
         deadline — see `TimerPill`. */
      drainMs={isRunning ? remaining * 1000 : null}
      drainKey={isPaused ? 'paused' : endsAt}
      pulse={finalTen && isRunning}
    >
      {/* The clock row: the numerals, and the pause at their right end. */}
      <View className="flex-row items-center">
        <View className="flex-1">
          <PillClock
            value={formatClock(remaining)}
            tone={tone}
            accessibilityLabel={
              isPaused
                ? t('Rest paused with {seconds} seconds left', { seconds: secondsLeft })
                : t('{seconds} seconds of rest left', { seconds: secondsLeft })
            }
          />
        </View>
        {/* Glyph, not a word: `Pause` and `Skip` side by side are two similar
            words in the same weight, and the wrong one costs you a rest. */}
        <RoundControl
          onPress={isPaused ? resume : pause}
          tone={tone}
          accessibilityLabel={isPaused ? t('Resume rest') : t('Pause rest')}
          size={52}
        >
          <Icon name={isPaused ? 'play' : 'pause'} size={20} color={tone.primary} />
        </RoundControl>
      </View>

      <View className="mt-[2px]">
        <PillLabel tone={tone} inline={false}>
          {restLabel(source, isPaused, t)}
        </PillLabel>
      </View>

      {/* `−15 +15 Skip`, right-aligned — see the file header. Minus first, plus
          second: the order they sit in on every other ± control in the app. */}
      <View className="mt-[10px] flex-row items-center justify-end" style={{ gap: 8 }}>
        <StepChip
          seconds={-stepSeconds}
          tone={tone}
          what={restLabel(source, false, t)}
          onPress={() => add(-stepSeconds)}
        />
        <StepChip
          seconds={stepSeconds}
          tone={tone}
          what={restLabel(source, false, t)}
          onPress={() => add(stepSeconds)}
        />
        <RoundControl onPress={skip} tone={tone} accessibilityLabel={t('Skip rest')} pill>
          <Text
            allowFontScaling={false}
            style={{ color: tone.primary, fontSize: 14 }}
            className="font-semibold"
          >
            {t('Skip')}
          </Text>
        </RoundControl>
      </View>
    </TimerPill>
  );
}

/**
 * One outlined control on the pill: the 52 dp pause circle, or a 40 dp pill.
 * Sinks to 0.9 under the finger — the pill is read from across a gym, and the
 * press has to be visible from there too.
 */
function RoundControl({
  onPress,
  tone,
  accessibilityLabel,
  size = 40,
  pill = false,
  children,
}: {
  onPress: () => void;
  tone: PillTone;
  accessibilityLabel: string;
  size?: number;
  pill?: boolean;
  children: ReactNode;
}) {
  const press = usePressScale(pill ? 0.9 : 0.88);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={{
          height: size,
          minWidth: size,
          paddingHorizontal: pill ? 18 : 0,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: tone.chipBorder,
          alignItems: 'center',
          justifyContent: 'center',
          transform: press.style.transform,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * One end of the ± pair: a 40 dp outlined pill, `−15` / `+15`.
 *
 * The accessibility label says what the adjustment MEANS, not what it does to the
 * clock: "Rest between sets 15 seconds shorter" is the promise the button keeps —
 * every set after this one, not just this rest. See `useRestTimer`.
 */
function StepChip({
  seconds,
  tone,
  what,
  onPress,
}: {
  seconds: number;
  tone: PillTone;
  /** "between sets" / "next exercise" — which rest is being changed. */
  what: string;
  onPress: () => void;
}) {
  const t = useT();
  const shorter = seconds < 0;
  const size = Math.abs(seconds);
  const press = usePressScale(0.9);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        shorter
          ? t('Rest {what} {size} seconds shorter', { what, size })
          : t('Rest {what} {size} seconds longer', { what, size })
      }
    >
      <Animated.View
        style={{
          height: 40,
          paddingHorizontal: 16,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: tone.chipBorder,
          justifyContent: 'center',
          transform: press.style.transform,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{ color: tone.secondary, fontSize: 14 }}
          className="font-medium tabular-nums"
        >
          {shorter ? '−' : '+'}
          {size}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
