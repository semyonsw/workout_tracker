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
import {
  backupBaseName,
  countPayload,
  describeCounts,
  parseBackup,
  type BackupCounts,
  type BackupEnvelope,
} from '../lib/backup';
import { describeError, pickJsonFile, readTextFile, saveJsonFile } from '../lib/backupFile';
import { commit, countFinal, countTick, tap } from '../lib/feedback';
import { formatClock, formatWeight, kgToLb, lbToKg, unitLabel, weightSteps } from '../lib/units';
import { applyBackup, currentSnapshot, exportBackupText } from '../state/dataTransfer';
import { SETTING_LIMITS, useSettings, type NumericSetting } from '../state/settingsStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';
import type { UnitSystem } from '../types/models';

/**
 * Where the bodyweight row starts from when it has never been set.
 *
 * A visible starting point for the ± chips, not a default: it is stored only once
 * the user taps the row, and what they see immediately is the number they are
 * adjusting. `sanitizeSettings` still has no fallback — an unset bodyweight stays
 * unset everywhere else in the app.
 */
const BODYWEIGHT_START_KG = 70;

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

/** A file that has been read and understood, waiting for a yes. */
interface PendingImport {
  file: string;
  envelope: BackupEnvelope;
  counts: BackupCounts;
}

/** The one line under the two rows. `quiet` is "nothing happened", not an alarm. */
interface DataStatus {
  tone: 'ok' | 'quiet';
  text: string;
}

/**
 * What is on this phone right now, counted the same way a file is.
 *
 * Read at the moment it is needed rather than subscribed to: it is only ever used
 * inside a sentence about something the user just did, and a count that re-renders
 * the whole settings screen on every logged set would be a subscription bought for
 * nothing.
 */
function onThisPhone(): BackupCounts {
  return countPayload(currentSnapshot());
}

export function SettingsScreen() {
  const settings = useSettings();
  const clearHistory = useWorkoutHistory((s) => s.clearHistory);
  const workoutCount = useWorkoutHistory((s) => s.workouts.length);
  const [confirming, setConfirming] = useState<'reset' | 'history' | null>(null);

  /** A parsed file waiting for a yes: importing replaces everything. */
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  /** One line under the buttons: what the last export or import actually did. */
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  /** A picker is open or a file is being read. Stops a second tap racing it. */
  const [busy, setBusy] = useState(false);

  const bump = (key: NumericSetting, direction: 1 | -1) => {
    tap();
    settings.bumpNumber(key, SETTING_LIMITS[key].step * direction);
  };

  /**
   * ± on the bodyweight, in the user's own units.
   *
   * THE FIRST TAP SEEDS, it does not nudge. Nudging from "not set" has to start
   * somewhere, and starting from zero would walk up from 20 kg while
   * `BODYWEIGHT_START_KG` puts the number on screen in one tap where it can be
   * read and corrected. It is a starting point the user is looking at, not a
   * guess the app acts on: nothing is stored until this row is touched, and
   * `Clear my bodyweight` puts it back.
   */
  const bumpBodyweight = (direction: 1 | -1) => {
    tap();
    if (settings.bodyweightKg == null) {
      settings.setBodyweightKg(BODYWEIGHT_START_KG);
      return;
    }
    const { coarse } = weightSteps(settings.unitSystem);
    const display =
      settings.unitSystem === 'imperial' ? kgToLb(settings.bodyweightKg) : settings.bodyweightKg;
    const next = Number((display + coarse * direction).toFixed(2));
    settings.setBodyweightKg(settings.unitSystem === 'imperial' ? lbToKg(next) : next);
  };

  /**
   * EXPORT — write everything to one JSON file, in a folder the user picks.
   *
   * The folder picker rather than a silent write: a file the user cannot find is
   * not a backup, and app-private storage is exactly where Android hides files
   * from its own file manager. What comes back is stated by name, so the next step
   * ("move it off the phone") is something the user can actually do.
   */
  const exportData = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setDataStatus(null);
    try {
      const outcome = await saveJsonFile(backupBaseName(), exportBackupText());
      if (!outcome.saved) {
        setDataStatus({ tone: 'quiet', text: 'No folder picked, so nothing was saved.' });
        return;
      }
      commit();
      setDataStatus({
        tone: 'ok',
        text: `Saved ${outcome.name} to ${outcome.where} — ${describeCounts(onThisPhone())}.`,
      });
    } catch (error) {
      setDataStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * IMPORT — the phone's own file browser, then a question.
   *
   * Reading the file and APPLYING it are deliberately two steps: this is the only
   * irreversible action in the app that isn't a delete, so the sheet gets to state
   * what is in the file and what is on the phone before anything is replaced.
   */
  const importData = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setDataStatus(null);
    try {
      const file = await pickJsonFile();
      if (!file) {
        setDataStatus({ tone: 'quiet', text: 'No file picked.' });
        return;
      }
      const result = parseBackup(await readTextFile(file.uri));
      if (!result.ok) {
        setDataStatus({ tone: 'quiet', text: `${file.name}: ${result.error}` });
        return;
      }
      setPendingImport({ file: file.name, envelope: result.envelope, counts: result.counts });
    } catch (error) {
      setDataStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const applied = applyBackup(pendingImport.envelope);
    commit();
    setPendingImport(null);
    setDataStatus({
      tone: 'ok',
      // What LANDED, not what the file claimed: rows that fail validation are
      // dropped on the way in, and a restore that reports the file's own numbers
      // is how someone learns not to trust the feature.
      text: `Restored ${describeCounts(applied)}${applied.settingsApplied ? ', and your settings' : ''}.`,
    });
  };

  const asking = confirming != null || pendingImport != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={asking ? { opacity: 0.28 } : undefined}>
        <ScreenHeader kicker="Settings" bordered={false} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!asking}
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

          {/* ----------------------------------------------------------
              BODY — one number, and it is opt-in.

              This is what makes bodyweight and assisted work COUNTABLE, and it is
              the only thing it does. A +40 kg dip moves a body plus forty; a
              −20 kg assisted pull-up moves a body minus twenty; a push-up moves a
              body. Without this number the app cannot weigh any of them, so it
              leaves them out of session volume and drops the volume figure from
              the history line rather than printing one that undercounts.

              It is NOT a weigh-in log, a target, or a chart. There is one value,
              it is the current one, and nothing tracks it over time — that is a
              different app, and this one has no opinion about anybody's weight.
              Nudged by the app's own coarse weight step (2 kg / 5 lb) because
              bodyweight to the nearest couple of kilos is all volume needs, and
              because a once-ever setting nudged in half-kilos is forty taps. */}
          <Kicker className="mx-lg mb-sm mt-xxl">Body</Kicker>
          <ListCard className="mx-lg">
            <StepperRow
              label="Bodyweight"
              hint="What makes push-ups, dips and assisted work countable"
              value={
                settings.bodyweightKg == null
                  ? 'Not set'
                  : `${formatWeight(settings.bodyweightKg, settings.unitSystem)} ${unitLabel(settings.unitSystem)}`
              }
              onDecrease={() => bumpBodyweight(-1)}
              onIncrease={() => bumpBodyweight(1)}
            />
            {settings.bodyweightKg != null ? (
              <>
                <Separator />
                <TextButton
                  label="Clear my bodyweight"
                  onPress={() => {
                    tap();
                    settings.setBodyweightKg(undefined);
                  }}
                />
              </>
            ) : null}
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {settings.bodyweightKg == null
              ? 'Until this is set, a session of push-ups or dips reports no volume — the app will not guess what your body weighs. Nothing else reads it.'
              : 'Read only when working out session volume. It is not logged, charted or compared to anything.'}
          </Text>

          {/* ---------------------------------------------------------- */}
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

          {/* ----------------------------------------------------------
              EXPORT AND IMPORT, at the bottom, above the two destructive rows.

              Everything the user owns lives in three AsyncStorage keys on one
              phone: an uninstall, a wiped device or a new phone takes all of it,
              and the app's whole value is a log that goes back far enough to show
              a plateau. These two rows are the only thing standing between a year
              of training and a factory reset, which is why they are plain,
              permanent rows rather than a screen you have to know about.

              `Export data` writes one readable JSON file — every exercise,
              routine, finished workout WITH its set rows, and your settings —
              into a folder you pick. `Import data` opens the phone's file browser
              so you can find that file and read it back. What each one did is
              stated underneath, by name and by count. */}
          <View className="mx-lg mt-xxl overflow-hidden rounded-surface border border-hairline bg-surface">
            <TextButton label="Export data" tone="green" onPress={() => void exportData()} />
            <Separator inset={0} />
            <TextButton label="Import data" tone="green" onPress={() => void importData()} />
            <Separator inset={0} />
            <TextButton label="Reset settings to defaults" onPress={() => setConfirming('reset')} />
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

          {dataStatus ? (
            <Text
              className={[
                'mx-lg mt-md text-label',
                dataStatus.tone === 'ok' ? 'text-green-bright' : 'text-ink-muted',
              ].join(' ')}
            >
              {dataStatus.text}
            </Text>
          ) : null}

          <Text className="mx-lg mt-md text-label text-ink-faint">
            A backup is plain JSON, so you can read it, keep it anywhere, and move it to another
            phone. Importing REPLACES what is on this phone — it is never merged — so export first
            if there is anything here you would miss. A workout in progress is not part of a backup:
            it carries a running clock.
          </Text>
        </ScrollView>
      </View>

      {confirming === 'reset' ? (
        <ConfirmSheet
          title="Reset settings?"
          body="Every duration and switch goes back to its default, and your bodyweight is cleared. Your exercises, routines and history are untouched."
          confirmLabel="Reset settings"
          cancelLabel="Keep mine"
          onConfirm={() => {
            settings.resetToDefaults();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {pendingImport ? (
        <ConfirmSheet
          title="Replace everything with this file?"
          body={[
            `${pendingImport.file} holds ${describeCounts(pendingImport.counts)}.`,
            `This phone has ${describeCounts(onThisPhone())}, and all of it goes.`,
            'This cannot be undone.',
          ].join(' ')}
          confirmLabel="Import it"
          cancelLabel="Keep what I have"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
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
