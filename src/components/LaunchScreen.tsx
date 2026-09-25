/**
 * LaunchScreen — the three seconds between the native splash and the app,
 * spent saying what is actually being loaded.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │                  ◌  ◌                        │  ← two rings pulse out
 *   │                ╭──────╮                      │  ← 150 dp: a third per store
 *   │                │  ✓   │                      │  ← the mark: squeezes, redraws
 *   │                ╰──────╯                      │
 *   │              Workout Tracker                 │  ← letter by letter
 *   │            TRAIN · TICK · COUNT              │
 *   │                                              │
 *   │  (✓ 92 workouts)(◌ 0 tasks)(◌ 0 accounts)    │  ← each ticks when ITS store has
 *   └──────────────────────────────────────────────┘
 *
 * ── IT STARTS ON THE NATIVE SPLASH'S OWN FRAME ────────────────────────────
 *
 * Android draws `assets/splash.png` — a `#1E7A4C` circle with an ink ✓ on
 * `#060807` — before a single line of JS has run, and nothing in the app can
 * move it. So this screen's FIRST frame is that same picture: the same page
 * colour, the same green circle at the same place, and every other element at
 * opacity 0. Everything that moves afterwards moves away from a frame the eye has
 * already been looking at, which is the only way a JS splash can take over from a
 * native one without a visible cut. A JS splash that opened on its own first
 * frame — a different layout, a flash of the app behind it — is the jump the
 * native splash exists to hide.
 *
 * The handover is NOT held with `expo-splash-screen`'s `preventAutoHideAsync`:
 * that package is not in this build, and adding a native dependency for it is a
 * decision for the owner, not for a motion pass. Without it Android dismisses its
 * splash on the app's first drawn frame, and this is that frame.
 *
 * ── THE CHIPS ARE THE TRUTH ───────────────────────────────────────────────
 *
 * Three chips, three stores: the workout log (SQLite), the tasks and the money
 * (both persisted). Each spins until THAT store has really finished, then ticks
 * and counts up to what it holds, and the ring round the mark fills a third per
 * store. The order they tick in is the order the stores finished —
 * `lib/launchReady.ts` paces them so three stores that finish together still
 * read as three, and decides when the screen may leave: all three ready and 2.3 s
 * gone, or 6 s gone whatever happened. A store that never reports ready ends the
 * launch at the ceiling and the screen behind it shows its own error state.
 *
 * It shows on a COLD START only. It is mounted once, by `App`, for the life of the
 * JS process; coming back to the app from the background resumes that process,
 * and this screen has long since unmounted. With reduced motion on, everything is
 * drawn at its end state and it leaves the moment the stores are ready.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { useMotionScale } from '../hooks/useMotionScale';
import { usePlural, useT } from '../hooks/useT';
import { LAUNCH_CEILING_MS, launchReady, launchTicks, type LaunchStore } from '../lib/launchReady';
import { useMoney } from '../state/moneyStore';
import { useTasks } from '../state/tasksStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { curve, motion, palette, radius } from '../theme/tokens';
import { Icon } from './Icon';
import { Pop } from './motion';
import { RollingNumber } from './RollingNumber';

const EASE = curve(motion.ease);
const WORDMARK = 'Workout Tracker';

/** The mark, and the box the pulse rings and the progress ring sit in. */
const MARK = 80;
const BOX = 170;
const PROGRESS = 150;
const PROGRESS_STROKE = 3;
const PROGRESS_R = (PROGRESS - PROGRESS_STROKE) / 2 - 1.5;
const PROGRESS_LENGTH = 2 * Math.PI * PROGRESS_R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function LaunchScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const plural = usePlural();
  const scale = useMotionScale();
  const reduced = scale === 0;
  const { width, height } = useWindowDimensions();

  /* --- the three stores, and when each became ready ------------------- */
  const started = useRef(Date.now()).current;
  const historyReady = useWorkoutHistory((s) => s.ready);
  const workoutCount = useWorkoutHistory((s) => s.workouts.length);
  const taskCount = useTasks((s) => s.tasks.filter((task) => task.archivedAt === null).length);
  const accountCount = useMoney(
    (s) => s.accounts.filter((account) => account.archivedAt === null).length,
  );
  const [tasksReady, setTasksReady] = useState(() => useTasks.persist.hasHydrated());
  const [moneyReady, setMoneyReady] = useState(() => useMoney.persist.hasHydrated());
  useEffect(() => {
    // Both, deliberately — the listener catches a hydration still in flight, the
    // re-check one that finished between render and effect (`useHydrated.ts`).
    const offTasks = useTasks.persist.onFinishHydration(() => setTasksReady(true));
    const offMoney = useMoney.persist.onFinishHydration(() => setMoneyReady(true));
    if (useTasks.persist.hasHydrated()) setTasksReady(true);
    if (useMoney.persist.hasHydrated()) setMoneyReady(true);
    return () => {
      offTasks();
      offMoney();
    };
  }, []);

  const readyAt = useRef<Record<LaunchStore, number | null>>({
    history: null,
    tasks: null,
    money: null,
  });
  const stamp = (store: LaunchStore, ready: boolean) => {
    if (ready && readyAt.current[store] == null) readyAt.current[store] = Date.now() - started;
  };
  stamp('history', historyReady);
  stamp('tasks', tasksReady);
  stamp('money', moneyReady);

  /* A tenth-of-a-second clock, for as long as this screen lives — at most 6 s. */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(interval);
  }, [started]);

  const ticked = reduced
    ? {
        history: readyAt.current.history != null,
        tasks: readyAt.current.tasks != null,
        money: readyAt.current.money != null,
      }
    : launchTicks(readyAt.current, elapsed);
  const state = launchReady({
    historyReady: ticked.history,
    tasksReady: ticked.tasks,
    moneyReady: ticked.money,
    elapsedMs: elapsed,
  });
  /* Reduced motion has no choreography to wait for: leave once the data is in. */
  const exit = state.exit || (reduced && (state.stage === 3 || elapsed >= LAUNCH_CEILING_MS));

  /* --- the exit ------------------------------------------------------- */
  const leave = useRef(new Animated.Value(0)).current;
  const left = useRef(false);
  useEffect(() => {
    if (!exit || left.current) return;
    left.current = true;
    Animated.timing(leave, {
      toValue: 1,
      duration: 600 * scale,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [exit, leave, onDone, scale]);

  /* --- the choreography, all of it from mount ------------------------- */
  const lamps = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const lampBreath = useRef(new Animated.Value(1)).current;
  const squeeze = useRef(new Animated.Value(1)).current;
  /* 0 is drawn: the first frame shows the ✓, exactly as the native splash does. */
  const check = useRef(new Animated.Value(0)).current;
  const markGlow = useRef(new Animated.Value(0)).current;
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return undefined;
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    Animated.timing(lamps, {
      toValue: 1,
      duration: 1600,
      easing: EASE,
      useNativeDriver: true,
    }).start(() => {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(lampBreath, {
            toValue: 0.72,
            duration: 2500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(lampBreath, {
            toValue: 1,
            duration: 2500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loops.push(breathe);
      breathe.start();
    });
    // The squeeze: in to 0.88 over the first third, back out on the overshoot.
    Animated.sequence([
      Animated.timing(squeeze, {
        toValue: 0.88,
        duration: 315,
        easing: EASE,
        useNativeDriver: true,
      }),
      Animated.timing(squeeze, {
        toValue: 1,
        duration: 585,
        easing: curve(motion.pop),
        useNativeDriver: true,
      }),
    ]).start(() => {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(markGlow, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(markGlow, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loops.push(glow);
      glow.start();
    });
    /* The ✓ REDRAWS: wiped while the mark squeezes, then drawn again from 380 ms
       over 520 ms — it starts on the native splash's own ✓ and ends on this one. */
    Animated.sequence([
      Animated.timing(check, {
        toValue: 24,
        duration: 180,
        delay: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.delay(50),
      Animated.timing(check, { toValue: 0, duration: 520, easing: EASE, useNativeDriver: false }),
    ]).start();
    const wave = (v: Animated.Value, delay: number) => {
      const loop = Animated.loop(
        Animated.timing(v, { toValue: 1, duration: 2400, easing: EASE, useNativeDriver: true }),
      );
      loops.push(loop);
      timers.push(setTimeout(() => loop.start(), delay));
    };
    wave(wave1, 700);
    wave(wave2, 1500);
    Animated.timing(tagline, {
      toValue: 1,
      duration: 500,
      delay: 1100,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
    };
    // Mount only: this runs once, for a screen that is only ever mounted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The ring round the mark: a third per ticked store, 700 ms a step. */
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: state.stage / 3,
      duration: 700 * scale,
      easing: EASE,
      useNativeDriver: false,
    }).start();
  }, [progress, scale, state.stage]);

  const chips: { store: LaunchStore; count: number; label: string }[] = [
    {
      store: 'history',
      count: workoutCount,
      label: plural(workoutCount, { one: t('workout'), few: 'тренировки', many: t('workouts') }),
    },
    {
      store: 'tasks',
      count: taskCount,
      label: plural(taskCount, { one: t('task'), few: 'задачи', many: t('tasks') }),
    },
    {
      store: 'money',
      count: accountCount,
      label: plural(accountCount, { one: t('account'), few: 'раздела', many: t('accounts') }),
    },
  ];

  return (
    <Animated.View
      accessibilityLabel={t('Loading')}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ scale: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
      }}
    >
      {/* The room lighting up: three radial greens, scaling in, then breathing. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: Animated.multiply(lamps, lampBreath),
          transform: [{ scale: lamps.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
        }}
      >
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="launchBright" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={palette.greenBright} stopOpacity={1} />
              <Stop offset="70%" stopColor={palette.greenBright} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="launchDim" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={palette.green} stopOpacity={1} />
              <Stop offset="70%" stopColor={palette.green} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={width / 2} cy={height / 2} r={230} opacity={0.22} fill="url(#launchBright)" />
          <Circle cx={width * 0.12} cy={110} r={160} opacity={0.14} fill="url(#launchDim)" />
          <Circle
            cx={width * 0.92}
            cy={height - 100}
            r={180}
            opacity={0.12}
            fill="url(#launchDim)"
          />
        </Svg>
      </Animated.View>

      {/* The mark and everything around it. 40 dp above true centre, because the
          wordmark sits under it — the same picture the native splash draws. */}
      <View
        style={{
          width: BOX,
          height: BOX,
          marginTop: -40,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Wave value={wave1} />
        <Wave value={wave2} />

        <Svg
          width={PROGRESS}
          height={PROGRESS}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={PROGRESS / 2}
            cy={PROGRESS / 2}
            r={PROGRESS_R}
            fill="none"
            stroke="rgba(21,69,44,0.7)"
            strokeWidth={PROGRESS_STROKE}
          />
          {[PROGRESS_STROKE + 6, PROGRESS_STROKE].map((stroke, index) => (
            <AnimatedCircle
              key={index}
              cx={PROGRESS / 2}
              cy={PROGRESS / 2}
              r={PROGRESS_R}
              fill="none"
              stroke={palette.greenBright}
              strokeOpacity={index === 0 ? 0.25 : 1}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={PROGRESS_LENGTH}
              strokeDashoffset={progress.interpolate({
                inputRange: [0, 1],
                outputRange: [PROGRESS_LENGTH, 0],
              })}
            />
          ))}
        </Svg>

        {/* The mark's glow breathing, 24 ↔ 48 dp: two fixed halos, one fading. */}
        <View
          pointerEvents="none"
          style={[
            MARK_BOX,
            {
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 24, color: 'rgba(63,169,108,0.25)' },
              ],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            MARK_BOX,
            {
              opacity: markGlow,
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 48, color: 'rgba(63,169,108,0.55)' },
              ],
            },
          ]}
        />

        <Animated.View
          style={[
            MARK_BOX,
            {
              backgroundColor: palette.green,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: squeeze }],
            },
          ]}
        >
          <Svg width={44} height={44} viewBox="0 0 24 24">
            <AnimatedPath
              d="M20 6L9 17l-5-5"
              fill="none"
              stroke={palette.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={24}
              strokeDashoffset={check}
            />
          </Svg>
        </Animated.View>
      </View>

      {/* The name, one letter at a time. It is a name, not a sentence: it stays
          `Workout Tracker` in both languages. */}
      <View style={{ marginTop: 26, flexDirection: 'row' }} accessibilityLabel={WORDMARK}>
        {Array.from(WORDMARK).map((letter, index) => (
          <Letter key={index} letter={letter} delay={480 + index * 28} reduced={reduced} />
        ))}
      </View>
      <Animated.Text
        allowFontScaling={false}
        style={{
          marginTop: 6,
          fontSize: 11,
          letterSpacing: 1.4,
          fontWeight: '600',
          color: palette.inkFaint,
          textTransform: 'uppercase',
          opacity: tagline,
          transform: [
            { translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        }}
      >
        {t('Train · tick · count')}
      </Animated.Text>

      {/* What is actually loading, and what each store holds once it has. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 72,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {chips.map((chip, index) => (
          <StatusChip
            key={chip.store}
            done={ticked[chip.store]}
            count={chip.count}
            label={chip.label}
            delay={900 + index * 90}
            reduced={reduced}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const MARK_BOX = {
  position: 'absolute',
  width: MARK,
  height: MARK,
  borderRadius: radius.pill,
} as const;

/** One 120 dp ring pulsing out from the mark: scale 1 → 2.2, fading. */
function Wave({ value }: { value: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: 'rgba(63,169,108,0.5)',
        opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
      }}
    />
  );
}

/** One letter of the wordmark arriving: opacity and a 12 dp rise, 520 ms. */
function Letter({ letter, delay, reduced }: { letter: string; delay: number; reduced: boolean }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, {
      toValue: 1,
      duration: 520,
      delay,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.Text
      allowFontScaling={false}
      style={{
        fontSize: 24,
        letterSpacing: -0.5,
        fontWeight: '600',
        color: palette.ink,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {letter}
    </Animated.Text>
  );
}

/**
 * One status chip: a spinner until its store is ready, then a popped ✓ in a green
 * dot, and the count rolling up from zero at the same moment.
 */
function StatusChip({
  done,
  count,
  label,
  delay,
  reduced,
}: {
  done: boolean;
  count: number;
  label: string;
  delay: number;
  reduced: boolean;
}) {
  const arrive = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(arrive, {
      toValue: 1,
      duration: 420,
      delay,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{
        height: 32,
        paddingLeft: 8,
        paddingRight: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: done ? 'rgba(63,169,108,0.14)' : 'rgba(236,241,238,0.035)',
        borderColor: done ? 'rgba(63,169,108,0.3)' : 'rgba(236,241,238,0.06)',
        opacity: arrive,
        transform: [
          { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? palette.green : 'transparent',
        }}
      >
        {done ? (
          <Pop duration={320}>
            <Icon name="check" size={11} color={palette.ink} />
          </Pop>
        ) : (
          <Spinner reduced={reduced} />
        )}
      </View>
      <RollingNumber
        value={done ? String(count) : '0'}
        lineHeight={16}
        duration={600}
        style={{ fontSize: 12, color: done ? palette.greenBright : palette.inkFaint }}
        className="font-semibold"
      />
      <Text
        allowFontScaling={false}
        style={{ fontSize: 12, color: done ? palette.inkMuted : palette.inkFaint }}
        className="font-medium"
      >
        {label}
      </Text>
    </Animated.View>
  );
}

/** A 10 dp ring with a lit top segment, turning once every 700 ms. */
function Spinner({ reduced }: { reduced: boolean }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, turn]);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: 'rgba(63,169,108,0.3)',
        borderTopColor: palette.greenBright,
        transform: [
          { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    />
  );
}
