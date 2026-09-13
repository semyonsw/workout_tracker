/**
 * RandomRoutineSheet — what the die is allowed to draw from.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Build a random routine                     │
 *   │ MUSCLE GROUPS                              │
 *   │ ╭Push╮ ╭Pull╮ ╭Legs╮ ╭Core╮ ╭Cardio╮╭Skill╮│
 *   │ HOW MANY EXERCISES              5  (−)(+)  │
 *   │ SETS EACH                       4  (−)(+)  │
 *   │ 34 exercises to draw from                  │
 *   │ ╭──────────────── Roll ───────────────────╮│
 *   ╰────────────────────────────────────────────╯
 *
 * ── THIS IS BEHIND A LONG PRESS, AND THAT IS THE POINT ────────────────────
 *
 * A tap on the die rolls immediately, from the whole library, five exercises,
 * each exercise's own set count. That is the feature: no decisions. This sheet
 * is for the other half of the time — "pull and core only, four of them, three
 * sets" — and it is reached by HOLDING the same glyph, which is the gesture the
 * rest of the app already uses for "the other thing about this" (the expenses'
 * category tiles, every reorderable row).
 *
 * ── CHIPS, NOT A SEGMENTED CONTROL ────────────────────────────────────────
 *
 * Six clusters, more than one at a time. That is exactly the shape `SelectChip`
 * exists for, and picking none of them is a legal, meaningful answer — it means
 * the whole library, which is what the plain tap does.
 *
 * ── AND IT STATES WHAT IT CAN ACTUALLY DRAW ───────────────────────────────
 *
 * `34 exercises to draw from` under the chips, live. Asking for eight exercises
 * out of a cluster holding three is a thing somebody will do, and the honest
 * moment to say so is before the roll, not after — `rollRoutine` clamps to what
 * exists, and a routine quietly shorter than the number you typed reads as the
 * dice being broken.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { Sheet } from './Sheet';
import { Kicker, PrimaryButton, SelectChip, StepperRow, TextButton } from './primitives';
import { useT } from '../hooks/useT';
import { clusterLabel, CLUSTERS } from '../lib/muscles';
import { drawableCount, RANDOM_LIMITS, type RandomSpec } from '../lib/randomRoutine';
import type { Exercise, MuscleCluster } from '../types/models';

interface RandomRoutineSheetProps {
  exercises: readonly Exercise[];
  /** What the sheet opens on — the last roll's answers, so a re-roll is one tap. */
  spec: RandomSpec;
  onRoll: (spec: RandomSpec) => void;
  onDismiss: () => void;
}

export function RandomRoutineSheet({
  exercises,
  spec: initial,
  onRoll,
  onDismiss,
}: RandomRoutineSheetProps) {
  const t = useT();
  const [clusters, setClusters] = useState<readonly MuscleCluster[]>(initial.clusters);
  const [exerciseCount, setExerciseCount] = useState(initial.exerciseCount);
  /**
   * `null` means "whatever each exercise says it wants".
   *
   * The stepper renders that as `—` at its floor rather than as a separate
   * switch: stepping DOWN from one lands on it, which is the only place it
   * belongs — fewer than one set is not a thing, and "let the library decide" is
   * the honest name for the value below the smallest number.
   */
  const [sets, setSets] = useState<number | null>(initial.sets);

  const pool = drawableCount(exercises, clusters);

  const toggle = (cluster: MuscleCluster) =>
    setClusters((current) =>
      current.includes(cluster)
        ? current.filter((c) => c !== cluster)
        : [...current, cluster].sort((a, b) => CLUSTERS.indexOf(a) - CLUSTERS.indexOf(b)),
    );

  return (
    <Sheet title={t('Build a random routine')} onDismiss={onDismiss}>
      <Kicker className="mb-sm">{t('Muscle groups')}</Kicker>
      <View className="flex-row flex-wrap">
        {CLUSTERS.map((cluster) => (
          <SelectChip
            key={cluster}
            label={t(clusterLabel(cluster))}
            selected={clusters.includes(cluster)}
            onPress={() => toggle(cluster)}
          />
        ))}
      </View>

      <View className="mt-md overflow-hidden rounded-surface border border-hairline bg-surface">
        <StepperRow
          label={t('How many exercises')}
          value={String(exerciseCount)}
          onDecrease={() =>
            setExerciseCount((n) => Math.max(RANDOM_LIMITS.exerciseCount.min, n - 1))
          }
          onIncrease={() =>
            setExerciseCount((n) => Math.min(RANDOM_LIMITS.exerciseCount.max, n + 1))
          }
        />
        <StepperRow
          label={t('Sets each')}
          hint={sets == null ? t("Each exercise's own number") : undefined}
          value={sets == null ? '—' : String(sets)}
          onDecrease={() =>
            setSets((n) => (n == null || n <= RANDOM_LIMITS.sets.min ? null : n - 1))
          }
          onIncrease={() =>
            setSets((n) =>
              n == null ? RANDOM_LIMITS.sets.min : Math.min(RANDOM_LIMITS.sets.max, n + 1),
            )
          }
        />
      </View>

      <Text className="mt-sm text-label tabular-nums text-ink-faint">
        {pool === 0
          ? t('There is nothing in the library for those groups yet.')
          : t('{n} exercises to draw from', { n: pool })}
      </Text>

      <View className="mt-xl">
        <PrimaryButton
          label={t('Roll')}
          onPress={() => {
            if (pool === 0) return;
            onRoll({ clusters, exerciseCount, sets });
          }}
        />
        <TextButton label={t('Cancel')} onPress={onDismiss} />
      </View>
    </Sheet>
  );
}
