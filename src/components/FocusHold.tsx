/**
 * Focus mode on a timed set — a plank, a hang, a boxing round.
 *
 *   not started      SET 1 OF 2            get ready    SET 1 OF 2
 *                    Plank                              Plank
 *                    2:00                               3
 *                    HOLD · NOT RUNNING                 GET READY
 *                    last: 2:00 · 2:00                  counting out loud
 *                    [ ▶ Start ]                        [ Start now ]  [ ✕ ]
 *                    ( ✓ DONE )                         ( ✓ DONE )
 *
 *   running          1:14                  open hold    0:47
 *                    PLANK                              HOLDING
 *                    ▓▓▓▓▓▓▓░░░░░░░░░░                  (no drain line)
 *                    logs itself at the bell            no target, no bell
 *                    [+15] [ ⏸ Stop ] [ ✕ ]             [ ⏸ Stop ] [ ✕ ]
 *                    ( ✓ DONE )                         ( ✓ DONE )
 *
 * FOUR PHASES, NOT TWO. This is what `useSetTimer` and `lib/setTimer.ts` actually
 * do, and a screen that carried only "idle" and "running" would be a screen that
 * cannot show the get-ready count — which is the phase the user is looking at while
 * they climb onto the bar.
 *
 * Three rules hold across all four, and every one of them is inherited from
 * `SetTimerPill` rather than invented here:
 *
 *   • `Stop` IS NOT `Skip`. Skipping a rest throws away nothing; stopping a hold
 *     LOGS it. So it is worded `Stop`, filled green, and sits where `Skip` sits.
 *   • THE `✕` IS THE ONLY WAY OUT WITHOUT LOGGING. A glyph rather than a word: it
 *     is the escape hatch, not one of the two things you normally do.
 *   • `+15` EXISTS ONLY ON A PRESCRIBED HOLD. There is no target to extend on an
 *     open hang, and a chip that silently does nothing is worse than no chip. Its
 *     step is the user's own from Settings, never a literal 15.
 *
 * And DONE stays exactly where it is in every phase. A prescribed countdown commits
 * itself at the bell, so the control row is for the hold that ends early — DONE is
 * for the hold the phone never saw. The check never changes meaning anywhere in this
 * app, and a set held away from the phone still has to be loggable in one tap.
 *
 * A PRESCRIBED HOLD INVERTS IN ITS FINAL TEN SECONDS, exactly as rest does. The
 * clock here is bare rather than in a card, so the slab arrives as a background and
 * nothing moves — see `FocusClockBlock`'s `filled`.
 */

import { Text, View } from 'react-native';

import { describeSetPosition, type FocusTarget } from '../lib/focusPlan';
import type { SetTimerApi } from '../hooks/useSetTimer';
import { formatClock, formatCount } from '../lib/units';
import { FocusClockBlock } from './FocusClock';
import { FocusAction, FocusBottom, FocusDone, FocusQuietAction } from './FocusControls';
import { FINAL_SECONDS, pillTone } from './TimerPill';
import { palette } from '../theme/tokens';

export function FocusHold({
  target,
  timer,
  onStart,
  onDone,
  onUndo,
}: {
  /** The set being held — the same set focus mode would otherwise be lifting. */
  target: FocusTarget;
  timer: SetTimerApi;
  /** Run the clock: `startSetTimer` for this set. */
  onStart: () => void;
  /** Log it by hand, whatever the clock says. */
  onDone: () => void;
  onUndo: (() => void) | null;
}) {
  const { reading, stepSeconds, add, startNow, stop, cancel } = timer;
  const { exercise } = target.entry;

  const preparing = reading?.phase === 'prepare';
  const running = reading != null && !preparing;
  const isCountdown = timer.timer?.mode === 'countdown';
  /*
   * The inversion. A get-ready count never inverts — it is about to BECOME the
   * loud thing, and two slabs in a row make neither of them read as an alert —
   * and a count-up has no end to warn about.
   */
  const finalTen = running && isCountdown && (reading?.display ?? 0) <= FINAL_SECONDS;
  const tone = pillTone(finalTen);

  /* --- what the clock reads, and what it is called ------------------- */
  let value: string;
  let label: string;
  let labelColor: string | undefined;
  let note: string | undefined;
  let remainingFraction: number | null = null;

  if (preparing) {
    value = String(reading?.display ?? 0);
    label = 'get ready';
    labelColor = palette.greenBright;
    note = 'counting out loud · lands on a long tone';
  } else if (running && isCountdown) {
    value = formatClock(reading?.display ?? 0);
    // The exercise's OWN NAME, because a bare 1:14 could be a rest.
    label = exercise.name;
    labelColor = finalTen ? undefined : palette.greenBright;
    note = 'logs itself at the bell';
    remainingFraction = reading?.remainingFraction ?? null;
  } else if (running) {
    value = formatClock(reading?.display ?? 0);
    label = 'holding';
    labelColor = palette.greenBright;
    // No drain line at all: `remainingFraction` is null on a count-up, and a
    // track with no fill would read as a clock that has already finished.
    note = 'no target, no drain line, no bell';
  } else {
    value = formatCount(target.set.count, exercise.countUnit);
    label = 'hold · not running';
    note = target.entry.lastSessionShort ? `last: ${target.entry.lastSessionShort}` : undefined;
  }

  return (
    <>
      <View className="flex-1 justify-center">
        <View className="px-lg">
          <Text className="text-micro font-semibold uppercase text-green-bright">
            {describeSetPosition(target)}
          </Text>
          <Text numberOfLines={2} className="mt-xs text-title-lg font-medium text-ink">
            {exercise.name}
          </Text>
        </View>

        <View className="mt-lg">
          <FocusClockBlock
            bare
            filled={finalTen}
            tone={tone}
            label={label}
            labelColor={labelColor}
            labelPlacement="below"
            value={value}
            variant={preparing ? 'count' : 'clock'}
            glow={preparing}
            remainingFraction={remainingFraction}
            note={note}
            accessibilityLabel={
              preparing
                ? `Starting in ${reading?.display ?? 0}`
                : running
                  ? `${reading?.display ?? 0} seconds ${isCountdown ? 'left' : 'held'}`
                  : `${formatCount(target.set.count, exercise.countUnit)} to hold`
            }
          />
        </View>
      </View>

      <FocusBottom onUndo={onUndo}>
        {/* The control row, then DONE under it — one row of clock controls and one
            circle, in that order, in every phase. */}
        <View className="mb-md flex-row">
          {preparing ? (
            <>
              <FocusAction
                label="Start now"
                onPress={startNow}
                accessibilityLabel="Start the hold now, without the count-in"
              />
              <View className="w-sm" />
              <FocusQuietAction
                icon="x"
                width="w-[56px]"
                onPress={cancel}
                accessibilityLabel="Cancel the timer without logging"
              />
            </>
          ) : running ? (
            <>
              {isCountdown ? (
                <>
                  <FocusQuietAction
                    label={`+${stepSeconds}`}
                    width="w-[72px]"
                    onPress={() => add(stepSeconds)}
                    accessibilityLabel={`Hold ${stepSeconds} seconds longer`}
                  />
                  <View className="w-sm" />
                </>
              ) : null}
              <FocusAction
                label="Stop"
                icon="pause"
                tone="filled"
                onPress={stop}
                accessibilityLabel="Stop the clock and log what it read"
              />
              <View className="w-sm" />
              <FocusQuietAction
                icon="x"
                width="w-[56px]"
                onPress={cancel}
                accessibilityLabel="Abandon the hold without logging"
              />
            </>
          ) : (
            <FocusAction
              label="Start"
              icon="play"
              onPress={onStart}
              accessibilityLabel={`Start the ${formatCount(target.set.count, exercise.countUnit)} clock`}
            />
          )}
        </View>

        <FocusDone onPress={onDone} label="done" />
      </FocusBottom>
    </>
  );
}
