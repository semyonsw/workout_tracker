/**
 * RoutineListScreen — the `Routines` tab.
 *
 * Not one of the fourteen designed frames: it is the landing surface the tab bar
 * needs in order to lead somewhere. Deliberately built from nothing but the
 * primitives the designed screens already establish — 64-high two-line rows, an
 * `Add routine` footer — so it inherits the system rather than inventing a
 * fifteenth layout to maintain.
 *
 * TWO TARGETS PER ROW, and they answer different questions. The row opens the
 * routine to EDIT it; the ▶ on the right OPENS THE WORKOUT (which then starts on
 * its own `Start` — see `ActiveWorkoutScreen`). This tab is where someone is
 * already looking at their routines, so it can reach either without a detour.
 *
 * The `Training sequence` row at the top is the way in to the optional running
 * order of those routines. It states whether it is on, because a feature that is
 * off and invisible is a feature nobody finds.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { AddRow, Kicker, ListCard, Separator } from '../components/primitives';
import { describeItemsFocus } from '../lib/muscles';
import { palette } from '../theme/tokens';
import type { Exercise, ID, Routine, TrainingSequence } from '../types/models';

interface RoutineListScreenProps {
  routines: Routine[];
  exercisesById: Record<ID, Exercise>;
  sequence: TrainingSequence;
  onOpen: (routineId: ID) => void;
  /** Open this routine as a workout. It starts inside, not here. */
  onStartWorkout: (routineId: ID) => void;
  onCreate: () => void;
  onOpenSequence: () => void;
}

export function RoutineListScreen({
  routines,
  exercisesById,
  sequence,
  onOpen,
  onStartWorkout,
  onCreate,
  onOpenSequence,
}: RoutineListScreenProps) {
  const insets = useSafeAreaInsets();
  const stepCount = sequence.routineIds.length;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Sequence</Kicker>
        <ListCard className="mx-lg">
          <Pressable
            onPress={onOpenSequence}
            accessibilityRole="button"
            accessibilityLabel="Training sequence"
            className="h-row-lg flex-row items-center px-lg"
          >
            <View className="flex-1 pr-md">
              <Text className="text-body font-medium text-ink">Training sequence</Text>
              <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
                {stepCount === 0
                  ? 'Off · no order set'
                  : `${sequence.isActive ? 'On' : 'Off'} · ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={palette.inkFaint} />
          </Pressable>
        </ListCard>

        <Kicker className="mx-lg mb-sm mt-xl">Routines · {routines.length}</Kicker>

        <ListCard className="mx-lg">
          {routines.map((routine, index) => {
            // A routine whose every exercise was deleted has nothing to open.
            const startable = routine.items.some((item) => exercisesById[item.exerciseId]);

            return (
              <View key={routine.id}>
                {index > 0 ? <Separator /> : null}
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => onOpen(routine.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${routine.name}`}
                    className="h-row-lg flex-1 flex-row items-center pl-lg"
                  >
                    <View className="flex-1">
                      <Text numberOfLines={1} className="text-body font-medium text-ink">
                        {routine.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="mt-[2px] text-label tabular-nums text-ink-faint"
                      >
                        {summarize(routine, exercisesById)}
                      </Text>
                    </View>
                    <View className="ml-md">
                      <Icon name="chevron-right" size={18} color={palette.inkFaint} />
                    </View>
                  </Pressable>

                  {/* 52 wide, full row height, and its own hit area: opening the
                      workout must not be reachable by a thumb aiming at `Edit`. */}
                  {startable ? (
                    <Pressable
                      onPress={() => onStartWorkout(routine.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${routine.name} as a workout`}
                      className="h-row-lg w-[52px] items-center justify-center"
                    >
                      <View className="h-[32px] w-[32px] items-center justify-center rounded-pill border border-hairline bg-surface-alt">
                        <Icon name="play" size={14} color={palette.greenBright} />
                      </View>
                    </Pressable>
                  ) : (
                    <View className="w-lg" />
                  )}
                </View>
              </View>
            );
          })}

          <Separator inset={0} />
          <AddRow label="Add routine" onPress={onCreate} />
        </ListCard>
      </ScrollView>
    </View>
  );
}

/**
 * "Pull · back, biceps · 6 exercises" — what day it is, then how much of it.
 *
 * The focus clause comes from the exercises themselves (see `lib/muscles.ts`), so
 * it is a fact about the routine rather than a repeat of the name someone typed:
 * a routine called "Pull + swimming" that is secretly all squats says `Legs`.
 * It leads because it is the thing you scan for when you are looking for the
 * right session, and it drops out silently for a routine with no muscles filed.
 */
function summarize(routine: Routine, exercisesById: Record<ID, Exercise>): string {
  const items = routine.items.filter((item) => exercisesById[item.exerciseId]);
  const sets = items.reduce((total, item) => total + item.targetSets, 0);
  const focus = describeItemsFocus(items, exercisesById);
  return [focus, `${items.length} exercises · ${sets} sets`].filter(Boolean).join(' · ');
}
