/**
 * SettingsScreen — every duration the app counts, and the two switches that
 * decide whether it can be heard.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SETTINGS                                     │
 *   │ REST                                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Between sets            2:00   ( − )( + )│ │
 *   │ │ Between exercises       2:30   ( − )( + )│ │
 *   │ │ Start rest automatically         [ ●━ ]  │ │
 *   │ │ Timer ± step              15 s ( − )( + )│ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ COUNTDOWN                                    │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Beep the last            5 s   ( − )( + )│ │
 *   │ │ Sound                            [ ●━ ]  │ │
 *   │ │ Test the beep                        ▶   │ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * WHY ± CHIPS AND NOT A KEYPAD. This is the same decision `QuickAdjust` makes on
 * a set row, for the same reason: nobody types "135" seconds. Rest is nudged in
 * fifteens from a number that was already close, and the two chips are the same
 * 44 dp targets the rest of the app uses. Held down they repeat — no, they don't,
 * and deliberately: the ranges are small enough that a tap count is honest and a
 * repeat would overshoot.
 *
 * WHY `TEST THE BEEP` IS A ROW. The whole point of the count-in is that it
 * reaches someone who isn't looking at the phone, which means the failure mode is
 * silent: a muted media stream, a denied audio focus, a switch left off. Finding
 * that out at 0:05 of a two-minute plank is finding it out too late. One tap here
 * proves the thing works before it matters.
 *
 * Every number is clamped by `settingsStore`, so a row cannot hand a `NaN` to a
 * deadline; this screen only ever asks for a nudge.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  Kicker,
  ListCard,
  Segmented,
  Separator,
  TextButton,
  Toggle,
} from '../components/primitives';
import { countFinal, countTick, tap } from '../lib/feedback';
import { formatClock } from '../lib/units';
import {
  SETTING_LIMITS,
  useSettings,
  type NumericSetting,
} from '../state/settingsStore';
import { useLibrary } from '../state/libraryStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { UnitSystem } from '../types/models';

const UNIT_OPTIONS: readonly { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Kilograms' },
  { value: 'imperial', label: 'Pounds' },
];

/**
 * A duration as the user thinks about it.
 *
 * Clock form once it passes a minute, because "2:30" is how anyone says a rest,
 * and plain seconds below that, because "0:45" is a stopwatch reading rather than
 * a length. Zero is a word: `0 s` for a setting that is switched off reads like a
 * value that failed to load.
 */
function formatSeconds(seconds: number, zeroLabel = 'Off'): string {
  if (seconds <= 0) return zeroLabel;
  if (seconds < 60) return `${seconds} s`;
  return formatClock(seconds);
}

interface SettingsScreenProps {
  /**
   * Open the backup screen. Optional so the screen still renders standalone, but a
   * caller that can navigate should always pass it: everything the user owns lives
   * in three keys on one phone, and this is the only door out of them.
   */
  onOpenBackup?: () => void;
}

export function SettingsScreen({ onOpenBackup }: SettingsScreenProps = {}) {
  const settings = useSettings();
  const restoreSeedLibrary = useLibrary((s) => s.restoreSeedLibrary);
  const clearHistory = useWorkoutHistory((s) => s.clearHistory);
  const workoutCount = useWorkoutHistory((s) => s.workouts.length);
  const [confirming, setConfirming] = useState<'reset' | 'library' | 'history' | null>(null);

  const bump = (key: NumericSetting, direction: 1 | -1) => {
    tap();
    settings.bumpNumber(key, SETTING_LIMITS[key].step * direction);
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={confirming ? { opacity: 0.28 } : undefined}>
        <ScreenHeader kicker="Settings" bordered={false} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!confirming}
        >
          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-md">Rest</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label="Between sets"
              value={formatSeconds(settings.restSecondsBetweenSets, 'No rest')}
              onDecrease={() => bump('restSecondsBetweenSets', -1)}
              onIncrease={() => bump('restSecondsBetweenSets', 1)}
            />
            <Separator />
            <StepperRow
              label="Between exercises"
              value={formatSeconds(settings.restSecondsBetweenExercises, 'No rest')}
              onDecrease={() => bump('restSecondsBetweenExercises', -1)}
              onIncrease={() => bump('restSecondsBetweenExercises', 1)}
            />
            <Separator />
            <SwitchRow
              label="Start rest automatically"
              hint="Off: rest only runs when you start it"
              value={settings.autoStartRest}
              onChange={(v) => settings.setFlag('autoStartRest', v)}
            />
            <Separator />
            <StepperRow
              label="Timer ± step"
              hint="The +15 on the rest and set-timer pills"
              value={formatSeconds(settings.adjustStepSeconds)}
              onDecrease={() => bump('adjustStepSeconds', -1)}
              onIncrease={() => bump('adjustStepSeconds', 1)}
            />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">Timed sets</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label="Get ready"
              hint="Counted in before a plank or a hang starts"
              value={formatSeconds(settings.prepareSeconds, 'Straight to work')}
              onDecrease={() => bump('prepareSeconds', -1)}
              onIncrease={() => bump('prepareSeconds', 1)}
            />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">Countdown</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label="Beep the last"
              hint="Every countdown: rest, get ready, and a prescribed hold"
              value={formatSeconds(settings.beepSeconds, 'Silent')}
              onDecrease={() => bump('beepSeconds', -1)}
              onIncrease={() => bump('beepSeconds', 1)}
            />
            <Separator />
            <SwitchRow
              label="Sound"
              value={settings.soundEnabled}
              onChange={(v) => settings.setFlag('soundEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label="Vibration"
              value={settings.hapticsEnabled}
              onChange={(v) => settings.setFlag('hapticsEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label="Keep the screen on"
              hint="While a timer is running"
              value={settings.keepAwakeEnabled}
              onChange={(v) => settings.setFlag('keepAwakeEnabled', v)}
            />
            <Separator />
            <SwitchRow
              label="Notify when a timer ends"
              hint="How the beep reaches you when the app isn't open — a tick 5 s out, then the tone"
              value={settings.notifyOnTimerEnd}
              onChange={(v) => settings.setFlag('notifyOnTimerEnd', v)}
            />
            <Separator />
            <TestBeepRow />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          {/* Above `Units`, not buried under the destructive block at the bottom:
              the thing standing between a year of training and an uninstall is not
              a footnote. */}
          {onOpenBackup ? (
            <>
              <Kicker className="mx-lg mb-sm mt-xxl">Your data</Kicker>
              <ListCard className="mx-lg">
                <Pressable
                  onPress={() => {
                    tap();
                    onOpenBackup();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Back up and restore"
                  className="min-h-[56px] flex-row items-center px-lg py-md"
                >
                  <View className="flex-1 pr-md">
                    <Text className="text-body font-medium text-ink">Back up &amp; restore</Text>
                    <Text className="mt-[2px] text-label text-ink-faint">
                      Export everything to a JSON file, or read one back in
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={palette.greenBright} />
                </Pressable>
              </ListCard>
            </>
          ) : null}

          <Kicker className="mx-lg mb-sm mt-xxl">Units</Kicker>
          <View className="mx-lg">
            <Segmented
              options={UNIT_OPTIONS}
              value={settings.unitSystem}
              onChange={settings.setUnitSystem}
              accessibilityLabel="Weight units"
            />
            <Text className="mt-sm text-label text-ink-faint">
              Display only. Every set is stored in kilograms, so switching can never change what
              your history says you lifted.
            </Text>
          </View>

          {/* ---------------------------------------------------------- */}
          <View className="mx-lg mt-xxl overflow-hidden rounded-surface border border-hairline bg-surface">
            <TextButton label="Reset settings to defaults" onPress={() => setConfirming('reset')} />
            <Separator inset={0} />
            <TextButton
              label="Restore the shipped exercise library"
              onPress={() => setConfirming('library')}
            />
            {/* Last, and only when there is something to lose. One workout at a
                time is deleted from the History tab; this is the whole log. */}
            {workoutCount > 0 ? (
              <>
                <Separator inset={0} />
                <TextButton
                  label="Delete all workout history"
                  onPress={() => setConfirming('history')}
                />
              </>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {confirming === 'reset' ? (
        <ConfirmSheet
          title="Reset settings?"
          body="Every duration and switch goes back to its default. Your exercises, routines and history are untouched."
          confirmLabel="Reset settings"
          cancelLabel="Keep mine"
          onConfirm={() => {
            settings.resetToDefaults();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {confirming === 'library' ? (
        <ConfirmSheet
          title="Restore the shipped library?"
          body="The exercises and routines the app came with come back, and anything you added or deleted is replaced. Logged sets stay in your history."
          confirmLabel="Restore the library"
          cancelLabel="Keep mine"
          onConfirm={() => {
            restoreSeedLibrary();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {confirming === 'history' ? (
        <ConfirmSheet
          title="Delete all workout history?"
          body={`All ${workoutCount} finished ${workoutCount === 1 ? 'workout' : 'workouts'} go, and so do the sets in them — which is what the prefills and the overload suggestions read. This cannot be undone.`}
          confirmLabel="Delete everything"
          cancelLabel="Keep my history"
          onConfirm={() => {
            clearHistory();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A number with a `−` and a `+`.
 *
 * The value sits between the label and the chips rather than next to them, so a
 * column of these rows has its numbers in one vertical line — you can see what
 * every duration is set to without reading a single label twice.
 */
function StepperRow({
  label,
  hint,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  hint?: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center py-md pl-lg pr-sm">
      <View className="flex-1 pr-md">
        <Text className="text-body font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-[2px] text-label text-ink-faint">{hint}</Text> : null}
      </View>

      <Text className="mr-sm text-body font-semibold tabular-nums text-ink-muted">{value}</Text>

      <StepButton icon="minus" label={`Decrease ${label}`} onPress={onDecrease} />
      <View className="w-xs" />
      <StepButton icon="plus" label={`Increase ${label}`} onPress={onIncrease} />
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-[36px] w-[36px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
    >
      <Icon name={icon} size={14} color={palette.ink} />
    </Pressable>
  );
}

/** Label, optional hint, and the app's one switch. */
function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center py-md px-lg">
      <View className="flex-1 pr-md">
        <Text className="text-body font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-[2px] text-label text-ink-faint">{hint}</Text> : null}
      </View>
      <Toggle
        value={value}
        onChange={(next) => {
          tap();
          onChange(next);
        }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * Plays the two tones a real countdown uses — three ticks, then the long one — so
 * what you hear here is exactly what you'll hear at 0:03 of a rest.
 *
 * Driven by timeouts rather than by the real hook because there is no countdown
 * to attach to; this is the one place in the app where a cue is faked, and it is
 * faked from the same two sounds so it cannot mislead.
 */
function TestBeepRow() {
  const [playing, setPlaying] = useState(false);

  const play = () => {
    if (playing) return;
    setPlaying(true);
    countTick();
    const timers = [
      setTimeout(() => countTick(), 700),
      setTimeout(() => countTick(), 1400),
      setTimeout(() => {
        countFinal();
        setPlaying(false);
      }, 2100),
    ];
    // Nothing to clean up on unmount beyond the flag: the tones are fire-and-forget
    // and a beep that lands after the user leaves Settings is harmless.
    void timers;
  };

  return (
    <Pressable
      onPress={play}
      accessibilityRole="button"
      accessibilityLabel="Test the countdown beep"
      className="h-row flex-row items-center px-lg"
    >
      <Text className="flex-1 text-body font-medium text-ink">Test the beep</Text>
      <Text className="mr-md text-label text-ink-faint">
        {playing ? 'counting…' : '3 · 2 · 1 · go'}
      </Text>
      <Icon name="play" size={16} color={palette.greenBright} />
    </Pressable>
  );
}
