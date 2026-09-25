/**
 * FocusMode — the session screen with everything but the work taken away.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ (⌄)             SET 2 OF 4                   │  ← the way out, and where you are
 *   │           Weighted 90° pull-ups              │
 *   │            last: +32 kg · 5 4                │
 *   │                                              │
 *   │   (−2)      +32 KG       (+2)                │  ← 84 dp, green, glowing
 *   │   (−1)     × 5 REPS      (+1)                │     with the ± beside them
 *   │                                              │
 *   │                undo last set                 │
 *   │                  ╭─────╮                     │
 *   │                  │  ✓  │                     │  ← 176 dp, and a ripple
 *   │                  │DONE │                     │
 *   │                  ╰─────╯                     │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE MOTION PASS MOVED THE ± NEXT TO THE NUMBER IT CHANGES ─────────────
 *
 * The nudge used to sit behind a `±` you had to open first; the common edit —
 * one plate, one rep — is now a 48 dp circle either side of the number it moves,
 * in the app's own steps (`lib/setNudge.ts`: the coarse weight step, the fine
 * count step). Tapping the numbers still opens the full ± panel for the half-kilo.
 * The digits ROLL when they change, the sheet arrives sliding up over 420 ms, and
 * DONE sends out a ripple before the rest ring takes its place.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 * The two facts you need mid-workout are WHAT AM I DOING and HOW LONG UNTIL I DO
 * IT, and each of them owns the screen while it is the answer. In LIFT that is the
 * working numbers, in REST the countdown, and both are drawn at the same 120 dp:
 * the clock is replaced by the set at the size the clock was, so the answer
 * changes without the screen moving. The other fact never disappears — it demotes
 * to a block under the hairline, its numbers still far bigger than any list's.
 *
 * The numbers are STACKED and their size is measured rather than fixed — see
 * `components/FocusNumbers.tsx` and `lib/focusType.ts`. One line of
 * `+120 kg × 12 reps` was what held them to 56.
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
 * `useRestTimer` and `useSetTimer` are not passive readers: they count the last
 * seconds out loud and hold the keep-awake lock. Two live instances of either would
 * double both. (The alarms that reach a phone in a pocket are scheduled once, in
 * `App.tsx` — `hooks/useTimerAlerts.ts`.) So the session screen renders no pill while focus mode is open, and the
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
import { Pressable as StylePressable } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import type { DraftSet } from '../lib/draft';
import { describeSetPosition, focusPlan, focusTarget, type FocusTarget } from '../lib/focusPlan';
import { tap } from '../lib/feedback';
import { isTimed as isTimedExercise } from '../lib/setTimer';
import { workNumeralSize } from '../lib/focusType';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { nudgeSet, nudgeSteps } from '../lib/setNudge';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { useRestTimer } from '../hooks/useRestTimer';
import { useSetTimer } from '../hooks/useSetTimer';
import { useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { useSettings } from '../state/settingsStore';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { useMotionScale } from '../hooks/useMotionScale';
import { curve, focusGlow, motion, palette } from '../theme/tokens';
import { FocusBottom, FocusDone, FocusFinish } from './FocusControls';
import { Lamps } from './glass';
import { Icon } from './Icon';
import { usePressScale } from './motion';
import { RollingNumber } from './RollingNumber';
import { RunningText } from './RunningText';
import { workLines } from './FocusNumbers';
import { FocusHold } from './FocusHold';
import { FocusNudge } from './FocusNudge';
import { FocusRest } from './FocusRest';
import type { UnitSystem } from '../types/models';

/** Focus mode's own keep-awake lock. Its own tag, so it cannot fight the timers'. */
const KEEP_AWAKE_TAG = 'focus-mode';

/**
 * How long the sheet takes to arrive (`motion.sheet`) and to leave, on the base
 * curve. Leaving is quicker: something going away should not ask to be watched.
 */
const ARRIVE_MS = motion.sheet;
const LEAVE_MS = 260;
const EASING = curve(motion.ease);

/** DONE logs this long after the press, so its ripple is seen. See `FocusDone`. */
const DONE_DELAY_MS = 180;

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
  const t = useT();
  const lang = useLanguage();
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
  /** The ± panel under the numbers, opened by tapping them. */
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const motionScale = useMotionScale();

  /* --- the slide and the flash ---------------------------------------- */
  const slide = useRef(new Animated.Value(motionScale === 0 ? 0 : height)).current;
  const flash = useRef(new Animated.Value(0)).current;
  /** Set once the sheet has begun leaving, so it cannot leave twice. */
  const leaving = useRef(false);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: ARRIVE_MS * motionScale,
      easing: EASING,
      useNativeDriver: true,
    }).start();
    // Mount only: the sheet arrives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(slide, {
      toValue: height,
      duration: LEAVE_MS * motionScale,
      easing: EASING,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [height, motionScale, onClose, slide]);

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
      onPanResponderMove: (_e, g) => {
        slide.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
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
      duration: LEAVE_MS,
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
  /*
   * WHERE YOU ARE, in the one line at the top: the set position while there is
   * work, `resting` while the clock runs, and nothing once the session is done —
   * the body says that itself, in a larger voice.
   */
  const kicker = holdTarget
    ? describeSetPosition(holdTarget, lang)
    : rest.isActive
      ? t('Resting')
      : current
        ? describeSetPosition(current, lang)
        : '';

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
      {/* One lamp, behind the numbers. Focus mode is the one screen with a
          single light source, because it has a single subject. */}
      <Lamps section="Focus" />

      {/* THE WAY OUT, and the only chrome in here: a glass ⌄ in the corner, and
          the whole top band is also a drag — swipe it down, or tap the ⌄, or use
          Android's back gesture. Available in every state, including over the
          inverted slab; focus mode is never a trap. */}
      <View
        {...drag.panHandlers}
        style={{ paddingTop: insets.top + 8 }}
        className="flex-row items-center px-md pb-sm"
      >
        <CloseButton
          onPress={() => {
            tap();
            close();
          }}
          label={t('Leave focus mode')}
          hint={t('Swipe down, or tap')}
        />
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          className="flex-1 text-center text-micro font-semibold uppercase text-ink-faint"
        >
          {kicker}
        </Text>
        <View className="w-hit" />
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
 * The weight at 84 dp in green with the app's focus glow, the count at 84 dp in
 * ink under it, and a 48 dp ± either side of each — the coarse weight step and
 * the fine count step, in the user's own units (`lib/setNudge.ts`), so the
 * common edit is one tap on the number's own row. Tapping the NUMBERS opens the
 * full panel, which is where the half-kilo lives.
 *
 * Both lines share one size: the largest that fits the narrower of the two
 * beside its circles (`workNumeralSize`), capped at 84 — so `+120 KG` comes down
 * on its own rather than pushing a circle off the phone.
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
  const t = useT();
  const lang = useLanguage();
  const { width, height: screen } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { exercise } = target.entry;
  const lines = workLines(target, unitSystem, lang);
  const countsMax = showsMaxLabel(exercise, target.set);

  /* The width a number has: the gutters, the two circles and their gaps, and —
     on the count line — the `×` in front of it. */
  const beside = 2 * (CIRCLE + GAP);
  const sizes = lines.map((line, index) =>
    workNumeralSize(
      [line],
      width - 32 - beside - (index === lines.length - 1 && lines.length > 1 ? 24 : 0),
      NUMERAL,
    ),
  );
  /* And the height: two lines of it must leave room for the name, DONE and undo
     on a short phone — the screen does not scroll. */
  const sheet = screen - insets.top - insets.bottom;
  const byHeight = Math.floor((sheet - LIFT_FURNITURE) / (lines.length * 1.1));
  const numeral = Math.max(40, Math.min(NUMERAL, byHeight, ...sizes));
  const lineHeight = Math.round(numeral * 1.1);

  const weightStep = nudgeSteps('weight', exercise.countUnit, unitSystem).coarse;
  const countStep = nudgeSteps('count', exercise.countUnit, unitSystem).fine;
  const nudge = (field: 'weight' | 'count', delta: number) => {
    tap();
    onPatch(nudgeSet(target.set, field, delta, unitSystem));
  };

  /* The whole number block, read as one sentence and opened as one control. */
  const spoken = [
    exercise.requiresWeight
      ? t('{weight} {unit} by', {
          weight: formatWeight(target.set.weightKg, unitSystem, exercise.loadMode),
          unit: unitLabel(unitSystem, lang),
        })
      : '',
    countsMax
      ? `${maxLabel(lang)}.`
      : `${formatCount(target.set.count, exercise.countUnit)} ${countUnitLabel(exercise.countUnit, lang)}.`,
    t('Adjust.'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <View className="flex-1 items-center">
        <View className="mt-[22px] items-center self-stretch px-xl">
          <RunningText
            text={exercise.name}
            fadeColor={palette.bg}
            containerStyle={{ maxWidth: '100%' }}
            allowFontScaling={false}
            style={{ fontSize: 22, lineHeight: 28 }}
            className="font-medium text-ink"
          />
        </View>
        {/* What this exercise did last time. Reference, not instruction — the
            same `ink-faint` clause the expanded card carries. */}
        <Text numberOfLines={1} className="mt-xs px-lg text-label tabular-nums text-ink-faint">
          {target.entry.lastSessionShort
            ? t('last: {what}', { what: target.entry.lastSessionShort })
            : ' '}
        </Text>

        {exercise.requiresWeight ? (
          <View className="mt-[22px] flex-row items-center" style={{ gap: GAP }}>
            <StepCircle
              label={formatStep(-weightStep)}
              fontSize={13}
              onPress={() => nudge('weight', -weightStep)}
              accessibilityLabel={t('{step} {unit}', {
                step: formatStep(-weightStep),
                unit: unitLabel(unitSystem, lang),
              })}
            />
            <Pressable
              onPress={onToggleNudge}
              accessibilityRole="button"
              accessibilityState={{ expanded: nudgeOpen }}
              accessibilityLabel={spoken}
              className="flex-row items-end"
            >
              <RollingNumber
                value={lines[0].value}
                lineHeight={lineHeight}
                duration={450}
                style={[
                  {
                    fontSize: numeral,
                    fontWeight: '600',
                    letterSpacing: -3,
                    color: palette.greenBright,
                  },
                  focusGlow,
                ]}
              />
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: UNIT,
                  lineHeight: UNIT_LINE,
                  marginLeft: 6,
                  marginBottom: unitDrop(numeral, lineHeight),
                  color: palette.green,
                }}
                className="font-semibold"
              >
                {lines[0].unit}
              </Text>
            </Pressable>
            <StepCircle
              label={formatStep(weightStep)}
              fontSize={13}
              onPress={() => nudge('weight', weightStep)}
              accessibilityLabel={t('{step} {unit}', {
                step: formatStep(weightStep),
                unit: unitLabel(unitSystem, lang),
              })}
            />
          </View>
        ) : null}

        <View
          className={
            exercise.requiresWeight
              ? 'mt-[6px] flex-row items-center'
              : 'mt-[22px] flex-row items-center'
          }
          style={{ gap: GAP }}
        >
          <StepCircle
            label={formatStep(-countStep)}
            fontSize={15}
            onPress={() => nudge('count', -countStep)}
            accessibilityLabel={t('{step} {unit}', {
              step: formatStep(-countStep),
              unit: countUnitLabel(exercise.countUnit, lang),
            })}
          />
          <Pressable
            onPress={onToggleNudge}
            accessibilityRole="button"
            accessibilityState={{ expanded: nudgeOpen }}
            accessibilityLabel={spoken}
            className="flex-row items-end"
          >
            {exercise.requiresWeight ? (
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 24,
                  lineHeight: 28,
                  marginRight: 6,
                  marginBottom: unitDrop(numeral, lineHeight, 24, 28),
                  color: palette.inkFaint,
                }}
              >
                ×
              </Text>
            ) : null}
            <RollingNumber
              value={lines[lines.length - 1].value}
              lineHeight={lineHeight}
              duration={450}
              style={{
                fontSize: numeral,
                fontWeight: '600',
                letterSpacing: -3,
                color: palette.ink,
              }}
            />
            {lines[lines.length - 1].unit ? (
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: UNIT,
                  lineHeight: UNIT_LINE,
                  marginLeft: 6,
                  marginBottom: unitDrop(numeral, lineHeight),
                  color: palette.inkFaint,
                }}
                className="font-semibold"
              >
                {lines[lines.length - 1].unit}
              </Text>
            ) : null}
          </Pressable>
          <StepCircle
            label={formatStep(countStep)}
            fontSize={15}
            onPress={() => nudge('count', countStep)}
            accessibilityLabel={t('{step} {unit}', {
              step: formatStep(countStep),
              unit: countUnitLabel(exercise.countUnit, lang),
            })}
          />
        </View>

        {nudgeOpen ? (
          <FocusNudge
            set={target.set}
            exercise={exercise}
            unitSystem={unitSystem}
            onChange={onPatch}
          />
        ) : null}
      </View>

      <FocusBottom onUndo={onUndo}>
        <FocusDone onPress={onDone} label={t('done')} delayMs={DONE_DELAY_MS} />
      </FocusBottom>
    </>
  );
}

/** The work view's numerals, at most; the size the design draws them at. */
const NUMERAL = 84;
/** Their units: `KG`, `REPS`. */
const UNIT = 18;
const UNIT_LINE = 22;
/** A ± circle, and the air between it and its number. */
const CIRCLE = 48;
const GAP = 14;
/**
 * What the work view spends on things that are not the numbers: the top band,
 * the name and `last:`, their margins, the undo row and the 176 dp DONE with its
 * padding. The rest is the numbers' to share.
 */
const LIFT_FURNITURE = 52 + 28 + 18 + 22 + 6 + 4 + 44 + 8 + 176 + 24 + 24;

/**
 * How far a unit sits up from the bottom of its numeral's box so the two share a
 * baseline: the numeral's own baseline offset, less the unit's. Arithmetic rather
 * than `alignItems: 'baseline'`, because a rolling numeral is a column of views
 * and has no baseline of its own to align to.
 */
function unitDrop(size: number, line: number, unit = UNIT, unitLine = UNIT_LINE): number {
  const DESCENT = 0.21;
  const numeralBase = (line - size) / 2 + size * DESCENT;
  const unitBase = (unitLine - unit) / 2 + unit * DESCENT;
  return Math.max(0, Math.round(numeralBase - unitBase));
}

/** `−2`, `+2.5`: a real minus sign, and no trailing zeros. */
function formatStep(delta: number): string {
  const body = String(Number(Math.abs(delta).toFixed(2)));
  return delta < 0 ? `−${body}` : `+${body}`;
}

/** One 48 dp ± beside a number. Sinks to 0.86 under the thumb. */
function StepCircle({
  label,
  fontSize,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  fontSize: number;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const press = usePressScale(0.86);
  return (
    <StylePressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={{
          width: CIRCLE,
          height: CIRCLE,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: palette.hairline,
          backgroundColor: 'rgba(236,241,238,0.03)',
          transform: press.style.transform,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{ fontSize, color: palette.inkMuted }}
          className="font-semibold tabular-nums"
        >
          {label}
        </Text>
      </Animated.View>
    </StylePressable>
  );
}

/** The ⌄ in the corner: a 44 dp glass circle, the way out of focus mode. */
function CloseButton({
  onPress,
  label,
  hint,
}: {
  onPress: () => void;
  label: string;
  hint: string;
}) {
  const press = usePressScale(0.88);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Animated.View
        style={{
          width: 44,
          height: 44,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(236,241,238,0.055)',
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.07)',
          transform: press.style.transform,
        }}
      >
        <Icon name="chevron-down" size={20} color={palette.inkMuted} />
      </Animated.View>
    </Pressable>
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
  const t = useT();
  const countedSets = usePlural();

  return (
    <>
      <View className="flex-1 justify-center px-lg">
        <Text className="text-micro font-semibold uppercase text-green-bright">
          {t('last set logged')}
        </Text>
        <Text allowFontScaling={false} className="mt-xs text-focus-work font-semibold text-ink">
          {t('Session complete')}
        </Text>
        <Text className="mt-md text-label tabular-nums text-ink-muted">
          {t('{count} {sets} logged', {
            count: loggedCount,
            // `few` is Russian's own third form, so it is the Russian word.
            sets: countedSets(loggedCount, { one: t('set'), few: 'подхода', many: t('sets') }),
          })}
          {elapsedMinutes == null ? '' : ` · ${t('{minutes} min', { minutes: elapsedMinutes })}`}
        </Text>
        <Text className="mt-xs text-label text-ink-faint">{t('nothing left to rest for')}</Text>
      </View>

      <FocusBottom onUndo={onUndo}>
        <FocusFinish onPress={onFinish} />
      </FocusBottom>
    </>
  );
}
