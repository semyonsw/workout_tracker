/**
 * Focus mode while a rest runs — the countdown, and the set it is counting for.
 *
 *   running          ╭──────────────────────────────────╮
 *                    │ BETWEEN SETS                     │
 *                    │ 2:30                             │
 *                    │▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░│
 *                    │  −15    +15     ⏸       Skip     │
 *                    ╰──────────────────────────────────╯
 *                            (the free space)
 *                    ╭ UP NEXT ─────────────────────────╮
 *                    │ Weighted 90° pull-ups            │
 *                    │ +32 KG × 5 REPS     SET 3 OF 4   │
 *                    ╰──────────────────────────────────╯
 *
 * Three of focus mode's six states live here, and all three are the same layout:
 *
 *   • RUNNING — the countdown owns the screen.
 *   • FINAL TEN SECONDS — the clock block inverts to a green slab and NOTHING ELSE
 *     MOVES. `pillTone(true)`, the app's one shadow, and in greyscale a jump from
 *     12% to 62% lightness: the biggest change on the screen, recognisable as
 *     colour alone from across a gym floor. The up-next block below it is
 *     untouched, because what you are about to do has not changed.
 *   • PAUSED — three signals, none of them colour alone. `PAUSED` replaces the
 *     rest's name, the numerals desaturate from green to `ink-muted`, and the
 *     drain freezes to its own track colour with a hairline at the head. A paused
 *     pill never inverts, exactly as on the session screen: the slab means "act
 *     now", and the point of a pause is that nothing is being demanded yet.
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

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Pressable } from './Pressable';

import type { DraftSet } from '../lib/draft';
import type { FocusPlan } from '../lib/focusPlan';
import { tap } from '../lib/feedback';
import { formatClock } from '../lib/units';
import type { RestTimerApi } from '../hooks/useRestTimer';
import { palette, space } from '../theme/tokens';
import { FocusClockBlock, FocusUpNext } from './FocusClock';
import { FocusNudge } from './FocusNudge';
import { Icon } from './Icon';
import { FINAL_SECONDS, pillTone, type PillTone } from './TimerPill';
import { restLabel } from './RestTimerPill';
import { useT } from '../hooks/useT';
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
  const { remaining, isPaused, source, totalSeconds, stepSeconds, add, pause, resume, skip } = rest;

  const finalTen = !isPaused && remaining <= FINAL_SECONDS;
  const tone = pillTone(finalTen);
  const secondsLeft = Math.ceil(remaining);

  /*
   * THE CLOCK SCALES UP INTO THE BOX THE NUMBERS JUST LEFT.
   *
   * The whole of the A → B transition, and the reason it is one line: the working
   * numbers and the countdown occupy the same optical band, so nothing has to
   * travel. The numbers go with the state change and the clock grows into their
   * place over the same 260 ms the flash takes — you look at one spot and the
   * answer has changed.
   *
   * On the value in a ref, not in state: this component re-renders four times a
   * second and an animation that restarted on every tick would be a clock that
   * never stops arriving.
   */
  const arrive = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(arrive, {
      toValue: 1,
      duration: 260,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [arrive]);

  return (
    <>
      <Animated.View
        /* `style`, not `className`: an animated node is a wrapper around a React
           Native component rather than one itself, and NativeWind's transform does
           not reach it. `space` is the same 4pt scale `tailwind.config.js` holds. */
        style={{
          marginTop: space.xl,
          opacity: arrive,
          transform: [
            { scale: arrive.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
          ],
        }}
      >
        <FocusClockBlock
          tone={tone}
          shadow={finalTen}
          label={restLabel(source, isPaused, t)}
          /* The only green left on a paused block, and the reason `PAUSED` reads
             as a state rather than as a stopped clock. */
          labelColor={isPaused ? palette.greenBright : undefined}
          value={formatClock(remaining)}
          accessibilityLabel={
            isPaused
              ? t('Rest paused with {seconds} seconds left', { seconds: secondsLeft })
              : t('{seconds} seconds of rest left', { seconds: secondsLeft })
          }
          remainingFraction={totalSeconds > 0 ? remaining / totalSeconds : 0}
          drainColor={isPaused ? palette.greenDim : undefined}
          drainHead={isPaused}
        >
          {/* Four cells of equal width, each a 56 dp target: 44 is the minimum
              for aim, 56 is the minimum for aim with a water bottle in the other
              hand. Minus before plus, the order every other ± in the app uses. */}
          <RestControl
            label={`−${stepSeconds}`}
            tone={tone}
            quiet
            onPress={() => add(-stepSeconds)}
            accessibilityLabel={t('Shorten {what} by {seconds} seconds', {
              what: restLabel(source, false, t),
              seconds: stepSeconds,
            })}
          />
          <RestControl
            label={`+${stepSeconds}`}
            tone={tone}
            quiet
            onPress={() => add(stepSeconds)}
            accessibilityLabel={t('Lengthen {what} by {seconds} seconds', {
              what: restLabel(source, false, t),
              seconds: stepSeconds,
            })}
          />
          <RestControl
            icon={isPaused ? 'play' : 'pause'}
            tone={tone}
            onPress={isPaused ? resume : pause}
            accessibilityLabel={isPaused ? t('Resume rest') : t('Pause rest')}
          />
          <RestControl
            label={t('Skip')}
            tone={tone}
            onPress={skip}
            accessibilityLabel={t('Skip rest')}
          />
        </FocusClockBlock>
      </Animated.View>

      {/* The clock is at the top and the work is at the bottom, with the free
          space between them: pressing DONE cleared the bottom of the screen, and
          this is what fills it — the thing your thumb was resting on is now the
          thing you read. */}
      <View className="flex-1" />

      {plan.current ? (
        <View className="mb-xl">
          <FocusUpNext
            target={plan.current}
            unitSystem={unitSystem}
            isNewExercise={plan.isNewExercise}
            previousName={plan.lastLogged?.entry.exercise.name ?? null}
            onPress={
              onPatch
                ? () => {
                    tap();
                    setNudgeOpen((open) => !open);
                  }
                : undefined
            }
            isOpen={nudgeOpen}
          />
          {/* Under the block rather than over the clock: the thing being changed
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
        </View>
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

/**
 * One of the four cells under the clock.
 *
 * `quiet` is the ± pair, which render in the tone's SECONDARY ink: they change a
 * setting, while `Skip` and the pause end or freeze the thing you are watching.
 * Two weights of the same colour, so the primary pair is findable without reading.
 */
function RestControl({
  label,
  icon,
  tone,
  quiet = false,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  icon?: 'play' | 'pause';
  tone: PillTone;
  quiet?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : null)}
      className="h-row flex-1 items-center justify-center"
    >
      {icon ? <Icon name={icon} size={22} color={tone.primary} /> : null}
      {label ? (
        <Text
          allowFontScaling={false}
          style={{ color: quiet ? tone.secondary : tone.primary }}
          className="text-title font-semibold tabular-nums"
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
