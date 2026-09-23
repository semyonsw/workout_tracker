/**
 * HomeScreen — what do I train today.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WORKOUT                        ≡   📖    ⟲   │  ← glass bar, content under
 *   │ ( SEQUENCE  3/4 · then Push              › ) │  ← folded; › opens it
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ TODAY · PULL                  ( 1 nudge )│ │  ← the hero, `lit` glass
 *   │ │ Pull + swimming                          │ │
 *   │ │ back, biceps · 8 exercises · 25 sets     │ │
 *   │ │ ────────────────────────                 │ │
 *   │ │ EXERCISES   SETS        WORKOUT          │ │
 *   │ │ 8           25          #92              │ │
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ OTHER ROUTINES                               │
 *   │ ╭ Push            Push · chest · 2 ex   ▶ ╮  │
 *   │ ╭ Boxing (cardio) Cardio · 2 ex          ▶ ╮  │
 *   │ RECENT                                       │
 *   │ │ #91  Pull + swimming     8 Aug · 74 min │  │
 *   │                            ╭ ▶ Open Pull ╮   │  ← the floating slot
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
 * hero naming the routine whose turn it is. It still only suggests.
 *
 * `Open`, not `Start`: opening a routine shows its exercises without timing or
 * dating anything. The workout starts on the `Start` inside it — see
 * `ActiveWorkoutScreen`.
 *
 * ── THE BUTTON LEFT THE CARD ──────────────────────────────────────────────
 *
 * `Open Pull + swimming` was a 56-high green slab inside the hero. Two things
 * were wrong with it and both are placement rules now: a full-width bar inside
 * the scroll flow competes with the container it is in, and it SCROLLS AWAY —
 * the one action the screen exists for stops existing the moment you look at the
 * routine list under it. It is the floating pill at `right: 16, bottom: 92` now,
 * the same slot the other three sections put their own commit action in, and it
 * is on screen at every scroll position.
 *
 * "1 nudge waiting" is the only forward-looking number on the screen, and it is
 * a count of facts, not a nag: it tells you a weight has gone stale before you
 * are standing under the bar deciding what to load.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { SectionTopBar } from '../components/SectionTopBar';
import { BubblePressable } from '../components/bubbles';
import {
  FloatingAction,
  GlassSurface,
  Lamps,
  SpecularEdge,
  useBarInsets,
} from '../components/glass';
import { pressedStyle, Reveal } from '../components/motion';
import { Kicker } from '../components/primitives';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { formatShortDate, formatVolumeKg } from '../lib/units';
import { focalType, palette, radius } from '../theme/tokens';
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
   * The workout already running, if any. It gets the top of the screen and the
   * floating slot, because while one exists every routine row leads back to IT
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
  /** Tapping a step in the opened sequence goes to the screen that edits it. */
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
   * are the other two: see `components/SectionTopBar.tsx`.
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
  const bars = useBarInsets();
  const next = sequence?.next ?? null;
  /*
   * An empty routine has nothing to open — a ▶ that lands on an editor is a
   * button that lies. Empty ones live in the `Routines` tab, which is where they
   * get filled in. The hero routine already has the floating slot.
   */
  const others = choices.filter(
    (choice) => choice.routineId !== next?.routineId && choice.exerciseCount > 0,
  );

  /*
   * What the workout about to be logged will be numbered. Derived here rather
   * than passed, because `numbers` is already on this screen for the RECENT
   * rows and the next ordinal is one `max` away from it — a second prop carrying
   * the same fact is a second thing that can disagree with the history screen.
   */
  const ordinals = Object.values(numbers);
  const nextNumber = ordinals.length > 0 ? Math.max(...ordinals) + 1 : 1;

  /*
   * THE FLOATING SLOT IS NEVER EMPTY, and what fills it is the one thing this
   * screen is for. A live session outranks everything — it is the workout you
   * are actually in — then the routine whose turn it is, then simply the first
   * one that has exercises in it. Only a phone with no usable routine at all
   * leaves the slot empty, and that screen says so in words instead.
   */
  const openable = next ?? others[0] ?? null;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Workout" />

      {/* Three destinations, one size, left to right: the routines, the library,
          the past. See `components/SectionTopBar.tsx` on why they are up here
          and why a commit action never is. */}
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
        contentContainerStyle={{ paddingTop: bars.top, paddingBottom: bars.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {inProgress ? (
          <GlassSurface
            tier="lit"
            radius={radius.hero}
            shadow="e2"
            glow="hero"
            flat
            className="mx-lg mt-lg"
          >
            <View className="p-[20px]">
              <Kicker tone="green">{t('In progress')}</Kicker>
              <Text className="mt-sm text-title font-medium text-ink">{inProgress.title}</Text>
              <Text className="mt-xs text-label tabular-nums text-ink-muted">
                {t('{done} of {total} sets · {minutes} min', {
                  done: inProgress.done,
                  total: inProgress.total,
                  minutes: inProgress.minutes,
                })}
              </Text>
            </View>
          </GlassSurface>
        ) : null}

        {sequence ? <SequenceStrip sequence={sequence} onPress={onOpenSequence} /> : null}

        {next ? <Hero plan={next} number={nextNumber} plural={plural} /> : null}

        {others.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">
              {next ? t('Other routines') : t('Start a workout')}
            </Kicker>
            <View className="mx-lg">
              {others.map((choice) => (
                <ChoiceRow
                  key={choice.routineId}
                  choice={choice}
                  onPress={() => onOpen(choice.routineId)}
                />
              ))}
            </View>
          </>
        ) : null}

        {others.length === 0 && !next ? <Empty /> : null}

        {recent.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-md mt-xxl">{t('Recent')}</Kicker>
            {/* One `well` holding all of them, and the only surface on this
                screen that is a container rather than a card: the past is
                context, and eight lit panes of it would out-shout the hero. */}
            <GlassSurface tier="well" radius={radius.row} flat className="mx-lg">
              {recent.map((session, index) => (
                <RecentRow
                  key={session.id}
                  session={session}
                  number={numbers[session.id]}
                  divided={index > 0}
                  onPress={() => onOpenSession(session.id)}
                />
              ))}
            </GlassSurface>
          </>
        ) : null}
      </ScrollView>

      {/* THE ONE COMMIT ACTION, in the slot every section shares. */}
      {inProgress ? (
        <FloatingAction label={t('Back to the workout')} icon="play" onPress={onResume} />
      ) : openable ? (
        <FloatingAction
          label={t('Open {name}', { name: openable.name })}
          icon="play"
          onPress={() => onOpen(openable.routineId)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The routine whose turn it is, as the one hero on the screen.
 *
 * `lit` glass over the section's brightest lamp, which is what the depth stack
 * is for: the card does not carry its own highlight, it is a translucent pane
 * with the light already behind it. The name is the only thing on this screen at
 * `hero-name` — one hero per screen is the rule the focal steps exist to keep.
 *
 * The three stats are a fact each, in a row, and none of them is new data: the
 * exercise and set counts came with the plan, and the ordinal is one `max` off
 * the numbers the RECENT rows below are already drawn from. The third is green
 * because it is the only one of the three about the workout you are ABOUT to do
 * rather than about the routine as written.
 */
function Hero({
  plan,
  number,
  plural,
}: {
  plan: NextUpPlan;
  number: number;
  plural: ReturnType<typeof usePlural>;
}) {
  const t = useT();
  return (
    <GlassSurface
      tier="lit"
      radius={radius.hero}
      shadow="e2"
      glow="hero"
      className="mx-lg mt-[22px]"
    >
      <View className="p-[20px]">
        <View className="flex-row items-center">
          <Kicker tone="green" className="flex-1">
            {plan.focus ? `${t('Today')} · ${plan.focus}` : t('Today')}
          </Kicker>
          {plan.nudgeCount > 0 ? (
            <View
              style={{
                height: 24,
                paddingHorizontal: 10,
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: 'rgba(63,169,108,0.20)',
                borderWidth: 1,
                borderColor: 'rgba(63,169,108,0.34)',
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ fontSize: 10, letterSpacing: 0.9 }}
                className="font-semibold uppercase tabular-nums text-green-bright"
              >
                {`${plan.nudgeCount} ${plural(plan.nudgeCount, {
                  one: t('nudge'),
                  few: 'подсказки',
                  many: t('nudges'),
                })}`}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={2}
          allowFontScaling={false}
          style={focalType.heroName}
          className="mt-sm font-semibold text-ink"
        >
          {plan.name}
        </Text>

        <Text className="mt-xs text-label text-ink-muted">
          {t('{exercises} exercises · {sets} sets', {
            exercises: plan.exerciseCount,
            sets: plan.setCount,
          })}
        </Text>

        {/* The divider fades out rather than crossing the card: a full-width
            rule inside a pane reads as a seam between two panes. */}
        <View
          className="mt-lg h-hairline"
          style={{ backgroundColor: 'rgba(236,241,238,0.12)', width: '62%' }}
        />

        <View className="mt-lg flex-row">
          <HeroStat label={t('Exercises')} value={String(plan.exerciseCount)} />
          <HeroStat label={t('Sets')} value={String(plan.setCount)} />
          <HeroStat label={t('Workout')} value={`#${number}`} tone="green" />
        </View>
      </View>
    </GlassSurface>
  );
}

function HeroStat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'green';
}) {
  return (
    <View className="mr-[22px]">
      <Text
        allowFontScaling={false}
        style={{ fontSize: 10, letterSpacing: 1.1 }}
        className="font-semibold uppercase text-ink-faint"
      >
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        style={{ fontSize: 20, lineHeight: 22 }}
        className={[
          'mt-[2px] font-semibold tabular-nums',
          tone === 'green' ? 'text-green-bright' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The sequence, FOLDED by default to one line: `SEQUENCE · 11/12 · then Push ⌄`.
 *
 * It used to be the full wrapping line of chips, always — and a real sequence is
 * not four steps, it is twelve, with long names. That was twelve rows of chips
 * between the top bar and the hero, pushing the one card this screen exists for
 * below the fold. The folded line keeps what is worth a glance on every visit —
 * where in the order you are, and what comes AFTER today (today itself is the
 * hero right under it, so naming it here too would be saying it twice). The
 * chevron opens the full order; it closes again the same way.
 *
 * Open state is local and starts closed each time the screen mounts. The whole
 * order is a thing you look at occasionally, not every time, and a preference
 * persisted for one disclosure is more machinery than the question deserves.
 *
 * Open, it is the same wrapping line of chips as before, step whose turn it is on
 * a lit pane. WRAPPING and not a horizontal `ScrollView`, which it once was: the
 * section swipe (`components/SwipePager.tsx`) claims sideways drags on capture,
 * so a sequence wider than the screen could not be scrolled at all — flicking it
 * changed section. Tapping a chip opens the screen that edits the order — a chip
 * is a label, not a start button, and the thing you want after looking at your
 * order is usually to change it.
 */
function SequenceStrip({ sequence, onPress }: { sequence: SequenceView; onPress: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { steps } = sequence;
  const currentIndex = steps.findIndex((step) => step.isCurrent);
  // The cursor wraps (`advanceSequence`), so after the last step comes the first.
  const after =
    currentIndex >= 0 && steps.length > 1 ? steps[(currentIndex + 1) % steps.length] : null;
  const summary = [
    currentIndex >= 0 ? `${currentIndex + 1}/${steps.length}` : null,
    after ? t('then {name}', { name: after.name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="mt-lg">
      <BubblePressable
        onPress={() => setOpen((was) => !was)}
        radius="pill"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Sequence')}. ${summary}. ${open ? t('Hide the sequence') : t('Show the sequence')}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 40,
            marginHorizontal: 16,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(236,241,238,0.045)',
            backgroundColor: 'rgba(236,241,238,0.028)',
          },
        ]}
      >
        <Kicker>{t('Sequence')}</Kicker>
        <Text
          numberOfLines={1}
          className="ml-md flex-1 text-label tabular-nums text-ink-faint"
          allowFontScaling={false}
        >
          {summary}
        </Text>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={palette.inkFaint} />
      </BubblePressable>

      {open ? (
        <Reveal>
          <View className="mx-lg mt-md flex-row flex-wrap items-center" style={{ rowGap: 8 }}>
            {steps.map((step, index) => (
              <SequenceChip key={step.key} step={step} divided={index > 0} onPress={onPress} />
            ))}
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

function SequenceChip({
  step,
  divided,
  onPress,
}: {
  step: SequenceView['steps'][number];
  /** A `›` before it — every chip but the first. */
  divided: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={`${step.name}${step.isCurrent ? `, ${t('next up')}` : ''}. ${t('Edit the sequence.')}`}
      style={(state) => [pressedStyle(state), { flexDirection: 'row', alignItems: 'center' }]}
    >
      {divided ? (
        <Text className="mx-[3px] text-label text-ink-faint" allowFontScaling={false}>
          ›
        </Text>
      ) : null}
      <View
        style={{
          height: 34,
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: step.isCurrent ? 'rgba(63,169,108,0.30)' : 'rgba(236,241,238,0.045)',
          backgroundColor: step.isCurrent ? 'rgba(63,169,108,0.13)' : 'rgba(236,241,238,0.028)',
          ...(step.isCurrent
            ? {
                boxShadow: [
                  { offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.35)' },
                ],
              }
            : {}),
        }}
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
    </BubblePressable>
  );
}

/**
 * One openable routine, as its own `card` pane with 8 of air under it.
 *
 * The whole row opens it — no chevron, because a chevron promises a screen and
 * this promises a workout. The ▶ is the same green glyph the set rows use for
 * "this one now", in a 40 dp circle that gives it an edge of its own.
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
    <GlassSurface tier="card" radius={radius.row} shadow="e1" flat className="mb-sm">
      <BubblePressable
        onPress={onPress}
        radius={radius.row}
        accessibilityRole="button"
        accessibilityLabel={`${t('Open {name}', { name: choice.name })}. ${detail}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View className="flex-1 pr-md">
          <Text numberOfLines={1} className="text-body font-medium text-ink">
            {choice.name}
          </Text>
          <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
            {detail}
          </Text>
        </View>
        <View
          style={{
            height: 40,
            width: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(63,169,108,0.26)',
            backgroundColor: 'rgba(63,169,108,0.14)',
          }}
        >
          <SpecularEdge color="rgba(236,241,238,0.12)" radius={radius.pill} />
          <Icon name="play" size={14} color={palette.greenBright} />
        </View>
      </BubblePressable>
    </GlassSurface>
  );
}

function RecentRow({
  session,
  number,
  divided,
  onPress,
}: {
  session: RecentSessionSummary;
  /** Its ordinal, when the numbering gives it one. */
  number?: number;
  /** A hairline above it — every row but the first. */
  divided: boolean;
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
    <View>
      {divided ? <View className="ml-lg h-hairline bg-hairline" /> : null}
      <BubblePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[
          numbered ? `${t('Workout {number}', { number })},` : '',
          session.title,
          detail,
        ]
          .filter(Boolean)
          .join(' ')}
        style={(state) => [pressedStyle(state), { paddingVertical: 13, paddingHorizontal: 16 }]}
      >
        <Text numberOfLines={1} className="text-[15px] leading-[20px] text-ink">
          {numbered ? (
            <Text className="text-[12px] font-semibold tabular-nums text-green-bright">
              {`#${number}  `}
            </Text>
          ) : null}
          {session.title}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-[12px] tabular-nums text-ink-faint">
          {detail}
        </Text>
      </BubblePressable>
    </View>
  );
}

/** Nothing to open: every routine is empty, or there are none. */
function Empty() {
  const t = useT();
  return (
    <GlassSurface tier="card" radius={radius.card} shadow="e1" flat className="mx-lg mt-xxl">
      <View className="p-lg">
        <Kicker>{t('Nothing to open')}</Kicker>
        <Text className="mt-sm text-body text-ink-muted">
          {t(
            'Put some exercises in a routine — the list glyph in the corner of this screen — and it shows up here, ready to open.',
          )}
        </Text>
      </View>
    </GlassSurface>
  );
}
