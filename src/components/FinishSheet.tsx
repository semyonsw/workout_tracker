/**
 * FinishSheet — "you have unlogged sets, are you sure", and the one question
 * worth asking on the way out.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Finish workout?                            │
 *   │ 7 sets are still unlogged. They won't be   │
 *   │ saved.                                     │
 *   │                                            │
 *   │ Dips did 5 sets, not 4.                    │
 *   │ ╭─────── Finish and update the plan ────╮  │
 *   │ ╭────────── Finish · 11 sets ───────────╮  │
 *   │ ╰────────────── Keep going ─────────────╯  │
 *   ╰────────────────────────────────────────────╯
 *
 * A sheet, not a dialog, for one reason: both buttons have to stay in the bottom
 * third where the thumb already is. A centred dialog puts the destructive option
 * in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button they press after every workout.
 *
 * ── THE PLAN OFFER ──────────────────────────────────────────────────────────
 *
 * When the sets you actually did disagree with what the routine plans, one extra
 * button writes the real number back. It is derived from what you did, not typed
 * into a form, which is this app's whole idiom for a plan — the same idiom as a
 * prefill coming from last session.
 *
 * Four things it is not:
 *
 *  • NOT AUTOMATIC. A routine is a template, and quietly rewriting it because
 *    somebody did an extra set on a good day is the app deciding what the plan is.
 *  • NOT A NAG. Declining is `Finish`, the button that was already there. There is
 *    no second ask, and the offer does not come back for this session.
 *  • NOT CONGRATULATIONS. "Dips did 5 sets, not 4" is the whole sentence. Five is
 *    not better than four, it is what happened.
 *  • NOT FOR A ONE-OFF SESSION. Only a workout that came from a routine has a plan
 *    to update, and an exercise added mid-session has no routine item — deciding to
 *    do neck work halfway through pull day says something about today.
 *    `plannedSetDiff` is where all of that is decided and tested.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme/tokens';
import { PrimaryButton } from './primitives';

interface FinishSheetProps {
  /** Sets the user planned but never logged. Drives the whole copy. */
  unloggedCount: number;
  loggedCount: number;
  /**
   * "Dips did 5 sets, not 4" — the one line, or null when the session matched the
   * plan (or had no plan). Null hides the whole offer, button included.
   */
  planChange: string | null;
  onConfirm: () => void;
  /** Finish, and write the session's set counts back to the routine. */
  onConfirmAndUpdatePlan: () => void;
  onDismiss: () => void;
}

export function FinishSheet({
  unloggedCount,
  loggedCount,
  planChange,
  onConfirm,
  onConfirmAndUpdatePlan,
  onDismiss,
}: FinishSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      {/* Scrim. Tapping it is the same as "Keep going": the safe option is
          always the easy one, even when the easy one is a mis-tap. */}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Keep going"
        className="flex-1"
        style={{ backgroundColor: palette.scrim }}
      />

      <View
        style={{ paddingBottom: insets.bottom + 16 }}
        className="rounded-t-surface border-t border-t-hairline bg-surface px-lg pt-xl"
      >
        <Text className="text-title font-medium text-ink">Finish workout?</Text>
        <Text className="mt-sm text-body tabular-nums text-ink-muted">
          {unloggedCount} {unloggedCount === 1 ? 'set is' : 'sets are'} still unlogged. They won't
          be saved.
        </Text>

        {/* The fact, then the button that acts on it. Stated above the buttons
            rather than inside one, because it is a sentence about the session and
            the button is a choice about the routine. */}
        {planChange ? (
          <Text className="mt-lg text-body tabular-nums text-ink">{planChange}</Text>
        ) : null}

        <View className="mt-xl">
          {planChange ? (
            <>
              <PrimaryButton label="Finish and update the plan" onPress={onConfirmAndUpdatePlan} />
              <View className="h-sm" />
            </>
          ) : null}
          <PrimaryButton
            label={`Finish · ${loggedCount} sets`}
            /* Demoted to ghost when there are two ways to finish, so the two are
               not one mis-tap apart at the same weight. Neither is destructive:
               both save the workout, and only one also touches the routine. */
            variant={planChange ? 'ghost' : 'primary'}
            onPress={onConfirm}
          />
          <View className="h-sm" />
          <PrimaryButton label="Keep going" variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
