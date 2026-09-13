/**
 * TasksScreen — the day.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │        ‹   13 September 2026   ›             │
 *   │                  TODAY                       │
 *   │ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔             │
 *   │ 6 of 8 done                                  │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ✓  Morning Bible/Narek reading         › │ │
 *   │ │    Every day · 12 in a row               │ │
 *   │ │ ○  Evening Bible reading               › │ │
 *   │ │ ✕  Book reading before sleep           › │ │
 *   │ │    Every day · missed on purpose · …     │ │
 *   │ │ +  Add task                              │ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE CIRCLE IS THE SCREEN ──────────────────────────────────────────────
 *
 * Everything else here is a label on it. It cycles unanswered → done → missed on
 * purpose → unanswered, and the third state is the one that makes the other two
 * mean anything: without a way to say "I chose not to", the only honest thing a
 * habit list can report is failure, so people stop answering it and it reports
 * nothing at all. `lib/tasks.ts` has the argument in full.
 *
 * The circle is 28px inside a 64-high row, so the TAP TARGET is the row's full
 * height and the glyph is just where it is drawn. Tapping the rest of the row
 * opens the month; only the left column toggles.
 *
 * ── THE PAGER GOES BACKWARDS, AND ONLY BACKWARDS ──────────────────────────
 *
 * You can walk to any past day and answer it — a day you forgot to open the app
 * on is exactly the day worth answering late. You cannot walk into tomorrow:
 * there is nothing there to tick, and a screen offering to let you tick it would
 * be offering to lie. The `›` is simply absent on today.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { TaskEditorSheet } from '../components/TaskEditorSheet';
import {
  WEEKDAY_LABELS,
  dayKey,
  formatLongDay,
  parseDay,
  shiftDay,
  weekdayIndex,
} from '../lib/days';
import {
  type Task,
  type TaskMark,
  dayProgress,
  describeTaskRow,
  entryOf,
  tasksOn,
} from '../lib/tasks';
import { useTasks } from '../state/tasksStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

interface TasksScreenProps {
  onOpenTask: (taskId: ID) => void;
}

export function TasksScreen({ onOpenTask }: TasksScreenProps) {
  const insets = useSafeAreaInsets();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const cycleMark = useTasks((s) => s.cycleMark);
  const addTask = useTasks((s) => s.addTask);

  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);

  const rows = tasksOn(tasks, day);
  const progress = dayProgress(tasks, log, day);
  const isToday = day === today;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-lg flex-row items-center justify-center">
          <Pressable
            onPress={() => setDay(shiftDay(day, -1))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The day before"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            <Icon name="chevron-left" size={20} color={palette.inkMuted} />
          </Pressable>

          <Text className="mx-lg text-title font-semibold tabular-nums text-ink">
            {formatLongDay(day)}
          </Text>

          <Pressable
            onPress={() => setDay(shiftDay(day, 1))}
            disabled={isToday}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The day after"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {isToday ? null : <Icon name="chevron-right" size={20} color={palette.inkMuted} />}
          </Pressable>
        </View>

        <View className="mx-lg items-center">
          <Kicker tone={isToday ? 'green' : 'faint'}>{isToday ? 'Today' : weekdayName(day)}</Kicker>
        </View>

        {/* 6px of track, and the app's one progress bar. It is a ratio, not a
            target: a day that asked for nothing reads full rather than empty. */}
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${progress.done} of ${progress.total} done`}
          className="mx-lg mt-lg h-[6px] overflow-hidden rounded-pill bg-green-dim"
        >
          <View
            className="h-[6px] rounded-pill bg-green-bright"
            style={{ width: `${Math.round(progress.fraction * 100)}%` }}
          />
        </View>
        <Text className="mx-lg mt-sm text-label tabular-nums text-ink-muted">
          {progress.total === 0
            ? 'Nothing asked for today'
            : `${progress.done} of ${progress.total} done`}
        </Text>

        <ListCard className="mx-lg mt-lg">
          {rows.map((task, index) => (
            <View key={task.id}>
              {index > 0 ? <Separator /> : null}
              <TaskRow
                task={task}
                mark={entryOf(log, task.id, day).mark}
                detail={describeTaskRow(task, log, day)}
                onToggle={() => cycleMark(task.id, day)}
                onOpen={() => onOpenTask(task.id)}
              />
            </View>
          ))}
          {rows.length > 0 ? <Separator inset={0} /> : null}
          <AddRow label="Add task" tone="faint" onPress={() => setAdding(true)} />
        </ListCard>

        {rows.length === 0 ? (
          <Text className="mx-lg mt-lg text-label text-ink-faint">
            Nothing is scheduled for this day.
          </Text>
        ) : null}
      </ScrollView>

      {adding ? (
        <TaskEditorSheet
          title="New task"
          onSave={(name, schedule) => {
            addTask(name, schedule);
            setAdding(false);
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function weekdayName(day: string): string {
  const date = parseDay(day);
  return date ? WEEKDAY_LABELS[weekdayIndex(date)] : '';
}

function TaskRow({
  task,
  mark,
  detail,
  onToggle,
  onOpen,
}: {
  task: Task;
  mark: TaskMark | null;
  detail: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <View className="h-row-lg flex-row items-center">
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: mark === 'done' }}
        accessibilityLabel={`${task.name}. ${answerOf(mark)}. Tap to change.`}
        style={pressedStyle}
        className="h-row-lg w-[56px] items-center justify-center"
      >
        <Mark mark={mark} />
      </Pressable>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.name}. ${detail}. Open the month.`}
        style={pressedStyle}
        className="h-row-lg flex-1 flex-row items-center pr-lg"
      >
        <View className="flex-1 pr-md">
          <Text
            numberOfLines={1}
            className={['text-body', mark === 'missed' ? 'text-ink-muted' : 'text-ink'].join(' ')}
          >
            {task.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {detail}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </Pressable>
    </View>
  );
}

/** The three answers, as three marks. Green fill is the only one that is filled. */
function Mark({ mark }: { mark: TaskMark | null }) {
  if (mark === 'done') {
    return (
      <View className="h-[28px] w-[28px] items-center justify-center rounded-pill bg-green">
        <Icon name="check" size={14} color={palette.ink} />
      </View>
    );
  }
  if (mark === 'missed') {
    return (
      <View className="h-[28px] w-[28px] items-center justify-center rounded-pill bg-surface-alt">
        <Icon name="x" size={12} color={palette.inkFaint} />
      </View>
    );
  }
  return <View className="h-[28px] w-[28px] rounded-pill border border-hairline" />;
}

function answerOf(mark: TaskMark | null): string {
  if (mark === 'done') return 'Done';
  if (mark === 'missed') return 'Missed on purpose';
  return 'Not answered';
}
