/**
 * CreateExerciseScreen — define what a set of this thing even is, or change it.
 *
 * ONE SCREEN FOR BOTH. `mode: 'edit'` relabels the header and the action and
 * nothing else, because "what is this exercise" is the same question the second
 * time you answer it. The alternative — a separate edit screen — is two screens
 * that have to agree about a data model with three interacting axes
 * (`requiresWeight` × `countUnit` × `loadMode`), and they would stop agreeing.
 *
 * Editing was the missing half of the library: you could add an exercise and delete
 * one, so fixing a typo or a wrong starting weight meant deleting the exercise and
 * making it again — which, before this, silently cost the history filed under its id.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  NEW EXERCISE                    [ Create ]│
 *   │ ‹  EDIT EXERCISE                     [ Save ]│
 *   │ NAME                                         │
 *   │ ╭ Weighted dips                            ╮ │
 *   │ MUSCLES · PULL · BACK, BICEPS                │
 *   │ ( Push )( Pull )( Legs )( Core )( Cardio )   │
 *   │ ( Back )( Traps )( Biceps )( Forearms )      │
 *   │ ╭ Requires weight                    [ ●━] ╮ │
 *   │ │ A weight cell renders on every set       │ │
 *   │ SET INPUTS · WEIGHT + REPS                   │
 *   │ ╭ DEFAULT KG ±╮ ╭ TARGET REPS ±╮             │
 *   │ │     30 KG   │ │    12 REPS   │             │
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ −10   −1     16 KG      +1    +10        │ │  ← the tapped well
 *   │ │ DEFAULT KG                        Done   │ │
 *   │ LOAD MODE                                    │
 *   │ ╭ External │ Added │ Assisted ╮               │
 *   │ ╭ Increment            ± 2.5 kg ╮             │
 *   │ ╰ Rest       From Settings · 2:00 ╯           │
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
 * physically be loaded. It cycles through the steps that exist on real equipment,
 * for the same reason `Get ready` cycles: four sane answers is a tap, not a keypad.
 *
 * ── EVERY NUMBER ON THIS SCREEN IS ADJUSTABLE, IN PLACE ────────────────────
 *
 * The two wells and the increment row used to be inert unless the screen was
 * handed an `onEditNumber` callback to open a keypad somewhere else — and nothing
 * ever passed one, so tapping `DEFAULT KG` did nothing at all. The wells now open
 * the same kind of inline ± panel a set row does (`QuickAdjust`), one at a time,
 * directly under the pair. Same reason as in a session: the useful edit is "that
 * but heavier", the chips are thumb-sized, and no keyboard covers what you are
 * changing. Weight steps by ±1 and ±10 so every whole kilo is reachable: a machine
 * whose pin reads 16 is a fact, and rounding the starting weight to the exercise's
 * 2.5 kg progression step made that number impossible to enter.
 *
 * `Rest` is the exception and is deliberately NOT editable here: rest lengths are
 * two global settings now (see `activeWorkoutStore.completeSet`), so a per-exercise
 * rest on this screen would be a control that quietly does nothing. It states where
 * the number comes from instead.
 *
 * What this file does NOT own: the draft itself, and the two conversions between a
 * draft and a library row. Those became load-bearing the moment this screen could
 * edit an existing exercise — a mistake in them rewrites a row with history against
 * it — so they live in `lib/exerciseDraft.ts`, pure and tested.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
import { type ExerciseDraft } from '../lib/exerciseDraft';
import { describeSetInputs, wellsFor, type WellSpec } from '../lib/exerciseShape';
import { tap } from '../lib/feedback';
import {
  CLUSTERS,
  CLUSTER_MUSCLES,
  clusterLabel,
  clusterOf,
  MUSCLE_CLUSTER,
} from '../lib/muscles';
import { formatClock, formatDuration } from '../lib/units';
import type { CountUnit, LoadMode, MuscleCluster, MuscleGroup, TimerMode } from '../types/models';

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

/**
 * The plate and pin steps that exist on real equipment, cycled by tapping the row.
 *
 * 1 and 2 are what many cable and machine stacks actually step by, 1.25 is a pair
 * of change plates, 2.5 the smallest dumbbell jump, 5 a pin stack, 10 a plate per
 * side on a bar. Nothing between them is loadable, which is exactly why this is a
 * cycle and not a keypad.
 *
 * This number is the PROGRESSION step — what the overload nudge is allowed to add,
 * and the ± on a set row mid-workout. It deliberately does not constrain the
 * starting weight below, which is a fact about a machine rather than a plan.
 */
const INCREMENT_CHOICES = [1, 1.25, 2, 2.5, 5, 10] as const;

interface CreateExerciseScreenProps {
  initial: ExerciseDraft;
  /** `edit` relabels the header and the action. Everything else is identical. */
  mode?: 'create' | 'edit';
  onBack: () => void;
  /** Create it, or save the changes — the caller knows which. */
  onSubmit: (draft: ExerciseDraft) => void;
}

export function CreateExerciseScreen({
  initial,
  mode = 'create',
  onBack,
  onSubmit,
}: CreateExerciseScreenProps) {
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  /** Which cluster's muscles are on show. A lens, never part of the draft. */
  const [pickerCluster, setPickerCluster] = useState<MuscleCluster>(
    () => clusterOf(initial) ?? 'push',
  );
  /** Which well the ± panel is pointing at. Null = closed. */
  const [editing, setEditing] = useState<WellSpec['field'] | null>(null);
  const patch = (next: Partial<ExerciseDraft>) => setDraft((d) => ({ ...d, ...next }));

  const wells = wellsFor(draft);
  /*
   * Derived, not stored: flipping `Requires weight` or the count unit changes WHICH
   * wells exist, and an editor pointing at a well that is no longer on screen would
   * be a panel editing something invisible. Reading it back out of the current wells
   * means that state cannot exist.
   */
  const editingWell = wells.find((well) => well.field === editing) ?? null;
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
        kicker={mode === 'edit' ? 'Edit exercise' : 'New exercise'}
        onBack={onBack}
        action={{
          label: mode === 'edit' ? 'Save' : 'Create',
          // Demoted while the name is empty: an exercise with no name is a row you
          // cannot find again.
          tone: draft.name.trim() === '' ? 'muted' : 'primary',
          onPress: () => {
            if (draft.name.trim() === '') return;
            onSubmit(draft);
          },
        }}
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
                selected={editing === well.field}
                onPress={() => {
                  tap();
                  // Tapping the open well again closes it, exactly as a set row's
                  // value cell does.
                  setEditing((current) => (current === well.field ? null : well.field));
                }}
              />
            </View>
          ))}
        </View>

        {editingWell ? (
          <View className="mx-lg mt-sm">
            <WellStepper
              well={editingWell}
              draft={draft}
              onChange={patch}
              onClose={() => setEditing(null)}
            />
          </View>
        ) : null}

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
                onPress={() => {
                  tap();
                  patch({ incrementKg: nextIncrement(draft.incrementKg) });
                }}
              />
              <Separator />
            </>
          ) : null}

          {/* Stated as a fact, not offered as a control: both rest lengths are
              global settings now, so an editable per-exercise rest here would be a
              row that quietly does nothing. */}
          <SettingRow
            label={isRounds ? 'Rest between rounds' : 'Rest'}
            value={`From Settings · ${formatClock(draft.restSeconds)}`}
            valueTone="faint"
          />

          {draft.requiresWeight ? null : (
            <>
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

/**
 * The ± panel for one well.
 *
 *   ┌────────────────────────────────────────────┐
 *   │  −10   −2.5      30 KG     +2.5   +10      │
 *   │  DEFAULT KG                        Done    │
 *   └────────────────────────────────────────────┘
 *
 * Deliberately the same shape as `QuickAdjust` in a session — same chip sizes, same
 * live value at Display size in the middle, same `Done` as the only way out and no
 * Cancel, because edits apply as they are made. Learning one teaches the other.
 *
 * FOUR chips, not two: a fine step and a coarse one. Setting up an exercise is a
 * coarse job ("this machine starts at 45, not 30") that still has to be able to land
 * on an exact number, so weight offers ±1 and ±10 — every whole kilo is reachable,
 * and 16 kg takes two taps from 30 rather than being impossible.
 */
function WellStepper({
  well,
  draft,
  onChange,
  onClose,
}: {
  well: WellSpec;
  draft: ExerciseDraft;
  onChange: (patch: Partial<ExerciseDraft>) => void;
  onClose: () => void;
}) {
  const { small, large, min, isTime } = stepsFor(well.field, draft);
  const deltas = [-large, -small, small, large];

  const bump = (delta: number) => {
    tap();

    if (well.field === 'weight') {
      /*
       * NOT snapped to the exercise's increment. This used to round to it, which
       * meant a movement with a 2.5 increment could not be started at 16 kg at
       * all — and 16 is exactly what a rope-machine pin says. The starting weight
       * is an observation about a machine; the increment is a plan for adding to
       * it, and only the second one has to land on a plate.
       *
       * `toFixed(2)` because 0.1-style float drift on a number the user typed in
       * whole kilos would be visible in a 40 px numeral.
       */
      onChange({
        defaultWeightKg: Math.max(min, Number((draft.defaultWeightKg + delta).toFixed(2))),
      });
      return;
    }
    if (well.field === 'duration') {
      onChange({ durationSeconds: Math.max(min, draft.durationSeconds + delta) });
      return;
    }
    onChange({ targetCount: Math.max(min, draft.targetCount + delta) });
  };

  return (
    <View className="rounded-surface border border-hairline bg-surface p-md">
      <View className="flex-row items-center justify-between">
        <View className="flex-row">
          {deltas
            .filter((d) => d < 0)
            .map((delta, i) => (
              <StepChip
                key={delta}
                label={formatDelta(delta, isTime)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>

        <View className="mx-xs flex-row items-baseline">
          <Text className="text-display font-semibold tabular-nums text-ink">
            {wellValue(draft, well.field)}
          </Text>
          {well.unit ? (
            <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">
              {well.unit}
            </Text>
          ) : null}
        </View>

        <View className="flex-row">
          {deltas
            .filter((d) => d > 0)
            .map((delta, i) => (
              <StepChip
                key={delta}
                label={formatDelta(delta, isTime)}
                first={i === 0}
                onPress={() => bump(delta)}
              />
            ))}
        </View>
      </View>

      <View className="mt-md flex-row items-center justify-between">
        <Kicker>{well.label}</Kicker>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Done adjusting"
          className="h-hit justify-center"
        >
          <Text className="text-label font-semibold text-green-bright">Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 44 high, 46 wide minimum — a thumb target, matching `QuickAdjust`'s chips. */
function StepChip({
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
        'h-hit min-w-[46px] items-center justify-center rounded-pill border border-hairline bg-surface-alt px-sm',
        first ? '' : 'ml-sm',
      ].join(' ')}
    >
      <Text className="text-label font-medium tabular-nums text-ink">{label}</Text>
    </Pressable>
  );
}

/**
 * The two step sizes for a field, and the floor it cannot go below.
 *
 * WEIGHT STEPS BY 1 AND 10, always. It used to step by the exercise's increment,
 * which sounds tidier and makes whole ranges of real weights unreachable: with a
 * 2.5 increment you can produce 15 and 17.5 but never 16, and 16 is what the pin on
 * a rope machine says. ±1 reaches every whole kilo and ±10 crosses the range in a
 * couple of taps; a half-kilo starting value stays on its own grid because nothing
 * is rounded (see `bump`).
 *
 * The floors matter: 0 kg is a real answer (bodyweight plus nothing yet), 0 reps
 * and a 0-second hold are not.
 */
function stepsFor(
  field: WellSpec['field'],
  draft: ExerciseDraft,
): { small: number; large: number; min: number; isTime: boolean } {
  if (field === 'weight') return { small: 1, large: 10, min: 0, isTime: false };
  if (field === 'duration') return { small: 15, large: 60, min: 5, isTime: true };

  switch (draft.countUnit) {
    case 'seconds':
      // A weighted-but-time-counted set keeps its target in `count`.
      return { small: 15, large: 60, min: 5, isTime: true };
    case 'meters':
      return { small: 25, large: 100, min: 25, isTime: false };
    case 'rounds':
      return { small: 1, large: 4, min: 1, isTime: false };
    default:
      return { small: 1, large: 5, min: 1, isTime: false };
  }
}

/**
 * "+2.5" / "−10" / "+15s" — a real minus sign (U+2212), not a hyphen, so it
 * optically matches the plus at the same size.
 */
function formatDelta(delta: number, isTime: boolean): string {
  const rounded = Number(delta.toFixed(2));
  const body = `${Math.abs(rounded)}${isTime ? 's' : ''}`;
  return rounded < 0 ? `−${body}` : `+${body}`;
}

/** Cycle to the next loadable increment, wrapping. */
function nextIncrement(current: number): number {
  const index = INCREMENT_CHOICES.indexOf(current as (typeof INCREMENT_CHOICES)[number]);
  return INCREMENT_CHOICES[(index + 1) % INCREMENT_CHOICES.length];
}

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

function wellValue(draft: ExerciseDraft, field: WellSpec['field']): string {
  if (field === 'weight') return String(draft.defaultWeightKg);
  if (field === 'duration') return formatClock(draft.durationSeconds);
  return String(draft.targetCount);
}
