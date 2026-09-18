/**
 * StreakFlame — how many days in a row, at one of three temperatures.
 *
 *   <7      ( 🜂 3 )    ink at 4%, muted text — a run, not yet a habit
 *   ≥7      ( 🜂 12 )   green at 12%, a thin halo — a week is the first threshold
 *   ≥21     ( 🜂 34 )   green at 20%, a wide halo, AND IT BREATHES
 *
 * ── WHY THREE STEPS AND NOT A GRADIENT ────────────────────────────────────
 *
 * A continuous ramp from day 1 to day 100 is a colour nobody can read a value
 * off. Three states are three sentences — "you have started", "this is a week",
 * "this is a habit" — and the thresholds are the ones people already use for
 * themselves. The count is written on it either way, so the temperature is
 * emphasis and never the only carrier of the number.
 *
 * The breathing at 21 is the only infinite animation in a list row anywhere in
 * this app, and it is deliberately hard to earn: `scale`, native-driven, on one
 * badge, and only once somebody has done a thing every day for three weeks.
 *
 * ── IT IS ABSENT, NOT ZERO ────────────────────────────────────────────────
 *
 * At streak 0 nothing is drawn. A badge reading `0` on eleven rows is a column
 * of failure reports on a screen whose entire argument (`lib/tasks.ts`) is that
 * a habit list which can only report failure is one people stop answering.
 * Excused days are the same: the streak is KEPT, so the badge is simply not the
 * thing that day's row is about.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { Icon } from './Icon';
import { palette, radius } from '../theme/tokens';

/** A week, and three weeks. The two numbers this badge is a function of. */
const WARM = 7;
const HOT = 21;

export function StreakFlame({ streak }: { streak: number }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const hot = streak >= HOT;
  const warm = streak >= WARM;

  useEffect(() => {
    if (!hot) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, hot]);

  if (streak < 1) return null;

  return (
    <View
      style={{
        height: 26,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 7,
        paddingRight: 9,
        borderRadius: radius.pill,
        borderWidth: warm ? 1 : 0,
        borderColor: hot ? 'rgba(63,169,108,0.42)' : 'rgba(63,169,108,0.24)',
        backgroundColor: hot
          ? 'rgba(63,169,108,0.20)'
          : warm
            ? 'rgba(63,169,108,0.12)'
            : 'rgba(236,241,238,0.04)',
        ...(hot
          ? {
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 18, color: 'rgba(63,169,108,0.55)' },
              ],
            }
          : warm
            ? {
                boxShadow: [
                  { offsetX: 0, offsetY: 0, blurRadius: 9, color: 'rgba(63,169,108,0.30)' },
                ],
              }
            : {}),
      }}
    >
      <Animated.View
        style={{
          marginRight: 4,
          transform: [
            { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
          ],
        }}
      >
        <Icon name="flame" size={13} color={warm ? palette.greenBright : palette.inkMuted} />
      </Animated.View>
      <Text
        allowFontScaling={false}
        style={{ fontSize: 12, color: warm ? palette.greenBright : palette.inkMuted }}
        className="font-semibold tabular-nums"
      >
        {streak}
      </Text>
    </View>
  );
}
