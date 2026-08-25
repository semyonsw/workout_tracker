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
 *   │ │ You rest 2:38 between sets.      Use it  │ │
 *   │ COUNTDOWN                                    │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Beep the last            5 s   ( − )( + )│ │
 *   │ │ Sound                            [ ●━ ]  │ │
 *   │ │ Test the beep                        ▶   │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ BODY                                         │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Bodyweight              82 kg  ( − )( + )│ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ PLATES                                       │
 *   │ (25)(20)(15)(10)( 5 )(2.5)(1.25) 0.5         │
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
 * THREE SECTIONS THAT ARE NOT DURATIONS, and what each is for. `Body` holds the
 * one number that makes bodyweight and assisted work countable — without it a
 * session of push-ups reports no volume at all, and the app will not guess.
 * `Plates` holds what is on the rack, which is the other half of the
 * `20 + 2×10 + 2×2.5` line under a barbell lift's weight cell (the bar itself is
 * a fact about the movement, so it lives on the exercise). Both are read in
 * exactly one place each, and both say so on screen.
 *
 * AND ONE ROW THAT MEASURES RATHER THAN ASKS. Under each rest stepper, once there
 * is enough data: "You rest 2:38 between sets." with one tap to adopt it. The
 * timer has always known when a rest began and when the next ✓ landed; this is
 * that number, as a median so one interrupted workout does not move it. It
 * appears only when it disagrees with the setting by more than one nudge, so a tap
 * always does something, and it disappears when they agree — there is nothing to
 * dismiss because it is not asking for anything.
 *
 * Every number is clamped by `settingsStore`, so a row cannot hand a `NaN` to a
 * deadline; this screen only ever asks for a nudge.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  Kicker,
  ListCard,
  Segmented,
  SelectChip,
  Separator,
  SettingRow,
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
import {
  describeError,
  pickJsonFile,
  readTextFile,
  saveCsvFile,
  saveJsonFile,
} from '../lib/backupFile';
import { csvBaseName, workoutsToCsv } from '../lib/csv';
import { commit, countFinal, countTick, tap } from '../lib/feedback';
import { restMedians } from '../lib/restHistory';
import { formatClock, formatWeight, kgToLb, lbToKg, unitLabel, weightSteps } from '../lib/units';
import {
  applyBackup,
  currentSnapshot,
  exportBackupText,
  mergeBackupWorkouts,
} from '../state/dataTransfer';
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

/**
 * The plate sizes this screen offers, heaviest first.
 *
 * A superset of the default list: 25 down to 1.25 is what a metric gym stocks, and
 * 0.5 is the change plate some of them have. Fixed rather than free-form because a
 * plate is a physical object with a stamped size — a keypad here would let somebody
 * enter 7 kg and then wonder why nothing loads (see `platesFor` on why a
 * non-canonical set fails).
 */
const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

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

/**
 * A file that has been read and understood, waiting for a yes.
 *
 * `mode` is the whole difference between the two actions, and it is carried here
 * rather than in a second piece of state so the sheet cannot be shown for one and
 * confirmed as the other.
 */
interface PendingImport {
  mode: 'replace' | 'merge';
  file: string;
  envelope: BackupEnvelope;
  counts: BackupCounts;
  /** For a merge: how many of the file's workouts this phone does not have. */
  newWorkouts: number;
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
  const workouts = useWorkoutHistory((s) => s.workouts);
  const workoutCount = workouts.length;
  /*
   * Counted from the DATABASE, once per render of this screen, rather than from the
   * array above — the whole point is to be able to disagree with it. Cheap: one
   * `COUNT(*)` over an indexed table, on a screen nobody opens mid-set.
   */
  const onDisk = useWorkoutHistory((s) => s.countOnDisk)();
  /** "The log could not be READ" — see `workoutHistoryStore.loadFailed`. */
  const loadFailed = useWorkoutHistory((s) => s.loadFailed);
  /*
   * What the user ACTUALLY rests, from the timer's own measurements. Null until
   * there are enough samples to mean anything — see `restHistory.ts` — and the
   * rows below render nothing at all in that case rather than hedging.
   */
  const measured = useMemo(() => restMedians(workouts), [workouts]);
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
   * EXPORT SETS — the same log, flat, one row per set.
   *
   * A copy you can read, not a second backup: there is no CSV import and there will
   * not be one, because a table of set rows carries no exercises, no routines and
   * no settings. `lib/csv.ts` has the whole argument.
   */
  const exportSets = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setDataStatus(null);
    try {
      const rows = workouts.reduce((n, w) => n + w.sets.length, 0);
      if (rows === 0) {
        /*
         * An empty log and an unreadable one produce the same zero here, and telling
         * somebody they have never logged a set when their log is on disk is the
         * failure this release is about. `loadFailed` is what tells them apart.
         */
        setDataStatus({
          tone: 'quiet',
          text: loadFailed
            ? 'The log could not be read, so there is nothing to write. Close the app and open it again.'
            : 'There are no logged sets to export yet.',
        });
        return;
      }
      const outcome = await saveCsvFile(csvBaseName(), workoutsToCsv(workouts));
      if (!outcome.saved) {
        setDataStatus({ tone: 'quiet', text: 'No folder picked, so nothing was saved.' });
        return;
      }
      commit();
      setDataStatus({
        tone: 'ok',
        text: `Saved ${outcome.name} to ${outcome.where} — ${rows} ${rows === 1 ? 'set' : 'sets'}.`,
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
   *
   * TWO ACTIONS, ONE PICKER. `mode` decides what the sheet asks and what the yes
   * does: `replace` is a restore, `merge` adds only the workouts this phone does
   * not already have. They share this function because reading and validating a
   * file is identical work, and they must never share a confirmation — see
   * `PendingImport`.
   */
  const importData = async (mode: 'replace' | 'merge') => {
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
      /*
       * How many workouts a merge would ADD, counted before asking, so the
       * confirmation states a number rather than a hope. Counted from the file's
       * ids against this phone's — the same union the store performs, so the sheet
       * cannot promise more than the merge delivers.
       */
      const known = new Set(workouts.map((w) => w.id));
      const newWorkouts = result.envelope.workouts.filter((w) => {
        const id = (w as { id?: unknown }).id;
        return typeof id === 'string' && !known.has(id);
      }).length;

      setPendingImport({
        mode,
        file: file.name,
        envelope: result.envelope,
        counts: result.counts,
        newWorkouts,
      });
    } catch (error) {
      setDataStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;

    if (pendingImport.mode === 'merge') {
      const merged = mergeBackupWorkouts(pendingImport.envelope);
      commit();
      setPendingImport(null);
      setDataStatus({
        tone: 'ok',
        text:
          merged.workoutsAdded === 0
            ? 'Nothing to add — every workout in that file was already here.'
            : `Added ${merged.workoutsAdded} ${
                merged.workoutsAdded === 1 ? 'workout' : 'workouts'
              } and ${merged.setsAdded} ${merged.setsAdded === 1 ? 'set' : 'sets'}.`,
      });
      return;
    }

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
            <MeasuredRestRow
              measuredSeconds={measured.betweenSets}
              settingSeconds={settings.restSecondsBetweenSets}
              what="between sets"
              onAdopt={() =>
                settings.setNumber('restSecondsBetweenSets', measured.betweenSets ?? 0)
              }
            />
            <Separator />
            <StepperRow
              label="Between exercises"
              value={formatSeconds(settings.restSecondsBetweenExercises, 'No rest')}
              onDecrease={() => bump('restSecondsBetweenExercises', -1)}
              onIncrease={() => bump('restSecondsBetweenExercises', 1)}
            />
            <MeasuredRestRow
              measuredSeconds={measured.betweenExercises}
              settingSeconds={settings.restSecondsBetweenExercises}
              what="between exercises"
              onAdopt={() =>
                settings.setNumber('restSecondsBetweenExercises', measured.betweenExercises ?? 0)
              }
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

          {/* ----------------------------------------------------------
              PLATES — what is on the rack behind you.

              A fact about the GYM, not about any one lift, which is why the bar
              weight lives on the exercise instead. Read in exactly one place: the
              `20 + 2×10 + 2×2.5` line under the weight cell of an exercise that
              declares a bar, so switching a size off here removes it from every
              breakdown the app draws. It informs and never rounds — a target these
              plates cannot make shows no line at all rather than the nearest
              loadable weight. */}
          <Kicker className="mx-lg mb-sm mt-xxl">Plates</Kicker>
          <View className="mx-lg flex-row flex-wrap">
            {PLATE_SIZES_KG.map((plate) => (
              <SelectChip
                key={plate}
                label={String(plate)}
                selected={settings.availablePlatesKg.includes(plate)}
                onPress={() => {
                  tap();
                  settings.togglePlate(plate);
                }}
              />
            ))}
          </View>
          <Text className="mx-lg text-label text-ink-faint">
            Which plates this gym has, in kilograms. Only used to work out what goes on the bar; it
            never changes a weight you have typed.
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
          {/*
            WHAT IS ACTUALLY ON DISK, stated as a fact.
        
            The log lives in SQLite (`historyDb.ts`) and the app holds a copy of it
            in memory. Those two can disagree in exactly one direction — a read that
            failed leaves the copy empty while the file is untouched — and when they
            do, every screen shows an empty History and it looks precisely like a
            year of training being deleted. One line here is the difference between
            that and knowing better: it counts the rows in the file, not the array on
            screen, and it says so when the two do not match.
          */}
          <View className="mx-lg mt-xxl overflow-hidden rounded-surface border border-hairline bg-surface">
            <SettingRow
              label="Workouts on disk"
              value={
                onDisk == null
                  ? 'Cannot read the log'
                  : onDisk === workoutCount
                    ? `${onDisk}`
                    : `${onDisk} on disk · ${workoutCount} loaded`
              }
              valueTone={onDisk == null || onDisk !== workoutCount ? 'muted' : 'faint'}
            />
            <Separator inset={0} />
            <TextButton label="Export data" tone="green" onPress={() => void exportData()} />
            <Separator inset={0} />
            <TextButton label="Export sets as CSV" tone="green" onPress={() => void exportSets()} />
            <Separator inset={0} />
            {/* TWO CLEARLY-DIFFERENT IMPORTS, named for what they do rather than
                for what they are. "Replace everything" and "Add workouts from a
                file" cannot be confused for each other by somebody reading fast,
                which one row labelled "Import data" with a mode picker behind it
                absolutely could. */}
            <TextButton
              label="Replace everything from a file"
              tone="green"
              onPress={() => void importData('replace')}
            />
            <Separator inset={0} />
            <TextButton
              label="Add workouts from a file"
              tone="green"
              onPress={() => void importData('merge')}
            />
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
            phone. <Text className="text-ink-muted">Replace everything</Text> makes this phone look
            like the file — exercises, routines, workouts and settings — so export first if there is
            anything here you would miss. <Text className="text-ink-muted">Add workouts</Text> only
            ever adds: workouts from the file that this phone does not already have, and nothing
            else. Your exercises, routines and settings are never merged, because a merged library
            brings back every exercise you have deleted. A workout in progress is not part of a
            backup: it carries a running clock.
          </Text>

          <Text className="mx-lg mt-md text-label text-ink-faint">
            The CSV is one row per set — date, workout, exercise, set number, weight, count, and
            whether it was a warm-up — for a spreadsheet. It is an export only; the JSON file is the
            backup.
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

      {pendingImport?.mode === 'replace' ? (
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

      {/* The merge asks a different question, so it says a different sentence: HOW
          MANY workouts will be added, and what will not be touched. A confirmation
          that reused the replace copy would be the one place this feature could
          mislead somebody into losing a library. */}
      {pendingImport?.mode === 'merge' ? (
        <ConfirmSheet
          title={
            pendingImport.newWorkouts === 0
              ? 'Nothing to add'
              : `Add ${pendingImport.newWorkouts} ${
                  pendingImport.newWorkouts === 1 ? 'workout' : 'workouts'
                }?`
          }
          body={[
            pendingImport.newWorkouts === 0
              ? `Every workout in ${pendingImport.file} is already on this phone.`
              : `${pendingImport.newWorkouts} of the ${pendingImport.counts.workouts} workouts in ${pendingImport.file} are not on this phone yet.`,
            'Your exercises, routines and settings are not touched, and nothing already here is changed or removed.',
          ].join(' ')}
          confirmLabel={pendingImport.newWorkouts === 0 ? 'Fine' : 'Add them'}
          cancelLabel="Not now"
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
 * "You rest 2:38 between sets" — and one tap to make that the setting.
 *
 * Measured by the rest timer itself: the store has always known when a rest began
 * and when the next ✓ landed, and `SetHistory.restTakenSeconds` has always had a
 * field for it. `restMedians` is the median rather than the mean, so one workout
 * interrupted by a phone call does not move it.
 *
 * FOUR THINGS IT DOES NOT DO, and each of them is why it can be trusted:
 *
 *  • It does not appear without the data. Below `MIN_REST_SAMPLES` recorded rests
 *    the median swings on one interruption, and a suggestion that changes every
 *    workout is one nobody trusts twice.
 *  • It does not appear when it agrees with the setting, or agrees within one nudge
 *    of the ± chips. A row whose tap would change nothing is a row that trains
 *    people to ignore rows.
 *  • It does not nag. One line, `ink-muted`, no icon, no dot, and it disappears the
 *    moment the setting matches — there is no dismissing it because there is
 *    nothing to dismiss.
 *  • It does not judge. "You rest 2:38" is a measurement of what happened, not a
 *    comparison with what should have. Resting longer than you planned is not a
 *    failure, it is information about the plan.
 */
function MeasuredRestRow({
  measuredSeconds,
  settingSeconds,
  what,
  onAdopt,
}: {
  measuredSeconds: number | null;
  settingSeconds: number;
  /** "between sets" / "between exercises" — the tail of the sentence. */
  what: string;
  onAdopt: () => void;
}) {
  if (measuredSeconds == null) return null;
  // Within one nudge of the chips is agreement. See the note above.
  if (Math.abs(measuredSeconds - settingSeconds) < SETTING_LIMITS.restSecondsBetweenSets.step) {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        commit();
        onAdopt();
      }}
      accessibilityRole="button"
      accessibilityLabel={`You rest ${formatClock(measuredSeconds)} ${what}. Use that as the setting.`}
      className="min-h-[44px] flex-row items-center px-lg pb-md"
    >
      <Text className="flex-1 pr-md text-label tabular-nums text-ink-muted">
        You rest {formatClock(measuredSeconds)} {what}.
      </Text>
      <Text className="text-label font-semibold text-green-bright">Use it</Text>
    </Pressable>
  );
}

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
