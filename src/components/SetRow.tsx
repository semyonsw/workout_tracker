/**
 * SetRow — the most important 56 dp in the app.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  W     +20 KG      ×    8 REPS           ( ✓ )│  ← a warm-up
 *   │  1     +40 KG      ×    4 REPS           ( ✓ )│
 *   │  2       2:00 MIN                    ( ▶ )( ✓ )│  ← a timed set
 *   │  3       65 KG     ×    5 REPS           ( ✓ )│
 *   │        20 + 2×10 + 2×2.5                      │  ← a barbell lift
 *   └──────────────────────────────────────────────┘
 *
 * Interaction contract:
 *   • The row arrives PRE-FILLED with last session's numbers, rendered faint
 *     ("ghost") on a lifted `surface-alt` background. That is the visual promise
 *     of "tap ✓ if nothing changed" — logging an identical set costs ONE tap.
 *   • A value goes full `ink` the moment it stops matching last session, or the
 *     moment the set is logged. Ink means "this is a fact now."
 *   • Tapping a number chips that cell up and opens the editor below the row —
 *     no keyboard, no modal, no scroll jump.
 *   • When `requiresWeight` is false the weight cell is ABSENT, not disabled,
 *     and the count cell widens into its place so rounds, minutes and reps all
 *     land under the same thumb position a weight would.
 *   • A TIMED set (a plank, a hang, a round) grows a ▶ to the LEFT of the ✓, and
 *     keeps the ✓. Two controls, because they answer two different questions:
 *     ▶ is "run the clock for me", ✓ is "I did this, take my word for it". The ✓
 *     never changes meaning anywhere in the app, so it does not get replaced —
 *     and a set held away from the phone can still be logged in one tap.
 *     While the clock is running the ▶ fills green and becomes stop-and-log.
 *   • A WARM-UP reads `W` where a working set reads its number, and the working
 *     sets number around it: W, 1, 2, 3. A warm-up is a set that does not
 *     count — it is out of the volume, out of the set count, out of the
 *     shorthand and out of every verdict — so it must not be numbered as though
 *     it did, and "set 2 of 5" must mean the second of five sets that counted.
 *     Same `ink-faint` as the numbers, because it is the same kind of landmark
 *     and not a warning; the toggle lives in `QuickAdjust`, beside `Remove set`.
 *   • A BARBELL LIFT gets what goes on the bar, under the weight cell:
 *     `20 + 2×10 + 2×2.5`. Only when the exercise declares a `barWeightKg`, so a
 *     machine, a dumbbell and a cable stack never show one — a plate breakdown for
 *     a pin position is a lie about the equipment. It INFORMS AND NEVER ROUNDS: an
 *     unreachable target renders no line at all rather than the nearest loadable
 *     weight, because `QuickAdjust`'s header is explicit that nothing here is
 *     snapped to a grid by a machine the app has never seen, and this is the most
 *     tempting place in the codebase to break that.
 */

import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { commit, tap, undo } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import { describePlates, platesFor } from '../lib/plates';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { palette } from '../theme/tokens';
import { Icon } from './Icon';

export type SetField = 'weight' | 'count';

interface SetRowProps {
  set: DraftSet;
  /**
   * What the leftmost column reads: the WORKING-set number (1-based), or null for
   * a warm-up, which reads `W` instead.
   *
   * Computed by the card rather than here, because it depends on the sets above
   * this one — `workingSetLabels` is the pure function that does it.
   */
  workingNumber: number | null;
  exercise: Exercise;
  unitSystem: UnitSystem;
  /** The next uncompleted set — lifted onto `surface-alt` so the eye lands on it. */
  isNext: boolean;
  /** Which field (if any) is currently open in the inline editor. */
  focusedField: SetField | null;
  /** This exercise is clock-driven: render the ▶. */
  isTimed?: boolean;
  /** The clock is running for THIS set. */
  isTiming?: boolean;
  /**
   * The plates this gym has, from Settings. Only read for an exercise that
   * declares a bar weight, and a stable reference from the store — this component
   * is memoized.
   */
  availablePlatesKg?: readonly number[];
  onFocusField: (field: SetField) => void;
  onToggleComplete: () => void;
  /** Start the clock, or — while it runs — stop it and log what it read. */
  onPressTimer?: () => void;
}

function SetRowComponent({
  set,
  workingNumber,
  exercise,
  unitSystem,
  isNext,
  focusedField,
  isTimed = false,
  isTiming = false,
  availablePlatesKg,
  onFocusField,
  onToggleComplete,
  onPressTimer,
}: SetRowProps) {
  const done = set.isCompleted;
  // Ghost = a value carried over from last session that the user hasn't touched.
  const ghost = set.isPrefilled && !done;
  const valueTone = ghost ? 'text-ink-faint' : 'text-ink';

  /*
   * What goes on the bar. Null — and therefore no line — for a machine (no
   * `barWeightKg`), for an empty weight cell, and for a target this plate set
   * cannot make. See the file header on why the third case is a missing line
   * rather than a rounded weight.
   */
  const plateLabel =
    exercise.barWeightKg != null && set.weightKg != null
      ? describePlates(
          exercise.barWeightKg,
          platesFor(set.weightKg, exercise.barWeightKg, availablePlatesKg),
        )
      : null;

  const handleComplete = () => {
    // Medium impact on completion, light on undo — the hand can tell them apart.
    if (done) undo();
    else commit();
    onToggleComplete();
  };

  // The get-ready count and the stop both have their own feedback (see
  // `useSetTimer`), so pressing ▶ only needs to acknowledge the tap itself.
  const handleTimer = () => {
    tap();
    onPressTimer?.();
  };

  return (
    <View
      className={[
        // `min-h` rather than a fixed `h-row`: the plate line adds 14 dp and only
        // on the rows that have one, so a barbell card grows and a machine card is
        // exactly the height it has always been.
        plateLabel ? 'min-h-row py-sm' : 'h-row',
        'flex-row items-center px-lg',
        // The primed row is the only one that lifts. Logged and later rows sit
        // flush on the card so "next" is unambiguous at a glance.
        isNext && !done ? 'bg-surface-alt' : 'bg-transparent',
      ].join(' ')}
    >
      {/* Set index — never a tap target, purely a landmark. `W` for a warm-up:
          see the file header. */}
      <Text className="w-[24px] text-micro font-semibold uppercase tabular-nums text-ink-faint">
        {workingNumber == null ? 'W' : workingNumber}
      </Text>

      {exercise.requiresWeight ? (
        <>
          <View className="min-w-[96px]">
            <ValueCell
              width="w-full"
              value={formatWeight(set.weightKg, unitSystem, exercise.loadMode)}
              unit={unitLabel(unitSystem)}
              tone={valueTone}
              focused={focusedField === 'weight'}
              onPress={() => onFocusField('weight')}
              accessibilityLabel={`Weight ${formatWeight(set.weightKg, unitSystem, exercise.loadMode)} ${unitLabel(unitSystem)}`}
            />
            {/* Micro, ink-faint, under the number it describes: it is reference,
                not a control, and nothing about it is tappable. */}
            {plateLabel ? (
              <Text
                numberOfLines={1}
                className="mt-[1px] text-micro tabular-nums text-ink-faint"
                accessibilityLabel={`On the bar: ${plateLabel} kilograms`}
              >
                {plateLabel}
              </Text>
            ) : null}
          </View>
          <Text className="mx-sm text-label text-ink-faint">×</Text>
        </>
      ) : null}

      {/* Count cell — reps / rounds / minutes / metres. Takes the weight cell's
          96 dp when there is no weight, so the thumb target never moves. */}
      <ValueCell
        width={exercise.requiresWeight ? 'min-w-[76px]' : 'min-w-[96px]'}
        value={formatCount(set.count, exercise.countUnit)}
        unit={countUnitLabel(exercise.countUnit)}
        tone={valueTone}
        focused={focusedField === 'count'}
        onPress={() => onFocusField('count')}
        accessibilityLabel={`${set.count} ${countUnitLabel(exercise.countUnit)}`}
      />

      <View className="flex-1" />

      {/* Run the clock. Present only on timed work, and only until the set is
          logged — there is nothing to time about a set that already happened. */}
      {isTimed && !done ? (
        <Pressable
          onPress={handleTimer}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            isTiming
              ? 'Stop the timer and log this set'
              : `Start ${formatCount(set.count, exercise.countUnit)} timer`
          }
          className={[
            'mr-sm h-hit w-hit items-center justify-center rounded-pill',
            isTiming ? 'bg-green' : 'border border-hairline',
          ].join(' ')}
        >
          <Icon name="play" size={16} color={isTiming ? palette.ink : palette.greenBright} />
        </Pressable>
      ) : null}

      {/* The commit target. Deliberately the largest element in the row. */}
      <Pressable
        onPress={handleComplete}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'Undo set' : 'Complete set'}
        className={[
          'h-hit w-hit items-center justify-center rounded-pill',
          done ? 'bg-green' : 'border border-hairline',
        ].join(' ')}
      >
        <Icon name="check" size={20} color={done ? palette.ink : palette.inkFaint} />
      </Pressable>
    </View>
  );
}

/**
 * One number + its micro unit, baseline-aligned.
 *
 * Focused, it grows a `surface` chip behind itself with a −8 left margin, so
 * the chip appears *around* the value without the value sliding sideways. The
 * number under the thumb must not move when it is tapped.
 */
function ValueCell({
  width,
  value,
  unit,
  tone,
  focused,
  onPress,
  accessibilityLabel,
}: {
  width: string;
  value: string;
  unit: string;
  tone: string;
  focused: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={[
        width,
        'flex-row items-baseline',
        focused ? '-ml-sm rounded-surface bg-surface px-sm py-[2px]' : '',
      ].join(' ')}
    >
      <Text className={`text-title font-semibold tabular-nums ${tone}`}>{value}</Text>
      <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">{unit}</Text>
    </Pressable>
  );
}

/**
 * Memoized: an 18-set session renders ~35 rows, and every tick of the rest
 * timer re-renders the screen. Rows must not repaint for someone else's state.
 */
export const SetRow = memo(SetRowComponent);
