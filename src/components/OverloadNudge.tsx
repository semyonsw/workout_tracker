/**
 * OverloadNudge — the app's one tinted surface.
 *
 *   ╭────────────────────────────────────────────────╮
 *   │ ↗  SAME +25 KG FOR 23 DAYS · 5 SESSIONS        │
 *   │    Try 27.5 kg                     [ Use ]  ×  │
 *   ╰────────────────────────────────────────────────╯
 *   ╭────────────────────────────────────────────────╮
 *   │ ↗  SAME 2:00 FOR 21 DAYS · 3 SESSIONS          │
 *   │    Try 2:15                        [ Use ]  ×  │
 *   ╰────────────────────────────────────────────────╯
 *
 * Tone rules, because a nudge that nags is a nudge that gets ignored:
 *   • It states a FACT first ("same weight, 23 days, 5 sessions"), then a
 *     suggestion. No exclamation marks, no "You've plateaued!", no trophies.
 *   • `Use` rewrites every remaining set of the exercise to the suggested
 *     weight in one tap. `×` dismisses it for the session, green dot and all.
 *   • It renders only for `due_*` verdicts. `building` / `progressing` /
 *     `regressing` produce no UI at all — silence is the default state.
 *   • A plank plateau reads exactly like a bench plateau, because it IS one:
 *     the engine judges the count where there is no weight, and this card names
 *     whichever axis the verdict is about. Time says "2:00", never "120".
 *
 * No border: `green-wash` against `bg` is a quiet enough step on its own, and a
 * hairline would make an advisory card look like a control.
 */

import { Pressable, Text, View } from 'react-native';

import { commit } from '../lib/feedback';
import { describeCount, type OverloadVerdict } from '../lib/progressiveOverload';
import type { CountUnit, LoadMode, UnitSystem } from '../types/models';
import { countUnitLabel, formatWeight, unitLabel } from '../lib/units';
import { palette } from '../theme/tokens';
import { Icon } from './Icon';

interface OverloadNudgeProps {
  verdict: OverloadVerdict;
  unitSystem: UnitSystem;
  loadMode: LoadMode;
  /** Needed to say "2:15" rather than "135" on an unweighted nudge. */
  countUnit: CountUnit;
  /** True once accepted or dismissed this session — hides the nudge. */
  resolved: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function OverloadNudge({
  verdict,
  unitSystem,
  loadMode,
  countUnit,
  resolved,
  onAccept,
  onDismiss,
}: OverloadNudgeProps) {
  if (!verdict.shouldNudge || resolved) return null;

  /*
   * WHICH AXIS, read off the data rather than off the status.
   *
   * `due_weight`, `due_reps` and `due_count` are three statuses and two
   * sentences: work with a weight names the weight, work without one names the
   * count. Branching on `currentWeightKg` keeps this component at two branches
   * however many `due_*` the engine grows — and a fourth status arriving would
   * otherwise have rendered "Same — kg for 21 days", which is what a status
   * branch does when it meets a case it was not told about.
   */
  const weighted = verdict.currentWeightKg != null;
  const held = weighted
    ? `${formatWeight(verdict.currentWeightKg, unitSystem, loadMode)} ${unitLabel(unitSystem)}`
    : describeCount(verdict.currentCount ?? 0, countUnit);

  const fact = `Same ${held} for ${verdict.plateauDays} days · ${verdict.sessionsInRun} sessions`;

  const suggestion =
    verdict.suggestedWeightKg != null
      ? `Try ${formatWeight(verdict.suggestedWeightKg, unitSystem, loadMode)} ${unitLabel(unitSystem)}`
      : weighted
        ? // Reps before weight: the load stays, the rep target moves.
          `Try ${verdict.suggestedCount} ${countUnitLabel(countUnit)} at the same weight`
        : `Try ${describeCount(verdict.suggestedCount ?? 0, countUnit)}`;

  const handleAccept = () => {
    commit();
    onAccept();
  };

  return (
    <View className="mx-lg mb-sm flex-row items-center rounded-surface bg-green-wash py-[14px] pl-lg pr-[14px]">
      <Icon name="trending-up" size={16} color={palette.greenBright} />

      <View className="ml-md flex-1">
        <Text className="text-micro font-semibold uppercase tabular-nums text-green-bright">
          {fact}
        </Text>
        <Text className="mt-xs text-body font-semibold tabular-nums text-ink">{suggestion}</Text>
      </View>

      <Pressable
        onPress={handleAccept}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${suggestion} — apply to every remaining set`}
        className="ml-md h-[36px] items-center justify-center rounded-pill bg-green px-lg"
      >
        <Text className="text-label font-semibold text-ink">Use</Text>
      </Pressable>

      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss suggestion"
        className="h-[36px] w-[28px] items-center justify-center"
      >
        <Icon name="x" size={14} color={palette.greenBright} />
      </Pressable>
    </View>
  );
}
