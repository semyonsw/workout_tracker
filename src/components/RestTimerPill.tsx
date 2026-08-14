/**
 * RestTimerPill — the floating rest countdown.
 *
 *   ╭───────────────────────────────────────╮
 *   │  1:28            +15      Skip        │
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░ │
 *   ╰───────────────────────────────────────╯
 *
 * The pill's geometry, elevation, inversion and drain line belong to
 * `FloatingPill`, which the set timer shares — see that file for those
 * decisions. What is specific to REST is only this:
 *
 *   • Controls are ON the pill, not behind a tap-to-expand. "+15" and "Skip"
 *     are the only two things anyone does to a rest timer, and both are one tap.
 *   • It renders only while resting and unmounts cleanly. No permanent chrome.
 */

import { Pressable, Text, View } from 'react-native';

import { formatClock } from '../lib/units';
import { useRestTimer } from '../hooks/useRestTimer';
import { FINAL_SECONDS, FloatingPill } from './FloatingPill';

export function RestTimerPill() {
  const { remaining, isRunning, totalSeconds, add, skip } = useRestTimer();

  if (!isRunning) return null;

  const finalTen = remaining <= FINAL_SECONDS;

  return (
    <FloatingPill
      inverted={finalTen}
      remainingFraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
    >
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${Math.ceil(remaining)} seconds of rest left`}
        className={[
          'text-title font-semibold tabular-nums',
          finalTen ? 'text-bg' : 'text-green-bright',
        ].join(' ')}
      >
        {formatClock(remaining)}
      </Text>

      <View className="flex-row items-center">
        <Pressable
          onPress={() => add(15)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          className="h-hit justify-center px-md"
        >
          <Text
            className={[
              'text-label font-semibold tabular-nums',
              finalTen ? 'text-green-wash' : 'text-ink-muted',
            ].join(' ')}
          >
            +15
          </Text>
        </Pressable>

        <Pressable
          onPress={skip}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          className="h-hit justify-center pl-md pr-xs"
        >
          <Text className={['text-label font-semibold', finalTen ? 'text-bg' : 'text-ink'].join(' ')}>
            Skip
          </Text>
        </Pressable>
      </View>
    </FloatingPill>
  );
}
