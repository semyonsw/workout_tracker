/**
 * ExerciseCard — one exercise inside the active session.
 *
 * Collapsed (not the current exercise):
 *   ┌────────────────────────────────────────────┐
 *   │ Wide pull-ups machine               0/4  ● │  ← ● = a nudge is waiting
 *   │ 80 kg · 8 6 5 5                            │
 *   └────────────────────────────────────────────┘
 *
 * Expanded (current exercise): header + overload nudge + set rows + "Add set".
 *
 * Only one card is expanded at a time. That is the whole navigation model of the
 * logging screen — no tabs, no per-exercise route, no back button. The user
 * moves down the list as they move through the gym.
 *
 * The collapsed signal for a waiting overload suggestion is a single 6px dot.
 * Not a badge, not a chip, not a count: the suggestion is not urgent, it just
 * needs to be findable.
 */

import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { DraftEntry, DraftSet } from '../lib/draft';
import { formatTarget } from '../lib/draft';
import type { ID, UnitSystem } from '../types/models';
import { palette } from '../theme/tokens';
import { Icon } from './Icon';
import { OverloadNudge } from './OverloadNudge';
import { QuickAdjust } from './QuickAdjust';
import { SetRow, type SetField } from './SetRow';

interface ExerciseCardProps {
  entry: DraftEntry;
  isActive: boolean;
  unitSystem: UnitSystem;
  policyIncrementKg: number;
  onActivate: () => void;
  onToggleSet: (setId: ID) => void;
  onPatchSet: (setId: ID, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: ID) => void;
  onAcceptOverload: () => void;
  onDismissOverload: () => void;
}

function ExerciseCardComponent({
  entry,
  isActive,
  unitSystem,
  policyIncrementKg,
  onActivate,
  onToggleSet,
  onPatchSet,
  onAddSet,
  onRemoveSet,
  onAcceptOverload,
  onDismissOverload,
}: ExerciseCardProps) {
  /** Which set row has the editor open, and on which field. Card-local state. */
  const [focus, setFocus] = useState<{ setId: ID; field: SetField } | null>(null);

  const completed = entry.sets.filter((s) => s.isCompleted).length;
  const total = entry.sets.length;
  const allDone = completed === total && total > 0;
  const nextSetId = entry.sets.find((s) => !s.isCompleted)?.localId ?? null;
  const nudgeWaiting = entry.overload.shouldNudge && !entry.overloadAccepted;
  const isRounds = entry.exercise.countUnit === 'rounds';

  /* ---------------------------------------------------------------- */
  /* Collapsed                                                         */
  /* ---------------------------------------------------------------- */
  if (!isActive) {
    return (
      <Pressable
        onPress={onActivate}
        accessibilityRole="button"
        accessibilityLabel={`${entry.exercise.name}, ${completed} of ${total} sets done${
          nudgeWaiting ? ', suggestion waiting' : ''
        }`}
        className="mx-lg mb-sm rounded-surface border border-hairline bg-surface p-lg"
      >
        <View className="flex-row items-center">
          <Text
            numberOfLines={1}
            className={`flex-1 text-body font-semibold ${allDone ? 'text-ink-faint' : 'text-ink'}`}
          >
            {entry.exercise.name}
          </Text>

          {/* Progress as text, not a bar: it reads faster and costs no colour.
              Shifted 14 left when a dot is present so the two never collide. */}
          <Text
            className={[
              'ml-md text-label font-medium tabular-nums text-ink-faint',
              nudgeWaiting ? 'mr-[14px]' : '',
            ].join(' ')}
          >
            {completed}/{total}
          </Text>
          {allDone ? (
            <View className="ml-sm">
              <Icon name="check" size={14} color={palette.inkFaint} />
            </View>
          ) : null}
        </View>

        {/* One line of context: what happened last time. */}
        {entry.lastSessionSummary ? (
          <Text className="mt-xs text-label tabular-nums text-ink-faint">
            {entry.lastSessionSummary}
          </Text>
        ) : null}

        {nudgeWaiting ? (
          <View className="absolute right-lg top-[19px] h-[6px] w-[6px] rounded-pill bg-green-bright" />
        ) : null}
      </Pressable>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Expanded                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <View className="mb-xl">
      {/* Header — name, then the target, then what it was last time. The last
          clause drops to ink-faint: it's reference, not instruction. */}
      <View className="mx-lg mb-md">
        <Text className="text-title font-medium text-ink">{entry.exercise.name}</Text>
        <Text className="mt-xs text-label tabular-nums text-ink-muted">
          {formatTarget(entry)}
          {entry.exercise.isUnilateral ? (
            <Text className="text-label text-ink-faint"> · each side</Text>
          ) : null}
          {entry.lastSessionShort ? (
            <Text className="text-label text-ink-faint"> · last: {entry.lastSessionShort}</Text>
          ) : null}
        </Text>
      </View>

      <OverloadNudge
        verdict={entry.overload}
        unitSystem={unitSystem}
        loadMode={entry.exercise.loadMode}
        resolved={entry.overloadAccepted}
        onAccept={onAcceptOverload}
        onDismiss={onDismissOverload}
      />

      <View className="mx-lg overflow-hidden rounded-surface border border-hairline bg-surface">
        {entry.sets.map((set, index) => (
          <View key={set.localId}>
            {/* Separators inset 16 from the left, so the index column reads as
                one continuous ruler down the card. */}
            {index > 0 ? <View className="ml-lg h-hairline bg-hairline" /> : null}

            <SetRow
              set={set}
              index={index}
              exercise={entry.exercise}
              unitSystem={unitSystem}
              isNext={set.localId === nextSetId}
              focusedField={focus?.setId === set.localId ? focus.field : null}
              onFocusField={(field) =>
                setFocus((current) =>
                  // Tapping the open field again closes the panel.
                  current?.setId === set.localId && current.field === field
                    ? null
                    : { setId: set.localId, field },
                )
              }
              onToggleComplete={() => {
                setFocus(null); // committing a set always closes the editor
                onToggleSet(set.localId);
              }}
            />

            {focus?.setId === set.localId ? (
              <QuickAdjust
                field={focus.field}
                set={set}
                exercise={entry.exercise}
                unitSystem={unitSystem}
                policyIncrementKg={policyIncrementKg}
                onChange={(patch) => onPatchSet(set.localId, patch)}
                onClose={() => setFocus(null)}
                onRemoveSet={() => {
                  setFocus(null);
                  onRemoveSet(set.localId);
                }}
              />
            ) : null}
          </View>
        ))}

        {/* Full-bleed hairline: the footer is not a set, so its rule isn't inset. */}
        <View className="h-hairline bg-hairline" />
        <Pressable
          onPress={onAddSet}
          accessibilityRole="button"
          accessibilityLabel={isRounds ? 'Add round' : 'Add set'}
          className="h-row flex-row items-center justify-center"
        >
          <Icon name="plus" size={14} color={palette.inkFaint} />
          <Text className="ml-sm text-label text-ink-muted">
            {isRounds ? 'Add round' : 'Add set'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardComponent);
