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
 *   │ #91  Pull + swimming        8 Aug · 74 min   │
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
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { SectionTopBar } from '../components/SectionTopBar';
import { GlowPulse } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { Kicker, ListCard, PrimaryButton, Separator } from '../components/primitives';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { formatShortDate, formatVolumeKg } from '../lib/units';
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
  /**
   * Workout ordinals, keyed by session id — the same numbers History shows, so
   * "workout 92" means one thing everywhere. See `workoutNumbers`.
   */
  numbers: Record<ID, number>;
  onOpen: (routineId: ID) => void;
  /** Back to the logging screen of the workout in progress. */
  onResume: () => void;
  /** Tapping the sequence strip goes to the screen that edits it. */
  onOpenSequence: () => void;
  onOpenSession: (sessionId: string) => void;
  /** The ⟲ in the corner: the log, the graphs and the calendar. */
  onOpenHistory: () => void;
  /**
   * The two screens the training log is set up from.
   *
   * They had a tab of their own, then a lobby screen called `More`, then two rows
   * at the FOOT of this screen — and the foot was the right place only while the
   * corner held one glyph. It holds three now, at the same size, and these two
   * are the other two: see `components/SectionTopBar.tsx`. The counts they used
   * to state are gone with the rows, which is the one thing lost; a count of
   * routines is not a thing anybody needs before deciding to look at them, and
   * the screen that opens leads with it anyway.
   */
  onOpenRoutines: () => void;
  onOpenLibrary: () => void;
}

export function HomeScreen({
  inProgress,
  sequence,
  choices,
  recent,
  numbers,
  onOpen,
  onResume,
  onOpenSequence,
  onOpenSession,
  onOpenHistory,
  onOpenRoutines,
  onOpenLibrary,
}: HomeScreenProps) {
  const t = useT();
  const plural = usePlural();
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

      {/* Three destinations, one size, left to right: the routines, the library,
          the past. See `components/SectionTopBar.tsx` on why they are up here. */}
      <SectionTopBar
        title={t('Workout')}
        actions={[
          {
            key: 'routines',
            icon: 'routines',
            label: t('Open the routines'),
            onPress: onOpenRoutines,
          },
          {
            key: 'library',
            icon: 'library',
            label: t('Open the exercise library'),
            onPress: onOpenLibrary,
          },
        ]}
        onOpenHistory={onOpenHistory}
        historyLabel={t('Training history')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {inProgress ? (
          <View className="mx-lg mb-xl rounded-surface border border-green-dim bg-green-wash p-lg">
            <Kicker tone="green">{t('In progress')}</Kicker>
            <Text className="mt-sm text-title font-medium text-ink">{inProgress.title}</Text>
            <Text className="mt-xs text-label tabular-nums text-ink-muted">
              {t('{done} of {total} sets · {minutes} min', {
                done: inProgress.done,
                total: inProgress.total,
                minutes: inProgress.minutes,
              })}
            </Text>
            <View className="mt-lg">
              <PrimaryButton label={t('Back to the workout')} onPress={onResume} />
            </View>
          </View>
        ) : null}

        {sequence ? <SequenceStrip sequence={sequence} onPress={onOpenSequence} /> : null}

        {next ? (
          /* THE ONE THING ON THIS SCREEN THAT MOVES.
             It is the workout the app is suggesting, in a column of cards that
             are the same green, and a slow halo is what makes it findable
             without being read. `GlowPulse` has the argument, and the reason it
             adds no information the card was not already carrying. */
          <GlowPulse className="mx-lg mt-xl" radius={14}>
            <View className="rounded-surface border border-hairline bg-green-wash p-lg">
              {/* `TODAY`, and the tinted surface, because this card is now one of
                  three things the tab bar offers and it has to say which day it is
                  talking about. The queue is still a queue — the list under it is
                  the rest of the offer — but `NEXT UP` described the sequence,
                  and the sequence is a detail of how this routine got chosen. */}
              <Kicker>{t('Today')}</Kicker>
              <Text className="mt-sm text-title font-semibold text-ink">{next.name}</Text>
              {next.focus ? (
                <Text className="mt-xs text-label text-ink-muted">{next.focus}</Text>
              ) : null}
              <Text className="mt-xs text-label tabular-nums text-green-bright">
                {t('{exercises} exercises · {sets} sets', {
                  exercises: next.exerciseCount,
                  sets: next.setCount,
                })}
                {next.nudgeCount > 0
                  ? ` · ${next.nudgeCount} ${plural(next.nudgeCount, {
                      one: t('nudge waiting'),
                      few: 'подсказки ждут',
                      many: t('nudges waiting'),
                    })}`
                  : ''}
              </Text>
              <View className="mt-lg">
                <PrimaryButton
                  label={t('Open {name}', { name: next.name })}
                  onPress={() => onOpen(next.routineId)}
                />
              </View>
            </View>
          </GlowPulse>
        ) : null}

        {others.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">
              {next ? t('Other routines') : t('Start a workout')}
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
            <Kicker className="mx-lg mb-md mt-xxl">{t('Recent')}</Kicker>
            <ListCard className="mx-lg">
              {recent.map((session, index) => (
                <View key={session.id}>
                  {index > 0 ? <Separator /> : null}
                  <RecentRow
                    session={session}
                    number={numbers[session.id]}
                    onPress={() => onOpenSession(session.id)}
                  />
                </View>
              ))}
            </ListCard>
          </>
        ) : null}

        {/* The two `Set up` rows that used to sit here are the two glyphs in the
            corner now — same destinations, one tap instead of a scroll. */}
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
  const t = useT();
  return (
    <View>
      <Kicker className="mx-lg">{t('Sequence')}</Kicker>
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
            accessibilityLabel={`${step.name}${step.isCurrent ? `, ${t('next up')}` : ''}. ${t('Edit the sequence.')}`}
            style={pressedStyle}
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
  const t = useT();
  const detail = [
    choice.focus,
    t('{exercises} exercises · {sets} sets', {
      exercises: choice.exerciseCount,
      sets: choice.setCount,
    }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('Open {name}', { name: choice.name })}. ${detail}`}
      style={pressedStyle}
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
  number,
  onPress,
}: {
  session: RecentSessionSummary;
  /** Its ordinal, when the numbering gives it one. */
  number?: number;
  onPress: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const numbered = number != null && number >= 1;
  /*
   * Two lines rather than one, and the ordinal moved INLINE with the title.
   *
   * The single line ran out of room once the set count and the volume joined it
   * — and those two are the reason to look at a past session at all, since the
   * date and the duration only say that it happened. The `#91` keeps its green
   * and its tabular weight, but it is now a prefix on the title rather than a
   * column, because there is no second column left to align it against.
   */
  const detail = [
    formatShortDate(session.performedAt, lang),
    t('{minutes} min', { minutes: session.durationMinutes }),
    t('{count} sets', { count: session.setCount }),
    // A volume built from sets that carried no weight is a floor, not a total,
    // so it is left off rather than stated wrongly.
    session.totalVolumeKg > 0 && !session.volumeIsPartial
      ? formatVolumeKg(session.totalVolumeKg, lang)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        numbered ? `${t('Workout {number}', { number })},` : '',
        session.title,
        detail,
      ]
        .filter(Boolean)
        .join(' ')}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1">
        <Text numberOfLines={1} className="text-body text-ink">
          {numbered ? (
            <Text className="text-label font-semibold tabular-nums text-green-bright">
              {`#${number}  `}
            </Text>
          ) : null}
          {session.title}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

/** Nothing to open: every routine is empty, or there are none. */
function Empty() {
  const t = useT();
  return (
    <View className="mx-lg mt-xxl rounded-surface border border-hairline bg-surface p-lg">
      <Kicker>{t('Nothing to open')}</Kicker>
      <Text className="mt-sm text-body text-ink-muted">
        {t(
          'Put some exercises in a routine — the list glyph in the corner of this screen — and it shows up here, ready to open.',
        )}
      </Text>
    </View>
  );
}
