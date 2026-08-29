/**
 * RestTimerPill — the rest countdown, at the top of the session.
 *
 *   running   ╭───────────────────────────────────────╮
 *             │  1:28                             ⏸    │
 *             │  BETWEEN SETS      −15  +15      Skip │
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *             ╰───────────────────────────────────────╯
 *
 *   paused    ╭───────────────────────────────────────╮
 *             │  1:28                             ▶    │
 *             │  PAUSED            −15  +15      Skip │
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
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
 *   • `−15` IS NOT DECORATION, AND IT IS NOT THE OPPOSITE OF `+15` EITHER. Both
 *     of them set the rest for every set that follows (see `useRestTimer`), and
 *     the minus is the one that was missing: the pill could only ever make a rest
 *     longer, so "I'm warm, 1:30 is enough now" meant leaving the gym floor for
 *     Settings, or waiting out a countdown you had already decided was wrong.
 *     The label is a real `−`, not a hyphen, so it pairs with the `+` above it.
 *   • STOP AND SKIP ARE DIFFERENT, AND THE PILL SAYS SO. Pausing keeps the pill and
 *     freezes the number; skipping dismisses it. The paused state relabels itself
 *     `PAUSED` and swaps ⏸ for ▶, so a frozen 1:28 can never be mistaken for a
 *     timer that has stalled.
 *   • IT SAYS WHICH REST THIS IS. `BETWEEN SETS` and `NEXT EXERCISE` are two
 *     different lengths the user sets separately, and a countdown that doesn't say
 *     which one it is running is a setting you cannot check. This label is how you
 *     can see, mid-workout, that the two numbers in Settings are doing what they
 *     say.
 *   • THE ± STEP IS THE USER'S. Read from Settings rather than hard-coded at 15,
 *     so the chip's label and what it does can never drift apart.
 *   • THE LABEL SITS UNDER THE CLOCK, not beside it. Four controls and an inline
 *     label do not both fit on a 360 dp phone — see `PillLabel`.
 *   • It renders only while resting and unmounts cleanly. No permanent chrome.
 */

import { Pressable, Text, View } from 'react-native';

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

/** What kind of rest is running, in the fewest words that distinguish them. */
function restLabel(source: RestSource | null, isPaused: boolean): string {
  if (isPaused) return 'paused';
  if (source === 'transition') return 'next exercise';
  if (source === 'set') return 'between sets';
  return 'rest';
}

export function RestTimerPill() {
  const {
    remaining,
    isActive,
    isPaused,
    source,
    totalSeconds,
    stepSeconds,
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
    >
      <View className="flex-1">
        <PillClock
          value={formatClock(remaining)}
          tone={tone}
          accessibilityLabel={
            isPaused
              ? `Rest paused with ${secondsLeft} seconds left`
              : `${secondsLeft} seconds of rest left`
          }
        />
        <PillLabel tone={tone} inline={false}>
          {restLabel(source, isPaused)}
        </PillLabel>
      </View>

      <View className="flex-row items-center">
        {/* Minus first, plus second — the order they sit in on every other ±
            control in the app, and the order they read in the label `± step`. */}
        <StepChip
          seconds={-stepSeconds}
          tone={tone}
          what={restLabel(source, false)}
          onPress={() => add(-stepSeconds)}
        />
        <StepChip
          seconds={stepSeconds}
          tone={tone}
          what={restLabel(source, false)}
          onPress={() => add(stepSeconds)}
        />

        {/* Glyph, not a word: `Pause` and `Skip` side by side are two similar
            words in the same weight, and the wrong one costs you a rest. */}
        <Pressable
          onPress={isPaused ? resume : pause}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isPaused ? 'Resume rest' : 'Pause rest'}
          className="h-hit w-[32px] items-center justify-center"
        >
          <Icon name={isPaused ? 'play' : 'pause'} size={16} color={tone.primary} />
        </Pressable>

        <Pressable
          onPress={skip}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          className="h-hit justify-center pl-sm pr-xs"
        >
          <Text
            allowFontScaling={false}
            style={{ color: tone.primary }}
            className="text-label font-semibold"
          >
            Skip
          </Text>
        </Pressable>
      </View>
    </TimerPill>
  );
}

/**
 * One end of the ± pair.
 *
 * `px-sm` rather than the `px-md` a two-control pill can afford: four targets
 * share this row. The tap target is not shrunk with the padding — `h-hit` plus
 * `hitSlop` keeps it past 44 dp in both directions, so the chips are still
 * findable by a thumb that isn't looking.
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
  const shorter = seconds < 0;
  const size = Math.abs(seconds);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Rest ${what} ${size} seconds ${shorter ? 'shorter' : 'longer'}`}
      className="h-hit justify-center px-sm"
    >
      <Text
        allowFontScaling={false}
        style={{ color: tone.secondary }}
        className="text-label font-semibold tabular-nums"
      >
        {shorter ? '−' : '+'}
        {size}
      </Text>
    </Pressable>
  );
}
