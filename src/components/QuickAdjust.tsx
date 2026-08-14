/**
 * QuickAdjust — the inline value editor, opened directly under the tapped row.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  −5   −2.5      42.5 KG      +2.5   +5       │
 *   │  Type          Remove set            Done    │
 *   └──────────────────────────────────────────────┘
 *
 * This is where the tap-count promise is proven. One tap logs an unchanged set
 * (the ✓). THREE taps log 2.5 kg heavier: the weight cell, `+2.5`, the ✓.
 *
 * Why not a keyboard? Because the gym case is "same as last time, plus one
 * plate". Four chips beat eleven keys, work with sweaty thumbs, and never cover
 * the row being edited. `Type` is still there for the case where a number
 * changes wholesale — the only path to a keyboard inside a session.
 *
 * Steps come from the exercise's own increment, so a dumbbell movement offers
 * ±2.5 while a pin stack offers ±5 — the app never suggests a weight the user
 * cannot physically load. There is no Cancel: edits are applied live, and
 * `Done` only closes the panel.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { DraftSet } from '../lib/draft';
import type { Exercise, UnitSystem } from '../types/models';
import {
  countStep,
  countUnitLabel,
  formatCount,
  formatWeight,
  kgToLb,
  lbToKg,
  resolveIncrementKg,
  roundToStep,
  unitLabel,
} from '../lib/units';
import type { SetField } from './SetRow';

interface QuickAdjustProps {
  field: SetField;
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  /** Increment fallback from the user's overload policy. */
  policyIncrementKg: number;
  onChange: (patch: Partial<DraftSet>) => void;
  onClose: () => void;
  onRemoveSet: () => void;
}

export function QuickAdjust({
  field,
  set,
  exercise,
  unitSystem,
  policyIncrementKg,
  onChange,
  onClose,
  onRemoveSet,
}: QuickAdjustProps) {
  const [typing, setTyping] = useState(false);
  const [buffer, setBuffer] = useState('');
  const inputRef = useRef<TextInput>(null);

  const isWeight = field === 'weight';
  const stepKg = resolveIncrementKg(exercise.incrementKg, policyIncrementKg, unitSystem);
  // Chips are expressed in the user's own units; kg is the storage unit only.
  const step = isWeight
    ? unitSystem === 'imperial'
      ? kgToLb(stepKg)
      : stepKg
    : countStep(exercise.countUnit);
  const chips = [-step * 2, -step, step, step * 2];

  const displayValue = isWeight
    ? formatWeight(set.weightKg, unitSystem, exercise.loadMode)
    : formatCount(set.count, exercise.countUnit);
  const displayUnit = isWeight ? unitLabel(unitSystem) : countUnitLabel(exercise.countUnit);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /** Apply a relative nudge, clamped at zero and snapped to a loadable step. */
  const bump = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});

    if (isWeight) {
      const currentDisplay =
        set.weightKg == null ? 0 : unitSystem === 'imperial' ? kgToLb(set.weightKg) : set.weightKg;
      const nextDisplay = Math.max(0, roundToStep(currentDisplay + delta, Math.abs(step)));
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
function Chip({
  label,
  first,
  onPress,
}: {
  label: string;
  first: boolean;
  onPress: () => void;
}) {
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
  const timeBased = !isWeight && (exercise.countUnit === 'seconds' || exercise.countUnit === 'rounds');
  const body = `${Math.abs(rounded)}${timeBased ? 's' : ''}`;
  return rounded < 0 ? `−${body}` : `+${body}`;
}
