/**
 * RestTimerPill — the floating rest countdown.
 *
 *   running   ╭───────────────────────────────────────╮
 *             │  1:28  BETWEEN SETS   +15   ⏸   Skip  │
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *             ╰───────────────────────────────────────╯
 *
 *   paused    ╭───────────────────────────────────────╮
 *             │  1:28  PAUSED         +15   ▶   Skip  │
 *             │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *             ╰───────────────────────────────────────╯
 *
 * The pill's geometry, elevation, inversion, drain line and every colour in it
 * belong to `FloatingPill`, which the set timer shares — see that file for those
 * decisions. What is specific to REST is only this:
 *
 *   • THREE CONTROLS, ALL ON THE PILL, all one tap. `+15` buys more, `⏸` stops the
 *     clock without losing it, `Skip` ends rest now. Nothing is behind a
 *     tap-to-expand, because every one of them is something people do mid-rest
 *     with one hand while holding a water bottle in the other.
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
 *   • It renders only while resting and unmounts cleanly. No permanent chrome.
 */

import { Pressable, Text, View } from 'react-native';

import { formatClock } from '../lib/units';
import { useRestTimer } from '../hooks/useRestTimer';
import type { RestSource } from '../state/activeWorkoutStore';
import { FINAL_SECONDS, FloatingPill, PillClock, PillLabel, pillTone } from './FloatingPill';
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
    <FloatingPill
      inverted={finalTen}
      remainingFraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
    >
      <View className="flex-1 flex-row items-baseline">
        <PillClock
          value={formatClock(remaining)}
          tone={tone}
          accessibilityLabel={
            isPaused
              ? `Rest paused with ${secondsLeft} seconds left`
              : `${secondsLeft} seconds of rest left`
          }
        />
        <PillLabel tone={tone}>{restLabel(source, isPaused)}</PillLabel>
      </View>

      <View className="flex-row items-center">
        <Pressable
          onPress={() => add(stepSeconds)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Add ${stepSeconds} seconds`}
          className="h-hit justify-center px-md"
        >
          <Text
            allowFontScaling={false}
            style={{ color: tone.secondary }}
            className="text-label font-semibold tabular-nums"
          >
            +{stepSeconds}
          </Text>
        </Pressable>

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
          className="h-hit justify-center pl-md pr-xs"
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
    </FloatingPill>
  );
}
