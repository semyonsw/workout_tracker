/**
 * HomeScreen — what do I train today.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ┌ IN PROGRESS ───────────────────────────────┐│  ← only mid-workout
 *   │ │ Pull + swimming · 11 of 18 sets · 42 min  ││
 *   │ │ ╭──── Back to the workout ──────────────╮ ││
 *   │ └────────────────────────────────────────────┘│
 *   │ SEQUENCE                                     │  ← only when one is on
 *   │  Push  ›  ‹Pull›  ›  Push  ›  Boxing          │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ NEXT UP · PULL · BACK, BICEPS            │ │
 *   │ │ Pull + swimming                          │ │
 *   │ │ 6 exercises · 18 sets · 1 nudge waiting  │ │
 *   │ │ ╭──── Open Pull + swimming ────────────╮ │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ OR START ANOTHER                             │
 *   │ Push              Push · chest · 2 ex   ▶    │
 *   │ Boxing (cardio)   Cardio · 2 ex         ▶    │
 *   │ RECENT                                       │
 *   │ Pull + swimming              8 Aug · 74 min  │
 *   └──────────────────────────────────────────────┘
 *
 * THE USER PICKS THE WORKOUT. Every routine is on this screen and every one of
 * them is one tap from opening, because "the queue says pull but the pull-up bar
 * is taken" is a normal Tuesday. A tracker that can only start the workout it
 * planned for you is a tracker you stop using the first time you do something
 * else.
 *
 * The sequence — push → pull → push, in whatever order you actually train — is
 * OPTIONAL and off until it is built (see `TrainingSequence`). While it is off,
 * nothing about it appears here: the screen is the routine list and the recent
 * log, and no routine is privileged. While it is on it adds exactly one thing: a
 * `NEXT UP` card naming the routine whose turn it is. It still only suggests.
 *
 * `Open`, not `Start`: opening a routine shows its exercises without timing or
 * dating anything. The workout starts on the `Start` inside it — see
 * `ActiveWorkoutScreen`.
 *
 * "1 nudge waiting" is the only forward-looking number on the screen, and it is
 * a count of facts, not a nag: it tells you a weight has gone stale before you
 * are standing under the bar deciding what to load.
 */

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { Kicker, ListCard, PrimaryButton, Separator } from '../components/primitives';
import { formatShortDate } from '../lib/units';
import { palette } from '../theme/tokens';
import type { ID, RecentSessionSummary } from '../types/models';

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

export interface NextUpPlan extends RoutineChoice {
  /** Exercises with a stale weight the overload engine wants to report. */
  nudgeCount: number;
}

/** The sequence as this screen needs it. Absent whenever it is off or empty. */
export interface SequenceView {
  /** Every step in order, the current one marked. Repeats are normal. */
  steps: { key: string; name: string; isCurrent: boolean }[];
  /** The routine whose turn it is, or null if that step no longer resolves. */
  next: NextUpPlan | null;
}

/** A workout that has been started and not finished, if there is one. */
export interface WorkoutInProgress {
  title: string;
  done: number;
  total: number;
  minutes: number;
}

interface HomeScreenProps {
  /**
   * The workout already running, if any. It gets the top of the screen and its
   * own button, because while one exists every routine row leads back to IT
   * rather than to the routine that was tapped — a live session is never
   * clobbered, and the user has to be able to see why.
   */
  inProgress: WorkoutInProgress | null;
  sequence: SequenceView | null;
  /** Every routine, in list order. */
  choices: RoutineChoice[];
  recent: RecentSessionSummary[];
  onOpen: (routineId: ID) => void;
  /** Back to the logging screen of the workout in progress. */
  onResume: () => void;
  /** Tapping the sequence strip goes to the screen that edits it. */
  onOpenSequence: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function HomeScreen({
  inProgress,
  sequence,
  choices,
  recent,
  onOpen,
  onResume,
  onOpenSequence,
  onOpenSession,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const next = sequence?.next ?? null;
  /*
   * An empty routine has nothing to open — a ▶ that lands on an editor is a
   * button that lies. Empty ones live in the `Routines` tab, which is where they
   * get filled in. The `NEXT UP` routine already has a button of its own.
   */
  const others = choices.filter(
    (choice) => choice.routineId !== next?.routineId && choice.exerciseCount > 0,
  );

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {inProgress ? (
          <View className="mx-lg mb-xl rounded-surface border border-green-dim bg-green-wash p-lg">
            <Kicker tone="green">In progress</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">{inProgress.title}</Text>
            <Text className="mt-xs text-label tabular-nums text-ink-muted">
              {inProgress.done} of {inProgress.total} sets · {inProgress.minutes} min
            </Text>
            <View className="mt-lg">
              <PrimaryButton label="Back to the workout" onPress={onResume} />
            </View>
          </View>
        ) : null}

        {sequence ? <SequenceStrip sequence={sequence} onPress={onOpenSequence} /> : null}

        {next ? (
          <View className="mx-lg mt-xl rounded-surface border border-hairline bg-surface p-lg">
            {/* `NEXT UP`, not `TODAY`: the sequence is a queue offering the next
                thing, and the list below is the rest of the offer. */}
            <Kicker>Next up{next.focus ? ` · ${next.focus}` : ''}</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">{next.name}</Text>
            <Text className="mt-xs text-label tabular-nums text-ink-muted">
              {next.exerciseCount} exercises · {next.setCount} sets
              {next.nudgeCount > 0
                ? ` · ${next.nudgeCount} ${next.nudgeCount === 1 ? 'nudge' : 'nudges'} waiting`
                : ''}
            </Text>
            <View className="mt-lg">
              <PrimaryButton label={`Open ${next.name}`} onPress={() => onOpen(next.routineId)} />
            </View>
          </View>
        ) : null}

        {others.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">
              {next ? 'Or start another' : 'Start a workout'}
            </Kicker>
            <ListCard className="mx-lg">
              {others.map((choice, index) => (
                <View key={choice.routineId}>
                  {index > 0 ? <Separator /> : null}
                  <ChoiceRow choice={choice} onPress={() => onOpen(choice.routineId)} />
                </View>
              ))}
            </ListCard>
          </>
        ) : null}

        {others.length === 0 && !next ? <Empty /> : null}

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

/* ------------------------------------------------------------------ */

/**
 * The sequence, as one scrollable line: `Push › Pull › Push › Boxing`, with the
 * step whose turn it is on a green hairline.
 *
 * A line rather than a calendar grid, because a sequence is an ORDER and not a
 * week: it advances when you train, not when Tuesday arrives. Tapping anywhere on
 * it opens the screen that edits it — a chip is a label, not a start button, and
 * the thing you want after looking at your order is usually to change it.
 */
function SequenceStrip({ sequence, onPress }: { sequence: SequenceView; onPress: () => void }) {
  return (
    <View>
      <Kicker className="mx-lg">Sequence</Kicker>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        className="mt-md"
      >
        {sequence.steps.map((step, index) => (
          <Pressable
            key={step.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${step.name}${step.isCurrent ? ', next up' : ''}. Edit the sequence.`}
            className="flex-row items-center"
          >
            {index > 0 ? (
              <Text className="mx-xs text-label text-ink-faint" allowFontScaling={false}>
                ›
              </Text>
            ) : null}
            <View
              className={[
                'h-[32px] justify-center rounded-pill px-md',
                step.isCurrent ? 'border border-green-bright bg-surface-alt' : 'bg-surface',
              ].join(' ')}
            >
              <Text
                numberOfLines={1}
                className={[
                  'text-label',
                  step.isCurrent ? 'font-semibold text-green-bright' : 'text-ink-muted',
                ].join(' ')}
              >
                {step.name}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One openable routine.
 *
 * The whole row opens it — no chevron, because a chevron promises a screen and
 * this promises a workout. The ▶ is the same green glyph the set rows use for
 * "this one now".
 */
function ChoiceRow({ choice, onPress }: { choice: RoutineChoice; onPress: () => void }) {
  const detail = [choice.focus, `${choice.exerciseCount} exercises · ${choice.setCount} sets`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${choice.name}. ${detail}`}
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

function RecentRow({ session, onPress }: { session: RecentSessionSummary; onPress: () => void }) {
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

/** Nothing to open: every routine is empty, or there are none. */
function Empty() {
  return (
    <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
      <Kicker>Nothing to open</Kicker>
      <Text className="mt-sm text-body text-ink-muted">
        Put some exercises in a routine — Routines, in the tab bar — and it shows up here, ready to
        open.
      </Text>
    </View>
  );
}
