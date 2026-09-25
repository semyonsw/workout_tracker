/**
 * FinishSheet — the end of a workout, stated, and the one question worth asking
 * on the way out.
 *
 *   ╭────────────────────────────────────────────╮
 *   │                   ▬▬▬▬                     │
 *   │ SESSION COMPLETE                           │
 *   │ Workout 92                                 │
 *   │ ╭ MINUTES ╮ ╭ SETS    ╮ ╭ KG MOVED ╮       │  ← roll up from 0
 *   │ │ 68      │ │ 17      │ │ 6,240    │       │
 *   │ 7 sets are still unlogged. They won't be   │
 *   │ saved.                                     │
 *   │ HOW DID THAT GO                            │
 *   │ ( Easy | ▓Right▓ | Brutal )                │  ← the thumb slides
 *   │ ╭──────────── Save workout ────────────╮   │
 *   │               Keep going                   │
 *   ╰────────────────────────────────────────────╯
 *
 * ── THE MOTION PASS MADE IT A MOMENT ──────────────────────────────────────
 *
 * It slides up over a scrim that fades in, and the three numbers ROLL UP FROM
 * ZERO a beat after it lands (`revealStats`, 80 ms): minutes, sets and the volume,
 * the last one lit because it is the one that grows session over session. None
 * of it is decoration over a delay — the Save button is live from the first frame,
 * and a thumb that already knows where it is going is never made to wait for a
 * number to finish rolling.
 *
 * A sheet, not a dialog, for one reason: both buttons have to stay in the bottom
 * third where the thumb already is. A centred dialog puts the destructive option
 * in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button they press after every workout.
 *
 * ── THE PLAN OFFER ──────────────────────────────────────────────────────────
 *
 * When the sets you actually did disagree with what the routine plans, one extra
 * button writes the real number back. It is derived from what you did, not typed
 * into a form, which is this app's whole idiom for a plan — the same idiom as a
 * prefill coming from last session.
 *
 * Four things it is not:
 *
 *  • NOT AUTOMATIC. A routine is a template, and quietly rewriting it because
 *    somebody did an extra set on a good day is the app deciding what the plan is.
 *  • NOT A NAG. Declining is `Finish`, the button that was already there. There is
 *    no second ask, and the offer does not come back for this session.
 *  • NOT CONGRATULATIONS. "Dips did 5 sets, not 4" is the whole sentence. Five is
 *    not better than four, it is what happened.
 *  • NOT FOR A ONE-OFF SESSION. Only a workout that came from a routine has a plan
 *    to update, and an exercise added mid-session has no routine item — deciding to
 *    do neck work halfway through pull day says something about today.
 *    `plannedSetDiff` is where all of that is decided and tested.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { useT, type Translate } from '../hooks/useT';
import { formatValue } from '../lib/money';
import { curve, motion, palette, radius } from '../theme/tokens';
import { COMMIT_GRADIENT, SpecularEdge } from './glass';
import { Kicker, PrimaryButton } from './primitives';
import { RollingNumber } from './RollingNumber';
import { SlidingThumb } from './SlidingThumb';
import { LinearGradient } from 'expo-linear-gradient';
import type { SessionEffort } from '../types/models';

/**
 * The three answers, in the order they run from easy to hard.
 *
 * `Right` in the middle rather than "Moderate" or "OK": the useful reading of a
 * session is whether it was pitched correctly, and "right" is the word a lifter
 * actually uses for a day that went to plan.
 */
const EFFORT_CHOICES: readonly SessionEffort[] = ['easy', 'right', 'hard'];

/**
 * A function rather than a constant, because the labels are translated: a
 * module-level record would be frozen in whichever language the app started in.
 */
function effortLabels(t: Translate): Record<SessionEffort, string> {
  return {
    easy: t('Easy'),
    right: t('Right'),
    hard: t('Brutal'),
  };
}

interface FinishSheetProps {
  /** Sets the user planned but never logged. Drives the whole copy. */
  unloggedCount: number;
  loggedCount: number;
  /**
   * "Dips did 5 sets, not 4" — the one line, or null when the session matched the
   * plan (or had no plan). Null hides the whole offer, button included.
   */
  planChange: string | null;
  /**
   * "Wide pull-ups · new max 17 · 17 + 10 + 9 + 8 + 7 next time" — what the
   * ladders in this session earned, or null when none of them moved.
   *
   * A STATEMENT, not an offer, and that is the difference between it and
   * `planChange` directly above. A routine is a template the user wrote, so
   * rewriting it is a question. A ladder is a progression they switched on so that
   * it would move without being asked — see `ladderOutcomes`. It gets a line
   * because being pushed one rep further is the whole feature and the user should
   * see the number that did it, not because there is anything to decide.
   */
  ladderChange: string | null;
  /**
   * HOW IT FELT, and the answer already given if the sheet has been here before.
   *
   * One tap, three choices, and skipping it is pressing the button that was already
   * there — which is the whole reason it can live on this sheet at all. `SessionEffort`
   * has the argument for why this exists when per-set RPE deliberately does not.
   */
  effort?: SessionEffort;
  onSetEffort?: (effort: SessionEffort) => void;
  onConfirm: () => void;
  /** Finish, and write the session's set counts back to the routine. */
  onConfirmAndUpdatePlan: () => void;
  onDismiss: () => void;
  /** What this workout will be saved as. Null titles the sheet without a number. */
  workoutNumber?: number | null;
  /** Minutes since the start, or null for a session that never started. */
  minutes?: number | null;
  /** Kilograms moved in the working sets — `sessionVolume`. */
  volumeKg?: number;
}

export function FinishSheet({
  unloggedCount,
  loggedCount,
  planChange,
  ladderChange,
  effort,
  onSetEffort,
  onConfirm,
  onConfirmAndUpdatePlan,
  onDismiss,
  workoutNumber = null,
  minutes = null,
  volumeKg = 0,
}: FinishSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const motionScale = useMotionScale();
  const efforts = effortLabels(t);

  /* The sheet rises over a scrim that fades; `motion.sheet` on the base curve. */
  const scrim = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(motionScale === 0 ? 0 : height)).current;
  /** Flips 80 ms after mount, so the numbers roll UP rather than simply appear. */
  const [revealStats, setRevealStats] = useState(motionScale === 0);
  useEffect(() => {
    Animated.parallel([
      Animated.timing(scrim, {
        toValue: 1,
        duration: 260 * motionScale,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: motion.sheet * motionScale,
        easing: curve(motion.ease),
        useNativeDriver: true,
      }),
    ]).start();
    const reveal = setTimeout(() => setRevealStats(true), 80 * motionScale);
    return () => clearTimeout(reveal);
    // Mount only: the sheet arrives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [trackWidth, setTrackWidth] = useState(0);
  const effortIndex = effort ? EFFORT_CHOICES.indexOf(effort) : null;

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      {/* Scrim. Tapping it is the same as "Keep going": the safe option is
          always the easy one, even when the easy one is a mis-tap. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: palette.scrim,
          opacity: scrim,
        }}
      >
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('Keep going')}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          borderTopLeftRadius: radius.hero,
          borderTopRightRadius: radius.hero,
          backgroundColor: palette.surface,
          borderTopWidth: 1,
          borderTopColor: 'rgba(236,241,238,0.08)',
          boxShadow: [{ offsetX: 0, offsetY: -20, blurRadius: 50, color: 'rgba(0,0,0,0.6)' }],
          transform: [{ translateY: rise }],
        }}
      >
        <View className="mb-[18px] h-[4px] w-[36px] self-center rounded-pill bg-hairline" />
        <Kicker tone="green">{t('Session complete')}</Kicker>
        <Text
          allowFontScaling={false}
          style={{ fontSize: 30, lineHeight: 34, letterSpacing: -0.9 }}
          className="mt-[6px] font-semibold text-ink"
        >
          {workoutNumber != null
            ? t('Workout {number}', { number: workoutNumber })
            : t('Finish workout?')}
        </Text>

        {/* The three facts of the session, rolling up from zero. The last one is
            lit: it is the number that grows workout over workout. */}
        <View className="mt-[18px] flex-row" style={{ gap: 8 }}>
          <StatTile
            label={t('Minutes')}
            value={revealStats ? String(Math.max(0, minutes ?? 0)) : '0'}
            duration={900}
          />
          <StatTile
            label={t('Sets')}
            value={revealStats ? String(loggedCount) : '0'}
            duration={900}
          />
          <StatTile
            label={t('Kg moved')}
            value={revealStats ? formatValue(volumeKg) : '0'}
            duration={1100}
            lit
          />
        </View>

        {/* Only when there is something to lose. A session with everything logged
            is on this sheet to be saved, and telling it "0 sets are still
            unlogged" would be the sheet reading out a zero. */}
        {unloggedCount > 0 ? (
          <Text className="mt-lg text-body tabular-nums text-ink-muted">
            {t('{count} still unlogged. They won’t be saved.', {
              count:
                unloggedCount === 1
                  ? t('{count} set is', { count: unloggedCount })
                  : t('{count} sets are', { count: unloggedCount }),
            })}
          </Text>
        ) : null}

        {/* What the ladder did. Green, because it is the one thing on this sheet
            that is progressive overload — the app's single meaning for colour. */}
        {ladderChange ? (
          <Text className="mt-lg text-body tabular-nums text-green-bright">{ladderChange}</Text>
        ) : null}

        {/* The fact, then the button that acts on it. Stated above the buttons
            rather than inside one, because it is a sentence about the session and
            the button is a choice about the routine. */}
        {planChange ? (
          <Text className="mt-lg text-body tabular-nums text-ink">{planChange}</Text>
        ) : null}

        {/*
          HOW DID THAT GO — above the buttons, because it is about the session and
          the buttons are about what to do with it.

          One track, three words, and a green thumb that SLIDES to the answer.
          Nothing is preselected — an answer the user did not give must not be
          recorded, so the thumb is not drawn until there is one — and tapping the
          selected word again takes it back, which is why there is no fourth
          segment reading `Skip`.
        */}
        {onSetEffort ? (
          <>
            <Kicker tone={effort ? 'green' : 'faint'} className="mt-[20px]">
              {t('How did that go')}
            </Kicker>
            <View
              accessibilityRole="radiogroup"
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              style={{
                marginTop: 8,
                height: 44,
                flexDirection: 'row',
                padding: 4,
                borderRadius: radius.pill,
                backgroundColor: 'rgba(236,241,238,0.03)',
                borderWidth: 1,
                borderColor: palette.hairline,
              }}
            >
              <SlidingThumb
                index={effortIndex}
                count={EFFORT_CHOICES.length}
                trackWidth={trackWidth - 2}
                duration={320}
                bezier={[0.34, 1.3, 0.64, 1]}
                style={{
                  borderRadius: radius.pill,
                  backgroundColor: palette.green,
                  boxShadow: [
                    { offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.3)' },
                  ],
                }}
              />
              {EFFORT_CHOICES.map((choice) => {
                const selected = effort === choice;
                return (
                  <Pressable
                    key={choice}
                    onPress={() => onSetEffort(choice)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={efforts[choice]}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text
                      allowFontScaling={false}
                      style={{ fontSize: 13 }}
                      className={selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}
                    >
                      {efforts[choice]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <View className="mt-[20px]">
          {planChange ? (
            <>
              <PrimaryButton
                label={t('Finish and update the plan')}
                onPress={onConfirmAndUpdatePlan}
              />
              <View className="h-sm" />
              <PrimaryButton label={t('Save workout')} variant="ghost" onPress={onConfirm} />
            </>
          ) : (
            /* Demoted to ghost above when there are two ways to finish, so the two
               are not one mis-tap apart at the same weight. Neither is
               destructive: both save the workout, and only one also touches the
               routine. */
            <SaveButton label={t('Save workout')} onPress={onConfirm} />
          )}
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('Keep going')}
            className="mt-xs h-[48px] items-center justify-center"
          >
            <Text className="text-label font-medium text-ink-muted">{t('Keep going')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

/** One of the three numbers. `lit` is the volume — see the sheet. */
function StatTile({
  label,
  value,
  duration,
  lit = false,
}: {
  label: string;
  value: string;
  duration: number;
  lit?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        padding: 14,
        borderRadius: radius.row,
        borderWidth: 1,
        backgroundColor: lit ? 'rgba(63,169,108,0.13)' : 'rgba(236,241,238,0.055)',
        borderColor: lit ? 'rgba(63,169,108,0.3)' : 'rgba(236,241,238,0.06)',
      }}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{ fontSize: 10, letterSpacing: 1.1 }}
        className={['font-semibold uppercase', lit ? 'text-green-bright' : 'text-ink-faint'].join(
          ' ',
        )}
      >
        {label}
      </Text>
      <RollingNumber
        value={value}
        lineHeight={30}
        duration={duration}
        containerStyle={{ marginTop: 6 }}
        style={{ fontSize: 26 }}
        className={['font-semibold', lit ? 'text-green-bright' : 'text-ink'].join(' ')}
      />
    </View>
  );
}

/** `Save workout` — 56 high, the commit gradient, the heavy specular. */
function SaveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    /* The glow on a wrapper: `overflow: hidden` on the pill itself would cut it
       off — the same nesting `GlassSurface` uses, for the same reason. */
    <View
      style={{
        borderRadius: radius.pill,
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(63,169,108,0.35)' }],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          height: 56,
          borderRadius: radius.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient
          colors={[...COMMIT_GRADIENT]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SpecularEdge color="rgba(236,241,238,0.22)" radius={radius.pill} height={2} />
        <Text allowFontScaling={false} className="text-body font-semibold text-ink">
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
