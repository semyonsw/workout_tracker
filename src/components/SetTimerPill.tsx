/**
 * SetTimerPill — the clock on the set you are in the middle of.
 *
 *   get ready          ╭─────────────────────────────────────╮
 *                      │ GET READY  3       Start now     ✕  │
 *                      ╰─────────────────────────────────────╯
 *
 *   countdown, 2:00    ╭─────────────────────────────────────╮
 *   plank              │ 1:24  PLANK        +15   Stop    ✕  │
 *                      │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *                      ╰─────────────────────────────────────╯
 *
 *   count up           ╭─────────────────────────────────────╮
 *   dead hang          │ 0:47  HOLDING            Stop    ✕  │
 *                      ╰─────────────────────────────────────╯
 *
 * Same slot, same instrument, same shadow as the rest timer — see
 * `FloatingPill`. Three things here are specific to timing a set:
 *
 *  • THE CLOCK IS THE WHOLE PILL. During a hold the user is not reading a list;
 *    they are staring at the ceiling and glancing down. So the numerals get
 *    Display size in the get-ready count (a 5-4-3-2-1 you can read from the
 *    floor) and Title size once work starts, where the label beside them says
 *    which exercise the clock belongs to.
 *  • STOP IS NOT SKIP. Skipping rest throws away nothing; stopping a hold LOGS
 *    it. So the primary action is worded `Stop`, sits where `Skip` sits, and the
 *    only way to walk away with nothing recorded is the explicit ✕.
 *  • `+15` EXISTS ONLY FOR A PRESCRIBED HOLD. There is no target to extend on an
 *    open hang, and a chip that silently does nothing is worse than no chip.
 */

import { Pressable, Text, View } from 'react-native';

import { formatClock } from '../lib/units';
import { useSetTimer } from '../hooks/useSetTimer';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { palette } from '../theme/tokens';
import { FINAL_SECONDS, FloatingPill } from './FloatingPill';
import { Icon } from './Icon';

export function SetTimerPill() {
  const { timer, reading, add, startNow, stop, cancel } = useSetTimer();
  /* The exercise name is what makes the clock mean something — "1:24" alone
     could be rest. Read straight from the store so the pill needs no props. */
  const exerciseName = useActiveWorkout((s) =>
    timer
      ? (s.session?.entries.find((e) => e.localId === timer.entryId)?.exercise.name ?? null)
      : null,
  );

  if (!timer || !reading) return null;

  const preparing = reading.phase === 'prepare';
  // A countdown inverts in its last ten seconds, exactly as rest does. The
  // get-ready count never inverts: it is about to become the loud thing, and two
  // slabs in a row would make neither of them read as an alert.
  const finalTen = !preparing && timer.mode === 'countdown' && reading.display <= FINAL_SECONDS;

  const label = preparing
    ? 'get ready'
    : timer.mode === 'countup'
      ? 'holding'
      : (exerciseName ?? 'working');

  return (
    <FloatingPill inverted={finalTen} remainingFraction={reading.remainingFraction}>
      <View className="flex-1 flex-row items-baseline">
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            preparing
              ? `Starting in ${reading.display} seconds`
              : `${formatClock(reading.display)} ${timer.mode === 'countup' ? 'held' : 'left'}`
          }
          className={[
            preparing ? 'text-display' : 'text-title',
            'font-semibold tabular-nums',
            finalTen ? 'text-bg' : 'text-green-bright',
          ].join(' ')}
        >
          {preparing ? reading.display : formatClock(reading.display)}
        </Text>

        <Text
          numberOfLines={1}
          className={[
            'ml-sm flex-1 text-micro font-semibold uppercase',
            finalTen ? 'text-green-wash' : 'text-ink-faint',
          ].join(' ')}
        >
          {label}
        </Text>
      </View>

      <View className="flex-row items-center">
        {preparing ? (
          <Pressable
            onPress={startNow}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Start now, skip the get-ready count"
            className="h-hit justify-center px-md"
          >
            <Text className="text-label font-semibold text-ink-muted">Start now</Text>
          </Pressable>
        ) : timer.mode === 'countdown' ? (
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
        ) : null}

        {preparing ? null : (
          <Pressable
            onPress={stop}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Stop and log ${formatClock(reading.workedSeconds)}`}
            className="h-hit justify-center px-md"
          >
            <Text
              className={['text-label font-semibold', finalTen ? 'text-bg' : 'text-ink'].join(' ')}
            >
              Stop
            </Text>
          </Pressable>
        )}

        {/* The only way out without logging anything. Glyph, not a word: it is
            the escape hatch, not one of the two things you normally do. */}
        <Pressable
          onPress={cancel}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Cancel timer without logging"
          className="h-hit w-[28px] items-center justify-center"
        >
          <Icon name="x" size={16} color={finalTen ? palette.bg : palette.inkFaint} />
        </Pressable>
      </View>
    </FloatingPill>
  );
}
