/**
 * ExerciseLibraryScreen — find an exercise, or make one.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  ADD EXERCISE                              │
 *   │ ╭ Search exercises                         ╮ │
 *   │ ( All )( Push )( Pull )( Legs )( Core )      │  ← cluster filter
 *   │ PULL · BACK · 3                              │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Weighted 90° pull-ups                 +  │ │
 *   │ │ KG · REPS · ADDED BODYWEIGHT             │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ PULL · BICEPS · 2                            │
 *   │ ╭ +  New exercise      (+ Create "pull")   ╮ │
 *   └──────────────────────────────────────────────┘
 *
 * TWO MODES, ONE RULE: BROWSING IS GROUPED, SEARCHING IS FLAT.
 *
 * With no query the library is a hierarchy — cluster, then muscle — because the
 * question being asked is "what have I got for back day", and the answer is a
 * shape, not a list. The moment a query exists the question changes to "where is
 * the plank", which has one answer, and section headers between two rows are
 * furniture. Same data, two questions, two layouts.
 *
 * The cluster filter is chips rather than a `Segmented`: six options don't fit in
 * equal segments, and unlike load mode this control is a lens on a list rather
 * than a fact about a thing.
 *
 * The micro line under each name is the exercise's SHAPE — which inputs it will
 * render when you log it. `KG · REPS · ADDED BODYWEIGHT` tells you you'll get a
 * weight cell and a reps cell, and that the weight is what's on the belt rather
 * than the whole load; `TIME · COUNTDOWN` tells you picking this gets you a clock
 * that runs to zero. That is the only thing worth saying about an exercise in a
 * list, and it is the thing people actually get wrong when they pick one. The
 * muscles are said by the section header instead of being repeated on every row.
 *
 * Creating from the query is a ROW IN THE SAME LIST, not a separate screen: the
 * moment you learn the thing you want doesn't exist is the moment you're looking
 * at the empty result, and making you navigate away loses the word you typed.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Icon } from '../components/Icon';
import { AddRow, FieldWell, Kicker, ListCard, SelectChip, Separator } from '../components/primitives';
import { describeShape } from '../lib/exerciseShape';
import { CLUSTERS, clusterLabel, groupByCluster, sectionLabel } from '../lib/muscles';
import { palette } from '../theme/tokens';
import type { Exercise, ID, MuscleCluster } from '../types/models';

interface ExerciseLibraryScreenProps {
  query: string;
  /** Already filtered by `query` and by `cluster` — the screen only renders. */
  matches: Exercise[];
  recentlyUsed: Exercise[];
  /** null = no filter, the `All` chip. */
  cluster: MuscleCluster | null;
  /** Absent when the library is a tab root rather than a pushed picker. */
  onBack?: () => void;
  onChangeQuery: (query: string) => void;
  onChangeCluster: (cluster: MuscleCluster | null) => void;
  onPick: (exerciseId: ID) => void;
  onCreate: (name: string) => void;
}

export function ExerciseLibraryScreen({
  query,
  matches,
  recentlyUsed,
  cluster,
  onBack,
  onChangeQuery,
  onChangeCluster,
  onPick,
  onCreate,
}: ExerciseLibraryScreenProps) {
  const trimmed = query.trim();
  const { sections, unfiled } = groupByCluster(matches, cluster);

  return (
    <View className="flex-1 bg-bg">
      {/* No hairline under the header: the search field below is its own
          surface, and two rules 16 apart read as a mistake. */}
      <ScreenHeader
        kicker={onBack ? 'Add exercise' : 'Library'}
        onBack={onBack}
        bordered={false}
      />

      <View className="mx-lg mb-md">
        <FieldWell
          value={query}
          size="body"
          shape="pill"
          placeholder="Search exercises, muscles, days"
          onChangeText={onChangeQuery}
          accessibilityLabel="Search exercises"
        />
      </View>

      {/* Horizontal so the filter never costs two lines, and so a sixth cluster
          is a scroll rather than a redesign. The 44-high box is fixed: a bare
          horizontal ScrollView in a column would fight the list below it for
          height. */}
      <View className="h-hit">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          <SelectChip label="All" selected={cluster == null} onPress={() => onChangeCluster(null)} />
          {CLUSTERS.map((option) => (
            <SelectChip
              key={option}
              label={clusterLabel(option)}
              selected={cluster === option}
              onPress={() => onChangeCluster(cluster === option ? null : option)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {trimmed ? (
          /* Searching: one flat, ranked list. */
          <>
            <Kicker className="mx-lg mb-sm mt-sm">
              {matches.length} {matches.length === 1 ? 'match' : 'matches'}
            </Kicker>
            {matches.length > 0 ? <ResultCard exercises={matches} onPick={onPick} /> : null}
          </>
        ) : (
          /* Browsing: the hierarchy, cluster by cluster. */
          <>
            {sections.map((section) => (
              <View key={section.muscle}>
                {/* With a cluster chip active the header drops the cluster: the
                    chip above already says `Pull`, and saying it twice on every
                    header is the app talking to itself. */}
                <Kicker className="mx-lg mb-sm mt-lg">
                  {cluster ? section.muscle : sectionLabel(section)} · {section.exercises.length}
                </Kicker>
                <ResultCard exercises={section.exercises} onPick={onPick} />
              </View>
            ))}

            {/* Exercises with no muscles set — every one created before the
                library had a hierarchy. Listed, not hidden: an exercise you
                cannot find is worse than one filed under nothing. */}
            {unfiled.length > 0 ? (
              <>
                <Kicker className="mx-lg mb-sm mt-lg">Unfiled · {unfiled.length}</Kicker>
                <ResultCard exercises={unfiled} onPick={onPick} />
              </>
            ) : null}

            {sections.length === 0 && unfiled.length === 0 ? (
              <Text className="mx-lg mt-lg text-body text-ink-muted">
                Nothing in {cluster ? clusterLabel(cluster).toLowerCase() : 'the library'} yet.
              </Text>
            ) : null}
          </>
        )}

        {/* Creating from the query names the exercise from what you typed. With
            no query there is nothing to name it after, so the same door is a
            plain `New exercise` row — browsing must not be a dead end. */}
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
        ) : (
          <View className="mx-lg mt-xl overflow-hidden rounded-surface border border-hairline bg-surface-alt">
            <AddRow label="New exercise" onPress={() => onCreate('')} />
          </View>
        )}

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

/** One card of result rows — the same card whether it's a section or a search. */
function ResultCard({
  exercises,
  onPick,
}: {
  exercises: Exercise[];
  onPick: (exerciseId: ID) => void;
}) {
  return (
    <ListCard className="mx-lg">
      {exercises.map((exercise, index) => (
        <View key={exercise.id}>
          {index > 0 ? <Separator /> : null}
          <ResultRow exercise={exercise} onPress={() => onPick(exercise.id)} />
        </View>
      ))}
    </ListCard>
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
