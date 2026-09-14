/**
 * The ± steppers inside focus mode — `QuickAdjust`'s chips at focus-mode scale.
 *
 *   ╭──────────────────────────────────────────────╮
 *   │  −2  │  −0.5  │   32 KG   │  +0.5  │   +2    │
 *   ╰──────────────────────────────────────────────╯
 *   ╭──────────────────────────────────────────────╮
 *   │  −2  │   −1   │   5 REPS  │   +1   │   +2    │
 *   ╰──────────────────────────────────────────────╯
 *
 * The plan survives contact with the gym for about ten minutes, and this is that
 * admission inside a screen with no set rows in it: the numbers focus mode is
 * showing you are the numbers it is about to log, so it has to be possible to
 * change them without leaving.
 *
 * WHY THERE IS NO KEYBOARD HERE. `QuickAdjust` offers `Type` for the case where a
 * number changes wholesale, and that is the right control on a set row you are
 * looking at from 30 cm. Focus mode is read from two metres with a hand that is
 * not aiming; four chips and a value are what works there, and the row's own
 * editor — with `Type`, `Warm-up` and `Remove set` — is still exactly where it
 * always was on the session screen.
 *
 * Both pills are one 56 dp row, which is the floor for a control pressed with a
 * water bottle in the other hand. The biggest steps sit at the OUTSIDE edges,
 * where a thumb finds them without looking.
 */

import { Pressable, Text, View } from 'react-native';

import type { DraftSet } from '../lib/draft';
import { useLanguage } from '../hooks/useT';
import { tap } from '../lib/feedback';
import { nudgeSet, nudgeSteps, type NudgeField } from '../lib/setNudge';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import type { Exercise, UnitSystem } from '../types/models';

export function FocusNudge({
  set,
  exercise,
  unitSystem,
  onChange,
}: {
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  onChange: (patch: Partial<DraftSet>) => void;
}) {
  const lang = useLanguage();

  return (
    <View className="mt-md px-lg">
      {/* The weight pill is ABSENT, not disabled, on bodyweight work — the same
          rule `SetRow` follows for the cell itself. */}
      {exercise.requiresWeight ? (
        <NudgePill
          field="weight"
          set={set}
          exercise={exercise}
          unitSystem={unitSystem}
          value={formatWeight(set.weightKg, unitSystem, exercise.loadMode)}
          unit={unitLabel(unitSystem, lang)}
          onChange={onChange}
        />
      ) : null}

      <View className={exercise.requiresWeight ? 'mt-sm' : ''}>
        <NudgePill
          field="count"
          set={set}
          exercise={exercise}
          unitSystem={unitSystem}
          value={formatCount(set.count, exercise.countUnit)}
          unit={countUnitLabel(exercise.countUnit, lang)}
          onChange={onChange}
        />
      </View>
    </View>
  );
}

function NudgePill({
  field,
  set,
  exercise,
  unitSystem,
  value,
  unit,
  onChange,
}: {
  field: NudgeField;
  set: DraftSet;
  exercise: Exercise;
  unitSystem: UnitSystem;
  value: string;
  unit: string;
  onChange: (patch: Partial<DraftSet>) => void;
}) {
  const { fine, coarse } = nudgeSteps(field, exercise.countUnit, unitSystem);

  const bump = (delta: number) => {
    tap();
    onChange(nudgeSet(set, field, delta, unitSystem));
  };

  return (
    <View className="h-row flex-row items-center overflow-hidden rounded-pill border border-hairline bg-surface-alt">
      <NudgeChip delta={-coarse} onPress={bump} />
      <NudgeChip delta={-fine} onPress={bump} />

      <View className="flex-1 flex-row items-baseline justify-center">
        <Text className="text-title font-semibold tabular-nums text-ink">{value}</Text>
        <Text className="ml-xs text-micro font-semibold uppercase text-ink-muted">{unit}</Text>
      </View>

      <NudgeChip delta={fine} onPress={bump} />
      <NudgeChip delta={coarse} onPress={bump} />
    </View>
  );
}

/**
 * One chip. 58 dp wide so five cells fill the pill on a 360 dp phone with the
 * value in the middle, and the full 56 dp tall — the target is the whole cell,
 * not the label inside it.
 *
 * A real `−`, not a hyphen, so it pairs optically with the `+` beside it. Same
 * detail the rest pill's chips carry.
 */
function NudgeChip({ delta, onPress }: { delta: number; onPress: (delta: number) => void }) {
  const label = `${delta < 0 ? '−' : '+'}${Math.abs(delta)}`;

  return (
    <Pressable
      onPress={() => onPress(delta)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { opacity: 0.45 } : null)}
      className="h-row w-[58px] items-center justify-center"
    >
      <Text className="text-label font-semibold tabular-nums text-ink">{label}</Text>
    </Pressable>
  );
}
