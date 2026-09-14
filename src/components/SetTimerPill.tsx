/**
 * SetTimerPill — the clock on the set you are in the middle of.
 *
 *   get ready          ╭─────────────────────────────────────╮
 *                      │ 3  GET READY                        │
 *                      │                  Start now       ✕  │
 *                      ╰─────────────────────────────────────╯
 *
 *   countdown, 2:00    ╭─────────────────────────────────────╮
 *   plank              │ 1:24  PLANK                         │
 *                      │            +15       Stop        ✕  │
 *                      │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │
 *                      ╰─────────────────────────────────────╯
 *
 *   count up           ╭─────────────────────────────────────╮
 *   dead hang          │ 0:47  HOLDING                       │
 *                      │                      Stop        ✕  │
 *                      ╰─────────────────────────────────────╯
 *
 * Same slot, same instrument, same shadow and same colours as the rest timer —
 * see `TimerPill`. Three things here are specific to timing a set:
 *
 *  • THE CLOCK IS THE WHOLE PILL. During a hold the user is not reading a list;
 *    they are staring at the ceiling and glancing down. So the numerals get the
 *    bigger `count` size in the get-ready phase (a 5-4-3-2-1 you can read from
 *    the floor) and clock size once work starts, where the label beside them says
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
import { FINAL_SECONDS, PillClock, PillLabel, pillTone, TimerPill } from './TimerPill';
import { Icon } from './Icon';
import { useT } from '../hooks/useT';

export function SetTimerPill() {
  const t = useT();
  const { timer, reading, stepSeconds, add, startNow, stop, cancel } = useSetTimer();
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
  const tone = pillTone(finalTen);

  const label = preparing
    ? t('get ready')
    : timer.mode === 'countup'
      ? t('holding')
      : (exerciseName ?? t('working'));

  return (
    <TimerPill inverted={finalTen} remainingFraction={reading.remainingFraction}>
      {/* The clock and its label share a baseline: this pill carries at most two
          controls, so the name of the exercise still fits beside the numerals.
          No `flex-1` — the pill's content is a column (see `TimerPill`). */}
      <View className="flex-row items-baseline">
        <PillClock
          value={preparing ? reading.display : formatClock(reading.display)}
          tone={tone}
          variant={preparing ? 'count' : 'clock'}
          accessibilityLabel={
            preparing
              ? t('Starting in {seconds} seconds', { seconds: reading.display })
              : timer.mode === 'countup'
                ? t('{clock} held', { clock: formatClock(reading.display) })
                : t('{clock} left', { clock: formatClock(reading.display) })
          }
        />
        <PillLabel tone={tone}>{label}</PillLabel>
      </View>

      {/* Under the clock and right-aligned, exactly as the rest pill's are. */}
      <View className="mt-sm flex-row items-center justify-end">
        {preparing ? (
          <Pressable
            onPress={startNow}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('Start now, skip the get-ready count')}
            className="h-hit justify-center px-md"
          >
            <Text
              allowFontScaling={false}
              style={{ color: tone.secondary }}
              className="text-label font-semibold"
            >
              {t('Start now')}
            </Text>
          </Pressable>
        ) : timer.mode === 'countdown' ? (
          <Pressable
            onPress={() => add(stepSeconds)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('Add {seconds} seconds', { seconds: stepSeconds })}
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
        ) : null}

        {preparing ? null : (
          <Pressable
            onPress={stop}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('Stop and log {clock}', {
              clock: formatClock(reading.workedSeconds),
            })}
            className="h-hit justify-center px-md"
          >
            <Text
              allowFontScaling={false}
              style={{ color: tone.primary }}
              className="text-label font-semibold"
            >
              {t('Stop')}
            </Text>
          </Pressable>
        )}

        {/* The only way out without logging anything. Glyph, not a word: it is
            the escape hatch, not one of the two things you normally do. */}
        <Pressable
          onPress={cancel}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('Cancel timer without logging')}
          className="h-hit w-[28px] items-center justify-center"
        >
          <Icon name="x" size={16} color={finalTen ? tone.primary : tone.label} />
        </Pressable>
      </View>
    </TimerPill>
  );
}
