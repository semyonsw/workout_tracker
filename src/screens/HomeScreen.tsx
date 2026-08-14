/**
 * HomeScreen — where am I in my split, and what do I do now.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ PUSH / PULL / BOXING · ROLLING               │
 *   │   ●────●────◉────○────○                      │
 *   │  Push  Boxing Pull Push Rest                 │
 *   │             TODAY                            │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ TODAY                                    │ │
 *   │ │ Pull + swimming                          │ │
 *   │ │ 6 exercises · 18 sets · 1 nudge waiting  │ │
 *   │ │ ╭──── Start Pull + swimming ───────────╮ │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ RECENT                                       │
 *   │ Pull + swimming              8 Aug · 74 min  │
 *   └──────────────────────────────────────────────┘
 *
 * One decision per screen: the Today card names the session and gives it a
 * 56-high button. Everything else — the strip above, the list below — is
 * context for that one decision, which is why nothing else here is green.
 *
 * "1 nudge waiting" is the only forward-looking number on the screen, and it is
 * a count of facts, not a nag: it tells you a weight has gone stale before you
 * are standing under the bar deciding what to load.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { SplitTimeline } from '../components/SplitTimeline';
import { Kicker, ListCard, PrimaryButton, Separator } from '../components/primitives';
import { formatShortDate } from '../lib/units';
import type { RecentSessionSummary, SplitDay, WorkoutSplit } from '../types/models';

export interface TodayPlan {
  routineId: string;
  name: string;
  /**
   * "Pull · back, biceps" — which movement family today is, derived from the
   * exercises rather than from the routine's name. Null when nothing is filed.
   */
  focus: string | null;
  exerciseCount: number;
  setCount: number;
  /** Exercises with a stale weight the overload engine wants to report. */
  nudgeCount: number;
}

interface HomeScreenProps {
  split: WorkoutSplit;
  today: TodayPlan | null;
  recent: RecentSessionSummary[];
  onStart: (routineId: string) => void;
  onSelectDay: (day: SplitDay) => void;
  onOpenSession: (sessionId: string) => void;
}

export function HomeScreen({
  split,
  today,
  recent,
  onStart,
  onSelectDay,
  onOpenSession,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <SplitTimeline split={split} onSelectDay={onSelectDay} />

        {today ? (
          <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
            {/* The kicker names the day rather than repeating the word "today"
                twice: `TODAY · PULL · BACK, BICEPS`. */}
            <Kicker>Today{today.focus ? ` · ${today.focus}` : ''}</Kicker>
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
          /* A rest day is a real answer, not an empty state. */
          <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
            <Kicker>Today</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">Rest</Text>
            <Text className="mt-xs text-label text-ink-muted">
              Nothing scheduled. The split advances when you train, not when the week does.
            </Text>
          </View>
        )}

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
