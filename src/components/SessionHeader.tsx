/**
 * SessionHeader — the bar across the top of a workout.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  Pull + swimming (tension on b░      #92   │  ← title runs, never wraps
 *   │    3 of 17 sets · 12:04                      │  ← the count rolls, the clock ticks
 *   │    ( Stop and exit )( Restart clock )        │
 *   │▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← 2 dp: the share of sets done
 *   └──────────────────────────────────────────────┘
 *
 * It replaced `ScreenHeader` on this one screen because a workout's header is an
 * INSTRUMENT, not a location: it says how far through you are three ways at once
 * — the count, the clock and a line along its bottom edge that fills as sets land
 * — and a generic header has no slot for the third, which is the one you read
 * without reading.
 *
 *   • THE TITLE RUNS (`RunningText`) instead of ellipsising, so two routines that
 *     differ at the end of their names can still be told apart mid-workout.
 *   • THE SET COUNT ROLLS, so a ✓ landing is visible up here as well as on the row.
 *   • THE CLOCK IS m:ss, ticking once a second in its own leaf component — the
 *     screen above it must not re-render every second for a number only this
 *     line shows.
 *   • `#92` is the workout this will be saved as, the same ordinal History shows.
 *   • THE PROGRESS LINE's width travels over 600 ms. Layout, so the JS driver: it
 *     changes once per ✓, which is the one pace at which that is free.
 *
 * The moving-a-card state keeps its words: `MOVING · PULL` in green where the
 * title was, and the position where the count was, with `Drop` in the corner.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { curve, motion, palette, radius } from '../theme/tokens';
import { GlassBar } from './glass';
import { Icon } from './Icon';
import { RollingPhrase } from './RollingNumber';
import { FADE_ON, RunningText } from './RunningText';
import { formatElapsed } from '../lib/units';

export function SessionHeader({
  title,
  done,
  total,
  startedAt,
  workoutNumber,
  onBack,
  moving,
  children,
}: {
  title: string;
  done: number;
  total: number;
  /** ISO start, or null while the workout has not been started. */
  startedAt: string | null;
  /** What this workout will be saved as. Null hides the pill. */
  workoutNumber: number | null;
  onBack?: () => void;
  /** A card is in the air: what to say instead, and the way to put it down. */
  moving?: { kicker: string; subtitle: string; onDrop: () => void; dropLabel: string };
  /** The session's own chips, under the two lines. */
  children?: ReactNode;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const fraction = total > 0 ? done / total : 0;

  return (
    <GlassBar style={{ paddingTop: insets.top }}>
      <View className="h-[60px] flex-row items-center pl-sm pr-md">
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          className="h-hit w-hit items-center justify-center"
        >
          {onBack ? <Icon name="chevron-left" size={22} color={palette.ink} /> : null}
        </Pressable>

        <View className="ml-[6px] flex-1" style={{ minWidth: 0 }}>
          {moving ? (
            <>
              <Text
                numberOfLines={1}
                className="text-micro font-semibold uppercase text-green-bright"
              >
                {moving.kicker}
              </Text>
              <Text className="mt-[2px] text-[12px] tabular-nums text-ink-muted">
                {moving.subtitle}
              </Text>
            </>
          ) : (
            <>
              <RunningText
                text={title}
                fadeColor={FADE_ON.bar}
                className="text-body font-semibold text-ink"
              />
              {startedAt ? (
                <View className="mt-[2px] flex-row items-center">
                  <RollingPhrase
                    template={t('{done} of {total} sets', { total })}
                    values={{ done }}
                    lineHeight={16}
                    duration={450}
                    className="text-[12px] text-ink-muted"
                  />
                  <Text
                    allowFontScaling={false}
                    style={{ lineHeight: 16 }}
                    className="text-[12px] tabular-nums text-ink-muted"
                  >
                    {' · '}
                  </Text>
                  <ElapsedClock startedAt={startedAt} />
                </View>
              ) : (
                <Text className="mt-[2px] text-[12px] tabular-nums text-ink-muted">
                  {t('{total} sets planned · not started', { total })}
                </Text>
              )}
            </>
          )}
        </View>

        {moving ? (
          <Pressable
            onPress={moving.onDrop}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={moving.dropLabel}
            className="h-[36px] items-center justify-center rounded-pill bg-green px-lg"
          >
            <Text className="text-label font-semibold text-ink">{moving.dropLabel}</Text>
          </Pressable>
        ) : workoutNumber != null ? (
          <View
            accessibilityLabel={t('Workout {number}', { number: workoutNumber })}
            style={{
              height: 28,
              paddingHorizontal: 10,
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: 'rgba(63,169,108,0.14)',
              borderWidth: 1,
              borderColor: 'rgba(63,169,108,0.3)',
            }}
          >
            <Text
              allowFontScaling={false}
              style={{ fontSize: 12 }}
              className="font-semibold tabular-nums text-green-bright"
            >
              {`#${workoutNumber}`}
            </Text>
          </View>
        ) : null}
      </View>

      {children ? <View className="pb-md pl-[60px] pr-md">{children}</View> : null}

      <ProgressLine fraction={fraction} />
    </GlassBar>
  );
}

/** The share of sets done, as a 2 dp line along the bar's bottom edge. */
function ProgressLine({ fraction }: { fraction: number }) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const width = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 600 * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, width]);

  return (
    <View style={{ height: 2, backgroundColor: 'rgba(21,69,44,0.6)' }}>
      <Animated.View
        style={{
          height: 2,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: palette.greenBright,
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(63,169,108,0.8)' }],
        }}
      />
    </View>
  );
}

/** `12:04`, or `1:12:04` past an hour. Ticks once a second, and only itself. */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text
      allowFontScaling={false}
      style={{ lineHeight: 16 }}
      className="text-[12px] tabular-nums text-ink-muted"
    >
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}
