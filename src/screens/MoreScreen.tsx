/**
 * MoreScreen — the fifth tab, and the reason the other four are the ones they are.
 *
 * `semyonsw` tracks three things, and the tab bar holds five roots (that ceiling is
 * `TabBar`'s, and it has not moved). Training, tasks, money and the log take four.
 * Everything that is SETUP rather than use — the routines you train from, the
 * exercises they are built out of, the settings behind all of it — lives here.
 *
 * The split is not "important" versus "unimportant": it is how often a screen is
 * opened. A routine is edited once a month and trained from twice a week, and the
 * training is already one tap away on Today.
 *
 * Rows carry a count, because the count is what makes the row worth the tap: `6
 * routines` answers the question a lot of visits to this screen are actually asking.
 */

import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Kicker, ListCard, Separator, SettingRow } from '../components/primitives';

interface MoreScreenProps {
  routineCount: number;
  exerciseCount: number;
  taskCount: number;
  categoryCount: number;
  onOpenRoutines: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
}

export function MoreScreen({
  routineCount,
  exerciseCount,
  taskCount,
  categoryCount,
  onOpenRoutines,
  onOpenLibrary,
  onOpenSettings,
}: MoreScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-lg">
          <Kicker>semyonsw</Kicker>
          <Text className="mt-xs text-title font-medium text-ink">
            Training, tasks and money, in one log.
          </Text>
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Training</Kicker>
        <ListCard className="mx-lg">
          <SettingRow label="Routines" value={`${routineCount}`} onPress={onOpenRoutines} />
          <Separator />
          <SettingRow label="Exercise library" value={`${exerciseCount}`} onPress={onOpenLibrary} />
        </ListCard>

        <Kicker className="mx-lg mb-sm mt-xl">Everything else</Kicker>
        <ListCard className="mx-lg">
          <SettingRow label="Settings, backup and restore" onPress={onOpenSettings} />
        </ListCard>

        <Text className="mx-lg mt-lg text-label text-ink-faint">
          {taskCount} daily {taskCount === 1 ? 'task' : 'tasks'} · {categoryCount} money{' '}
          {categoryCount === 1 ? 'category' : 'categories'}. Finishing a workout ticks the workout
          task; recording an amount ticks the expense one.
        </Text>
      </ScrollView>
    </View>
  );
}
