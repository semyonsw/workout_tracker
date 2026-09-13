/**
 * TaskEditorScreen — a task's name and the days it asks for.
 *
 * One screen for new and existing, because the fields are identical and the only
 * difference is what is already in them. `CreateExerciseScreen` and the library's
 * edit route made the same call for the same reason.
 *
 * Three schedules and a chip row, which is the whole grammar (see `types/tasks.ts`).
 * The weekday chips appear only under `Some days`, and the date stepper only under
 * `Once`: a control for a mode you are not in is a control you have to learn to
 * ignore.
 *
 * WHAT IS NOT EDITABLE: `auto`. Whether finishing a workout ticks this task is a fact
 * about the app's wiring, not a preference, and a second task claiming the workout
 * would make "which one gets ticked" a question with no good answer. Renaming the one
 * that has it is the supported way to have your own wording — which is why the header
 * says it is there rather than hiding it.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  FieldWell,
  Kicker,
  ListCard,
  PrimaryButton,
  Segmented,
  SelectChip,
} from '../components/primitives';
import { addDays, dayLabel } from '../lib/money';
import { WEEKDAY_NAMES } from '../lib/tasks';
import type { TaskDraft } from '../state/taskStore';
import { palette } from '../theme/tokens';
import type { DailyTask, TaskSchedule } from '../types/tasks';

interface TaskEditorScreenProps {
  /** The task being edited, or `null` for a new one. */
  existing: DailyTask | null;
  /** The day the Tasks tab is on — what a one-off starts pinned to. */
  dayKey: string;
  onSave: (draft: TaskDraft) => void;
  onBack: () => void;
}

export function TaskEditorScreen({ existing, dayKey, onSave, onBack }: TaskEditorScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(existing?.name ?? '');
  const [schedule, setSchedule] = useState<TaskSchedule>(existing?.schedule ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(
    existing?.schedule === 'weekdays' ? existing.activeWeekdays : [1, 3, 5],
  );
  const [date, setDate] = useState(existing?.date ?? dayKey);

  const ready = name.trim().length > 0 && (schedule !== 'weekdays' || weekdays.length > 0);
  const save = () => {
    if (!ready) return;
    onSave({ name, schedule, activeWeekdays: weekdays, date });
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={existing ? 'Edit task' : 'New task'}
        subtitle={existing?.auto ? 'Ticked automatically — rename it, it keeps that' : undefined}
        onBack={onBack}
        action={{ label: 'Save', tone: ready ? 'primary' : 'muted', onPress: save }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Name</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={name}
            onChangeText={setName}
            placeholder="Evening reading"
            autoFocus={!existing}
            selectAllOnFocus
            accessibilityLabel="Task name"
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Asks for</Kicker>
        <View className="mx-lg">
          <Segmented
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'weekdays', label: 'Some days' },
              { value: 'once', label: 'Once' },
            ]}
            value={schedule}
            onChange={setSchedule}
            accessibilityLabel="Schedule"
          />
        </View>

        {schedule === 'weekdays' ? (
          <View className="mx-lg mt-md flex-row flex-wrap">
            {WEEKDAY_NAMES.map((label, day) => (
              <SelectChip
                key={label}
                label={label}
                selected={weekdays.includes(day)}
                onPress={() =>
                  setWeekdays((current) =>
                    current.includes(day)
                      ? current.filter((d) => d !== day)
                      : [...current, day].sort(),
                  )
                }
              />
            ))}
          </View>
        ) : null}

        {schedule === 'once' ? (
          <ListCard className="mx-lg mt-md">
            <View className="h-row flex-row items-center px-sm">
              <Arrow
                icon="chevron-left"
                label="Earlier"
                onPress={() => setDate(addDays(date, -1))}
              />
              <Text className="flex-1 text-center text-body font-medium tabular-nums text-ink">
                {dayLabel(date)}
              </Text>
              <Arrow icon="chevron-right" label="Later" onPress={() => setDate(addDays(date, 1))} />
            </View>
          </ListCard>
        ) : null}

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={existing ? 'Save' : 'Add task'}
            variant={ready ? 'primary' : 'ghost'}
            onPress={save}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Arrow({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={pressedStyle}
      className="h-hit w-hit items-center justify-center"
    >
      <Icon name={icon} size={18} color={palette.ink} />
    </Pressable>
  );
}
