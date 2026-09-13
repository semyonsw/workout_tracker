/**
 * MoreScreen — the things you set up once.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SEMYONSW                                     │
 *   │ Training, tasks and money, in one log.       │
 *   │                                              │
 *   │ TRAINING                                     │
 *   │ Routines                            6      › │
 *   │ Exercise library                   52      › │
 *   │                                              │
 *   │ EVERYTHING ELSE                              │
 *   │ Settings, backup and restore               › │
 *   │                                              │
 *   │ Finishing a workout ticks the workout task.  │
 *   └──────────────────────────────────────────────┘
 *
 * The fifth root, and the only one that is not a log. Routines, the library and
 * Settings each had a tab of their own until the tasks and the money arrived;
 * all three are places you go to change something you configured once, which is
 * a different kind of visit from "what do I do now", and none of them was ever
 * the reason the app got opened. See `components/TabBar.tsx`.
 *
 * THE TWO COUNTS ARE THE POINT OF THE ROWS. `Routines · 6` says whether there is
 * anything to open without opening anything, which is the question you have when
 * you are looking at this screen at all.
 *
 * The closing paragraph is the only place the app explains itself, and it
 * explains exactly one thing: two of the daily tasks answer themselves. That is
 * surprising the first time it happens, and a tick nobody can account for is a
 * tick you stop trusting.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { Kicker, ListCard, Separator } from '../components/primitives';
import { palette } from '../theme/tokens';

interface MoreScreenProps {
  routineCount: number;
  exerciseCount: number;
  onOpenRoutines: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
}

export function MoreScreen({
  routineCount,
  exerciseCount,
  onOpenRoutines,
  onOpenLibrary,
  onOpenSettings,
}: MoreScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg">semyonsw</Kicker>
        <Text className="mx-lg mt-sm text-title-lg font-semibold text-ink">
          Training, tasks and money, in one log.
        </Text>

        <Kicker className="mx-lg mb-sm mt-xxl">Training</Kicker>
        <ListCard className="mx-lg">
          <NavRow label="Routines" value={String(routineCount)} onPress={onOpenRoutines} />
          <Separator />
          <NavRow label="Exercise library" value={String(exerciseCount)} onPress={onOpenLibrary} />
        </ListCard>

        <Kicker className="mx-lg mb-sm mt-xl">Everything else</Kicker>
        <ListCard className="mx-lg">
          <NavRow label="Settings, backup and restore" onPress={onOpenSettings} />
        </ListCard>

        <Text className="mx-lg mt-xxl max-w-[300px] text-label text-ink-faint">
          Finishing a workout ticks the workout task. Recording an amount ticks the expense one.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * A row that goes somewhere.
 *
 * `SettingRow` states a value; this one is a door, and the chevron is the whole
 * difference. It is the only row shape in the app that carries one, which is why
 * it is spelled out here rather than added as a flag to the primitive.
 */
function NavRow({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={pressedStyle}
      className="h-row flex-row items-center px-lg"
    >
      <Text className="flex-1 text-body font-medium text-ink">{label}</Text>
      {value ? (
        <Text className="mr-md text-body font-medium tabular-nums text-ink-muted">{value}</Text>
      ) : null}
      <Icon name="chevron-right" size={16} color={palette.inkFaint} />
    </Pressable>
  );
}
