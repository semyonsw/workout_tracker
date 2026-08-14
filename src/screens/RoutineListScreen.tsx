/**
 * RoutineListScreen — the `Routines` tab.
 *
 * Not one of the fourteen designed frames: it is the landing surface the tab bar
 * needs in order to lead somewhere. Deliberately built from nothing but the
 * primitives the designed screens already establish — 64-high two-line rows, an
 * `Add routine` footer — so it inherits the system rather than inventing a
 * fifteenth layout to maintain.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine } from '../types/models';

interface RoutineListScreenProps {
  routines: Routine[];
  exercisesById: Record<ID, Exercise>;
  onOpen: (routineId: ID) => void;
  onCreate: () => void;
}

export function RoutineListScreen({
  routines,
  exercisesById,
  onOpen,
  onCreate,
}: RoutineListScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Routines · {routines.length}</Kicker>

        <ListCard className="mx-lg">
          {routines.map((routine, index) => (
            <View key={routine.id}>
              {index > 0 ? <Separator /> : null}
              <Pressable
                onPress={() => onOpen(routine.id)}
                accessibilityRole="button"
                accessibilityLabel={routine.name}
                className="h-row-lg flex-row items-center px-lg"
              >
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-body font-medium text-ink">
                    {routine.name}
                  </Text>
                  <Text className="mt-[2px] text-label tabular-nums text-ink-faint">
                    {summarize(routine, exercisesById)}
                  </Text>
                </View>
                <View className="ml-md">
                  <Icon name="chevron-right" size={18} color={palette.inkFaint} />
                </View>
              </Pressable>
            </View>
          ))}

          <Separator inset={0} />
          <AddRow label="Add routine" onPress={onCreate} />
        </ListCard>
      </ScrollView>
    </View>
  );
}

/** "6 exercises · 18 sets" — the same two numbers the Today card leads with. */
function summarize(routine: Routine, exercisesById: Record<ID, Exercise>): string {
  const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
  const sets = items.reduce((total, item) => total + item.targetSets, 0);
  return `${items.length} exercises · ${sets} sets`;
}
