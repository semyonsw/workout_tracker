/**
 * TopWeightChart — one line, three gridlines, no axes box.
 *
 *   80 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄●━━●
 *                        ╱
 *   70 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄●╱
 *                 ╱
 *   60 ┄┄┄┄┄┄┄●╱
 *      ────────────────────────────
 *      11 JUN        9 JUL    8 AUG
 *
 * Plots TOP WORKING WEIGHT PER SESSION, never per set. Real sessions ramp and
 * drop inside one exercise ("80 kg × 7, then 75 kg × 7 7 6"); charting every set
 * would draw a sawtooth and fabricate a plateau out of a warm-up. One number per
 * session is the honest signal, and it is the same number the overload engine
 * judges — so the chart can never disagree with the nudge.
 *
 * No fill gradient, no axes box, no second series. The gridlines are `green-dim`
 * because they are part of the same instrument as the line; the baseline is
 * `hairline` because it is structure, not data.
 */

import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { formatChartDate } from '../lib/units';
import { palette } from '../theme/tokens';

export interface TopWeightPoint {
  /** ISO date of the session. */
  performedAt: string;
  topWeightKg: number;
}

/* Geometry from the design: a 342 × 160 box, plot area y 8–104, 34 wide gutter. */
const WIDTH = 342;
const HEIGHT = 160;
const GUTTER = 34;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 104;
const BASELINE_Y = 128;
const LABEL_Y = 150;

interface TopWeightChartProps {
  points: TopWeightPoint[];
}

export function TopWeightChart({ points }: TopWeightChartProps) {
  if (points.length < 2) return null;

  const weights = points.map((p) => p.topWeightKg);
  const max = Math.max(...weights);
  const min = Math.min(...weights);
  /*
   * A flat run (every session the same weight — exactly the case the nudge
   * fires on) would divide by zero and collapse the line onto one gridline.
   * Give it a nominal span so it draws as a level line mid-plot instead.
   */
  const span = max === min ? Math.max(max * 0.1, 1) : max - min;
  const floor = max === min ? min - span / 2 : min;

  const x = (index: number) =>
    GUTTER + 18 + (index * (WIDTH - GUTTER - 40)) / Math.max(1, points.length - 1);
  const y = (weight: number) => PLOT_BOTTOM - ((weight - floor) / span) * (PLOT_BOTTOM - PLOT_TOP);

  /* Three gridlines: the top weight, the bottom, and the midpoint. */
  const gridlines = [max, floor + span / 2, floor];

  const polyline = points.map((p, i) => `${x(i)},${y(p.topWeightKg)}`).join(' ');
  const lastIndex = points.length - 1;

  // First, middle and last dates only — a label under every point would be a
  // wall of text, and the shape is what's being read, not the dates.
  const labelled = [0, Math.floor(lastIndex / 2), lastIndex].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {gridlines.map((weight) => (
          <Line
            key={`grid-${weight}`}
            x1={GUTTER}
            y1={y(weight)}
            x2={WIDTH}
            y2={y(weight)}
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

        {gridlines.map((weight) => (
          <SvgText
            key={`axis-${weight}`}
            x={0}
            y={y(weight) + 4}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {String(Math.round(weight))}
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
              key={point.performedAt}
              cx={x(index)}
              cy={y(point.topWeightKg)}
              r={4}
              fill={palette.greenBright}
            />
          ) : (
            <Circle
              key={point.performedAt}
              cx={x(index)}
              cy={y(point.topWeightKg)}
              r={3}
              fill={palette.bg}
              stroke={palette.greenBright}
              strokeWidth={2}
            />
          ),
        )}

        {labelled.map((index) => (
          <SvgText
            key={`label-${points[index].performedAt}`}
            x={x(index)}
            y={LABEL_Y}
            textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
            fill={palette.inkFaint}
            fontSize={11}
            fontWeight="600"
            letterSpacing={1.1}
          >
            {formatChartDate(points[index].performedAt)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
