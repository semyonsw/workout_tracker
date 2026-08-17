/**
 * OverloadNudge — the app's one tinted surface.
 *
 *   ╭────────────────────────────────────────────────╮
 *   │ ↗  SAME +25 KG FOR 23 DAYS · 5 SESSIONS        │
 *   │    Try 27.5 kg                     [ Use ]  ×  │
 *   ╰────────────────────────────────────────────────╯
 *
 * Tone rules, because a nudge that nags is a nudge that gets ignored:
 *   • It states a FACT first ("same weight, 23 days, 5 sessions"), then a
 *     suggestion. No exclamation marks, no "You've plateaued!", no trophies.
 *   • `Use` rewrites every remaining set of the exercise to the suggested
 *     weight in one tap. `×` dismisses it for the session, green dot and all.
 *   • It renders only for `due_*` verdicts. `building` / `progressing` /
 *     `regressing` produce no UI at all — silence is the default state.
 *
 * No border: `green-wash` against `bg` is a quiet enough step on its own, and a
 * hairline would make an advisory card look like a control.
 */

import { Pressable, Text, View } from 'react-native';

import { commit } from '../lib/feedback';
import type { OverloadVerdict } from '../lib/progressiveOverload';
import type { LoadMode, UnitSystem } from '../types/models';
import { formatWeight, unitLabel } from '../lib/units';
import { palette } from '../theme/tokens';
import { Icon } from './Icon';

interface OverloadNudgeProps {
  verdict: OverloadVerdict;
  unitSystem: UnitSystem;
  loadMode: LoadMode;
  /** True once accepted or dismissed this session — hides the nudge. */
  resolved: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function OverloadNudge({
  verdict,
  unitSystem,
  loadMode,
  resolved,
  onAccept,
  onDismiss,
}: OverloadNudgeProps) {
  if (!verdict.shouldNudge || resolved) return null;

  const isWeightNudge = verdict.status === 'due_weight';

  const fact = `Same ${formatWeight(verdict.currentWeightKg, unitSystem, loadMode)} ${unitLabel(
    unitSystem,
  )} for ${verdict.plateauDays} days · ${verdict.sessionsAtWeight} sessions`;

  const suggestion = isWeightNudge
    ? `Try ${formatWeight(verdict.suggestedWeightKg, unitSystem, loadMode)} ${unitLabel(unitSystem)}`
    : `Try ${verdict.suggestedReps} reps at the same weight`;

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
