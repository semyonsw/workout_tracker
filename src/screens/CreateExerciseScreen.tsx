/**
 * CreateExerciseScreen — define what a set of this thing even is.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  NEW EXERCISE                    [ Create ]│
 *   │ NAME                                         │
 *   │ ╭ Weighted dips                            ╮ │
 *   │ MUSCLES · PULL · BACK, BICEPS                │
 *   │ ( Push )( Pull )( Legs )( Core )( Cardio )   │
 *   │ ( Back )( Traps )( Biceps )( Forearms )      │
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
 * MUSCLES ARE PICKED THROUGH THE HIERARCHY, not from a list of fourteen: tap a
 * cluster, then the muscles inside it. Two rows instead of a wall of chips, and
 * it teaches the thing the library is organised by — that `back` lives under
 * `pull` — at the moment the user is deciding where their new exercise belongs.
 * The FIRST muscle picked is the primary and decides which section the exercise
 * files under, which is why the kicker echoes the picks back in order.
 *
 * TIMER only exists for time-counted work, and it is the difference between a
 * plank you type in afterwards and a plank the phone counts for you. `Count up`
 * has no target to run out, so it hides the target-time well's meaning as a
 * prescription — the number stays as the prefill for next time.
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
  SelectChip,
  Separator,
  SettingRow,
  Toggle,
} from '../components/primitives';
import { describeSetInputs, wellsFor } from '../lib/exerciseShape';
import {
  CLUSTERS,
  CLUSTER_MUSCLES,
  clusterLabel,
  clusterOf,
  MUSCLE_CLUSTER,
} from '../lib/muscles';
import { DEFAULT_PREPARE_SECONDS } from '../lib/setTimer';
import { formatClock, formatDuration } from '../lib/units';
import type {
  CountUnit,
  Exercise,
  LoadMode,
  MuscleCluster,
  MuscleGroup,
  TimerMode,
} from '../types/models';

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

const TIMER_MODES: readonly { value: TimerMode; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'countdown', label: 'Countdown' },
  { value: 'countup', label: 'Count up' },
];

/**
 * Get-ready lengths, cycled by tapping the row.
 *
 * A cycle rather than a keypad because there are four sane answers and a
 * five-second get-ready is not a number anyone needs to type. 0 is included and
 * first-class: a boxing round starts when you say go.
 */
const PREPARE_CHOICES = [0, 3, 5, 10] as const;

/** The editable shape of a new exercise. A draft, not an `Exercise` yet. */
export interface ExerciseDraft {
  name: string;
  /** Primary first — the first one picked decides the cluster. */
  muscleGroups: MuscleGroup[];
  requiresWeight: boolean;
  countUnit: CountUnit;
  loadMode: LoadMode;
  timerMode: TimerMode;
  prepareSeconds: number;
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
  /** Which cluster's muscles are on show. A lens, never part of the draft. */
  const [pickerCluster, setPickerCluster] = useState<MuscleCluster>(
    () => clusterOf(initial) ?? 'push',
  );
  const patch = (next: Partial<ExerciseDraft>) => setDraft((d) => ({ ...d, ...next }));

  const wells = wellsFor(draft);
  const isRounds = draft.countUnit === 'rounds';
  const isTimeCounted = draft.countUnit === 'seconds' || draft.countUnit === 'rounds';

  /** Tapping a muscle appends or removes it; append order IS primary order. */
  const toggleMuscle = (muscle: MuscleGroup) =>
    patch({
      muscleGroups: draft.muscleGroups.includes(muscle)
        ? draft.muscleGroups.filter((m) => m !== muscle)
        : [...draft.muscleGroups, muscle],
    });

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

        {/* Muscles, through the hierarchy: cluster first, then what's inside it.
            The kicker states the filing decision this makes — cluster, then the
            picks in the order they were tapped. */}
        <Kicker tone={draft.muscleGroups.length > 0 ? 'green' : 'faint'} className="mx-lg mb-sm mt-xl">
          Muscles{describeMuscles(draft.muscleGroups)}
        </Kicker>

        <View className="mx-lg flex-row flex-wrap">
          {CLUSTERS.map((option) => (
            <SelectChip
              key={option}
              label={clusterLabel(option)}
              selected={pickerCluster === option}
              onPress={() => setPickerCluster(option)}
            />
          ))}
        </View>

        <View className="mx-lg mt-xs flex-row flex-wrap">
          {CLUSTER_MUSCLES[pickerCluster].map((muscle) => (
            <SelectChip
              key={muscle}
              label={muscle}
              selected={draft.muscleGroups.includes(muscle)}
              onPress={() => toggleMuscle(muscle)}
            />
          ))}
        </View>

        <Text className="mx-lg text-label text-ink-faint">
          {draft.muscleGroups.length > 0
            ? 'First pick is the primary — it decides which section this files under.'
            : 'Pick at least one, or it lands in the library’s Unfiled section.'}
        </Text>

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
                  // Reps are not a clock. Dropping the timer here keeps the
                  // draft honest rather than relying on `resolveTimerMode` to
                  // ignore it later.
                  timerMode: requiresWeight ? 'manual' : draft.timerMode,
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
                onChange={(countUnit) =>
                  patch({
                    countUnit,
                    // Only time can be counted down. Metres and reps drop the
                    // timer rather than keeping a setting that does nothing.
                    timerMode:
                      countUnit === 'seconds' || countUnit === 'rounds'
                        ? draft.timerMode
                        : 'manual',
                  })
                }
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

        {/* The timer. Only time-counted work has a clock to run, and this is
            what turns "2:00 plank" from a number you type into a set the phone
            counts for you. */}
        {isTimeCounted ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">Timer</Kicker>
            <View className="mx-lg">
              <Segmented
                options={TIMER_MODES}
                value={draft.timerMode}
                onChange={(timerMode) => patch({ timerMode })}
                accessibilityLabel="Timer"
              />
            </View>
            <Text className="mx-lg mt-sm text-label text-ink-faint">
              {timerHelp(draft, isRounds)}
            </Text>

            {draft.timerMode === 'manual' ? null : (
              <ListCard className="mx-lg mt-lg">
                <SettingRow
                  label="Get ready"
                  value={prepareLabel(draft.prepareSeconds)}
                  onPress={() => patch({ prepareSeconds: nextPrepare(draft.prepareSeconds) })}
                />
              </ListCard>
            )}
          </>
        ) : null}

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

/* ------------------------------------------------------------------ */

/** " · PULL · back, biceps" — the filing decision, echoed back in pick order. */
function describeMuscles(muscles: MuscleGroup[]): string {
  if (muscles.length === 0) return '';
  const cluster = clusterLabel(MUSCLE_CLUSTER[muscles[0]]);
  return ` · ${cluster} · ${muscles.join(', ')}`;
}

/** What the chosen timer mode will actually do, in one line. */
function timerHelp(draft: ExerciseDraft, isRounds: boolean): string {
  const target = formatClock(draft.durationSeconds);
  switch (draft.timerMode) {
    case 'countdown':
      return isRounds
        ? `Each round counts down from ${target}, then logs itself.`
        : `Counts down from ${target} and logs the hold when it reaches zero.`;
    case 'countup':
      return 'Counts up until you stop it, and logs the time you held.';
    default:
      return 'You type the number after the set. No clock runs.';
  }
}

function prepareLabel(seconds: number): string {
  return seconds > 0 ? `${seconds} sec` : 'None';
}

/** Cycle to the next get-ready length, wrapping. */
function nextPrepare(current: number): number {
  const index = PREPARE_CHOICES.indexOf(current as (typeof PREPARE_CHOICES)[number]);
  return PREPARE_CHOICES[(index + 1) % PREPARE_CHOICES.length];
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
  const timed = draft.timerMode !== 'manual';
  return {
    id,
    ownerId,
    name: draft.name.trim(),
    muscleGroups: draft.muscleGroups,
    requiresWeight: draft.requiresWeight,
    countUnit: draft.countUnit,
    loadMode: draft.requiresWeight ? draft.loadMode : 'none',
    // Omitted rather than stored as 'manual': absent is the default, and a row
    // that says nothing about a timer is easier to read than one that says "off".
    timerMode: timed ? draft.timerMode : undefined,
    prepareSeconds: timed ? draft.prepareSeconds : undefined,
    isUnilateral: false,
    incrementKg: draft.requiresWeight ? draft.incrementKg : undefined,
    defaultRestSeconds: draft.restSeconds,
    isArchived: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * A blank draft, named from whatever the user typed into the library search.
 *
 * `muscle` is the group the create flow was opened FROM — the library's tree
 * hangs an `+ Add exercise to chest` row off every muscle group, and arriving here
 * with `chest` already picked is the whole point of that row. It lands first in
 * `muscleGroups`, which makes it the primary and therefore decides where the
 * exercise files: the user is returned to exactly the group they were looking at.
 *
 * The chips are still live, so it is a starting point rather than a lock-in.
 */
export function emptyExerciseDraft(name: string, muscle?: MuscleGroup): ExerciseDraft {
  return {
    name,
    muscleGroups: muscle ? [muscle] : [],
    requiresWeight: true,
    countUnit: 'reps',
    loadMode: 'external',
    timerMode: 'manual',
    prepareSeconds: DEFAULT_PREPARE_SECONDS,
    defaultWeightKg: 30,
    targetCount: 12,
    durationSeconds: 180,
    incrementKg: 2.5,
    restSeconds: 120,
  };
}
