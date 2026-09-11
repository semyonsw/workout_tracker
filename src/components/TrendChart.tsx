/**
 * TrendChart — one line, three gridlines, no axes box. The app's only chart.
 *
 *   80 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄●━━●
 *                        ╱
 *   70 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄●╱
 *                 ╱
 *   60 ┄┄┄┄┄┄┄●╱
 *      ────────────────────────────
 *      11 JUN        9 JUL    8 AUG
 *
 * ONE POINT PER SESSION, whatever the series is — top working weight, reps in a
 * session, kilograms moved in a workout. Never per set: a real session ramps and
 * drops inside one exercise ("80 kg × 7, then 75 kg × 7 7 6"), so charting sets
 * draws a sawtooth and invents a plateau out of a warm-up. `lib/trends.ts` owns
 * every series this renders, which is why they all fit one component.
 *
 * The value axis is not forced to zero. This chart is read for DIRECTION — "is it
 * going up" — and a 75-to-80 kg climb against a zero baseline is a flat line. The
 * gridlines carry the actual numbers, so the scale is never a mystery.
 *
 * No fill gradient, no axes box, no second series. The gridlines are `green-dim`
 * because they are part of the same instrument as the line; the baseline is
 * `hairline` because it is structure, not data.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { formatChartDate } from '../lib/units';
import type { TrendPoint } from '../lib/trends';
import { palette } from '../theme/tokens';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Matches `FocusMode.tsx`'s `EASING`. */
const EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
/**
 * The dash a `strokeDashoffset` animation reveals the polyline through — the
 * same technique the design's `drawLine` keyframe uses. Not the line's actual
 * length: it only has to be longer than any path this fixed 342×160 box can
 * draw, so the offset can run the whole thing to 0 without a real measurement.
 */
const DRAW_LENGTH = 1000;

/** Rounded integers: right for reps, kilograms and plain counts. */
function defaultFormat(value: number): string {
  return String(Math.round(value));
}

/* Geometry from the design: a 342 × 160 box, plot area y 8–104, 34 wide gutter. */
const WIDTH = 342;
const HEIGHT = 160;
const GUTTER = 34;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 104;
const BASELINE_Y = 128;
const LABEL_Y = 150;

interface TrendChartProps {
  /** Oldest first, one point per session. Under two points nothing is drawn. */
  points: readonly TrendPoint[];
  /**
   * How a gridline's number reads — "80", "2:00", "4 720". Defaults to a rounded
   * integer, which is right for reps, kilograms and counts.
   */
  formatValue?: (value: number) => string;
}

export function TrendChart({ points, formatValue = defaultFormat }: TrendChartProps) {
  /*
   * Hooks run before the `points.length < 2` bail-out below, so a chart that
   * gains its second point mid-session still gets an entrance the first time it
   * actually draws.
   */
  const draw = useRef(new Animated.Value(0)).current;
  const dotAnims = useMemo(() => points.map(() => new Animated.Value(0)), [points]);

  useEffect(() => {
    if (points.length < 2) return;
    /*
     * JS-driven, not native: `strokeDashoffset` and an SVG `opacity` prop are
     * not transform/style properties the native animated module can patch, so
     * asking for `useNativeDriver: true` here throws rather than animates.
     */
    draw.setValue(0);
    Animated.timing(draw, {
      toValue: 1,
      duration: 900,
      easing: EASING,
      useNativeDriver: false,
    }).start();

    dotAnims.forEach((value, index) => {
      value.setValue(0);
      Animated.timing(value, {
        toValue: 1,
        duration: 260,
        delay: 500 + index * 90,
        easing: EASING,
        useNativeDriver: false,
      }).start();
    });
    // Runs once per mount and again only if the point count changes — see
    // `dotAnims`'s own memo above.
  }, [dotAnims, draw, points.length]);

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  /*
   * A flat run (every session the same number — exactly the case the nudge fires
   * on) would divide by zero and collapse the line onto one gridline. Give it a
   * nominal span so it draws as a level line mid-plot instead.
   */
  const span = max === min ? Math.max(max * 0.1, 1) : max - min;
  const floor = max === min ? min - span / 2 : min;

  const x = (index: number) =>
    GUTTER + 18 + (index * (WIDTH - GUTTER - 40)) / Math.max(1, points.length - 1);
  const y = (value: number) => PLOT_BOTTOM - ((value - floor) / span) * (PLOT_BOTTOM - PLOT_TOP);

  /* Three gridlines: the highest value, the lowest, and the midpoint. */
  const gridlines = [max, floor + span / 2, floor];

  const polyline = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const lastIndex = points.length - 1;

  // First, middle and last dates only — a label under every point would be a
  // wall of text, and the shape is what's being read, not the dates.
  const labelled = [0, Math.floor(lastIndex / 2), lastIndex].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {gridlines.map((value) => (
          <Line
            key={`grid-${value}`}
            x1={GUTTER}
            y1={y(value)}
            x2={WIDTH}
            y2={y(value)}
            stroke={palette.greenDim}
            strokeWidth={1}
          />
        ))}

        <Line
          x1={GUTTER}
          y1={BASELINE_Y}
          x2={WIDTH}
          y2={BASELINE_Y}
          stroke={palette.hairline}
          strokeWidth={1}
        />

        {gridlines.map((value) => (
          <SvgText
            key={`axis-${value}`}
            x={0}
            y={y(value) + 4}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {formatValue(value)}
          </SvgText>
        ))}

        <AnimatedPolyline
          points={polyline}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DRAW_LENGTH}
          strokeDashoffset={draw.interpolate({
            inputRange: [0, 1],
            outputRange: [DRAW_LENGTH, 0],
          })}
        />

        {/* Hollow dots for history, one solid dot for the latest session — the
            only point that is still a live fact rather than a record. Each pops
            in after the line reaches it, left to right. */}
        {points.map((point, index) =>
          index === lastIndex ? (
            <AnimatedCircle
              key={`${point.at}-${index}`}
              cx={x(index)}
              cy={y(point.value)}
              r={4}
              fill={palette.greenBright}
              opacity={dotAnims[index]}
            />
          ) : (
            <AnimatedCircle
              key={`${point.at}-${index}`}
              cx={x(index)}
              cy={y(point.value)}
              r={3}
              fill={palette.bg}
              stroke={palette.greenBright}
              strokeWidth={2}
              opacity={dotAnims[index]}
            />
          ),
        )}

        {labelled.map((index) => (
          <SvgText
            key={`label-${index}`}
            x={x(index)}
            y={LABEL_Y}
            textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {formatChartDate(points[index].at)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
