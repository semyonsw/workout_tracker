/**
 * TaskDetailScreen — one task, one month.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ Tasks                                      │
 *   │ Morning Bible/Narek reading                  │
 *   │ Every day · since 4 January 2026             │
 *   │ ┌─ STREAK ────────┐┌─ THIS MONTH ──────────┐ │
 *   │ │ 12 days         ││ 11 of 13              │ │
 *   │ └─────────────────┘└───────────────────────┘ │
 *   │          ‹ September 2026 ›                  │
 *   │  M  T  W  T  F  S  S                         │
 *   │     ▢  ▢  ■  ■  ■  ■                         │
 *   │  ■  ■  ■  ■  ■  ■  ◉  ← today                │
 *   │ NOTE · 12 SEPTEMBER                          │
 *   │ ╭──────────── Edit task ─────────────────╮   │
 *   │ Archive this task                            │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE GRID IS THE ANSWER TO A QUESTION THE LIST CANNOT ANSWER ───────────
 *
 * Exactly the argument `lib/calendar.ts` makes for the training calendar: "how
 * did September go" is a question about a SHAPE, and thirty rows of dates is not
 * a shape. Four squares in a row with a gap after them says something no counter
 * does.
 *
 * Four cell states and they are four different things — filled is done, outlined
 * is missed on purpose, faint is a day that went by unanswered, and BLANK is a
 * day this task never asked about. The blanks are what stop a Mon/Wed/Fri task
 * from looking like a daily one with a terrible record.
 *
 * ── THE NOTE IS ATTACHED TO A DAY, NOT TO THE TASK ────────────────────────
 *
 * Tapping a square moves the note field to that square's day. A note on the task
 * itself would be a description, and a task that needs describing needs renaming.
 *
 * ── ARCHIVE, AND NO DELETE ────────────────────────────────────────────────
 *
 * Stated plainly in `ink-muted`, like every other destructive row in the app —
 * there is no red here. Archiving keeps the months that were already drawn;
 * deleting would silently remove a year of answered days from a log whose only
 * job is to remember them.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import { pressedStyle } from '../components/motion';
import { FieldWell, Kicker, PrimaryButton, TextButton } from '../components/primitives';
import { WEEKDAY_INITIALS, dayKey, formatLongDay, formatShortDay, parseDay } from '../lib/days';
import {
  type Task,
  type TaskCell,
  describeSchedule,
  entryOf,
  streakOf,
  taskMonth,
} from '../lib/tasks';
import { useTasks } from '../state/tasksStore';
import { palette } from '../theme/tokens';

interface TaskDetailScreenProps {
  task: Task;
  onBack: () => void;
}

export function TaskDetailScreen({ task, onBack }: TaskDetailScreenProps) {
  const log = useTasks((s) => s.log);
  const setNote = useTasks((s) => s.setNote);
  const updateTask = useTasks((s) => s.updateTask);
  const archiveTask = useTasks((s) => s.archiveTask);

  const today = dayKey(new Date());
  const start = parseDay(today) ?? new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [noteDay, setNoteDay] = useState(today);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const month = useMemo(
    () => taskMonth(task, log, cursor.year, cursor.month, today),
    [task, log, cursor, today],
  );
  const streak = streakOf(task, log, today);
  const note = entryOf(log, task.id, noteDay).note;

  const step = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };
  // Nothing is recorded past this month, so there is nowhere forward to go.
  const atLatest = cursor.year === start.getFullYear() && cursor.month === start.getMonth();

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker="Tasks" onBack={onBack} bordered={false} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg mt-sm text-title font-semibold text-ink">{task.name}</Text>
        <Text className="mx-lg mt-xs text-label text-ink-muted">
          {describeSchedule(task.schedule)} · since {formatLongDay(task.startedOn)}
        </Text>

        <View className="mx-lg mt-lg flex-row gap-md">
          <Well label="Streak" value={String(streak)} unit={streak === 1 ? 'day' : 'days'} green />
          <Well label="This month" value={String(month.done)} unit={`of ${month.asked}`} />
        </View>

        <View className="mx-lg mt-xl flex-row items-center justify-center">
          <Pressable
            onPress={() => step(-1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The month before"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            <Icon name="chevron-left" size={18} color={palette.inkMuted} />
          </Pressable>
          <Text className="mx-lg text-body font-medium tabular-nums text-ink">{month.label}</Text>
          <Pressable
            onPress={() => step(1)}
            disabled={atLatest}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The month after"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {atLatest ? null : <Icon name="chevron-right" size={18} color={palette.inkMuted} />}
          </Pressable>
        </View>

        <View className="mx-lg mt-md flex-row">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <Text
              key={`${initial}${index}`}
              className="flex-1 text-center text-micro font-semibold text-ink-faint"
            >
              {initial}
            </Text>
          ))}
        </View>

        <View className="mx-lg mt-sm">
          {month.weeks.map((week, index) => (
            <View key={index} className="flex-row">
              {week.map((cell, position) => (
                <Cell
                  key={cell.date ?? `pad${position}`}
                  cell={cell}
                  selected={cell.date !== null && cell.date === noteDay}
                  onPress={cell.date ? () => setNoteDay(cell.date as string) : undefined}
                />
              ))}
              {/* The last week is short rather than padded — a trailing blank
                  would draw squares for days that have not happened. */}
              {week.length < 7
                ? Array.from({ length: 7 - week.length }, (_, i) => (
                    <View key={`tail${i}`} className="flex-1" />
                  ))
                : null}
            </View>
          ))}
        </View>

        <Text className="mx-lg mt-md text-label text-ink-faint">
          Filled is done, outlined is missed, faint is unanswered. Blank days were never asked for.
        </Text>

        <Kicker className="mx-lg mb-sm mt-xl">Note · {formatShortDay(noteDay)}</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={note}
            size="body"
            placeholder="What happened that day"
            onChangeText={(text) => setNote(task.id, noteDay, text)}
            accessibilityLabel={`Note for ${formatLongDay(noteDay)}`}
          />
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton label="Edit task" onPress={() => setEditing(true)} />
        </View>
        <View className="mx-lg">
          <TextButton label="Archive this task" onPress={() => setArchiving(true)} />
        </View>
      </ScrollView>

      {editing ? (
        <TaskEditorSheet
          title="Edit task"
          name={task.name}
          schedule={task.schedule}
          onSave={(name, schedule) => {
            updateTask(task.id, { name, schedule });
            setEditing(false);
          }}
          onDismiss={() => setEditing(false)}
        />
      ) : null}

      {archiving ? (
        <ConfirmSheet
          title={`Archive “${task.name}”?`}
          body="It leaves the day list. Every day you already answered stays where it is."
          confirmLabel="Archive it"
          cancelLabel="Keep it"
          onConfirm={() => {
            archiveTask(task.id);
            setArchiving(false);
            onBack();
          }}
          onCancel={() => setArchiving(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** A 96-high well. `NumericWell` is the ± version of this; these two are facts. */
function Well({
  label,
  value,
  unit,
  green = false,
}: {
  label: string;
  value: string;
  unit: string;
  green?: boolean;
}) {
  return (
    <View className="h-well flex-1 justify-between rounded-surface bg-surface-alt p-lg">
      <Kicker>{label}</Kicker>
      <View className="flex-row items-baseline">
        <Text
          className={[
            'text-title-lg font-semibold tabular-nums',
            green ? 'text-green-bright' : 'text-ink',
          ].join(' ')}
        >
          {value}
        </Text>
        <Text className="ml-xs text-label text-ink-muted">{unit}</Text>
      </View>
    </View>
  );
}

function Cell({
  cell,
  selected,
  onPress,
}: {
  cell: TaskCell;
  selected: boolean;
  onPress?: () => void;
}) {
  if (cell.day === null) return <View className="flex-1 p-[3px]" />;

  const fill =
    cell.state === 'done'
      ? 'bg-green'
      : cell.state === 'missed'
        ? 'border border-hairline'
        : cell.state === 'unanswered'
          ? 'border border-ink-faint/40'
          : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cell.day}, ${cell.state}`}
      accessibilityState={{ selected }}
      style={pressedStyle}
      className="flex-1 p-[3px]"
    >
      <View
        className={['aspect-square items-center justify-center rounded-[6px]', fill].join(' ')}
        style={
          // The app's one glow, spent here on the single square that is today.
          cell.isToday
            ? {
                borderWidth: 1,
                borderColor: palette.greenBright,
                shadowColor: palette.greenBright,
                shadowOpacity: 0.45,
                shadowRadius: 8,
                elevation: 6,
              }
            : selected
              ? { borderWidth: 1, borderColor: palette.inkMuted }
              : undefined
        }
      >
        <Text
          className={[
            'text-label tabular-nums',
            cell.state === 'done' ? 'font-medium text-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {cell.day}
        </Text>
      </View>
    </Pressable>
  );
}
