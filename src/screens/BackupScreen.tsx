/**
 * BackupScreen — get everything off the phone, and get it back.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  BACK UP & RESTORE                         │
 *   │ ON THIS PHONE                                │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ 42 workouts · 512 sets · 88 exercises …  │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ EXPORT                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Save a backup file…                      │ │
 *   │ │ Save inside the app instead              │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ ✓ Saved workout-tracker-…-0912.json to Download│
 *   │ IMPORT                                       │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Choose the folder you saved to…          │ │
 *   │ │ Paste a backup instead                   │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ 3 BACKUPS IN DOWNLOAD                        │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ workout-tracker-backup-2026-08-19-0912.json│ │
 *   │ │ workout-tracker-backup-2026-08-12-2140.json│ │
 *   │ └──────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────┘
 *
 * THE ONE RULE THIS SCREEN FOLLOWS: NOTHING IS REPLACED WITHOUT A COUNT AND A
 * QUESTION. Importing is the only irreversible action in the app that isn't a
 * delete — it overwrites a log that cannot be reconstructed — so the sheet states
 * what is in the file AND what is on the phone right now, and the report afterwards
 * states what actually landed rather than what the file claimed. A restore that
 * silently drops eleven malformed workouts and says "42 restored" is how someone
 * learns not to trust a backup.
 *
 * Why a folder and then a list, rather than a file dialog: see `lib/backupFile.ts` —
 * Android's folder picker is what this app can reach without adding a native module,
 * and it is enough. `Paste a backup instead` is the path that needs no file system at
 * all, for a backup that arrived in a chat or an email.
 *
 * Everything on this screen is wiring: the format is `lib/backup.ts`, the store
 * writes are `state/dataTransfer.ts`, and the file system is `lib/backupFile.ts`.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator, SettingRow, TextButton } from '../components/primitives';
import {
  backupBaseName,
  countPayload,
  describeCounts,
  parseBackup,
  type BackupCounts,
  type BackupEnvelope,
} from '../lib/backup';
import {
  canPickFolder,
  describeError,
  folderLabel,
  listJsonFiles,
  pickFolder,
  readTextFile,
  writeToAppFolder,
  writeToFolder,
  type FoundFile,
} from '../lib/backupFile';
import { commit, tap } from '../lib/feedback';
import { applyBackup, currentSnapshot, exportBackupText } from '../state/dataTransfer';
import { useActiveWorkout } from '../state/activeWorkoutStore';
import { useLibrary } from '../state/libraryStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { palette } from '../theme/tokens';

/** A one-line report under the buttons: what just happened, good or bad. */
interface Status {
  tone: 'ok' | 'error';
  text: string;
}

/** A parsed file waiting for the user to confirm that it may replace everything. */
interface Pending {
  envelope: BackupEnvelope;
  counts: BackupCounts;
  /** Where it came from, for the sheet: a file name, or "the pasted text". */
  source: string;
}

export function BackupScreen({ onBack }: { onBack: () => void }) {
  const exercises = useLibrary((s) => s.exercises.length);
  const routines = useLibrary((s) => s.routines.length);
  const workouts = useWorkoutHistory((s) => s.workouts);
  const hasSession = useActiveWorkout((s) => s.session != null);

  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<{ uri: string; files: FoundFile[] } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const here = useMemo<BackupCounts>(
    () => countPayload(currentSnapshot()),
    // Recomputed whenever any of the three collections changes size, which is the
    // only way this screen's numbers can move while it is open.
    [exercises, routines, workouts],
  );

  const pickerAvailable = canPickFolder();

  /* --- export -------------------------------------------------------- */

  const saveToFolder = async () => {
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const target = await pickFolder();
      if (!target) {
        setStatus({ tone: 'error', text: 'No folder was picked, so nothing was saved.' });
        return;
      }
      const name = await writeToFolder(target, backupBaseName(), exportBackupText());
      commit();
      setStatus({ tone: 'ok', text: `Saved ${name} to ${folderLabel(target)}.` });
    } catch (error) {
      setStatus({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const saveInApp = async () => {
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const path = await writeToAppFolder(backupBaseName(), exportBackupText());
      commit();
      setStatus({
        tone: 'ok',
        text: `Saved to ${path}. This copy survives an app update, but NOT an uninstall — save one to a folder as well.`,
      });
    } catch (error) {
      setStatus({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  /* --- import -------------------------------------------------------- */

  const chooseFolder = async () => {
    tap();
    setBusy(true);
    setStatus(null);
    setFolder(null);
    try {
      const target = await pickFolder();
      if (!target) {
        setStatus({ tone: 'error', text: 'No folder was picked.' });
        return;
      }
      const files = await listJsonFiles(target);
      setFolder({ uri: target, files });
      if (files.length === 0) {
        setStatus({
          tone: 'error',
          text: `There are no .json files in ${folderLabel(target)}. Pick the folder you exported to.`,
        });
      }
    } catch (error) {
      setStatus({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (file: FoundFile) => {
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const text = await readTextFile(file.uri);
      const result = parseBackup(text);
      if (!result.ok) {
        setStatus({ tone: 'error', text: `${file.name}: ${result.error}` });
        return;
      }
      setPending({ envelope: result.envelope, counts: result.counts, source: file.name });
    } catch (error) {
      setStatus({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const openPasted = () => {
    tap();
    setStatus(null);
    const result = parseBackup(pasted);
    if (!result.ok) {
      setStatus({ tone: 'error', text: result.error });
      return;
    }
    setPending({ envelope: result.envelope, counts: result.counts, source: 'the pasted backup' });
  };

  const confirmImport = () => {
    if (!pending) return;
    const applied = applyBackup(pending.envelope);
    commit();
    setPending(null);
    setFolder(null);
    setPasting(false);
    setPasted('');
    setStatus({
      tone: 'ok',
      text: `Restored ${describeCounts(applied)}${applied.settingsApplied ? ', and your settings' : ''}.`,
    });
  };

  const dimmed = pending != null;

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={dimmed ? { opacity: 0.28 } : undefined}>
        <ScreenHeader kicker="Back up & restore" onBack={onBack} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!dimmed}
        >
          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm">On this phone</Kicker>
          <ListCard className="mx-lg">
            <SettingRow label="Workouts" value={String(here.workouts)} />
            <Separator />
            <SettingRow label="Logged sets" value={String(here.sets)} />
            <Separator />
            <SettingRow label="Exercises" value={String(here.exercises)} />
            <Separator />
            <SettingRow label="Routines" value={String(here.routines)} />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">Export</Kicker>
          <ListCard className="mx-lg">
            {pickerAvailable ? (
              <>
                <ActionRow
                  label="Save a backup file…"
                  hint="Pick a folder you can find again — Download works"
                  disabled={busy}
                  onPress={() => void saveToFolder()}
                />
                <Separator inset={0} />
              </>
            ) : null}
            <ActionRow
              label="Save inside the app"
              hint="Survives an app update, but not an uninstall"
              tone="quiet"
              disabled={busy}
              onPress={() => void saveInApp()}
            />
          </ListCard>

          {/* ---------------------------------------------------------- */}
          <Kicker className="mx-lg mb-sm mt-xxl">Import</Kicker>
          <ListCard className="mx-lg">
            {pickerAvailable ? (
              <>
                <ActionRow
                  label="Choose the folder you saved to…"
                  hint="The backups in it are listed below"
                  disabled={busy}
                  onPress={() => void chooseFolder()}
                />
                <Separator inset={0} />
              </>
            ) : null}
            <ActionRow
              label={pasting ? 'Hide the paste field' : 'Paste a backup instead'}
              hint={pasting ? undefined : 'For a backup that arrived in a message'}
              tone="quiet"
              disabled={busy}
              onPress={() => {
                tap();
                setPasting((open) => !open);
              }}
            />
          </ListCard>

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

          {/* The backups found in the chosen folder. */}
          {folder && folder.files.length > 0 ? (
            <>
              <Kicker className="mx-lg mb-sm mt-xl">
                {folder.files.length} {folder.files.length === 1 ? 'file' : 'files'} in{' '}
                {folderLabel(folder.uri)}
              </Kicker>
              <ListCard className="mx-lg">
                {folder.files.map((file, index) => (
                  <View key={file.uri}>
                    {index > 0 ? <Separator /> : null}
                    <Pressable
                      onPress={() => void openFile(file)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${file.name}`}
                      className="h-row flex-row items-center px-lg"
                    >
                      <Text numberOfLines={1} className="flex-1 text-body text-ink">
                        {file.name}
                      </Text>
                      <Icon name="chevron-right" size={18} color={palette.inkFaint} />
                    </Pressable>
                  </View>
                ))}
              </ListCard>
            </>
          ) : null}

          {/* The no-file-system path. */}
          {pasting ? (
            <View className="mx-lg mt-xl">
              <View className="rounded-surface border border-hairline bg-surface-alt p-md">
                <TextInput
                  value={pasted}
                  onChangeText={setPasted}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder='{ "format": "workout-tracker-backup", … }'
                  placeholderTextColor={palette.inkFaint}
                  cursorColor={palette.greenBright}
                  selectionColor={palette.greenBright}
                  accessibilityLabel="Backup JSON"
                  className="min-h-[120px] text-label text-ink"
                />
              </View>
              <View className="mt-sm overflow-hidden rounded-surface border border-hairline bg-surface">
                <TextButton
                  label={pasted.trim() === '' ? 'Nothing pasted yet' : 'Read this backup'}
                  onPress={() => {
                    if (pasted.trim() !== '') openPasted();
                  }}
                />
              </View>
            </View>
          ) : null}

          {/* ---------------------------------------------------------- */}
          <Text className="mx-lg mt-xxl text-label text-ink-faint">
            A backup holds every exercise, every routine, every finished workout with the sets
            inside it, and your settings. It is plain JSON, so you can read it, keep it anywhere,
            and move it to another phone.
          </Text>
          <Text className="mx-lg mt-md text-label text-ink-faint">
            Importing REPLACES what is on this phone — it is not merged. Export first if you have
            anything here you would miss.
          </Text>
          {hasSession ? (
            <Text className="mx-lg mt-md text-label text-ink-muted">
              The workout you have in progress is not part of a backup: it carries a running clock.
              Finish it first, then export.
            </Text>
          ) : null}
        </ScrollView>
      </View>

      {pending ? (
        <ConfirmSheet
          title="Replace everything on this phone?"
          body={[
            `${pending.source} holds ${describeCounts(pending.counts)}.`,
            `This phone has ${describeCounts(here)}, and all of it goes.`,
            'This cannot be undone.',
          ].join(' ')}
          confirmLabel="Restore this backup"
          cancelLabel="Keep what I have"
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A row that does something. `quiet` is for the second option in a card — the
 * fallback path, present but not the one being recommended.
 */
function ActionRow({
  label,
  hint,
  tone = 'primary',
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
  onPress: () => void;
}) {
  const green = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={disabled ? { opacity: 0.5 } : undefined}
      className="min-h-[56px] flex-row items-center px-lg py-md"
    >
      <View className="flex-1 pr-md">
        <Text className={`text-body font-medium ${green ? 'text-ink' : 'text-ink-muted'}`}>
          {label}
        </Text>
        {hint ? <Text className="mt-[2px] text-label text-ink-faint">{hint}</Text> : null}
      </View>
      <Icon name="chevron-right" size={18} color={green ? palette.greenBright : palette.inkFaint} />
    </Pressable>
  );
}
