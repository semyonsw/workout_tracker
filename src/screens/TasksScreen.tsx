/**
 * TasksScreen — the `Tasks` tab: what today asks for, and what you have answered.
 *
 * One day at a time, with arrows. A week grid was the obvious alternative and it is
 * the wrong screen for the thing this is used for: ticking. The grid is on the DETAIL
 * screen, where the question is "how am I doing" rather than "what is left".
 *
 * ── THE CIRCLE HAS THREE STATES, NOT TWO ───────────────────────────────────
 *
 *   empty   nobody has said anything about this day yet
 *   ✓       done
 *   ✕       missed, on purpose, and recorded as such
 *
 * The third one is what makes the history worth having. A day left empty and a day
 * you know you skipped look identical in a two-state tracker, so the log slowly turns
 * into "days I remembered to open the app". Tapping cycles empty → done → missed →
 * empty, so all three are one thumb away and nothing needs a long-press.
 *
 * ── A TASK THE APP TICKS FOR YOU SAYS SO ───────────────────────────────────
 *
 * `Gym / Boxing` and `Track expenses` are ticked by finishing a workout and by
 * recording an amount (see `lib/taskSync.ts`). They stay tappable — the app is not
 * the authority on whether you trained — but they carry the word `auto`, because a
 * box that ticks itself with no explanation reads as a bug.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { addDays, dayLabel, daysBetween } from '../lib/money';
import { dayProgress, describeSchedule, statusOf, streakOf, tasksForDay } from '../lib/tasks';
import { useTasks } from '../state/taskStore';
import { palette } from '../theme/tokens';
import type { DailyTask } from '../types/tasks';
import type { ID } from '../types/models';

interface TasksScreenProps {
  /** The day being looked at, and the one the shell remembers between visits. */
  dayKey: string;
  /** Today, so the screen can say so and offer the way back to it. */
  todayKey: string;
  onChangeDay: (dayKey: string) => void;
  onOpenTask: (taskId: ID) => void;
  onAddTask: () => void;
}

export function TasksScreen({
  dayKey,
  todayKey,
  onChangeDay,
  onOpenTask,
  onAddTask,
}: TasksScreenProps) {
  const insets = useSafeAreaInsets();
  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const notes = useTasks((s) => s.notes);
  const cycleDay = useTasks((s) => s.cycleDay);

  const today = tasksForDay(tasks, dayKey);
  const progress = useMemo(() => dayProgress(tasks, log, dayKey), [tasks, log, dayKey]);
  const isToday = dayKey === todayKey;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-hit flex-row items-center px-lg">
          <Arrow
            icon="chevron-left"
            label="Previous day"
            onPress={() => onChangeDay(addDays(dayKey, -1))}
          />
          <View className="flex-1 items-center">
            <Text className="text-body font-semibold tabular-nums text-ink">
              {dayLabel(dayKey)}
            </Text>
            <Text className="text-micro font-semibold uppercase text-ink-faint">
              {isToday ? 'Today' : relativeTo(dayKey, todayKey)}
            </Text>
          </View>
          <Arrow
            icon="chevron-right"
            label="Next day"
            onPress={() => onChangeDay(addDays(dayKey, 1))}
          />
        </View>

        {/* The bar is the only progress indicator in the app that is not a number,
            and it earns it: the number is right beside it, and the bar is what makes
            a glance at the top of the screen enough. */}
        <View className="mx-lg mt-md">
          <View className="h-[6px] overflow-hidden rounded-pill bg-green-dim">
            <View
              className="h-full rounded-pill bg-green-bright"
              style={{
                width: `${progress.planned === 0 ? 0 : Math.round((progress.done / progress.planned) * 100)}%`,
              }}
            />
          </View>
          <View className="mt-sm flex-row items-center">
            <Text className="flex-1 text-label font-medium tabular-nums text-ink-muted">
              {progress.done} of {progress.planned} done
            </Text>
            {isToday ? null : (
              <Pressable
                onPress={() => onChangeDay(todayKey)}
                accessibilityRole="button"
                accessibilityLabel="Back to today"
                style={pressedStyle}
                hitSlop={8}
              >
                <Text className="text-label font-semibold text-green-bright">Today</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">The day</Kicker>

        <ListCard className="mx-lg">
          {today.map((task, index) => (
            <View key={task.id}>
              {index > 0 ? <Separator inset={40} /> : null}
              <TaskRow
                task={task}
                status={statusOf(log, task.id, dayKey)}
                streak={streakOf(task, log, dayKey)}
                note={notes[task.id]?.[dayKey]}
                onToggle={() => cycleDay(task.id, dayKey)}
                onOpen={() => onOpenTask(task.id)}
              />
            </View>
          ))}

          {today.length === 0 ? (
            <View className="h-row-lg justify-center px-lg">
              <Text className="text-label text-ink-faint">Nothing is scheduled for this day.</Text>
            </View>
          ) : null}

          <Separator inset={0} />
          <AddRow label="Add task" onPress={onAddTask} />
        </ListCard>
      </ScrollView>
    </View>
  );
}

/**
 * One task on one day: the circle, the name, and the line that says why it is here.
 *
 * TWO TARGETS, and they are the two questions. The circle answers the day; the row
 * opens the task. Same split as the routine list's row-and-▶, and for the same
 * reason — ticking is the thing you came to do, so it must not be reachable only
 * through a screen you have to leave again.
 */
function TaskRow({
  task,
  status,
  streak,
  note,
  onToggle,
  onOpen,
}: {
  task: DailyTask;
  status: boolean | undefined;
  streak: number;
  note?: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const done = status === true;
  const missed = status === false;

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${task.name}, ${done ? 'done' : missed ? 'missed' : 'not answered'}`}
        style={pressedStyle}
        className="h-row-lg w-[52px] items-center justify-center"
      >
        <View
          className={[
            'h-[28px] w-[28px] items-center justify-center rounded-pill border',
            done
              ? 'border-green bg-green'
              : missed
                ? 'border-hairline bg-surface-alt'
                : 'border-hairline',
          ].join(' ')}
        >
          {done ? <Icon name="check" size={14} color={palette.ink} /> : null}
          {missed ? <Icon name="x" size={12} color={palette.inkFaint} /> : null}
        </View>
      </Pressable>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${task.name}`}
        style={pressedStyle}
        className="h-row-lg flex-1 flex-row items-center pr-lg"
      >
        <View className="flex-1 pr-md">
          <Text
            numberOfLines={1}
            className={['text-body font-medium', done ? 'text-ink-muted' : 'text-ink'].join(' ')}
          >
            {task.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {[
              describeSchedule(task),
              streak > 1 ? `${streak} in a row` : null,
              task.auto ? 'auto' : null,
              note,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={palette.inkFaint} />
      </Pressable>
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
      <Icon name={icon} size={20} color={palette.ink} />
    </Pressable>
  );
}

/** `Yesterday`, `3 days ago`, `In 2 days` — said in days, because the arrows step in days. */
function relativeTo(dayKey: string, todayKey: string): string {
  const delta = daysBetween(todayKey, dayKey);
  if (delta === 0) return 'Today';
  if (delta < 0) return delta === -1 ? 'Yesterday' : `${-delta} days ago`;
  return delta === 1 ? 'Tomorrow' : `In ${delta} days`;
}
