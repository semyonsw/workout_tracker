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
 *
 * ── THE MOTION PASS ───────────────────────────────────────────────────────
 *
 *   • A SKELETON, while the log has not been read (`workoutHistoryStore.ready`):
 *     a hero block, two rows and a well, each with a shimmer sweeping over it.
 *     An empty screen that fills itself in is a screen that looked, for a
 *     moment, like the app had forgotten your training.
 *   • THE HERO'S HALO BREATHES, 26 → 44 dp over six seconds, and it gained a
 *     fourth stat: `LAST · 6 Sep`, when this routine was last done. `#92` rolls
 *     when it changes.
 *   • The routine rows arrive one after another, 70 ms apart.
 *   • A workout in progress gets a ring — the share of its sets done — and its
 *     name runs rather than wrapping.
 *   • SAVING A WORKOUT comes back here, and the hero throws sparks while the new
 *     row grows into Recent.
 *   • THE BUBBLE. Scroll the hero away and it follows you as a capsule at the top:
 *     `#92`, the routine, its size, and a ▶ — or, mid-workout, the share done in a
 *     ring, the clock ticking and the sets counting as they are logged.
 *     `components/FloatingBubble.tsx` is the shell all three sections share.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '../components/Icon';
import { SectionTopBar } from '../components/SectionTopBar';
import { SparkBurst, SPARK_MS } from '../components/SparkBurst';
import { BubblePressable } from '../components/bubbles';
import { FloatingBubble, useHeroRecede } from '../components/FloatingBubble';
import {
  COMMIT_GRADIENT,
  FloatingAction,
  GlassSurface,
  Lamps,
  SpecularEdge,
  useBarInsets,
} from '../components/glass';
import { GrowIn, Reveal, Stagger, pressedStyle, usePressScale } from '../components/motion';
import { Kicker } from '../components/primitives';
import { Pressable } from '../components/Pressable';
import { RollingNumber, RollingPhrase } from '../components/RollingNumber';
import { FADE_ON, RunningText } from '../components/RunningText';
import { useBubbleOnScroll } from '../hooks/useBubbleOnScroll';
import { useMotionScale } from '../hooks/useMotionScale';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { formatElapsed, formatShortDate, formatVolumeKg } from '../lib/units';
import { isResting, useActiveWorkout } from '../state/activeWorkoutStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { curve, focalType, motion, palette, radius } from '../theme/tokens';
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
  /** When it was last trained, for the hero's `LAST` stat. Null if never. */
  lastTrainedAt: string | null;
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
  /** When it started — the in-progress card and the bubble tick from it. */
  startedAt: string;
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
  /**
   * The workout that was just saved, if this screen is what the save came back
   * to: the hero throws its sparks and the new row grows into Recent. Cleared
   * through `onCelebrated` once it has played.
   */
  justSaved?: { id: ID; at: number } | null;
  onCelebrated?: () => void;
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
  justSaved = null,
  onCelebrated,
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

  /* The log has been read — until then, the skeleton. See the file header. */
  const ready = useWorkoutHistory((s) => s.ready);

  /* The bubble, and the hero stepping back while it is up. */
  const { visible: bubbleUp, onScroll, scrollRef, scrollToTop } = useBubbleOnScroll();
  const heroRecede = useHeroRecede(bubbleUp);

  /*
   * THE CELEBRATION, once, on the mount a save came back to. The id is held for
   * the Recent row that grows in; the sparks run for as long as they take.
   */
  const [celebrating] = useState(() =>
    justSaved != null && Date.now() - justSaved.at < 4000 ? justSaved.id : null,
  );
  const [sparks, setSparks] = useState(celebrating != null);
  useEffect(() => {
    if (celebrating == null) return undefined;
    onCelebrated?.();
    const timer = setTimeout(() => setSparks(false), SPARK_MS);
    return () => clearTimeout(timer);
    // Mount only: this is about the save that brought the screen here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingTop: bars.top, paddingBottom: bars.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {!ready ? (
          <Skeleton />
        ) : (
          <>
            {inProgress ? (
              <Animated.View style={next ? undefined : heroRecede}>
                <InProgressCard progress={inProgress} onPress={onResume} />
              </Animated.View>
            ) : null}

            {sequence ? <SequenceStrip sequence={sequence} onPress={onOpenSequence} /> : null}

            {next ? (
              <Animated.View style={heroRecede}>
                <Hero plan={next} number={nextNumber} plural={plural} />
              </Animated.View>
            ) : null}

            {others.length > 0 ? (
              <>
                <Kicker className="mx-lg mb-md mt-xxl">
                  {next ? t('Other routines') : t('Start a workout')}
                </Kicker>
                <View className="mx-lg">
                  {others.map((choice, index) => (
                    <Stagger key={choice.routineId} delay={120 + index * 70}>
                      <ChoiceRow choice={choice} onPress={() => onOpen(choice.routineId)} />
                    </Stagger>
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
                    <GrowIn key={session.id} appear={session.id === celebrating} duration={500}>
                      <RecentRow
                        session={session}
                        number={numbers[session.id]}
                        divided={index > 0}
                        onPress={() => onOpenSession(session.id)}
                      />
                    </GrowIn>
                  ))}
                </GlassSurface>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* The workout just saved, celebrated from the hero's band. */}
      {sparks ? <SparkBurst y={bars.top + 110} /> : null}

      {/* THE BUBBLE — the hero, carried along once it has scrolled away. */}
      {ready && (inProgress || openable) ? (
        <WorkoutBubble
          visible={bubbleUp}
          inProgress={inProgress}
          plan={openable}
          number={nextNumber}
          onTop={scrollToTop}
          onPlay={inProgress ? onResume : () => openable && onOpen(openable.routineId)}
        />
      ) : null}

      {/* THE ONE COMMIT ACTION, in the slot every section shares. */}
      {inProgress ? (
        <FloatingAction
          label={t('Back to {name}', { name: inProgress.title })}
          icon="play"
          onPress={onResume}
        />
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
 * The shape of the screen, before the log has been read: a hero block, a label,
 * two rows, a label and a well, each with a light sweeping over it. Nothing in it
 * is a number that could be mistaken for data.
 */
function Skeleton() {
  const t = useT();
  return (
    <View accessible accessibilityLabel={t('Loading your training log')}>
      <Shimmer height={196} radius={radius.hero} marginTop={10} delay={0} />
      <View
        style={{ marginTop: 40, marginHorizontal: 16, marginBottom: 12, width: 110, height: 10 }}
        className="rounded-[6px] bg-ink/5"
      />
      <Shimmer height={68} radius={radius.row} delay={100} />
      <Shimmer height={68} radius={radius.row} marginTop={8} delay={100} />
      <View
        style={{ marginTop: 40, marginHorizontal: 16, marginBottom: 12, width: 70, height: 10 }}
        className="rounded-[6px] bg-ink/5"
      />
      <Shimmer height={180} radius={radius.row} delay={200} faint />
    </View>
  );
}

/**
 * One skeleton block, and the light across it: a gradient strip translated from
 * off the left edge to off the right over 1.3 s, looped, native-driven. Still,
 * with reduced motion on — the block is the information; the sweep is not.
 */
function Shimmer({
  height,
  radius: corner,
  marginTop = 0,
  delay,
  faint = false,
}: {
  height: number;
  radius: number;
  marginTop?: number;
  delay: number;
  faint?: boolean;
}) {
  const { width } = useWindowDimensions();
  const scale = useMotionScale();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return undefined;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const start = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [delay, scale, sweep]);

  const strip = 300;
  return (
    <View
      style={{
        marginTop,
        marginHorizontal: 16,
        height,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: faint ? 'rgba(236,241,238,0.025)' : 'rgba(236,241,238,0.035)',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: strip,
          transform: [
            {
              translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-strip, width] }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={[
            'rgba(236,241,238,0)',
            faint ? 'rgba(236,241,238,0.06)' : 'rgba(236,241,238,0.08)',
            'rgba(236,241,238,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The workout already running: where it is up to, and one tap back to it.
 *
 *   ╭──────────────────────────────────────╮
 *   │ IN PROGRESS · 12:04          ╭──╮    │
 *   │ Pull + swimming (tension o░  │42│    │  ← the ring: the share of sets done
 *   │ 3 of 17 sets · resting       ╰──╯    │
 *   ╰──────────────────────────────────────╯
 *
 * The whole card resumes the session — it was a statement with the way back in
 * the floating slot, and a card that says "in progress" and does nothing when
 * pressed is a card people press anyway.
 */
function InProgressCard({
  progress,
  onPress,
}: {
  progress: WorkoutInProgress;
  onPress: () => void;
}) {
  const t = useT();
  const press = usePressScale(0.98);
  const resting = useActiveWorkout((s) => isResting(s.rest));
  const fraction = progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <Animated.View
      style={{ marginHorizontal: 16, marginTop: 10, transform: press.style.transform }}
    >
      <GlassSurface tier="lit" radius={radius.hero} shadow="e2" flat>
        <Pressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`${t('In progress')}: ${progress.title}. ${t(
            '{done} of {total} sets',
            {
              done: progress.done,
              total: progress.total,
            },
          )}. ${t('Back to the workout')}`}
          className="flex-row items-center px-[20px] py-[18px]"
        >
          <View className="mr-[14px] flex-1" style={{ minWidth: 0 }}>
            <View className="flex-row items-center">
              <Kicker tone="green">{`${t('In progress')} · `}</Kicker>
              <TickingClock startedAt={progress.startedAt} className="text-green-bright" />
            </View>
            <RunningText
              text={progress.title}
              fadeColor={FADE_ON.lit}
              containerStyle={{ marginTop: 8 }}
              className="text-title font-medium text-ink"
            />
            <View className="mt-xs flex-row items-center">
              <RollingPhrase
                template={t('{done} of {total} sets', { total: progress.total })}
                values={{ done: progress.done }}
                lineHeight={18}
                className="text-label text-ink-muted"
              />
              {resting ? (
                <Text className="text-label text-ink-muted">{` · ${t('resting')}`}</Text>
              ) : null}
            </View>
          </View>
          <ProgressDial fraction={fraction} size={52} stroke={4}>
            <Text
              allowFontScaling={false}
              style={{ fontSize: 12 }}
              className="font-semibold tabular-nums text-green-bright"
            >
              {`${Math.round(fraction * 100)}%`}
            </Text>
          </ProgressDial>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

/** A clock counting up from `startedAt`, ticking once a second and only itself. */
function TickingClock({ startedAt, className }: { startedAt: string; className?: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text
      allowFontScaling={false}
      className={['text-micro font-semibold uppercase tabular-nums', className ?? ''].join(' ')}
    >
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A progress ring whose arc TRAVELS to its share (`motion.ring`), for the
 * in-progress card and the bubble's badge. JS-driven: `strokeDashoffset` is an
 * SVG prop, not a transform.
 */
function ProgressDial({
  fraction,
  size,
  stroke,
  track = palette.greenDim,
  children,
}: {
  fraction: number;
  size: number;
  stroke: number;
  /** Null for no track at all — the bubble's badge draws only the arc. */
  track?: string | null;
  children?: ReactNode;
}) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: clamped,
      duration: motion.ring * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, v]);
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        {track ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={track}
            strokeWidth={stroke}
          />
        ) : null}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
        />
      </Svg>
      {children}
    </View>
  );
}

/**
 * THE WORKOUT BUBBLE — the hero at a tenth of its size.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ( #92 )  UP NEXT · WORKOUT          ( ▶ ) │
 *   │          Pull + swimming (tensi░          │
 *   │          5 exercises · 17 sets            │
 *   ╰──────────────────────────────────────────╯
 *
 * Mid-workout the same capsule changes on the fly: the badge becomes the share
 * done with a ring filling around it, the kicker ticks the elapsed clock, the
 * line counts sets as they are logged, and ▶ goes back to the session. The badge
 * and the text scroll back up to the hero they stand in for.
 */
function WorkoutBubble({
  visible,
  inProgress,
  plan,
  number,
  onTop,
  onPlay,
}: {
  visible: boolean;
  inProgress: WorkoutInProgress | null;
  plan: RoutineChoice | null;
  number: number;
  onTop: () => void;
  onPlay: () => void;
}) {
  const t = useT();
  const fraction = inProgress && inProgress.total > 0 ? inProgress.done / inProgress.total : 0;
  const name = inProgress ? inProgress.title : (plan?.name ?? '');
  const spoken = inProgress
    ? `${t('In progress')}: ${name}, ${t('{done} of {total} sets', {
        done: inProgress.done,
        total: inProgress.total,
      })}. ${t('Back to the workout')}.`
    : `${t('Workout {number}', { number })}, ${name}, ${t('{exercises} exercises · {sets} sets', {
        exercises: plan?.exerciseCount ?? 0,
        sets: plan?.setCount ?? 0,
      })}. ${t('Open')}.`;

  return (
    <FloatingBubble visible={visible} contentStyle={{ gap: 10 }} accessibilityLabel={spoken}>
      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the top')}
        style={{
          width: 44,
          height: 44,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(63,169,108,0.20)',
          borderWidth: 1,
          borderColor: 'rgba(63,169,108,0.38)',
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.3)' }],
        }}
      >
        {inProgress ? (
          <View style={{ position: 'absolute', top: -1, left: -1 }}>
            <ProgressDial fraction={fraction} size={44} stroke={2.5} track={null} />
          </View>
        ) : null}
        <RollingNumber
          value={inProgress ? `${Math.round(fraction * 100)}%` : `#${number}`}
          lineHeight={16}
          duration={inProgress ? 600 : 800}
          style={{ fontSize: 13 }}
          className="font-bold text-green-bright"
        />
      </Pressable>

      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the top')}
        style={{ width: 150 }}
      >
        <View className="flex-row items-center">
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ fontSize: 9, letterSpacing: 1 }}
            className="font-semibold uppercase text-green-bright"
          >
            {inProgress ? `${t('In progress')} · ` : `${t('Up next')} · ${t('Workout')}`}
          </Text>
          {inProgress ? <TickingClockSmall startedAt={inProgress.startedAt} /> : null}
        </View>
        <RunningText
          text={name}
          fadeColor="#171C1A"
          containerStyle={{ marginTop: 2 }}
          allowFontScaling={false}
          style={{ fontSize: 14, lineHeight: 18 }}
          className="font-semibold text-ink"
        />
        {inProgress ? (
          <RollingPhrase
            template={t('{done} of {total} sets', { total: inProgress.total })}
            values={{ done: inProgress.done }}
            lineHeight={14}
            duration={500}
            containerStyle={{ marginTop: 1 }}
            style={{ fontSize: 11 }}
            className="text-ink-muted"
          />
        ) : (
          <RollingPhrase
            template={t('{exercises} exercises · {sets} sets')}
            values={{ exercises: plan?.exerciseCount ?? 0, sets: plan?.setCount ?? 0 }}
            lineHeight={14}
            duration={500}
            containerStyle={{ marginTop: 1 }}
            style={{ fontSize: 11 }}
            className="text-ink-muted"
          />
        )}
      </Pressable>

      <PlayButton
        onPress={onPlay}
        label={inProgress ? t('Back to the workout') : t('Open {name}', { name })}
      />
    </FloatingBubble>
  );
}

/** The bubble's kicker clock: 9 px, green, ticking. */
function TickingClockSmall({ startedAt }: { startedAt: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text
      allowFontScaling={false}
      style={{ fontSize: 9, letterSpacing: 1 }}
      className="font-semibold tabular-nums text-green-bright"
    >
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}

/** The bubble's ▶: 44 dp of the commit gradient. Sinks to 0.9. */
function PlayButton({ onPress, label }: { onPress: () => void; label: string }) {
  const press = usePressScale(0.9);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View
        style={{
          width: 44,
          height: 44,
          borderRadius: 9999,
          transform: press.style.transform,
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(63,169,108,0.45)' }],
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 9999,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinearGradient
            colors={[...COMMIT_GRADIENT]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SpecularEdge color="rgba(236,241,238,0.22)" radius={9999} />
          <Icon name="play" size={15} color={palette.ink} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

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
  const lang = useLanguage();
  const scale = useMotionScale();
  /*
   * THE HALO BREATHES — 26 dp at 0.14 to 44 dp at 0.30 and back over six
   * seconds, starting a second after the screen arrives. A `boxShadow` cannot
   * animate, so it is two fixed halos behind the card with the brighter one's
   * opacity swinging over the dimmer, native-driven.
   */
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scale === 0) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: motion.halo / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: motion.halo / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const start = setTimeout(() => loop.start(), 1000);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [breath, scale]);

  return (
    <View className="mx-lg mt-[22px]">
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: radius.hero,
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 26, color: 'rgba(63,169,108,0.14)' }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: radius.hero,
          opacity: breath,
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 44, color: 'rgba(63,169,108,0.30)' }],
        }}
      />
      <GlassSurface tier="lit" radius={radius.hero} shadow="e2">
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
            <HeroStat label={t('Workout')} value={`#${number}`} tone="green" rolls />
            {plan.lastTrainedAt ? (
              <HeroStat
                label={t('Last')}
                value={formatShortDate(plan.lastTrainedAt, lang)}
                tone="muted"
              />
            ) : null}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}

function HeroStat({
  label,
  value,
  tone = 'plain',
  rolls = false,
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'green' | 'muted';
  /** The workout number rolls when it changes — a workout was just saved. */
  rolls?: boolean;
}) {
  const color =
    tone === 'green' ? 'text-green-bright' : tone === 'muted' ? 'text-ink-muted' : 'text-ink';
  return (
    <View className="mr-[22px]">
      <Text
        allowFontScaling={false}
        style={{ fontSize: 10, letterSpacing: 1.1 }}
        className="font-semibold uppercase text-ink-faint"
      >
        {label}
      </Text>
      {rolls ? (
        <RollingNumber
          value={value}
          lineHeight={22}
          duration={900}
          containerStyle={{ marginTop: 2 }}
          style={{ fontSize: 20 }}
          className={['font-semibold', color].join(' ')}
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={{ fontSize: 20, lineHeight: 22 }}
          className={['mt-[2px] font-semibold tabular-nums', color].join(' ')}
        >
          {value}
        </Text>
      )}
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
  const press = usePressScale(0.97);
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
    <Animated.View style={{ transform: press.style.transform }}>
      <GlassSurface tier="card" radius={radius.row} shadow="e1" flat className="mb-sm">
        <BubblePressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
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
          {/* Both lines RUN rather than ellipsise — two routines whose names
              differ only at the end are two routines. */}
          <View className="flex-1 pr-md" style={{ minWidth: 0 }}>
            <RunningText
              text={choice.name}
              fadeColor={FADE_ON.card}
              className="text-body font-medium text-ink"
            />
            <RunningText
              text={detail}
              fadeColor={FADE_ON.card}
              containerStyle={{ marginTop: 2 }}
              className="text-label tabular-nums text-ink-faint"
            />
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
    </Animated.View>
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
   * column, because there is no second column left to align it against. The
   * title RUNS beside it.
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
        <View className="flex-row items-center">
          {numbered ? (
            <Text className="mr-sm text-[12px] font-semibold tabular-nums text-green-bright">
              {`#${number}`}
            </Text>
          ) : null}
          <RunningText
            text={session.title}
            fadeColor="#0B0E0D"
            containerStyle={{ flex: 1 }}
            className="text-[15px] leading-[20px] text-ink"
          />
        </View>
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
