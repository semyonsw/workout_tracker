/**
 * HomeScreen — where am I in my split, and what do I do now.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ PUSH / PULL / BOXING · ROLLING               │
 *   │   ●────●────◉────○────○                      │
 *   │  Push  Boxing Pull Push Rest                 │
 *   │             TODAY                            │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ SUGGESTED · PULL · BACK, BICEPS          │ │
 *   │ │ Pull + swimming                          │ │
 *   │ │ 6 exercises · 18 sets · 1 nudge waiting  │ │
 *   │ │ ╭──── Start Pull + swimming ───────────╮ │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ OR START ANOTHER                             │
 *   │ Push              Push · chest · 2 ex   ▶    │
 *   │ Boxing (cardio)   Cardio · 2 ex         ▶    │
 *   │ RECENT                                       │
 *   │ Pull + swimming              8 Aug · 74 min  │
 *   └──────────────────────────────────────────────┘
 *
 * One decision per screen, and the split SUGGESTS it rather than dictating it.
 * The card gets the 56-high green button because it is the answer most days; the
 * list under it is every other routine, one tap from starting, because "the queue
 * says pull but the pull-up bar is taken" is a normal Tuesday. A tracker that can
 * only start the workout it planned for you is a tracker you stop using the first
 * time you do something else.
 *
 * That is also why a REST day is not a dead end: the picker is there, so a day the
 * split calls empty is still a day you can train.
 *
 * "1 nudge waiting" is the only forward-looking number on the screen, and it is
 * a count of facts, not a nag: it tells you a weight has gone stale before you
 * are standing under the bar deciding what to load.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { SplitTimeline } from '../components/SplitTimeline';
import { Kicker, ListCard, PrimaryButton, Separator } from '../components/primitives';
import { formatShortDate } from '../lib/units';
import { palette } from '../theme/tokens';
import type { ID, RecentSessionSummary, SplitDay, WorkoutSplit } from '../types/models';

/** One routine, described well enough to choose it without opening it. */
export interface RoutineChoice {
  routineId: ID;
  name: string;
  /**
   * "Pull · back, biceps" — which movement family it is, derived from the
   * exercises rather than from the routine's name. Null when nothing is filed.
   */
  focus: string | null;
  exerciseCount: number;
  setCount: number;
}

export interface TodayPlan extends RoutineChoice {
  /** Exercises with a stale weight the overload engine wants to report. */
  nudgeCount: number;
}

interface HomeScreenProps {
  split: WorkoutSplit;
  /** What the split suggests, or null on a rest day. */
  today: TodayPlan | null;
  /** Everything else that can be started, in list order. */
  choices: RoutineChoice[];
  /** Split days whose routine was deleted — forwarded to the timeline. */
  emptyDayIds?: ReadonlySet<ID>;
  recent: RecentSessionSummary[];
  onStart: (routineId: ID) => void;
  onSelectDay: (day: SplitDay) => void;
  onOpenSession: (sessionId: string) => void;
}

export function HomeScreen({
  split,
  today,
  choices,
  emptyDayIds,
  recent,
  onStart,
  onSelectDay,
  onOpenSession,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  // The suggested routine already has a button of its own two inches above.
  const others = choices.filter((choice) => choice.routineId !== today?.routineId);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <SplitTimeline split={split} onSelectDay={onSelectDay} emptyDayIds={emptyDayIds} />

        {today ? (
          <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
            {/* `SUGGESTED`, not `TODAY`: the split is a queue offering the next
                thing, and the list below is the rest of the offer. */}
            <Kicker>Suggested{today.focus ? ` · ${today.focus}` : ''}</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">{today.name}</Text>
            <Text className="mt-xs text-label tabular-nums text-ink-muted">
              {today.exerciseCount} exercises · {today.setCount} sets
              {today.nudgeCount > 0
                ? ` · ${today.nudgeCount} ${today.nudgeCount === 1 ? 'nudge' : 'nudges'} waiting`
                : ''}
            </Text>
            <View className="mt-lg">
              <PrimaryButton
                label={`Start ${today.name}`}
                onPress={() => onStart(today.routineId)}
              />
            </View>
          </View>
        ) : (
          /* A rest day is a real answer, not an empty state — and not a locked
             door either: the picker below still works. */
          <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
            <Kicker>Today</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">Rest</Text>
            <Text className="mt-xs text-label text-ink-muted">
              Nothing scheduled. The split advances when you train, not when the week does — start
              anything below if you want to.
            </Text>
          </View>
        )}

        {others.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">
              {today ? 'Or start another' : 'Start a workout'}
            </Kicker>
            <ListCard className="mx-lg">
              {others.map((choice, index) => (
                <View key={choice.routineId}>
                  {index > 0 ? <Separator /> : null}
                  <ChoiceRow choice={choice} onPress={() => onStart(choice.routineId)} />
                </View>
              ))}
            </ListCard>
          </>
        ) : null}

        {recent.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">Recent</Kicker>
            <ListCard className="mx-lg">
              {recent.map((session, index) => (
                <View key={session.id}>
                  {index > 0 ? <Separator /> : null}
                  <RecentRow session={session} onPress={() => onOpenSession(session.id)} />
                </View>
              ))}
            </ListCard>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * One startable routine.
 *
 * The whole row starts it — no chevron, because a chevron promises a screen and
 * this promises a workout. The ▶ is the same green glyph the set rows use for "run
 * this now", which is exactly what it does here.
 */
function ChoiceRow({ choice, onPress }: { choice: RoutineChoice; onPress: () => void }) {
  const detail = [choice.focus, `${choice.exerciseCount} exercises · ${choice.setCount} sets`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start ${choice.name}. ${detail}`}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1 pr-md">
        <Text numberOfLines={1} className="text-body font-medium text-ink">
          {choice.name}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
          {detail}
        </Text>
      </View>
      <Icon name="play" size={15} color={palette.greenBright} />
    </Pressable>
  );
}

function RecentRow({
  session,
  onPress,
}: {
  session: RecentSessionSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${session.title}, ${formatShortDate(session.performedAt)}, ${session.durationMinutes} minutes`}
      className="h-row flex-row items-center px-lg"
    >
      <Text numberOfLines={1} className="flex-1 text-body font-medium text-ink">
        {session.title}
      </Text>
      <Text className="ml-md text-label tabular-nums text-ink-faint">
        {formatShortDate(session.performedAt)} · {session.durationMinutes} min
      </Text>
    </Pressable>
  );
}
