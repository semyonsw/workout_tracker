/**
 * TaskEditorSheet — a task's name and the days it asks on.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ New task                                   │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ Morning Bible/Narek reading            │ │
 *   │ └────────────────────────────────────────┘ │
 *   │ ASKS ON                                    │
 *   │ ╭── Every day ──╮╭── Chosen days ─────────╮│
 *   │  Mon  Tue  Wed  Thu  Fri  Sat  Sun         │
 *   │ ╭────────────── Save ───────────────────╮  │
 *   ╰────────────────────────────────────────────╯
 *
 * A task is TWO facts, and this is the whole editor for both. There is no colour
 * to pick, no icon, no reminder time and no priority: the list is read top to
 * bottom every evening, so its order is the only ranking it needs, and a
 * notification is a different product.
 *
 * The weekday row only exists under `Chosen days`. A segmented control that
 * reveals seven chips is one more decision than most tasks need — almost
 * everything here is daily — so the common answer is the first one and costs
 * nothing.
 */

import { useState } from 'react';
import { Text, View } from 'react-native';

import { Sheet } from './Sheet';
import { FieldWell, Kicker, PrimaryButton, Segmented, SelectChip, TextButton } from './primitives';
import { WEEKDAY_LABELS } from '../lib/days';
import type { TaskSchedule, Weekday } from '../lib/tasks';

const KINDS = [
  { value: 'daily' as const, label: 'Every day' },
  { value: 'weekdays' as const, label: 'Chosen days' },
];

interface TaskEditorSheetProps {
  title: string;
  /** Absent for a new task. */
  name?: string;
  schedule?: TaskSchedule;
  onSave: (name: string, schedule: TaskSchedule) => void;
  onDismiss: () => void;
}

export function TaskEditorSheet({
  title,
  name: initialName = '',
  schedule: initialSchedule = { kind: 'daily' },
  onSave,
  onDismiss,
}: TaskEditorSheetProps) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<'daily' | 'weekdays'>(initialSchedule.kind);
  const [days, setDays] = useState<readonly Weekday[]>(
    initialSchedule.kind === 'weekdays' ? initialSchedule.days : [0, 2, 4],
  );

  const schedule: TaskSchedule = kind === 'daily' ? { kind: 'daily' } : { kind: 'weekdays', days };
  // A task with no name is not a task, and one that asks on no day never asks.
  const savable = name.trim() !== '' && (kind === 'daily' || days.length > 0);

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <FieldWell
        value={name}
        size="body"
        placeholder="What are you asking yourself to do?"
        onChangeText={setName}
        autoFocus={initialName === ''}
        accessibilityLabel="Task name"
      />

      <Kicker className="mb-sm mt-xl">Asks on</Kicker>
      <Segmented
        options={KINDS}
        value={kind}
        onChange={setKind}
        accessibilityLabel="Every day, or only on the days you choose"
      />

      {kind === 'weekdays' ? (
        <View className="mt-md flex-row flex-wrap">
          {WEEKDAY_LABELS.map((label, index) => {
            const weekday = index as Weekday;
            const selected = days.includes(weekday);
            return (
              <SelectChip
                key={label}
                label={label}
                selected={selected}
                onPress={() =>
                  setDays((current) =>
                    selected ? current.filter((day) => day !== weekday) : [...current, weekday],
                  )
                }
              />
            );
          })}
        </View>
      ) : null}

      {savable ? null : (
        <Text className="mt-sm text-label text-ink-faint">
          {name.trim() === '' ? 'Give it a name.' : 'Pick at least one day.'}
        </Text>
      )}

      <View className="mt-xl">
        <PrimaryButton
          label="Save"
          onPress={() => {
            if (savable) onSave(name.trim(), schedule);
          }}
        />
        <TextButton label="Cancel" onPress={onDismiss} />
      </View>
    </Sheet>
  );
}
