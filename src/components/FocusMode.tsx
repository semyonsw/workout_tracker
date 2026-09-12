/**
 * FocusMode — the session screen with everything but the work taken away.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │                   ▬▬▬▬                       │  ← the grabber, the way out
 *   │              swipe down to exit              │  ← 3.6 s, then gone
 *   │ PULL + SWIMMING        11 OF 18 SETS · 42 MIN │
 *   ├──────────────────────────────────────────────┤
 *   │  SET 2 OF 4                                  │
 *   │  Weighted 90° pull-ups                       │
 *   │                                              │
 *   │  +32 kg × 5 reps                        ±    │  ← 56 dp, green, glowing
 *   │  last: +32 kg · 5 4                          │
 *   │                                              │
 *   │                undo last set                 │
 *   │                  ╭─────╮                     │
 *   │                  │  ✓  │                     │  ← 176 dp
 *   │                  │DONE │                     │
 *   │                  ╰─────╯                     │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * The two facts you need mid-workout are WHAT AM I DOING and HOW LONG UNTIL I DO
 * IT, and each of them owns the screen while it is the answer. In LIFT that is the
 * working numbers at 56 dp; in REST it is the countdown at 120. The other fact
 * never disappears — it demotes to a block under the hairline at a size the app
 * already uses.
 *
 * ── WHY THIS EXISTS AT ALL, WHEN NOTHING IN IT IS NEW ───────────────────────
 *
 * Both facts are already on `ActiveWorkoutScreen`, and that is the problem: on a
 * 360 × 800 phone the header plus a running rest pill occupy 341 dp before the
 * first set row is drawn, so the set you are about to do lands around y ≈ 500 —
 * below the fold of a phone lying flat on a bench. Focus mode adds no data, no
 * store and no logic. It stops the two facts competing for the same 800 dp.
 *
 * ── SIX STATES, ONE SCREEN ──────────────────────────────────────────────────
 *
 *   A  LIFT          nothing running: the set, the ± nudge, DONE
 *   B  REST          the countdown, and the set it is counting for   `FocusRest`
 *   C  REST, final   the slab. A colour change and nothing else      `FocusRest`
 *   D  HOLD          a timed set, in all four of its phases          `FocusHold`
 *   E  COMPLETE      every set logged: `Finish workout`
 *   F  REST, paused  a frozen clock that must not look stalled       `FocusRest`
 *
 * The router below is the whole state machine, and it is four lines because the
 * store already owns every one of these facts. `lib/focusPlan.ts` says what is
 * being looked at; the two timer hooks say what is running.
 *
 * ── IT IS A SHEET, NOT A ROUTE ──────────────────────────────────────────────
 *
 * Rest keeps running when you leave, and the session's own pill picks it up
 * mid-countdown — so focus mode must not own the timer, only display it. The way
 * out is the grabber: swipe it down, or tap it (a tap is a zero-length swipe, and a
 * sweaty thumb produces plenty of those), or use Android's own back gesture. It is
 * available in EVERY state, including over the inverted slab, and it is never a
 * trap.
 *
 * `focusOpen` lives on the session screen and is deliberately not persisted, the
 * same reasoning that screen gives for `collapsedId`: reopening the app should show
 * you the session, not the fact that focus mode was open at some point.
 *
 * ── THE TWO TIMER HOOKS LIVE HERE, AND THE PILLS UNMOUNT ────────────────────
 *
 * `useRestTimer` and `useSetTimer` are not passive readers: they schedule the
 * notifications that reach a phone in a pocket, count the last seconds out loud and
 * hold the keep-awake lock. Two live instances of either would double every one of
 * those. So the session screen renders no pill while focus mode is open, and the
 * hand-off is clean in both directions — the effects cancel on unmount and
 * re-arm on mount, against a deadline that lives in the store rather than in
 * either component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import type { DraftSet } from '../lib/draft';
import { describeSetPosition, focusPlan, focusTarget, type FocusTarget } from '../lib/focusPlan';
import { tap } from '../lib/feedback';
import { isTimed as isTimedExercise } from '../lib/setTimer';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { useRestTimer } from '../hooks/useRestTimer';
import { useSetTimer } from '../hooks/useSetTimer';
import { useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { palette } from '../theme/tokens';
import { FOCUS_GLOW } from './FocusClock';
import { FocusBottom, FocusDone, FocusFinish } from './FocusControls';
import { FocusHold } from './FocusHold';
import { FocusNudge } from './FocusNudge';
import { FocusRest } from './FocusRest';
import type { UnitSystem } from '../types/models';

/** Focus mode's own keep-awake lock. Its own tag, so it cannot fight the timers'. */
const KEEP_AWAKE_TAG = 'focus-mode';

/** How long the sheet takes to arrive and to leave, and on which curve. */
const SLIDE_MS = 260;
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);

/** The exit hint's life: long enough to read twice, short enough to forget. */
const HINT_MS = 3600;
const HINT_FADE_MS = 600;

/** Past this much of a downward drag, letting go leaves. */
const DISMISS_DY = 60;
const DISMISS_VY = 0.5;

interface FocusModeProps {
  unitSystem: UnitSystem;
  /** Minutes the session has been running, or null while it has not started. */
  elapsedMinutes: number | null;
  /** Leave. The screen owns `focusOpen`; this closes it. */
  onClose: () => void;
  /**
   * Open the finish sheet.
   *
   * Focus mode adds NO finish logic of its own — `FinishSheet` already asks the
   * three questions finishing a session asks (the unlogged-set count, the ladders
   * that moved, how it felt), and it belongs to the screen. This only puts the
   * button where the thumb is.
   */
  onFinish: () => void;
}

export function FocusMode({ unitSystem, elapsedMinutes, onClose, onFinish }: FocusModeProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  /* --- store: one selector per slice ---------------------------------- */
  const session = useActiveWorkout((s) => s.session);
  const progress = useSessionProgress();
  const completeSet = useActiveWorkout((s) => s.completeSet);
  const uncompleteSet = useActiveWorkout((s) => s.uncompleteSet);
  const patchSet = useActiveWorkout((s) => s.patchSet);
  const startSetTimer = useActiveWorkout((s) => s.startSetTimer);
  /*
   * The two set-timer endings, straight off the store rather than through
   * `useSetTimer`'s wrappers: those fire their own haptic, and DONE has already
   * fired one. Two buzzes for one press is a stutter, not an acknowledgement.
   */
  const commitSetTimer = useActiveWorkout((s) => s.commitSetTimer);
  const cancelSetTimer = useActiveWorkout((s) => s.cancelSetTimer);
  const keepAwakeEnabled = useSettings((s) => s.keepAwakeEnabled);

  /* --- the two clocks. See the file header on why they live here. ----- */
  const rest = useRestTimer();
  const timer = useSetTimer();

  const plan = useMemo(() => focusPlan(session), [session]);

  /* --- screen-local view state --------------------------------------- */
  /** The ± pills, which take the `last:` line's place while they are open. */
  const [nudgeOpen, setNudgeOpen] = useState(false);
  /** The grabber goes `ink` while a finger is on it. */
  const [dragging, setDragging] = useState(false);

  /* --- the slide, the flash, the hint --------------------------------- */
  const slide = useRef(new Animated.Value(height)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(1)).current;
  /** Set once the sheet has begun leaving, so it cannot leave twice. */
  const leaving = useRef(false);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: EASING,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(HINT_MS),
      Animated.timing(hint, {
        toValue: 0,
        duration: HINT_FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [hint]);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(slide, {
      toValue: height,
      duration: SLIDE_MS,
      easing: EASING,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [height, onClose, slide]);

  /* Android's own back gesture leaves focus mode rather than the session. This
     listener is registered after `AppShell`'s, and the most recent one wins. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  /*
   * KEEP THE SCREEN ON FOR THE WHOLE OF FOCUS MODE, not only while something is
   * running. A screen that goes dark at 45 seconds of rest defeats the feature —
   * the entire premise is a phone lying face-up on a bench being read from two
   * metres. Gated on the setting, and under its own tag so releasing it cannot
   * release a timer's lock.
   */
  useEffect(() => {
    if (!keepAwakeEnabled) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwakeEnabled]);

  /*
   * The drag. It claims a touch only on the top block — the grabber and the header
   * — so nothing below it can be dismissed by a thumb that was reaching for `Skip`.
   * A downward drag follows the finger; anything else springs back.
   *
   * The responder is built ONCE (rebuilding it mid-gesture drops the gesture), so
   * it calls `close` through a ref rather than closing over the first render's
   * copy of it — a stale `close` here would animate against a stale screen height.
   */
  const closeRef = useRef(close);
  closeRef.current = close;

  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_e, g) => {
        slide.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        if (g.dy > DISMISS_DY || g.vy > DISMISS_VY) {
          closeRef.current();
          return;
        }
        Animated.timing(slide, {
          toValue: 0,
          duration: 160,
          easing: EASING,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        slide.setValue(0);
      },
    }),
  ).current;

  /* --- the two things a press does ------------------------------------ */
  /**
   * The visual half of an alert that is never visual-only.
   *
   * `FocusDone` has already fired `commit()` and the store's own timers will
   * speak; this is the half that reaches an eye which was on the bar rather than
   * on the phone. Green-wash over the whole screen, gone in 260 ms.
   */
  const flashNow = useCallback(() => {
    flash.setValue(0.85);
    Animated.timing(flash, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [flash]);

  const logSet = useCallback(
    (target: FocusTarget) => {
      flashNow();
      setNudgeOpen(false);
      // Logs it, advances the cursor and starts the rest — all of that already
      // lives in `completeSet`, including starting a session that was only
      // being read.
      completeSet(target.entryId, target.setId);
    },
    [completeSet, flashNow],
  );

  /**
   * DONE on a timed set, which has three endings rather than one:
   *
   *   • MID-HOLD, the clock has the honest number, so DONE means the same thing
   *     `Stop` does — log what it read. Anything else would leave a clock running
   *     over a set that is already logged, and a bell about to ring for it.
   *   • DURING THE GET-READY COUNT nothing has been held yet, so the count is
   *     dropped and the set is logged as planned: DONE there is "I did this, take
   *     my word for it", which is what the ✓ means everywhere in this app.
   *   • NOT RUNNING AT ALL — the hold the phone never saw. Log it as planned.
   */
  const handleHoldDone = useCallback(
    (target: FocusTarget) => {
      if (timer.reading?.phase === 'work') {
        flashNow();
        commitSetTimer();
        return;
      }
      if (timer.timer) cancelSetTimer();
      logSet(target);
    },
    [cancelSetTimer, commitSetTimer, flashNow, logSet, timer.reading?.phase, timer.timer],
  );

  const handleUndo = useMemo(() => {
    const target = plan.lastLogged;
    if (!target) return null;
    return () => {
      setNudgeOpen(false);
      uncompleteSet(target.entryId, target.setId);
    };
  }, [plan.lastLogged, uncompleteSet]);

  if (!session) return null;

  /* --- the router. See the file header. ------------------------------- */
  const holdTarget = timer.timer ? focusTarget(session, timer.timer) : null;
  const current = plan.current;

  const body = holdTarget ? (
    /* A clock is running: it is the subject, wherever the cursor is. */
    <FocusHold
      target={holdTarget}
      timer={timer}
      onStart={() => startSetTimer(holdTarget.entryId, holdTarget.setId)}
      onDone={() => handleHoldDone(holdTarget)}
      onUndo={handleUndo}
    />
  ) : rest.isActive ? (
    <FocusRest
      rest={rest}
      plan={plan}
      unitSystem={unitSystem}
      /* The set the countdown is counting towards, editable while it runs — see
         `FocusRest`. Bound to `plan.current` rather than to a stored target,
         because the session is editable while rest runs and the row this patches
         has to be the row the block is showing. */
      onPatch={current ? (patch) => patchSet(current.entryId, current.setId, patch) : undefined}
    />
  ) : !current ? (
    <SessionComplete
      loggedCount={progress.done}
      elapsedMinutes={elapsedMinutes}
      onFinish={onFinish}
      onUndo={handleUndo}
    />
  ) : isTimedExercise(current.entry.exercise) ? (
    <FocusHold
      target={current}
      timer={timer}
      onStart={() => startSetTimer(current.entryId, current.setId)}
      onDone={() => handleHoldDone(current)}
      onUndo={handleUndo}
    />
  ) : (
    <Lift
      target={current}
      unitSystem={unitSystem}
      nudgeOpen={nudgeOpen}
      onToggleNudge={() => {
        tap();
        setNudgeOpen((open) => !open);
      }}
      onPatch={(patch) => patchSet(current.entryId, current.setId, patch)}
      onDone={() => logSet(current)}
      onUndo={handleUndo}
    />
  );

  /*
   * EVERY ANIMATED VIEW IN HERE IS STYLED WITH `style`, NOT `className`.
   *
   * Not a preference: `className` reaches a React Native component through
   * NativeWind's JSX transform, and `Animated.View` is a wrapper around one rather
   * than one itself. Every animated node in this app is styled the same way for
   * the same reason (`ActiveWorkoutScreen`'s lifted card, the routine editor's).
   * The static children inside them keep their classes, so the tokens still come
   * from `tailwind.config.js` everywhere it matters.
   */
  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: palette.bg, transform: [{ translateY: slide }] },
      ]}
    >
      {/* THE WAY OUT, and the only chrome in here. Its own block above the header
          rule, outside every other control's box, in every state. */}
      <View {...drag.panHandlers} style={{ paddingTop: insets.top + 4 }}>
        <Pressable
          onPress={() => {
            tap();
            close();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Leave focus mode"
          accessibilityHint="Swipe down, or tap"
          className="h-hit items-center justify-center"
        >
          {({ pressed }) => (
            /* `ink` while a finger is on it, whether that finger is dragging or
               tapping — the handle has to acknowledge a press it is about to act
               on, and a tap is a zero-length swipe. */
            <View
              style={{ backgroundColor: dragging || pressed ? palette.ink : palette.inkFaint }}
              className="h-[4px] w-[36px] rounded-pill"
            />
          )}
        </Pressable>

        {/* Absolutely positioned so its 3.6 seconds of life cost no layout: a hint
            that reserves a line forever is a permanent gap, and one that unmounts
            moves the screen under a thumb. */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, opacity: hint }}
        >
          <Text className="text-center text-micro uppercase text-ink-faint">
            swipe down to exit
          </Text>
        </Animated.View>

        <View className="mt-lg flex-row items-center border-b border-b-hairline px-lg pb-md">
          <Text
            numberOfLines={1}
            className="flex-1 text-micro font-semibold uppercase text-ink-faint"
          >
            {session.title}
          </Text>
          <Text className="ml-md text-micro font-semibold uppercase tabular-nums text-ink-faint">
            {progress.done} of {progress.total} sets
            {elapsedMinutes == null ? ' · not started' : ` · ${elapsedMinutes} min`}
          </Text>
        </View>
      </View>

      {body}

      {/* The flash. Last child, `pointerEvents="none"`, so it paints over
          everything and takes nothing. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: flash, backgroundColor: palette.greenWash }]}
      />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* State A — LIFT                                                      */
/* ------------------------------------------------------------------ */

/**
 * The set you are about to do, and the one control that says you did it.
 *
 * THE NUMBERS ARE THE TAP TARGET. Tapping them — or the low-contrast `±` in its own
 * 44 dp box, which is the affordance a reveal needs — swaps the `last:` line for
 * the two stepper pills. That is where the up-next row's inline editor went: on the
 * session screen that row's numbers now open focus mode, and this is the editor
 * they open into. Every other row keeps `QuickAdjust` exactly as it was.
 *
 * The numbers are GREEN, the size the app reserves for the work, and glowing — the
 * same glow the set row's ring carries, at the wider radius a 56 dp glyph needs.
 * They go to `ink` the moment they stop being what you are about to do and become
 * what you just did: the app's existing "this is a fact now" rule, and the whole
 * argument for the up-next block being ink rather than green.
 */
function Lift({
  target,
  unitSystem,
  nudgeOpen,
  onToggleNudge,
  onPatch,
  onDone,
  onUndo,
}: {
  target: FocusTarget;
  unitSystem: UnitSystem;
  nudgeOpen: boolean;
  onToggleNudge: () => void;
  onPatch: (patch: Partial<DraftSet>) => void;
  onDone: () => void;
  onUndo: (() => void) | null;
}) {
  const { exercise } = target.entry;

  return (
    <>
      <View className="flex-1 justify-center">
        <View className="px-lg">
          <Text className="text-micro font-semibold uppercase text-green-bright">
            {describeSetPosition(target)}
          </Text>
          <Text numberOfLines={2} className="mt-xs text-title-lg font-medium text-ink">
            {exercise.name}
          </Text>
        </View>

        <Pressable
          onPress={onToggleNudge}
          accessibilityRole="button"
          accessibilityState={{ expanded: nudgeOpen }}
          /* The weight clause is dropped entirely on bodyweight work rather than
             read as "dash kilograms" — the same absence the cell itself has. */
          accessibilityLabel={[
            exercise.requiresWeight
              ? `${formatWeight(target.set.weightKg, unitSystem, exercise.loadMode)} ${unitLabel(unitSystem)} by`
              : '',
            `${formatCount(target.set.count, exercise.countUnit)} ${countUnitLabel(exercise.countUnit)}.`,
            'Adjust.',
          ]
            .filter(Boolean)
            .join(' ')}
          className="mt-xl flex-row items-baseline px-lg"
        >
          {exercise.requiresWeight ? (
            <>
              <WorkNumber
                value={formatWeight(target.set.weightKg, unitSystem, exercise.loadMode)}
              />
              <WorkUnit label={unitLabel(unitSystem)} />
              <Text className="mx-sm text-title text-ink-faint">×</Text>
            </>
          ) : null}

          <WorkNumber value={formatCount(target.set.count, exercise.countUnit)} />
          <WorkUnit label={countUnitLabel(exercise.countUnit)} />

          <View className="flex-1" />
          {/* WHAT GIVES WAY WHEN THE LINE IS TOO LONG. `+120 kg × 12 reps` plus
              this box is wider than the gutter on a 360 dp phone, and something
              has to lose. The numerals never do, and neither does the ± — it is a
              44 dp target and half a target is worse than none — so the two UNITS
              shrink and ellipsize, which is the part of the line the design says
              you never have to read. */}
          <View className="h-hit w-hit shrink-0 items-center justify-center">
            <Text className="text-title text-ink-faint">±</Text>
          </View>
        </Pressable>

        {nudgeOpen ? (
          <FocusNudge
            set={target.set}
            exercise={exercise}
            unitSystem={unitSystem}
            onChange={onPatch}
          />
        ) : (
          /* What this exercise did last time. Reference, not instruction — the
             same `ink-faint` clause the expanded card carries. */
          <Text numberOfLines={1} className="mt-sm px-lg text-label tabular-nums text-ink-faint">
            {target.entry.lastSessionShort ? `last: ${target.entry.lastSessionShort}` : ' '}
          </Text>
        )}
      </View>

      <FocusBottom onUndo={onUndo}>
        <FocusDone onPress={onDone} label="done" />
      </FocusBottom>
    </>
  );
}

/** One of the two 56 dp numerals. Tabular, unscaled, and glowing. */
function WorkNumber({ value }: { value: string }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[FOCUS_GLOW, { fontVariant: ['tabular-nums'] }]}
      className="text-focus-work font-semibold text-green-bright"
    >
      {value}
    </Text>
  );
}

/**
 * `kg` / `reps` beside them — `title`, and `green` rather than `green-bright`.
 *
 * The units stay at 22 while the numerals take 56: a five-character weight with
 * its unit at the same size does not fit the gutter, and the unit is the one part
 * of the line you never have to read.
 */
function WorkUnit({ label }: { label: string }) {
  return (
    <Text numberOfLines={1} className="ml-xs shrink text-title font-semibold uppercase text-green">
      {label}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* State E — session complete                                          */
/* ------------------------------------------------------------------ */

/**
 * Every set logged. There is nothing to rest for, so nothing counts down.
 *
 * `Finish workout` takes DONE's slot and deliberately not its shape — see
 * `FocusControls`. `undo last set` stays above it, because the last thing that
 * happened in this session was a ✓ and it is still the thing most likely to have
 * been a mis-tap.
 */
function SessionComplete({
  loggedCount,
  elapsedMinutes,
  onFinish,
  onUndo,
}: {
  loggedCount: number;
  elapsedMinutes: number | null;
  onFinish: () => void;
  onUndo: (() => void) | null;
}) {
  return (
    <>
      <View className="flex-1 justify-center px-lg">
        <Text className="text-micro font-semibold uppercase text-green-bright">
          last set logged
        </Text>
        <Text allowFontScaling={false} className="mt-xs text-focus-work font-semibold text-ink">
          Session complete
        </Text>
        <Text className="mt-md text-label tabular-nums text-ink-muted">
          {loggedCount} {loggedCount === 1 ? 'set' : 'sets'} logged
          {elapsedMinutes == null ? '' : ` · ${elapsedMinutes} min`}
        </Text>
        <Text className="mt-xs text-label text-ink-faint">nothing left to rest for</Text>
      </View>

      <FocusBottom onUndo={onUndo}>
        <FocusFinish onPress={onFinish} />
      </FocusBottom>
    </>
  );
}
