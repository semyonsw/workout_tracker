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

import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { formatChartDate } from '../lib/units';
import type { TrendPoint } from '../lib/trends';
import { palette } from '../theme/tokens';

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
  const y = (value: number) =>
    PLOT_BOTTOM - ((value - floor) / span) * (PLOT_BOTTOM - PLOT_TOP);

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

        <Polyline
          points={polyline}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hollow dots for history, one solid dot for the latest session — the
            only point that is still a live fact rather than a record. */}
        {points.map((point, index) =>
          index === lastIndex ? (
            <Circle
              key={`${point.at}-${index}`}
              cx={x(index)}
              cy={y(point.value)}
              r={4}
              fill={palette.greenBright}
            />
          ) : (
            <Circle
              key={`${point.at}-${index}`}
              cx={x(index)}
              cy={y(point.value)}
              r={3}
              fill={palette.bg}
              stroke={palette.greenBright}
              strokeWidth={2}
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
