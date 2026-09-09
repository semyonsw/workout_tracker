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

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import type { FocusPlan } from '../lib/focusPlan';
import { formatClock } from '../lib/units';
import type { RestTimerApi } from '../hooks/useRestTimer';
import { palette, space } from '../theme/tokens';
import { FocusClockBlock, FocusUpNext } from './FocusClock';
import { Icon } from './Icon';
import { FINAL_SECONDS, pillTone, type PillTone } from './TimerPill';
import { restLabel } from './RestTimerPill';
import type { UnitSystem } from '../types/models';

export function FocusRest({
  rest,
  plan,
  unitSystem,
}: {
  rest: RestTimerApi;
  plan: FocusPlan;
  unitSystem: UnitSystem;
}) {
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
          label={restLabel(source, isPaused)}
          /* The only green left on a paused block, and the reason `PAUSED` reads
             as a state rather than as a stopped clock. */
          labelColor={isPaused ? palette.greenBright : undefined}
          value={formatClock(remaining)}
          accessibilityLabel={
            isPaused
              ? `Rest paused with ${secondsLeft} seconds left`
              : `${secondsLeft} seconds of rest left`
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
            accessibilityLabel={`Shorten ${restLabel(source, false)} by ${stepSeconds} seconds`}
          />
          <RestControl
            label={`+${stepSeconds}`}
            tone={tone}
            quiet
            onPress={() => add(stepSeconds)}
            accessibilityLabel={`Lengthen ${restLabel(source, false)} by ${stepSeconds} seconds`}
          />
          <RestControl
            icon={isPaused ? 'play' : 'pause'}
            tone={tone}
            onPress={isPaused ? resume : pause}
            accessibilityLabel={isPaused ? 'Resume rest' : 'Pause rest'}
          />
          <RestControl label="Skip" tone={tone} onPress={skip} accessibilityLabel="Skip rest" />
        </FocusClockBlock>
      </Animated.View>

      {/* The clock is at the top and the work is at the bottom, with the free
          space between them: pressing DONE cleared the bottom of the screen, and
          this is what fills it — the thing your thumb was resting on is now the
          thing you read. */}
      <View className="flex-1" />

      {plan.current ? (
        <FocusUpNext
          target={plan.current}
          unitSystem={unitSystem}
          isNewExercise={plan.isNewExercise}
          previousName={plan.lastLogged?.entry.exercise.name ?? null}
        />
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
            every set logged
          </Text>
          <Text className="mt-xs text-title font-medium text-ink">Nothing left to rest for</Text>
          <Text className="mt-xs text-label text-ink-faint">
            skip the clock to finish the workout
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
