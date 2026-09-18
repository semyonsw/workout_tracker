/**
 * FocusNumbers — what to load and how many, at the size the clock is read at.
 *
 *   ╭──────────────────────────────╮
 *   │  32 KG                       │   ← 96 dp of numeral, 29 of unit
 *   │  5 REPS                      │
 *   ╰──────────────────────────────╯
 *
 * ── WHY TWO LINES ───────────────────────────────────────────────────────────
 *
 * This was `+32 KG × 5 REPS` on one line at 56 dp, and 56 was not a design choice
 * so much as the largest size the WORST line could take: `+120 kg × 12 reps` was
 * already within 14 dp of the gutter (`tailwind.config.js` says so, in the
 * comment on `focus-work`). So the number you read between every pair of sets was
 * being held down by a set almost nobody does, and the whole point of focus mode
 * is that the phone is on the floor or on a bench and you are two metres from it
 * when the rest ends.
 *
 * Stacked, each number gets the whole width, and the size stops being a constant:
 * `lib/focusType.ts` works out the biggest one that still fits both lines, which
 * on an ordinary set is around the countdown's own 120 and on `+120 KG × 12` comes
 * down on its own rather than clipping. The `×` goes with the line break — two
 * facts on two lines do not need a multiplication sign to say they belong to one
 * set, and it was costing an em of the width at the size that matters.
 *
 * ── AND THEY ARE GREEN ONLY WHILE THEY ARE THE INSTRUCTION ──────────────────
 *
 * `tone` is the app's existing rule and not a decoration: green and glowing while
 * this is the set you are about to do, `ink` once it is a statement of what is
 * coming after a rest that is still running. Same numbers, same size, different
 * claim on you.
 */

import { Text, View } from 'react-native';

import { workNumeralSize, UNIT_RATIO, type WorkLine } from '../lib/focusType';
import { maxLabel, showsMaxLabel } from '../lib/maxReps';
import { countUnitLabel, formatCount, formatWeight, unitLabel } from '../lib/units';
import { useLanguage } from '../hooks/useT';
import type { Language } from '../lib/i18n';
import type { FocusTarget } from '../lib/focusPlan';
import { focusGlow, palette } from '../theme/tokens';
import type { UnitSystem } from '../types/models';

/**
 * The lines one set is drawn as: the load, then the count. A bodyweight exercise
 * has no weight line at all — the same absence `SetRow` and `FocusNudge` give it,
 * rather than a dash standing in for a number nobody entered.
 */
export function workLines(target: FocusTarget, unitSystem: UnitSystem, lang: Language): WorkLine[] {
  const { exercise } = target.entry;
  const lines: WorkLine[] = [];
  if (exercise.requiresWeight) {
    lines.push({
      value: formatWeight(target.set.weightKg, unitSystem, exercise.loadMode),
      unit: unitLabel(unitSystem, lang).toUpperCase(),
    });
  }
  /*
   * `MAX` IS A LINE OF ITS OWN WORD, not a number with a unit after it. The set
   * has no rep target and the counter has not started, so the biggest thing on
   * the screen says the only thing that is true about it. The moment a rep is
   * counted it becomes the count, like any other set. See `lib/maxReps.ts`.
   */
  if (showsMaxLabel(exercise, target.set)) {
    lines.push({ value: maxLabel(lang).toUpperCase(), unit: '' });
    return lines;
  }

  lines.push({
    value: formatCount(target.set.count, exercise.countUnit),
    unit: countUnitLabel(exercise.countUnit, lang).toUpperCase(),
  });
  return lines;
}

export function FocusNumbers({
  target,
  unitSystem,
  tone,
  ceiling,
  width,
}: {
  target: FocusTarget;
  unitSystem: UnitSystem;
  /** `work` is the instruction — green, glowing. `fact` is what is coming. */
  tone: 'work' | 'fact';
  /** The largest size this state will allow, before the width has its say. */
  ceiling: number;
  /** What the numbers have to themselves, in dp. Gutters already taken off. */
  width: number;
}) {
  const lang = useLanguage();
  const lines = workLines(target, unitSystem, lang);
  const size = workNumeralSize(lines, width, ceiling);
  const unitSize = Math.round(size * UNIT_RATIO);
  const work = tone === 'work';

  return (
    <View>
      {lines.map((line) => (
        <View key={line.unit + line.value} className="flex-row items-baseline">
          <Text
            /*
             * `allowFontScaling={false}`, for the reason the clock gives: this is
             * already sized to the width it has, and an OS scale on top of that
             * pushes the one number the screen exists for past the edge.
             */
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              {
                fontSize: size,
                // Tighter than the size, as every large step in the scale is: two
                // lines at full leading read as two separate facts.
                lineHeight: Math.round(size * 1.04),
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
                letterSpacing: -size * 0.03,
                color: work ? palette.greenBright : palette.ink,
              },
              work ? focusGlow : null,
            ]}
          >
            {line.value}
          </Text>
          {line.unit === '' ? null : (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{
                fontSize: unitSize,
                fontWeight: '600',
                marginLeft: Math.round(size * 0.1),
                color: work ? palette.green : palette.inkMuted,
              }}
            >
              {line.unit}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
