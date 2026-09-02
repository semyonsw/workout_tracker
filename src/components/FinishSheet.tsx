/**
 * FinishSheet — "you have unlogged sets, are you sure", and the one question
 * worth asking on the way out.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Finish workout?                            │
 *   │ 7 sets are still unlogged. They won't be   │
 *   │ saved.                                     │
 *   │                                            │
 *   │ Wide pull-ups · new max 17 ·               │
 *   │ 17 + 10 + 9 + 8 + 7 next time              │
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
import { Kicker, PrimaryButton, SelectChip } from './primitives';
import type { SessionEffort } from '../types/models';

/**
 * The three answers, in the order they run from easy to hard.
 *
 * `Right` in the middle rather than "Moderate" or "OK": the useful reading of a
 * session is whether it was pitched correctly, and "right" is the word a lifter
 * actually uses for a day that went to plan.
 */
const EFFORT_CHOICES: readonly SessionEffort[] = ['easy', 'right', 'hard'];

const EFFORT_LABELS: Record<SessionEffort, string> = {
  easy: 'Easy',
  right: 'Right',
  hard: 'Brutal',
};

interface FinishSheetProps {
  /** Sets the user planned but never logged. Drives the whole copy. */
  unloggedCount: number;
  loggedCount: number;
  /**
   * "Dips did 5 sets, not 4" — the one line, or null when the session matched the
   * plan (or had no plan). Null hides the whole offer, button included.
   */
  planChange: string | null;
  /**
   * "Wide pull-ups · new max 17 · 17 + 10 + 9 + 8 + 7 next time" — what the
   * ladders in this session earned, or null when none of them moved.
   *
   * A STATEMENT, not an offer, and that is the difference between it and
   * `planChange` directly above. A routine is a template the user wrote, so
   * rewriting it is a question. A ladder is a progression they switched on so that
   * it would move without being asked — see `ladderOutcomes`. It gets a line
   * because being pushed one rep further is the whole feature and the user should
   * see the number that did it, not because there is anything to decide.
   */
  ladderChange: string | null;
  /**
   * HOW IT FELT, and the answer already given if the sheet has been here before.
   *
   * One tap, three choices, and skipping it is pressing the button that was already
   * there — which is the whole reason it can live on this sheet at all. `SessionEffort`
   * has the argument for why this exists when per-set RPE deliberately does not.
   */
  effort?: SessionEffort;
  onSetEffort?: (effort: SessionEffort) => void;
  onConfirm: () => void;
  /** Finish, and write the session's set counts back to the routine. */
  onConfirmAndUpdatePlan: () => void;
  onDismiss: () => void;
}

export function FinishSheet({
  unloggedCount,
  loggedCount,
  planChange,
  ladderChange,
  effort,
  onSetEffort,
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
        {/* Only when there is something to lose. A session with everything logged
            is on this sheet for the ladder line below, and telling it "0 sets are
            still unlogged" would be the sheet reading out a zero. */}
        {unloggedCount > 0 ? (
          <Text className="mt-sm text-body tabular-nums text-ink-muted">
            {unloggedCount} {unloggedCount === 1 ? 'set is' : 'sets are'} still unlogged. They won't
            be saved.
          </Text>
        ) : null}

        {/* What the ladder did. Green, because it is the one thing on this sheet
            that is progressive overload — the app's single meaning for colour. */}
        {ladderChange ? (
          <Text className="mt-lg text-body tabular-nums text-green-bright">{ladderChange}</Text>
        ) : null}

        {/* The fact, then the button that acts on it. Stated above the buttons
            rather than inside one, because it is a sentence about the session and
            the button is a choice about the routine. */}
        {planChange ? (
          <Text className="mt-lg text-body tabular-nums text-ink">{planChange}</Text>
        ) : null}

        {/*
          HOW DID THAT GO — above the buttons, because it is about the session and
          the buttons are about what to do with it.

          `Kicker` + three chips, the same pair the create screen uses for muscles,
          so there is nothing new to learn. Nothing is preselected: an answer the
          user did not give must not be recorded, and tapping the selected one again
          takes it back — which is why there is no fourth chip reading `Skip`.
        */}
        {onSetEffort ? (
          <>
            <Kicker tone={effort ? 'green' : 'faint'} className="mt-xl">
              How did that go{effort ? ` · ${EFFORT_LABELS[effort].toLowerCase()}` : ''}
            </Kicker>
            <View className="mt-sm flex-row">
              {EFFORT_CHOICES.map((choice) => (
                <SelectChip
                  key={choice}
                  label={EFFORT_LABELS[choice]}
                  selected={effort === choice}
                  onPress={() => onSetEffort(choice)}
                />
              ))}
            </View>
          </>
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
