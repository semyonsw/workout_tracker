/**
 * SettingsHomeScreen — three doors, one export, one import, one reset.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SETTINGS                                     │
 *   │ SECTIONS                                     │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Workout settings                       › │ │
 *   │ │ Daily tasks settings                   › │ │
 *   │ │ Expenses settings                      › │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ EVERYTHING, IN ONE FILE                      │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Last backup                 2 days ago   │ │
 *   │ │ Back up automatically    Every 7 days    │ │
 *   │ │ Back up now                              │ │
 *   │ │ Export everything                        │ │
 *   │ │ Replace everything from a file           │ │
 *   │ │ Reset every setting to its default       │ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * ── THREE ROWS AT THE TOP, AND WHY THEY ARE THE WHOLE STRUCTURE ────────────
 *
 * The app is three logs. Settings used to be one scroll holding all three logs'
 * preferences in whatever order they were added, so the rest step and the plate
 * list sat between the user and anything about their money. A row per section
 * means the question "where do I change this" has the same answer as "which part
 * of the app is it about", which is the only mapping anybody has to learn.
 *
 * ── AND ONE OF EACH, UNDERNEATH ────────────────────────────────────────────
 *
 * There were eight data rows across this screen and three more elsewhere: a
 * whole-phone export, a CSV export, a replace, a merge, a CSV import, and an
 * export-and-import pair for each of the three sections. Every one of them
 * worked. Together they made the one that matters — everything, out to a file
 * you can read — just another row in a list of things to be careful about, and a
 * backup you have to choose between is a backup you put off.
 *
 * So: one file holds all three logs and the settings. `Export everything` writes
 * it, `Replace everything from a file` reads it back, and `Reset every setting`
 * puts the preferences back to their defaults WITHOUT touching a single logged
 * row. That last distinction is the reason the reset is here rather than in a
 * section: it resets all three sections' settings at once, which is a sentence
 * only this screen can honestly say.
 *
 * The automatic backup stays, above them, because it is not an export — it is the
 * thing that makes remembering to export optional, and `lib/backup.ts` is right
 * that protection depending on the user's memory of a menu is not protection.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { SectionTopBar } from '../components/SectionTopBar';
import {
  Kicker,
  ListCard,
  NavRow,
  Separator,
  SettingRow,
  StepperRow,
  TextButton,
} from '../components/primitives';
import { runBackupNow } from '../hooks/useAutoBackup';
import { describeBackupAge } from '../lib/autoBackup';
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
  folderLabel,
  pickFolder,
  pickJsonFile,
  readTextFile,
  saveJsonFile,
} from '../lib/backupFile';
import { commit, tap } from '../lib/feedback';
import { applyBackup, currentSnapshot, exportBackupText } from '../state/dataTransfer';
import { SETTING_LIMITS, useSettings } from '../state/settingsStore';

/** A file that has been read and understood, waiting for a yes. */
interface PendingImport {
  file: string;
  envelope: BackupEnvelope;
  counts: BackupCounts;
}

/** The one line under the rows. `quiet` is "nothing happened", not an alarm. */
interface Status {
  tone: 'ok' | 'quiet';
  text: string;
}

/**
 * What is on this phone right now, counted the same way a file is.
 *
 * Read at the moment it is needed rather than subscribed to: it is only ever used
 * inside a sentence about something the user just did, and a count that re-rendered
 * this screen on every logged set would be a subscription bought for nothing.
 */
function onThisPhone(): BackupCounts {
  return countPayload(currentSnapshot());
}

interface SettingsHomeScreenProps {
  onOpenWorkoutSettings: () => void;
  onOpenTaskSettings: () => void;
  onOpenMoneySettings: () => void;
}

export function SettingsHomeScreen({
  onOpenWorkoutSettings,
  onOpenTaskSettings,
  onOpenMoneySettings,
}: SettingsHomeScreenProps) {
  const settings = useSettings();

  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  /** A picker is open or a file is being read. Stops a second tap racing it. */
  const [busy, setBusy] = useState(false);

  /**
   * EXPORT — write everything to one JSON file, in a folder the user picks.
   *
   * The folder picker rather than a silent write: a file the user cannot find is
   * not a backup, and app-private storage is exactly where Android hides files
   * from its own file manager. What comes back is stated by name, so the next step
   * ("move it off the phone") is something the user can actually do.
   */
  const exportEverything = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await saveJsonFile(backupBaseName(), exportBackupText());
      if (!outcome.saved) {
        setStatus({ tone: 'quiet', text: 'No folder picked, so nothing was saved.' });
        return;
      }
      commit();
      /*
       * A MANUAL EXPORT COUNTS AS A BACKUP, and it also teaches the automatic one
       * where to write. Both matter: without the first, "last backup 40 days ago"
       * would be a lie told to somebody who exported this morning; without the
       * second, the app would ask for a folder permission it was just handed.
       */
      settings.recordBackup(new Date().toISOString());
      const adopted = outcome.folderUri != null && settings.autoBackupFolderUri == null;
      if (adopted) settings.setAutoBackupFolder(outcome.folderUri);

      setStatus({
        tone: 'ok',
        text: `Saved ${outcome.name} to ${outcome.where} — ${describeCounts(onThisPhone())}.${
          adopted ? ' Automatic backups will go to that folder from now on.' : ''
        }`,
      });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error) });
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
  const importEverything = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const file = await pickJsonFile();
      if (!file) {
        setStatus({ tone: 'quiet', text: 'No file picked.' });
        return;
      }
      const result = parseBackup(await readTextFile(file.uri));
      if (!result.ok) {
        setStatus({ tone: 'quiet', text: `${file.name}: ${result.error}` });
        return;
      }
      setPending({ file: file.name, envelope: result.envelope, counts: result.counts });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const applied = applyBackup(pending.envelope);
    commit();
    setPending(null);
    setStatus({
      tone: 'ok',
      // What LANDED, not what the file claimed: rows that fail validation are
      // dropped on the way in, and a restore that reports the file's own numbers
      // is how someone learns not to trust the feature.
      text: `Restored ${describeCounts(applied)}${applied.settingsApplied ? ', and your settings' : ''}.`,
    });
  };

  /**
   * `Back up now`, and `Choose a folder` when there isn't one.
   *
   * The same write path the unattended one uses (`runBackupNow`), so the rotation
   * and the stamp cannot disagree between the two. Where no folder has been granted
   * this asks for one first, because that grant is the whole difference between a
   * backup that survives an uninstall and one that dies with it.
   */
  const backUpNow = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      let folder = settings.autoBackupFolderUri;
      if (!folder) {
        const picked = await pickFolder();
        if (!picked) {
          setStatus({ tone: 'quiet', text: 'No folder picked, so nothing was saved.' });
          return;
        }
        settings.setAutoBackupFolder(picked);
        folder = picked;
      }

      const result = await runBackupNow(true);
      if (!result.wrote) {
        setStatus({
          tone: 'quiet',
          text: 'Could not write to that folder. Pick it again to re-grant access.',
        });
        return;
      }
      commit();
      setStatus({
        tone: 'ok',
        text: `Backed up ${result.name} to ${folderLabel(folder)} — ${describeCounts(onThisPhone())}.`,
      });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const asking = pending != null || confirmingReset;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={asking ? { opacity: 0.28 } : undefined}>
        <StatusBar style="light" />
        <SectionTopBar title="Settings" />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!asking}
        >
          <Kicker className="mx-lg mb-sm mt-md">Sections</Kicker>
          <ListCard className="mx-lg">
            <NavRow label="Workout settings" onPress={onOpenWorkoutSettings} />
            <Separator />
            <NavRow label="Daily tasks settings" onPress={onOpenTaskSettings} />
            <Separator />
            <NavRow label="Expenses settings" onPress={onOpenMoneySettings} />
          </ListCard>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            Each one holds only what its own section reads. Rest, plates and weekly targets are
            training; the automatic tick is the daily tasks; what amounts are counted in is the
            expenses.
          </Text>

          {/* ----------------------------------------------------------
              AUTOMATIC BACKUP — the row that makes the one below it optional.

              `lib/backup.ts` says a backup is "the only thing standing between a
              year of training and a factory reset", and then made it a button:
              protection only as good as the user's memory of a screen they have no
              other reason to open. So it happens on its own, and this row is the
              receipt — the AGE of the last copy, in words, because "is it recent
              enough" is the only question it answers and a date makes the reader do
              the arithmetic.

              It cannot be on without a folder: Android's only durable destination
              is a granted directory, and the app's own sandbox dies with the app —
              which is one of the exact events a backup exists to survive. So the
              row states which of the two facts is missing. */}
          <Kicker className="mx-lg mb-sm mt-xxl">Everything, in one file</Kicker>
          <View className="mx-lg overflow-hidden rounded-surface border border-hairline bg-surface">
            <SettingRow
              label="Last backup"
              value={describeBackupAge(settings.lastBackupAt)}
              valueTone={settings.lastBackupAt == null ? 'muted' : 'faint'}
            />
            <Separator inset={0} />
            <SettingRow
              label="Back up automatically"
              value={
                !settings.autoBackupEnabled
                  ? 'Off'
                  : settings.autoBackupFolderUri == null
                    ? 'Needs a folder'
                    : `Every ${settings.autoBackupIntervalDays} days · ${folderLabel(settings.autoBackupFolderUri)}`
              }
              valueTone={
                settings.autoBackupEnabled && settings.autoBackupFolderUri == null
                  ? 'muted'
                  : 'faint'
              }
              onPress={() => {
                tap();
                settings.setAutoBackupEnabled(!settings.autoBackupEnabled);
              }}
            />
            {settings.autoBackupEnabled ? (
              <>
                <Separator inset={0} />
                <StepperRow
                  label="Backup every"
                  value={`${settings.autoBackupIntervalDays} days`}
                  onDecrease={() => {
                    tap();
                    settings.bumpNumber(
                      'autoBackupIntervalDays',
                      -SETTING_LIMITS.autoBackupIntervalDays.step,
                    );
                  }}
                  onIncrease={() => {
                    tap();
                    settings.bumpNumber(
                      'autoBackupIntervalDays',
                      SETTING_LIMITS.autoBackupIntervalDays.step,
                    );
                  }}
                />
              </>
            ) : null}
            <Separator inset={0} />
            <TextButton
              label={
                settings.autoBackupFolderUri == null ? 'Choose a backup folder' : 'Back up now'
              }
              tone="green"
              onPress={() => void backUpNow()}
            />
            <Separator inset={0} />
            <TextButton
              label="Export everything"
              tone="green"
              onPress={() => void exportEverything()}
            />
            <Separator inset={0} />
            <TextButton
              label="Replace everything from a file"
              tone="green"
              onPress={() => void importEverything()}
            />
            <Separator inset={0} />
            <TextButton
              label="Reset every setting to its default"
              onPress={() => setConfirmingReset(true)}
            />
          </View>

          {status ? (
            <Text
              className={[
                'mx-lg mt-md text-label',
                status.tone === 'ok' ? 'text-green-bright' : 'text-ink-muted',
              ].join(' ')}
            >
              {status.text}
            </Text>
          ) : null}

          <Text className="mx-lg mt-md text-label text-ink-faint">
            A backup is plain JSON, so you can read it, keep it anywhere, and move it to another
            phone. It holds all three sections — training, the daily tasks and the expenses — and
            every setting. <Text className="text-ink-muted">Replace everything</Text> makes this
            phone look like the file, so export first if there is anything here you would miss. A
            backup written by an older version carries no tasks and no amounts, and restoring one
            leaves both of those exactly where they are rather than emptying them. A workout in
            progress is not part of a backup: it carries a running clock.
          </Text>

          <Text className="mx-lg mt-md text-label text-ink-faint">
            <Text className="text-ink-muted">Reset every setting</Text> puts all three
            sections&apos; settings back to their defaults at once. It does not touch a single thing
            you have logged — not an exercise, not a routine, not an answered day, not an amount.
          </Text>
        </ScrollView>
      </View>

      {pending ? (
        <ConfirmSheet
          title="Replace everything with this file?"
          body={[
            `${pending.file} holds ${describeCounts(pending.counts)}.`,
            `This phone has ${describeCounts(onThisPhone())}, and all of it goes.`,
            'This cannot be undone.',
          ].join(' ')}
          confirmLabel="Import it"
          cancelLabel="Keep what I have"
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {confirmingReset ? (
        <ConfirmSheet
          title="Reset every setting?"
          body="Every duration, switch, target and default across all three sections goes back to how it shipped, and your bodyweight is cleared. Your exercises, routines, history, tasks and amounts are untouched."
          confirmLabel="Reset settings"
          cancelLabel="Keep mine"
          onConfirm={() => {
            settings.resetToDefaults();
            setConfirmingReset(false);
            setStatus({ tone: 'ok', text: 'Every setting is back to its default.' });
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      ) : null}
    </View>
  );
}
