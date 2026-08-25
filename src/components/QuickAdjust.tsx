/**
 * QuickAdjust — the inline value editor, opened directly under the tapped row.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  −2   −0.5      42.5 KG      +0.5   +2       │
 *   │  Type    Warm-up    Remove set       Done    │
 *   └──────────────────────────────────────────────┘
 *
 * This is where the tap-count promise is proven. One tap logs an unchanged set
 * (the ✓). THREE taps log 2 kg heavier: the weight cell, `+2`, the ✓.
 *
 * Why not a keyboard? Because the gym case is "same as last time, plus one
 * plate". Four chips beat eleven keys, work with sweaty thumbs, and never cover
 * the row being edited. `Type` is still there for the case where a number
 * changes wholesale — the only path to a keyboard inside a session.
 *
 * WEIGHT STEPS BY ±0.5 AND ±2, EVERYWHERE (see `weightSteps`). Not by the
 * exercise's own increment, which is a progression plan rather than a thumb
 * gesture: reading the chips off a 2.5 kg increment offered ±5 where nobody
 * wanted it and made every half-kilo — the small disc on a dumbbell, the change
 * plate on a bar — unreachable. Nothing is snapped to a grid either, so 16.5 kg
 * stays 16.5 rather than being rounded to something "loadable" by a machine the
 * app has never seen. There is no Cancel: edits are applied live, and `Done`
 * only closes the panel.
 *
 * WARM-UP LIVES HERE, as a chip beside `Remove set`, because this panel already IS
 * the set-row editor and a flag on a set does not earn a surface of its own.
 * `isWarmup` has been on both `DraftSet` and `SetHistory` since the first release,
 * with two consumers filtering on it — the overload engine and the shorthand — and
 * nothing anywhere able to set it. That is worse than a missing feature: a light
 * warm-up rendered as a drop-set group in the history line, and a heavy warm-up
 * single was read as the session's TOP WORKING WEIGHT and drove a nudge off a set
 * the user never worked at.
 *
 * The label says what tapping it will do, not what the set currently is:
 * `Warm-up` on a working set, `Working set` on a warm-up. It is green-bright in the
 * second case because green means "this is on" everywhere else in the app.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { tap } from '../lib/feedback';
import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import {
  countStep,
  countUnitLabel,
  formatCount,
  formatWeight,
  kgToLb,
  lbToKg,
  unitLabel,
  weightSteps,
} from '../lib/units';
import type { SetField } from './SetRow';

interface QuickAdjustProps {
  field: SetField;
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  onChange: (patch: Partial<DraftSet>) => void;
  onClose: () => void;
  onRemoveSet: () => void;
}

export function QuickAdjust({
  field,
  set,
  exercise,
  unitSystem,
  onChange,
  onClose,
  onRemoveSet,
}: QuickAdjustProps) {
  const [typing, setTyping] = useState(false);
  const [buffer, setBuffer] = useState('');
  const inputRef = useRef<TextInput>(null);

  const isWeight = field === 'weight';
  /*
   * Chips are expressed in the user's own units; kg is the storage unit only.
   * Weight has its own pair of steps (±0.5 / ±2); a count keeps the doubling
   * pattern off its unit's natural step — one rep and two, fifteen seconds and
   * thirty.
   */
  const { fine, coarse } = isWeight
    ? weightSteps(unitSystem)
    : { fine: countStep(exercise.countUnit), coarse: countStep(exercise.countUnit) * 2 };
  const chips = [-coarse, -fine, fine, coarse];

  const displayValue = isWeight
    ? formatWeight(set.weightKg, unitSystem, exercise.loadMode)
    : formatCount(set.count, exercise.countUnit);
  const displayUnit = isWeight ? unitLabel(unitSystem) : countUnitLabel(exercise.countUnit);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /** Apply a relative nudge, clamped at zero and snapped to a loadable step. */
  const bump = (delta: number) => {
    tap();

    if (isWeight) {
      const currentDisplay =
        set.weightKg == null ? 0 : unitSystem === 'imperial' ? kgToLb(set.weightKg) : set.weightKg;
      /*
       * Not snapped to any step. Snapping is what made a 0.5 chip useless on an
       * exercise carrying a 2.5 kg increment — every tap rounded itself away.
       * `toFixed(2)` only keeps 0.1-style float drift out of a 40 px numeral.
       */
      const nextDisplay = Math.max(0, Number((currentDisplay + delta).toFixed(2)));
      onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(nextDisplay) : nextDisplay });
      return;
    }

    onChange({ count: Math.max(0, set.count + delta) });
  };

  const commitTyped = () => {
    const parsed = Number(buffer.replace(',', '.'));
    if (!Number.isNaN(parsed) && buffer.trim() !== '') {
      if (isWeight) {
        onChange({ weightKg: unitSystem === 'imperial' ? lbToKg(parsed) : parsed });
      } else {
        onChange({ count: Math.max(0, Math.round(parsed)) });
      }
    }
    setTyping(false);
    setBuffer('');
  };

  return (
    <View className="border-t border-t-hairline bg-surface-alt p-md">
      <View className="flex-row items-center justify-between">
        {/* subtract chips */}
        <View className="flex-row">
          {chips
            .filter((c) => c < 0)
            .map((delta, i) => (
              <Chip
                key={delta}
                label={formatDelta(delta, exercise, isWeight)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>

        {/* the live value — Display size, because it is the thing being changed */}
        {typing ? (
          <TextInput
            ref={inputRef}
            value={buffer}
            onChangeText={setBuffer}
            onBlur={commitTyped}
            onSubmitEditing={commitTyped}
            keyboardType={isWeight ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            placeholder={displayValue}
            placeholderTextColor="#57615C"
            className="mx-xs min-w-[110px] text-center text-display font-semibold tabular-nums text-ink"
          />
        ) : (
          <View className="mx-xs flex-row items-baseline">
            <Text className="text-display font-semibold tabular-nums text-ink">{displayValue}</Text>
            <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">
              {displayUnit}
            </Text>
          </View>
        )}

        {/* add chips */}
        <View className="flex-row">
          {chips
            .filter((c) => c > 0)
            .map((delta, i) => (
              <Chip
                key={delta}
                label={formatDelta(delta, exercise, isWeight)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>
      </View>

      {/* Secondary actions, spread apart so no two are one mis-tap from each
          other. `Done` is the only green thing here — it is the way out. */}
      <View className="mt-md flex-row items-center justify-between">
        <Pressable
          onPress={() => setTyping(true)}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel="Type an exact value"
        >
          <Text className="text-label font-medium text-ink-muted">Type</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            tap();
            onChange({ isWarmup: !set.isWarmup });
          }}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="switch"
          accessibilityState={{ checked: set.isWarmup }}
          accessibilityLabel={
            set.isWarmup ? 'Make this a working set' : 'Mark this set as a warm-up'
          }
        >
          <Text
            className={[
              'text-label font-medium',
              set.isWarmup ? 'text-green-bright' : 'text-ink-muted',
            ].join(' ')}
          >
            {set.isWarmup ? 'Working set' : 'Warm-up'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRemoveSet}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel="Remove set"
        >
          <Text className="text-label font-medium text-ink-muted">Remove set</Text>
        </Pressable>

        <Pressable
          onPress={onClose}
          hitSlop={8}
          className="h-hit justify-center"
          accessibilityRole="button"
          accessibilityLabel="Done editing"
        >
          <Text className="text-label font-semibold text-green-bright">Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 44 high, 46 wide minimum — a thumb target, not a decoration. */
function Chip({ label, first, onPress }: { label: string; first: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={[
        'h-hit min-w-[46px] items-center justify-center rounded-pill border border-hairline bg-surface px-sm',
        first ? '' : 'ml-sm',
      ].join(' ')}
    >
      <Text className="text-label font-medium tabular-nums text-ink">{label}</Text>
    </Pressable>
  );
}

/**
 * "+2.5" / "−5" — a real minus sign (U+2212), not a hyphen, so it optically
 * matches the plus at the same size. Time steps read as seconds: "+15s".
 */
function formatDelta(delta: number, exercise: Exercise, isWeight: boolean): string {
  const rounded = Number(delta.toFixed(2));
  const timeBased =
    !isWeight && (exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds');
  const body = `${Math.abs(rounded)}${timeBased ? 's' : ''}`;
  return rounded < 0 ? `−${body}` : `+${body}`;
}
