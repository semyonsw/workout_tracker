/**
 * CreateExerciseScreen — define what a set of this thing even is.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  NEW EXERCISE                    [ Create ]│
 *   │ NAME                                         │
 *   │ ╭ Weighted dips                            ╮ │
 *   │ ╭ Requires weight                    [ ●━] ╮ │
 *   │ │ A weight cell renders on every set       │ │
 *   │ SET INPUTS · WEIGHT + REPS                   │
 *   │ ╭ DEFAULT KG  ╮ ╭ TARGET REPS ╮              │
 *   │ │     30 KG   │ │    12 REPS  │              │
 *   │ LOAD MODE                                    │
 *   │ ╭ External │ Added │ Assisted ╮               │
 *   │ ╭ Increment            ± 2.5 kg ╮             │
 *   │ ╰ Rest                    2:00 ╯              │
 *   └──────────────────────────────────────────────┘
 *
 * `Requires weight` is the key control in the app's data model, and this screen
 * makes it look like one: flipping it visibly ADDS OR REMOVES the inputs below
 * it. The weight well is removed, not disabled — a greyed input promises it
 * might come back. Turning it off also reveals `COUNTED IN` (reps / time /
 * metres / rounds), because an exercise with no load has to say what it counts
 * instead, and it turns overload nudges off, because something with no load has
 * no plateau to report.
 *
 * `Increment` lives on the EXERCISE, not on the user: a dumbbell movement offers
 * ±2.5 and a pin stack ±5, so the nudge can never suggest a weight that cannot
 * physically be loaded.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import {
  FieldWell,
  Kicker,
  ListCard,
  NumericWell,
  Segmented,
  Separator,
  SettingRow,
  Toggle,
} from '../components/primitives';
import { describeSetInputs, wellsFor } from '../lib/exerciseShape';
import { formatClock, formatDuration } from '../lib/units';
import type { CountUnit, Exercise, LoadMode } from '../types/models';

const LOAD_MODES: readonly { value: LoadMode; label: string }[] = [
  { value: 'external', label: 'External' },
  { value: 'added_bodyweight', label: 'Added' },
  { value: 'assisted', label: 'Assisted' },
];

const COUNT_UNITS: readonly { value: CountUnit; label: string }[] = [
  { value: 'reps', label: 'Reps' },
  { value: 'seconds', label: 'Time' },
  { value: 'meters', label: 'Metres' },
  { value: 'rounds', label: 'Rounds' },
];

/** The editable shape of a new exercise. A draft, not an `Exercise` yet. */
export interface ExerciseDraft {
  name: string;
  requiresWeight: boolean;
  countUnit: CountUnit;
  loadMode: LoadMode;
  defaultWeightKg: number;
  /** Reps, metres, or the number of rounds — whatever `countUnit` counts. */
  targetCount: number;
  /** Seconds per set: a round length, or a swim duration. */
  durationSeconds: number;
  incrementKg: number;
  restSeconds: number;
}

interface CreateExerciseScreenProps {
  initial: ExerciseDraft;
  onBack: () => void;
  onCreate: (draft: ExerciseDraft) => void;
  /** Opens a keypad for one numeric field. The wells are read-only without it. */
  onEditNumber?: (field: keyof ExerciseDraft) => void;
}

export function CreateExerciseScreen({
  initial,
  onBack,
  onCreate,
  onEditNumber,
}: CreateExerciseScreenProps) {
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const patch = (next: Partial<ExerciseDraft>) => setDraft((d) => ({ ...d, ...next }));

  const wells = wellsFor(draft);
  const isRounds = draft.countUnit === 'rounds';

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="New exercise"
        onBack={onBack}
        action={{ label: 'Create', onPress: () => onCreate(draft) }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Name</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={draft.name}
            placeholder="Exercise name"
            onChangeText={(name) => patch({ name })}
            accessibilityLabel="Exercise name"
          />
        </View>

        {/* THE control. 64 high because it carries a helper line, and the helper
            line changes with it — that's how the user learns what it does. */}
        <View className="mx-lg mt-xl h-row-lg flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
          <View className="flex-1">
            <Text className="text-body font-medium text-ink">Requires weight</Text>
            <Text className="mt-[2px] text-label text-ink-faint">
              {draft.requiresWeight
                ? 'A weight cell renders on every set'
                : 'No weight cell renders at all'}
            </Text>
          </View>
          <View className="ml-lg">
            <Toggle
              value={draft.requiresWeight}
              onChange={(requiresWeight) =>
                patch({
                  requiresWeight,
                  // Weighted work is rep-counted unless the user says otherwise;
                  // `none` is the only honest load mode for unweighted work.
                  countUnit: requiresWeight ? 'reps' : draft.countUnit,
                  loadMode: requiresWeight ? 'external' : 'none',
                })
              }
              accessibilityLabel="Requires weight"
            />
          </View>
        </View>

        {/* Only exists when there is no weight: something has to be counted. */}
        {draft.requiresWeight ? null : (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">Counted in</Kicker>
            <View className="mx-lg">
              <Segmented
                options={COUNT_UNITS}
                value={draft.countUnit}
                onChange={(countUnit) => patch({ countUnit })}
                accessibilityLabel="Counted in"
              />
            </View>
          </>
        )}

        {/* Green because this label just changed under the user's thumb. */}
        <Kicker tone="green" className="mx-lg mb-sm mt-xl">
          Set inputs · {describeSetInputs(draft)}
        </Kicker>
        <View className="mx-lg flex-row">
          {wells.map((well, index) => (
            <View key={well.label} className={index > 0 ? 'ml-sm flex-1' : 'flex-1'}>
              <NumericWell
                label={well.label}
                value={wellValue(draft, well.field)}
                unit={well.unit}
                onPress={onEditNumber ? () => onEditNumber(wellField(well.field)) : undefined}
              />
            </View>
          ))}
        </View>

        {/* Load mode only means something when there is a load to read. */}
        {draft.requiresWeight ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">Load mode</Kicker>
            <View className="mx-lg">
              <Segmented
                options={LOAD_MODES}
                value={draft.loadMode}
                onChange={(loadMode) => patch({ loadMode })}
                accessibilityLabel="Load mode"
              />
            </View>
          </>
        ) : null}

        <ListCard className="mx-lg mt-xl">
          {draft.requiresWeight ? (
            <>
              <SettingRow
                label="Increment"
                value={`± ${draft.incrementKg} kg`}
                onPress={onEditNumber ? () => onEditNumber('incrementKg') : undefined}
              />
              <Separator />
              <SettingRow
                label="Rest"
                value={formatClock(draft.restSeconds)}
                onPress={onEditNumber ? () => onEditNumber('restSeconds') : undefined}
              />
            </>
          ) : (
            <>
              <SettingRow
                label={isRounds ? 'Rest between rounds' : 'Rest'}
                value={formatClock(draft.restSeconds)}
                onPress={onEditNumber ? () => onEditNumber('restSeconds') : undefined}
              />
              <Separator />
              {/* Stated, not hidden: the user should know why they'll never see
                  a nudge here, rather than wonder whether it's broken. */}
              <SettingRow label="Overload nudges" value="Off · no load to add" valueTone="faint" />
            </>
          )}
        </ListCard>

        {draft.requiresWeight ? null : (
          <Text className="mx-lg mt-xl text-label text-ink-faint">
            Reps, time and metres swap the same two wells:{' '}
            <Text className="text-label text-ink-muted">
              reps only · duration · distance + duration
            </Text>
            .
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/** Which draft key a well edits. `duration` and `count` are separate numbers. */
function wellField(field: 'weight' | 'count' | 'duration'): keyof ExerciseDraft {
  if (field === 'weight') return 'defaultWeightKg';
  if (field === 'duration') return 'durationSeconds';
  return 'targetCount';
}

function wellValue(draft: ExerciseDraft, field: 'weight' | 'count' | 'duration'): string {
  if (field === 'weight') return String(draft.defaultWeightKg);
  if (field === 'duration') return formatClock(draft.durationSeconds);
  return String(draft.targetCount);
}

/**
 * Turn a finished draft into a library row.
 *
 * `durationSeconds` collapses into `count` for time-based units, because in
 * `SetHistory` a round IS its length — one row, one number, no second column to
 * keep in sync.
 */
export function draftToExercise(draft: ExerciseDraft, id: string, ownerId: string): Exercise {
  return {
    id,
    ownerId,
    name: draft.name.trim(),
    muscleGroups: [],
    requiresWeight: draft.requiresWeight,
    countUnit: draft.countUnit,
    loadMode: draft.requiresWeight ? draft.loadMode : 'none',
    isUnilateral: false,
    incrementKg: draft.requiresWeight ? draft.incrementKg : undefined,
    defaultRestSeconds: draft.restSeconds,
    isArchived: false,
    createdAt: new Date().toISOString(),
  };
}

/** A blank draft, named from whatever the user typed into the library search. */
export function emptyExerciseDraft(name: string): ExerciseDraft {
  return {
    name,
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    defaultWeightKg: 30,
    targetCount: 12,
    durationSeconds: 180,
    incrementKg: 2.5,
    restSeconds: 120,
  };
}
