/**
 * ExerciseLibraryScreen — find an exercise, or make one.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  ADD EXERCISE                              │
 *   │ ╭ pull|                                    ╮ │
 *   │ 4 MATCHES                                    │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Weighted 90° pull-ups                 +  │ │
 *   │ │ KG · REPS · ADDED BODYWEIGHT             │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ╭ +  Create "pull"                         ╮ │
 *   │ RECENTLY USED                                │
 *   └──────────────────────────────────────────────┘
 *
 * The micro line under each name is the exercise's SHAPE — which inputs it will
 * render when you log it. `KG · REPS · ADDED BODYWEIGHT` tells you you'll get a
 * weight cell and a reps cell, and that the weight is what's on the belt rather
 * than the whole load. That is the only thing worth saying about an exercise in
 * a list, and it is the thing people actually get wrong when they pick one.
 *
 * Creating from the query is a ROW IN THE SAME LIST, not a separate screen: the
 * moment you learn the thing you want doesn't exist is the moment you're looking
 * at the empty result, and making you navigate away loses the word you typed.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Icon } from '../components/Icon';
import { FieldWell, Kicker, ListCard, Separator } from '../components/primitives';
import { describeShape } from '../lib/exerciseShape';
import { palette } from '../theme/tokens';
import type { Exercise, ID } from '../types/models';

interface ExerciseLibraryScreenProps {
  query: string;
  matches: Exercise[];
  recentlyUsed: Exercise[];
  /** Absent when the library is a tab root rather than a pushed picker. */
  onBack?: () => void;
  onChangeQuery: (query: string) => void;
  onPick: (exerciseId: ID) => void;
  onCreate: (name: string) => void;
}

export function ExerciseLibraryScreen({
  query,
  matches,
  recentlyUsed,
  onBack,
  onChangeQuery,
  onPick,
  onCreate,
}: ExerciseLibraryScreenProps) {
  const trimmed = query.trim();

  return (
    <View className="flex-1 bg-bg">
      {/* No hairline under the header: the search field below is its own
          surface, and two rules 16 apart read as a mistake. */}
      <ScreenHeader
        kicker={onBack ? 'Add exercise' : 'Library'}
        onBack={onBack}
        bordered={false}
      />

      <View className="mx-lg mb-lg">
        <FieldWell
          value={query}
          size="body"
          shape="pill"
          placeholder="Search exercises"
          onChangeText={onChangeQuery}
          accessibilityLabel="Search exercises"
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker className="mx-lg mb-sm">
          {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </Kicker>

        {matches.length > 0 ? (
          <ListCard className="mx-lg">
            {matches.map((exercise, index) => (
              <View key={exercise.id}>
                {index > 0 ? <Separator /> : null}
                <ResultRow exercise={exercise} onPress={() => onPick(exercise.id)} />
              </View>
            ))}
          </ListCard>
        ) : null}

        {trimmed ? (
          <Pressable
            onPress={() => onCreate(trimmed)}
            accessibilityRole="button"
            accessibilityLabel={`Create ${trimmed}`}
            className="mx-lg mt-xl h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg"
          >
            <Icon name="plus" size={14} color={palette.greenBright} />
            <Text className="ml-md text-body font-medium text-ink">Create “{trimmed}”</Text>
          </Pressable>
        ) : null}

        {recentlyUsed.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xxl">Recently used</Kicker>
            <ListCard className="mx-lg">
              {recentlyUsed.map((exercise, index) => (
                <View key={exercise.id}>
                  {index > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={() => onPick(exercise.id)}
                    accessibilityRole="button"
                    accessibilityLabel={exercise.name}
                    className="h-row flex-row items-center px-lg"
                  >
                    <Text numberOfLines={1} className="flex-1 text-body font-medium text-ink">
                      {exercise.name}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ListCard>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ResultRow({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) {
  const shape = describeShape(exercise);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}. ${shape}. Add to routine.`}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {exercise.name}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-micro font-semibold uppercase text-ink-faint">
          {shape}
        </Text>
      </View>
      <View className="ml-md">
        <Icon name="plus" size={16} color={palette.greenBright} />
      </View>
    </Pressable>
  );
}

