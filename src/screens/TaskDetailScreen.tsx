/**
 * TaskDetailScreen — one task, one month at a time.
 *
 * The grid is the reason this screen exists. A list of days tells you what you did;
 * a month of cells tells you the SHAPE of it — the fortnight that went perfectly, the
 * Wednesdays that never happen — and that is the only thing in the task section worth
 * looking at rather than acting on.
 *
 * Three cell states, matching the circles on the day screen: filled for done, an
 * outline for a day explicitly marked missed, and a faint dot for a day nobody has
 * answered. Days the task never asked for are BLANK, not grey-and-present: the
 * clearest thing a Tuesday can say about a Mon/Wed/Fri task is nothing.
 *
 * Every cell is tappable, which is what makes back-filling possible. The old tracker
 * this data came from could only be corrected on the day itself, and the result is
 * visible in the imported history: runs that stop on the days somebody was travelling.
 *
 * The note is per DAY, not per task — the selected day's. It is the one place the
 * imported history carries somebody's own words, so it is an editable field rather
 * than a read-only line.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import { FieldWell, Kicker, ListCard, PrimaryButton, TextButton } from '../components/primitives';
import { addMonths, dayLabel, monthKeyOf, monthLabel } from '../lib/money';
import { describeSchedule, monthCells, monthScore, streakOf } from '../lib/tasks';
import { useTasks } from '../state/taskStore';
import { palette } from '../theme/tokens';
import type { DailyTask } from '../types/tasks';

interface TaskDetailScreenProps {
  task: DailyTask;
  /** The day the Tasks tab is on — where the grid opens, and whose note is shown. */
  dayKey: string;
  onSelectDay: (dayKey: string) => void;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: () => void;
}

export function TaskDetailScreen({
  task,
  dayKey,
  onSelectDay,
  onEdit,
  onBack,
  onDeleted,
}: TaskDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const log = useTasks((s) => s.log);
  const notes = useTasks((s) => s.notes);
  const cycleDay = useTasks((s) => s.cycleDay);
  const setNote = useTasks((s) => s.setNote);
  const deleteTask = useTasks((s) => s.deleteTask);

  const [monthAnchor, setMonthAnchor] = useState(dayKey);
  const [note, setLocalNote] = useState(notes[task.id]?.[dayKey] ?? '');

  const monthKey = monthKeyOf(monthAnchor);
  const cells = monthCells(task, log, monthKey);
  const score = monthScore(task, log, monthKey);
  const streak = streakOf(task, log, dayKey);
  const everLogged = Object.keys(log[task.id] ?? {}).length > 0;

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={task.name}
        subtitle={[describeSchedule(task), task.auto ? 'ticked automatically' : null]
          .filter(Boolean)
          .join(' · ')}
        onBack={onBack}
        action={{ label: 'Edit', tone: 'muted', onPress: onEdit }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-lg flex-row">
          <Stat label="Streak" value={streak === 0 ? '—' : `${streak}`} unit="days" />
          <View className="w-sm" />
          <Stat label="This month" value={`${score.done}`} unit={`of ${score.planned}`} />
        </View>

        <View className="mt-xl h-hit flex-row items-center px-lg">
          <Arrow
            icon="chevron-left"
            label="Previous month"
            onPress={() => setMonthAnchor(addMonths(monthAnchor, -1))}
          />
          <Text className="flex-1 text-center text-body font-semibold tabular-nums text-ink">
            {monthLabel(monthKey)}
          </Text>
          <Arrow
            icon="chevron-right"
            label="Next month"
            onPress={() => setMonthAnchor(addMonths(monthAnchor, 1))}
          />
        </View>

        {/* Seven columns, so a column is a weekday and the pattern in a Mon/Wed/Fri
            task is readable as three vertical stripes. The leading blanks put the
            1st under its real weekday. */}
        <View className="mx-lg mt-sm flex-row flex-wrap">
          {Array.from({ length: leadingBlanks(monthKey) }).map((_, i) => (
            <View key={`blank_${i}`} className="w-[14.28%] p-xs">
              <View className="aspect-square" />
            </View>
          ))}
          {cells.map((cell) => (
            <View key={cell.dayKey} className="w-[14.28%] p-xs">
              <Pressable
                onPress={() => {
                  if (!cell.scheduled) return;
                  cycleDay(task.id, cell.dayKey);
                }}
                onLongPress={() => onSelectDay(cell.dayKey)}
                disabled={!cell.scheduled}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(cell.dayKey)}, ${
                  !cell.scheduled
                    ? 'not scheduled'
                    : cell.status === true
                      ? 'done'
                      : cell.status === false
                        ? 'missed'
                        : 'not answered'
                }`}
                style={pressedStyle}
                className={[
                  'aspect-square items-center justify-center rounded-surface',
                  !cell.scheduled
                    ? ''
                    : cell.status === true
                      ? 'bg-green'
                      : cell.status === false
                        ? 'border border-hairline bg-surface'
                        : 'border border-hairline',
                  cell.dayKey === dayKey ? 'border border-green-bright' : '',
                ].join(' ')}
              >
                <Text
                  className={[
                    'text-label tabular-nums',
                    !cell.scheduled
                      ? 'text-ink-faint'
                      : cell.status === true
                        ? 'font-semibold text-ink'
                        : 'text-ink-muted',
                  ].join(' ')}
                >
                  {cell.day}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text className="mx-lg mt-sm text-label text-ink-faint">
          Tap a day to cycle it: done, missed, unanswered. Hold one to make it the day the Tasks tab
          is showing.
        </Text>

        <Kicker className="mx-lg mb-sm mt-xl">Note · {dayLabel(dayKey)}</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={note}
            size="body"
            onChangeText={setLocalNote}
            onBlur={() => setNote(task.id, dayKey, note)}
            placeholder="Why this day went the way it did"
            accessibilityLabel="Note for this day"
          />
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton label="Edit task" variant="ghost" onPress={onEdit} />
        </View>

        <ListCard className="mx-lg mt-sm">
          <TextButton
            label={everLogged ? 'Archive this task' : 'Delete this task'}
            onPress={() => {
              deleteTask(task.id);
              onDeleted();
            }}
          />
        </ListCard>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {everLogged
            ? 'It has days recorded against it, so it is hidden rather than removed — the history stays true.'
            : 'Nothing has ever been recorded against it, so there is nothing to keep.'}
        </Text>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="h-well flex-1 justify-between rounded-surface border border-hairline bg-surface-alt px-lg py-md">
      <Kicker>{label}</Kicker>
      <View className="flex-row items-baseline">
        <Text className="text-display font-semibold tabular-nums text-ink">{value}</Text>
        <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">{unit}</Text>
      </View>
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

/**
 * How many empty cells go before the 1st, with the grid's Monday-first columns.
 *
 * Monday-first because `lib/money.ts` starts the week on Monday and a calendar that
 * disagrees with the app's own week would put a Sunday total under a Monday column.
 */
function leadingBlanks(monthKey: string): number {
  const weekday = new Date(`${monthKey}-01T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}
