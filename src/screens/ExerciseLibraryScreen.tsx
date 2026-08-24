/**
 * ExerciseLibraryScreen — the library as a hierarchy you open, not a list you
 * scroll.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  LIBRARY                                   │
 *   │ ╭ Search exercises                         ╮ │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ PUSH                            12    ⌄  │ │  ← cluster
 *   │ │   CHEST                          3    ⌄  │ │  ← muscle group
 *   │ │     Inclined dumbbell press          −   │ │  ← exercise, with delete
 *   │ │     Dips                             −   │ │
 *   │ │     Pec flies                        −   │ │
 *   │ │     + Add exercise to chest              │ │
 *   │ │   SHOULDERS                      4    ›  │ │
 *   │ │   TRICEPS                        5    ›  │ │
 *   │ │ PULL                            18    ›  │ │
 *   │ │ LEGS                             6    ›  │ │
 *   │ │ CORE                             4    ›  │ │
 *   │ │ CARDIO                           2    ›  │ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * TWO MODES, ONE RULE: BROWSING IS A TREE, SEARCHING IS FLAT.
 *
 * With no query the library is push / pull / legs, then the muscles inside, then
 * the movements — because the question being asked is "what have I got for chest
 * day", and the answer is a shape, not a list. Five collapsed rows show the whole
 * library at a glance and reach any exercise in two taps. The moment a query
 * exists the question changes to "where is the plank", which has one answer, and
 * a hierarchy between you and it is furniture. Same data, two questions, two
 * layouts.
 *
 * WHY EMPTY GROUPS ARE STILL DRAWN: every muscle group carries its own
 * `+ Add exercise`, and that row is the whole reason the tree exists rather than
 * a filter. Creating from inside `chest` files the new exercise under `chest`
 * without the user picking a muscle twice — so a group with nothing in it is a
 * destination, not dead space. A `chest` that disappears because you own no chest
 * exercises is a `chest` you cannot add one to.
 *
 * DELETE IS A `−` AND IT ASKS. The glyph is `plus` with its vertical stroke
 * removed, at the same weight, sitting where the `+` sits on the row above — the
 * two marks are opposites and nobody has to learn either. It never deletes on the
 * tap: the confirmation is the parent's, because deleting an exercise also edits
 * every routine holding it, and that is a sentence the parent can write and this
 * screen cannot.
 *
 * The micro line under each name is the exercise's SHAPE — which inputs it will
 * render when you log it. `KG · REPS · ADDED BODYWEIGHT` tells you you'll get a
 * weight cell and a reps cell, and that the weight is what's on the belt rather
 * than the whole load; `TIME · COUNTDOWN` tells you picking this gets you a clock
 * that runs to zero. That is the only thing worth saying about an exercise in a
 * list, and it is the thing people actually get wrong when they pick one. The
 * muscles are said by the group above it instead of being repeated on every row.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Icon } from '../components/Icon';
import { FieldWell, Kicker, ListCard, Separator } from '../components/primitives';
import { describeShape } from '../lib/exerciseShape';
import { buildMuscleTree, clusterLabel } from '../lib/muscles';
import { palette } from '../theme/tokens';
import type { Exercise, ID, MuscleGroup } from '../types/models';

/* Disclosure keys are strings so one Set can hold both levels of the tree. */
export const clusterKey = (cluster: string) => `cluster:${cluster}`;
export const muscleKey = (muscle: string) => `muscle:${muscle}`;
const UNFILED_KEY = 'cluster:unfiled';

interface ExerciseLibraryScreenProps {
  query: string;
  /** The whole live library. Browse mode builds its own tree from this. */
  exercises: Exercise[];
  /** `exercises` narrowed by `query` and ranked. Only used while searching. */
  matches: Exercise[];
  recentlyUsed: Exercise[];
  /** Which clusters and muscle groups are open. Held by the parent so it
   *  survives a trip to the create screen and back. */
  expanded: ReadonlySet<string>;
  onToggleExpanded: (key: string) => void;
  /** Absent when the library is a tab root rather than a pushed picker. */
  onBack?: () => void;
  /**
   * Header label. Defaults to `Library` as a tab root and `Add exercise` as a
   * picker; a caller with a more specific destination says so ("Add to workout"),
   * because what a tap will DO is the one thing a picker has to be clear about.
   */
  kicker?: string;
  onChangeQuery: (query: string) => void;
  onPick: (exerciseId: ID) => void;
  /** `muscle` pre-files the new exercise under the group it was created from. */
  onCreate: (name: string, muscle?: MuscleGroup) => void;
  onDelete: (exercise: Exercise) => void;
}

export function ExerciseLibraryScreen({
  query,
  exercises,
  matches,
  recentlyUsed,
  expanded,
  onToggleExpanded,
  onBack,
  kicker,
  onChangeQuery,
  onPick,
  onCreate,
  onDelete,
}: ExerciseLibraryScreenProps) {
  const trimmed = query.trim();
  const { clusters, unfiled } = useMemo(() => buildMuscleTree(exercises), [exercises]);

  return (
    <View className="flex-1 bg-bg">
      {/* No hairline under the header: the search field below is its own surface,
          and two rules 16 apart read as a mistake. */}
      <ScreenHeader
        kicker={kicker ?? (onBack ? 'Add exercise' : 'Library')}
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
            {matches.length > 0 ? (
              <ListCard className="mx-lg">
                {matches.map((exercise, index) => (
                  <View key={exercise.id}>
                    {index > 0 ? <Separator /> : null}
                    <ExerciseRow
                      exercise={exercise}
                      indent={0}
                      onPress={() => onPick(exercise.id)}
                      onDelete={() => onDelete(exercise)}
                    />
                  </View>
                ))}
              </ListCard>
            ) : null}

            {/* Creating from the query names the exercise from what you typed. The
                moment you learn the thing you want doesn't exist is the moment
                you're looking at the empty result, so the door is right here. */}
            <Pressable
              onPress={() => onCreate(trimmed)}
              accessibilityRole="button"
              accessibilityLabel={`Create ${trimmed}`}
              className="mx-lg mt-xl h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg"
            >
              <Icon name="plus" size={14} color={palette.greenBright} />
              <Text className="ml-md text-body font-medium text-ink">Create “{trimmed}”</Text>
            </Pressable>
          </>
        ) : (
          /* Browsing: the tree. */
          <ListCard className="mx-lg">
            {clusters.map((node, index) => {
              const open = expanded.has(clusterKey(node.cluster));
              return (
                <View key={node.cluster}>
                  {index > 0 ? <Separator inset={0} /> : null}

                  <DisclosureRow
                    label={clusterLabel(node.cluster)}
                    count={node.total}
                    open={open}
                    indent={0}
                    onPress={() => onToggleExpanded(clusterKey(node.cluster))}
                  />

                  {open
                    ? node.groups.map((group) => {
                        const groupOpen = expanded.has(muscleKey(group.muscle));
                        return (
                          <View key={group.muscle}>
                            <Separator inset={16} />
                            <DisclosureRow
                              label={group.muscle}
                              count={group.exercises.length}
                              open={groupOpen}
                              indent={1}
                              onPress={() => onToggleExpanded(muscleKey(group.muscle))}
                            />

                            {groupOpen ? (
                              <>
                                {group.exercises.map((exercise) => (
                                  <View key={exercise.id}>
                                    <Separator inset={40} />
                                    <ExerciseRow
                                      exercise={exercise}
                                      indent={2}
                                      onPress={() => onPick(exercise.id)}
                                      onDelete={() => onDelete(exercise)}
                                    />
                                  </View>
                                ))}

                                <Separator inset={40} />
                                <AddToGroupRow
                                  muscle={group.muscle}
                                  onPress={() => onCreate('', group.muscle)}
                                />
                              </>
                            ) : null}
                          </View>
                        );
                      })
                    : null}
                </View>
              );
            })}

            {/* Exercises with no muscles set — every one created before the
                library had a hierarchy. Listed, not hidden: an exercise you
                cannot find is worse than one filed under nothing. */}
            {unfiled.length > 0 ? (
              <View>
                <Separator inset={0} />
                <DisclosureRow
                  label="Unfiled"
                  count={unfiled.length}
                  open={expanded.has(UNFILED_KEY)}
                  indent={0}
                  onPress={() => onToggleExpanded(UNFILED_KEY)}
                />
                {expanded.has(UNFILED_KEY)
                  ? unfiled.map((exercise) => (
                      <View key={exercise.id}>
                        <Separator inset={16} />
                        <ExerciseRow
                          exercise={exercise}
                          indent={1}
                          onPress={() => onPick(exercise.id)}
                          onDelete={() => onDelete(exercise)}
                        />
                      </View>
                    ))
                  : null}
              </View>
            ) : null}
          </ListCard>
        )}

        {/* Browsing must not be a dead end for someone who doesn't yet know which
            muscle their new movement belongs to. The in-group rows are the fast
            path; this is the one that asks. */}
        {trimmed ? null : (
          <Pressable
            onPress={() => onCreate('')}
            accessibilityRole="button"
            accessibilityLabel="New exercise"
            className="mx-lg mt-lg h-row flex-row items-center justify-center rounded-surface border border-hairline bg-surface-alt"
          >
            <Icon name="plus" size={14} color={palette.greenBright} />
            <Text className="ml-sm text-label font-medium text-green-bright">New exercise</Text>
          </Pressable>
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

/* ------------------------------------------------------------------ */

/** Left padding per depth: cluster 16, muscle 32, exercise 48. */
const INDENT = ['pl-lg', 'pl-[32px]', 'pl-[48px]'] as const;

/**
 * A collapsible header row — one for clusters, one for muscle groups.
 *
 * Both levels use the same component and differ only in indent and type size, so
 * the tree reads as one control rather than two that resemble each other. The
 * chevron points DOWN when open and RIGHT when closed, which is the only
 * convention for this that nobody has to be taught.
 *
 * The count is on the row rather than inside the section, because it is the whole
 * value of the collapsed state: `TRICEPS 5` answers "have I got triceps work"
 * without opening anything.
 */
function DisclosureRow({
  label,
  count,
  open,
  indent,
  onPress,
}: {
  label: string;
  count: number;
  open: boolean;
  indent: 0 | 1;
  onPress: () => void;
}) {
  const isCluster = indent === 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'exercise' : 'exercises'}`}
      className={[
        'h-row flex-row items-center pr-lg',
        INDENT[indent],
        // The open cluster lifts onto surface-alt so the eye can find where the
        // section it is reading actually begins.
        open && isCluster ? 'bg-surface-alt' : '',
      ].join(' ')}
    >
      <Text
        numberOfLines={1}
        className={[
          'flex-1 uppercase',
          // Cluster at Label, muscle at Micro: one step of type size is enough to
          // read as a level, and the app has no third uppercase size to spend.
          isCluster
            ? 'text-label font-semibold text-ink'
            : 'text-micro font-semibold text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>

      <Text className="ml-md text-label font-medium tabular-nums text-ink-faint">{count}</Text>

      <View className="ml-md w-[16px] items-center">
        <Icon
          name={open ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={open ? palette.greenBright : palette.inkFaint}
        />
      </View>
    </Pressable>
  );
}

/**
 * One exercise: name, shape, and a `−` that asks before it deletes.
 *
 * The delete target is 44 wide and sits hard against the right edge, clear of the
 * row's own press area — picking an exercise and deleting one are one mis-tap
 * apart otherwise, and only one of them is reversible.
 */
function ExerciseRow({
  exercise,
  indent,
  onPress,
  onDelete,
}: {
  exercise: Exercise;
  indent: 0 | 1 | 2;
  onPress: () => void;
  onDelete: () => void;
}) {
  const shape = describeShape(exercise);
  return (
    <View className={['h-row-lg flex-row items-center pr-xs', INDENT[indent]].join(' ')}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}. ${shape}.`}
        className="flex-1 justify-center"
      >
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {exercise.name}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-[2px] text-micro font-semibold uppercase text-ink-faint"
        >
          {shape}
        </Text>
      </Pressable>

      <Pressable
        onPress={onDelete}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${exercise.name}`}
        className="h-hit w-hit items-center justify-center rounded-pill border border-hairline"
      >
        <Icon name="minus" size={16} color={palette.inkMuted} />
      </Pressable>
    </View>
  );
}

/**
 * `+ Add exercise to chest` — the footer of an open muscle group.
 *
 * Naming the group in the label is not redundancy: this row is what makes the
 * tree worth navigating instead of filtering, and the label is the promise that
 * the exercise will land HERE rather than wherever the create screen defaults to.
 */
function AddToGroupRow({ muscle, onPress }: { muscle: MuscleGroup; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add an exercise to ${muscle}`}
      className="h-row flex-row items-center pl-[48px] pr-lg"
    >
      <Icon name="plus" size={14} color={palette.greenBright} />
      <Text className="ml-sm text-label font-medium text-green-bright">
        Add exercise to {muscle}
      </Text>
    </Pressable>
  );
}
