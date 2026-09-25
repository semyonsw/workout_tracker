/**
 * Focus mode while a rest runs — the countdown, and the set it is counting for.
 *
 *                         ╭─────────╮
 *                      ╭──           ──╮
 *                     │      1:28       │   ← a 280 dp ring draining, 88 dp digits
 *                     │  BETWEEN SETS   │
 *                      ╰──           ──╯
 *                         ╰─────────╯
 *                  (−15) (+15) (⏸) ( Skip )
 *
 *                    ╭ UP NEXT · NEW MACHINE ─╮   ← rises from the bottom
 *                    │ Barbell row            │
 *                    │ 60 kg × 8 reps         │
 *                    ╰────────────────────────╯
 *
 * ── THE MOTION PASS MADE THE CLOCK A RING ─────────────────────────────────
 *
 * A 280 dp ring (stroke 10, `green-dim` track, `green-bright` fill with a soft
 * underlay glow) drains linearly over exactly the time left — re-anchored on
 * every `±15`, pause and resume — with the digits rolling in the middle. It
 * arrives by cross-fading and rising over the numbers DONE just logged, and the
 * Up-next card rises from the bottom a beat later, so the eye lands on the clock
 * first and on where to walk second.
 *
 * Three of focus mode's six states live here, and all three are the same layout:
 *
 *   • RUNNING — the countdown owns the screen.
 *   • FINAL TEN SECONDS — the ring's fill turns `ink`, the digits turn
 *     `green-bright`, and the ring PULSES once a second like the session pill.
 *     Colour, contrast and motion all change at once; nothing else on the screen
 *     does, because what you are about to do has not changed.
 *   • PAUSED — three signals, none of them colour alone. The label reads
 *     `between sets · paused` in green, the digits desaturate to `ink-muted`, the
 *     ring stops, and the pause control is a ▶.
 *
 * ── THE LABEL AND THE BLOCK ANSWER TWO DIFFERENT QUESTIONS ──────────────────
 *
 * The clock's label says WHICH REST IS RUNNING — `between sets` or `next exercise`,
 * the two lengths the user sets separately — because a countdown that does not say
 * which one it is is a setting you cannot check. That comes from `restLabel`, the
 * same function the session pill uses.
 *
 * The up-next block says WHERE YOU ARE GOING, and it is green and louder when that
 * is a different machine. That comes from `focusPlan.isNewExercise`, which is
 * derived from the two sets rather than from the rest's source — see that file for
 * why the two can disagree. In the ordinary case they agree and the screen says the
 * same thing twice, quietly, in two places.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Pressable } from './Pressable';

import type { DraftSet } from '../lib/draft';
import type { FocusPlan, FocusTarget } from '../lib/focusPlan';
import { tap } from '../lib/feedback';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { countUnitLabel, formatClock, formatCount, formatWeight, unitLabel } from '../lib/units';
import type { RestTimerApi } from '../hooks/useRestTimer';
import { useMotionScale } from '../hooks/useMotionScale';
import { curve, elevation, motion, palette, radius } from '../theme/tokens';
import { FocusNudge } from './FocusNudge';
import { Icon } from './Icon';
import { SecondPulse, Stagger, usePressScale } from './motion';
import { RollingNumber } from './RollingNumber';
import { RunningText } from './RunningText';
import { FINAL_SECONDS } from './TimerPill';
import { restLabel } from './RestTimerPill';
import { useLanguage, useT } from '../hooks/useT';
import type { UnitSystem } from '../types/models';

export function FocusRest({
  rest,
  plan,
  unitSystem,
  onPatch,
}: {
  rest: RestTimerApi;
  plan: FocusPlan;
  unitSystem: UnitSystem;
  /**
   * Change the set the countdown is counting towards.
   *
   * ── WHY REST IS AN EDITING SCREEN NOW ──────────────────────────────────
   *
   * It used to be the one state of focus mode with no controls over the WORK in
   * it: the clock, and a block stating what was coming. That reads as a design
   * decision and it was an omission, because the minute between two sets is
   * exactly when the decision about the next one gets made — the last set was
   * heavy, the next one is coming down 10 kg, and the user is holding the phone
   * with nothing else to do. Before this they had to leave focus mode, find the
   * row, open its editor, and come back, all against a clock.
   *
   * So the up-next block is a button, and it opens the same ± `Lift` opens. Absent
   * = the block is a statement again, which is what a caller with no session to
   * patch should get rather than a control that does nothing.
   */
  onPatch?: (patch: Partial<DraftSet>) => void;
}) {
  /*
   * Screen-local, and reset by the block disappearing — a panel is open because
   * the user opened it a moment ago, and that is not a fact worth surviving the
   * rest it was opened during.
   */
  const t = useT();
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const motionScale = useMotionScale();
  const {
    remaining,
    isPaused,
    isRunning,
    source,
    totalSeconds,
    stepSeconds,
    endsAt,
    add,
    pause,
    resume,
    skip,
  } = rest;

  const finalTen = !isPaused && remaining <= FINAL_SECONDS;
  const secondsLeft = Math.ceil(remaining);

  /*
   * THE CLOCK ARRIVES where the numbers DONE just logged were: a cross-fade and a
   * 10 dp rise over 360 ms. On a ref, not in state: this component re-renders four
   * times a second, and an entrance that restarted on every tick would be a clock
   * that never stops arriving.
   */
  const arrive = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(arrive, {
      toValue: 1,
      duration: 360 * motionScale,
      easing: curve(motion.ease),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrive]);

  const clockColor = isPaused ? palette.inkMuted : finalTen ? palette.greenBright : palette.ink;

  return (
    <>
      <Animated.View
        style={{
          marginTop: 28,
          alignItems: 'center',
          opacity: arrive,
          transform: [
            { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        }}
      >
        <SecondPulse active={finalTen && isRunning}>
          <RestRing
            fraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
            drainMs={isRunning ? remaining * 1000 : null}
            drainKey={isPaused ? 'paused' : endsAt}
            color={finalTen ? palette.ink : palette.greenBright}
          >
            <RollingNumber
              value={formatClock(remaining)}
              lineHeight={96}
              duration={320}
              accessibilityLabel={
                isPaused
                  ? t('Rest paused with {seconds} seconds left', { seconds: secondsLeft })
                  : t('{seconds} seconds of rest left', { seconds: secondsLeft })
              }
              style={{ fontSize: 88, letterSpacing: -3, fontWeight: '600', color: clockColor }}
            />
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={{ color: isPaused ? palette.greenBright : palette.inkFaint }}
              className="mt-xs text-micro font-semibold uppercase"
            >
              {restLabel(source, isPaused, t)}
            </Text>
          </RestRing>
        </SecondPulse>

        {/* Under the ring, 48 high: minus before plus, the order every other ±
            in the app uses, and `Skip` lit because it is the one that ends it. */}
        <View className="mt-[20px] flex-row items-center" style={{ gap: 10 }}>
          <RestControl
            label={`−${stepSeconds}`}
            onPress={() => add(-stepSeconds)}
            accessibilityLabel={t('Shorten {what} by {seconds} seconds', {
              what: restLabel(source, false, t),
              seconds: stepSeconds,
            })}
          />
          <RestControl
            label={`+${stepSeconds}`}
            onPress={() => add(stepSeconds)}
            accessibilityLabel={t('Lengthen {what} by {seconds} seconds', {
              what: restLabel(source, false, t),
              seconds: stepSeconds,
            })}
          />
          <RestControl
            icon={isPaused ? 'play' : 'pause'}
            onPress={isPaused ? resume : pause}
            accessibilityLabel={isPaused ? t('Resume rest') : t('Pause rest')}
          />
          <RestControl label={t('Skip')} lit onPress={skip} accessibilityLabel={t('Skip rest')} />
        </View>
      </Animated.View>

      {/* The clock is at the top and the work is at the bottom, with the free
          space between them: pressing DONE cleared the bottom of the screen, and
          this is what fills it — the thing your thumb was resting on is now the
          thing you read. */}
      <View className="flex-1" />

      {plan.current ? (
        <Stagger delay={120} duration={480} rise={24} style={{ marginBottom: 28 }}>
          <UpNextCard
            target={plan.current}
            unitSystem={unitSystem}
            isNewExercise={plan.isNewExercise}
            isOpen={nudgeOpen}
            onPress={
              onPatch
                ? () => {
                    tap();
                    setNudgeOpen((open) => !open);
                  }
                : undefined
            }
          />
          {/* Under the card rather than over the clock: the thing being changed
              stays visible while the chips move it, exactly as `QuickAdjust` sits
              under the row it edits. */}
          {onPatch && nudgeOpen ? (
            <FocusNudge
              set={plan.current.set}
              exercise={plan.current.entry.exercise}
              unitSystem={unitSystem}
              onChange={onPatch}
            />
          ) : null}
        </Stagger>
      ) : (
        /*
         * A COUNTDOWN WITH NOTHING AFTER IT.
         *
         * Reachable, and worth saying out loud rather than leaving as empty space:
         * the last set of the session does not start a rest, but a rest started by
         * hand (the `Rest 2:00` row) or one already running when the last ✓ landed
         * is still ticking with no work behind it. The clock stays — it is real, and
         * hiding a running timer is worse than admitting it is pointless — and this
         * says what `Skip` will get you.
         */
        <View className="mx-lg mb-xl rounded-surface border border-hairline px-lg py-lg">
          <Text className="text-micro font-semibold uppercase text-ink-faint">
            {t('every set logged')}
          </Text>
          <Text className="mt-xs text-title font-medium text-ink">
            {t('Nothing left to rest for')}
          </Text>
          <Text className="mt-xs text-label text-ink-faint">
            {t('skip the clock to finish the workout')}
          </Text>
        </View>
      )}
    </>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 280;
const RING_STROKE = 10;
const RING_R = (RING - RING_STROKE) / 2 - 3;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * The 280 dp ring, draining.
 *
 * The same idea as `TimerPill`'s drain line: jump to where the clock is on every
 * new deadline, then run linearly to empty over exactly the time left. It is an
 * SVG `strokeDashoffset`, which is not a transform, so it runs on the JS driver —
 * one number, once a frame, for a screen that has nothing else moving.
 *
 * The glow is a second, wider arc under the first at low alpha: an SVG filter
 * would be the literal translation, and `react-native-svg` does not draw one
 * reliably on Android. A wider arc also follows the drain, which a halo around
 * the whole ring would not.
 */
function RestRing({
  fraction,
  drainMs,
  drainKey,
  color,
  children,
}: {
  fraction: number;
  drainMs: number | null;
  drainKey: string | number | null;
  color: string;
  children: ReactNode;
}) {
  const motionScale = useMotionScale();
  const clamped = Math.min(1, Math.max(0, fraction));
  const v = useRef(new Animated.Value(clamped)).current;
  const latest = useRef(clamped);
  latest.current = clamped;

  useEffect(() => {
    v.setValue(latest.current);
    if (motionScale === 0 || drainMs == null) return undefined;
    const run = Animated.timing(v, {
      toValue: 0,
      duration: Math.max(0, drainMs),
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
    // Keyed on the deadline — see `TimerPill`'s `DrainLine`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drainKey, drainMs == null, motionScale]);

  useEffect(() => {
    if (motionScale === 0 || drainMs == null) v.setValue(clamped);
  }, [clamped, drainMs, motionScale, v]);

  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] });

  return (
    <View style={{ width: RING, height: RING }} className="items-center justify-center">
      <Svg
        width={RING}
        height={RING}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          fill="none"
          stroke={palette.greenDim}
          strokeWidth={RING_STROKE}
        />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeOpacity={0.16}
          strokeWidth={RING_STROKE + 12}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
        />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
        />
      </Svg>
      <View className="items-center">{children}</View>
    </View>
  );
}

/**
 * One of the four controls under the ring: 48 high, outlined, and `Skip` lit.
 * Sinks to 0.9 under the finger.
 */
function RestControl({
  label,
  icon,
  lit = false,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  icon?: 'play' | 'pause';
  lit?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const press = usePressScale(0.9);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={{
          height: 48,
          minWidth: 48,
          paddingHorizontal: icon ? 0 : lit ? 22 : 20,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: lit ? 'rgba(63,169,108,0.3)' : palette.hairline,
          backgroundColor: lit ? 'rgba(63,169,108,0.12)' : 'rgba(236,241,238,0.03)',
          transform: press.style.transform,
        }}
      >
        {icon ? <Icon name={icon} size={18} color={palette.ink} /> : null}
        {label ? (
          <Text
            allowFontScaling={false}
            style={{ fontSize: 15, color: lit ? palette.greenBright : palette.inkMuted }}
            className={lit ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}
          >
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Up next — where you are walking to, and what you will do when you get there.
 *
 * A glass card that rises from the bottom a beat after the ring. The kicker says
 * `UP NEXT · NEW MACHINE` when the next set is in a different exercise — derived
 * from the two sets themselves (`focusPlan.isNewExercise`), so it is true
 * whenever it is on screen. The name RUNS; the numbers are one line, `60 kg × 8
 * reps`, because on this screen they are a statement and not the instruction.
 * Tapping it opens the same ± the work view has, on the set it describes.
 */
function UpNextCard({
  target,
  unitSystem,
  isNewExercise,
  isOpen,
  onPress,
}: {
  target: FocusTarget;
  unitSystem: UnitSystem;
  isNewExercise: boolean;
  isOpen: boolean;
  onPress?: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const { exercise } = target.entry;
  const count = showsMaxLabel(exercise, target.set)
    ? maxLabel(lang)
    : `${formatCount(target.set.count, exercise.countUnit)} ${countUnitLabel(exercise.countUnit, lang).toLowerCase()}`;
  const numbers = exercise.requiresWeight
    ? `${formatWeight(target.set.weightKg, unitSystem, exercise.loadMode)} ${unitLabel(unitSystem, lang)} × ${count}`
    : count;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { expanded: isOpen } : undefined}
      accessibilityLabel={`${isNewExercise ? t('Up next, new machine') : t('Up next')}: ${exercise.name}, ${numbers}`}
      style={{
        marginHorizontal: 16,
        paddingVertical: 18,
        paddingHorizontal: 20,
        borderRadius: radius.hero,
        backgroundColor: 'rgba(236,241,238,0.055)',
        borderWidth: 1,
        borderColor: 'rgba(236,241,238,0.06)',
        boxShadow: [...elevation.e2],
      }}
    >
      <View className="flex-row items-center">
        <Text
          numberOfLines={1}
          className="flex-1 text-micro font-semibold uppercase text-green-bright"
        >
          {isNewExercise ? `${t('Up next')} · ${t('new machine')}` : t('Up next')}
        </Text>
        {onPress ? (
          <Text allowFontScaling={false} className="ml-md text-title text-ink-faint">
            {isOpen ? '×' : '±'}
          </Text>
        ) : null}
      </View>
      <RunningText
        text={exercise.name}
        fadeColor="#121615"
        containerStyle={{ marginTop: 6 }}
        allowFontScaling={false}
        style={{ fontSize: 20, lineHeight: 26 }}
        className="font-medium text-ink"
      />
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{ fontSize: 28, lineHeight: 34 }}
        className="mt-xs font-semibold tabular-nums text-ink"
      >
        {numbers}
      </Text>
    </Pressable>
  );
}
