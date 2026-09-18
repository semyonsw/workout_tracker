/**
 * SettingsHomeScreen — three doors, one export, one import, one reset.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SETTINGS                            РУ  EN   │
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
 *
 * ── AND THE LANGUAGE IS IN THE CORNER, NOT IN A ROW ────────────────────────
 *
 * It is the one setting whose whole job is to be findable by somebody who cannot
 * read the screen it is on. A row saying `Язык` is invisible to exactly the
 * person who needs it, and so is one saying `Language`. Two letters in the
 * corner, each in its own script, are legible either way — and they are in the
 * corner rather than in the list because the corner is the same place on every
 * section root, which is where somebody who cannot read the app will look.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon, type IconName } from '../components/Icon';
import { LanguageToggle, SectionTopBar } from '../components/SectionTopBar';
import { BubblePressable } from '../components/bubbles';
import {
  FloatingAction,
  GlassSurface,
  Lamps,
  SpecularEdge,
  useBarInsets,
} from '../components/glass';
import { pressedStyle } from '../components/motion';
import { Kicker, Separator, SettingRow, StepperRow, TextButton } from '../components/primitives';
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
import { useLanguage, useT } from '../hooks/useT';
import { commit, tap } from '../lib/feedback';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_NAMES, type Language } from '../lib/i18n';
import { applyBackup, currentSnapshot, exportBackupText } from '../state/dataTransfer';
import { SETTING_LIMITS, useSettings } from '../state/settingsStore';
import { palette, radius } from '../theme/tokens';

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
  const t = useT();
  const language = useLanguage();
  const bars = useBarInsets();

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
      const outcome = await saveJsonFile(backupBaseName(), exportBackupText(), language);
      if (!outcome.saved) {
        setStatus({ tone: 'quiet', text: t('No folder picked, so nothing was saved.') });
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
        text: `${t('Saved {name} to {where} — {counts}.', {
          name: outcome.name,
          where: outcome.where,
          counts: describeCounts(onThisPhone(), language),
        })}${adopted ? ` ${t('Automatic backups will go to that folder from now on.')}` : ''}`,
      });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
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
        setStatus({ tone: 'quiet', text: t('No file picked.') });
        return;
      }
      const result = parseBackup(await readTextFile(file.uri), language);
      if (!result.ok) {
        setStatus({ tone: 'quiet', text: `${file.name}: ${result.error}` });
        return;
      }
      setPending({ file: file.name, envelope: result.envelope, counts: result.counts });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
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
      text: applied.settingsApplied
        ? t('Restored {counts}, and your settings.', { counts: describeCounts(applied, language) })
        : t('Restored {counts}.', { counts: describeCounts(applied, language) }),
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
          setStatus({ tone: 'quiet', text: t('No folder picked, so nothing was saved.') });
          return;
        }
        settings.setAutoBackupFolder(picked);
        folder = picked;
      }

      const result = await runBackupNow(true);
      if (!result.wrote) {
        setStatus({
          tone: 'quiet',
          text: t('Could not write to that folder. Pick it again to re-grant access.'),
        });
        return;
      }
      commit();
      setStatus({
        tone: 'ok',
        text: t('Backed up {name} to {folder} — {counts}.', {
          name: result.name ?? '',
          folder: folderLabel(folder, language),
          counts: describeCounts(onThisPhone(), language),
        }),
      });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
    } finally {
      setBusy(false);
    }
  };

  const asking = pending != null || confirmingReset;

  return (
    <View className="flex-1 bg-bg">
      <Lamps section="Settings" />
      <View className="flex-1" style={asking ? { opacity: 0.28 } : undefined}>
        <StatusBar style="light" />
        <SectionTopBar
          title={t('Settings')}
          trailing={
            <LanguageToggle
              options={LANGUAGES.map((value) => ({
                value,
                label: LANGUAGE_LABELS[value],
                name: LANGUAGE_NAMES[value],
              }))}
              active={language}
              onSelect={(value) => {
                tap();
                settings.setLanguage(value as Language);
              }}
            />
          }
        />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: bars.top + 8, paddingBottom: bars.bottom }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!asking}
        >
          <Kicker className="mx-lg mb-sm">{t('Sections')}</Kicker>
          {/* The three rows that ARE the app, each behind its own section's
              mark: the routine list, the tick, and the symbol amounts are counted
              in. The badge is what makes this list read as a map.

              Three separate panes with 8 of air between them rather than one
              card split by hairlines — a door is a thing, and three doors in one
              box read as three lines in a list. */}
          <View className="mx-lg">
            <SectionRow
              label={t('Workout settings')}
              hint={t('Rest, plates, weekly targets')}
              icon="routines"
              onPress={onOpenWorkoutSettings}
            />
            <SectionRow
              label={t('Daily tasks settings')}
              hint={t('The automatic tick')}
              icon="check"
              onPress={onOpenTaskSettings}
            />
            <SectionRow
              label={t('Expenses settings')}
              hint={t('What amounts are counted in')}
              icon="money"
              onPress={onOpenMoneySettings}
            />
          </View>
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {t(
              'Each one holds only what its own section reads. Rest, plates and weekly targets are training; the automatic tick is the daily tasks; what amounts are counted in is the expenses.',
            )}
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
          <Kicker className="mx-lg mb-sm mt-xxl">{t('Everything, in one file')}</Kicker>

          {/* THE HERO. The one fact on this screen anybody opens it to check —
              how old the last copy is — at a size nothing else here comes near.
              A phrase rather than a bare numeral, because "Never" and "Today"
              are both answers and neither is a number. */}
          <GlassSurface
            tier="lit"
            radius={radius.card}
            className="mx-lg mb-sm"
            tint="rgba(63,169,108,0.10)"
            borderColor="rgba(63,169,108,0.24)"
            style={{
              boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 28, color: 'rgba(0,0,0,0.44)' }],
            }}
          >
            <View className="p-[18px]">
              <Kicker tone="green">{t('Last backup')}</Kicker>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.8 }}
                className="mt-xs font-semibold tabular-nums text-ink"
              >
                {describeBackupAge(settings.lastBackupAt, undefined, language)}
              </Text>
              <Text className="mt-[2px] text-label font-medium text-ink-muted">
                {settings.autoBackupEnabled
                  ? t('Every {days} days', { days: settings.autoBackupIntervalDays })
                  : t('Automatic backups are off')}
              </Text>
            </View>
          </GlassSurface>

          <GlassSurface tier="well" radius={radius.row} flat className="mx-lg">
            <SettingRow
              label={t('Back up automatically')}
              value={
                !settings.autoBackupEnabled
                  ? 'Off'
                  : settings.autoBackupFolderUri == null
                    ? t('Needs a folder')
                    : `${t('Every {days} days', { days: settings.autoBackupIntervalDays })} · ${folderLabel(settings.autoBackupFolderUri, language)}`
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
                  label={t('Backup every')}
                  value={t('{days} days', { days: settings.autoBackupIntervalDays })}
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
              label={t('Export everything')}
              tone="green"
              onPress={() => void exportEverything()}
            />
            <Separator inset={0} />
            <TextButton
              label={t('Replace everything from a file')}
              tone="green"
              onPress={() => void importEverything()}
            />
            <Separator inset={0} />
          </GlassSurface>

          {/* PLACEMENT RULE 5. The one action on this screen that cannot be
              undone is plain text in a dashed box at the foot of the scroll —
              deliberately out of the thumb's arc. A reset should cost a scroll,
              not a flick. Still no red: this app has one hue, and a destructive
              action states what it does rather than shouting a colour. */}
          <BubblePressable
            onPress={() => setConfirmingReset(true)}
            radius={16}
            accessibilityRole="button"
            accessibilityLabel={t('Reset every setting to its default')}
            style={(state) => [
              pressedStyle(state),
              {
                marginTop: 26,
                marginHorizontal: 16,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: 'rgba(138,150,143,0.22)',
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={{ fontSize: 13 }}
              className="font-medium text-ink-muted"
            >
              {t('Reset every setting to its default')}
            </Text>
            <Text
              allowFontScaling={false}
              style={{ fontSize: 12, lineHeight: 16 }}
              className="mt-[2px] text-ink-faint"
            >
              {t('Nothing you have logged is touched.')}
            </Text>
          </BubblePressable>

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
            {t(
              'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds all three sections — training, the daily tasks and the expenses — and every setting.',
            )}{' '}
            <Text className="text-ink-muted">{t('Replace everything')}</Text>{' '}
            {t(
              'makes this phone look like the file, so export first if there is anything here you would miss. A backup written by an older version carries no tasks and no amounts, and restoring one leaves both of those exactly where they are rather than emptying them. A workout in progress is not part of a backup: it carries a running clock.',
            )}
          </Text>

          <Text className="mx-lg mt-md text-label text-ink-faint">
            <Text className="text-ink-muted">{t('Reset every setting')}</Text>{' '}
            {t(
              'puts all three sections’ settings back to their defaults at once. It does not touch a single thing you have logged — not an exercise, not a routine, not an answered day, not an amount.',
            )}
          </Text>
        </ScrollView>
      </View>

      {/* THE ONE NON-FILLED INSTANCE of the floating slot, and it earns the
          exception: a maintenance task should not shout in the same voice as
          `Add expense`. Same coordinates, same geometry, ghost glass. */}
      {asking ? null : (
        <FloatingAction
          label={
            settings.autoBackupFolderUri == null ? t('Choose a backup folder') : t('Back up now')
          }
          variant="ghost"
          onPress={() => void backUpNow()}
        />
      )}

      {pending ? (
        <ConfirmSheet
          title={t('Replace everything with this file?')}
          body={[
            t('{file} holds {counts}.', {
              file: pending.file,
              counts: describeCounts(pending.counts, language),
            }),
            t('This phone has {counts}, and all of it goes.', {
              counts: describeCounts(onThisPhone(), language),
            }),
            t('This cannot be undone.'),
          ].join(' ')}
          confirmLabel={t('Import it')}
          cancelLabel={t('Keep what I have')}
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {confirmingReset ? (
        <ConfirmSheet
          title={t('Reset every setting?')}
          body={t(
            'Every duration, switch, target and default across all three sections goes back to how it shipped, and your bodyweight is cleared. Your exercises, routines, history, tasks and amounts are untouched.',
          )}
          confirmLabel={t('Reset settings')}
          cancelLabel={t('Keep mine')}
          onConfirm={() => {
            settings.resetToDefaults();
            setConfirmingReset(false);
            setStatus({ tone: 'ok', text: t('Every setting is back to its default.') });
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One of the three doors at the top, as its own pane.
 *
 * The leading tile is the section's own mark, in the same green square the tab
 * it belongs to would draw — which is what makes this list read as the app's map
 * rather than as three more rows. A door inside a section does not get one;
 * there is nothing for it to be a mark of.
 */
function SectionRow({
  label,
  hint,
  icon,
  onPress,
}: {
  label: string;
  hint: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <GlassSurface tier="card" radius={radius.row} shadow="e1" flat className="mb-sm">
      <BubblePressable
        onPress={onPress}
        radius={radius.row}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${hint}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View
          style={{
            height: 36,
            width: 36,
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(63,169,108,0.24)',
            backgroundColor: 'rgba(63,169,108,0.16)',
          }}
        >
          <SpecularEdge color="rgba(236,241,238,0.12)" radius={12} />
          <Icon name={icon} size={16} color={palette.greenBright} />
        </View>
        <View className="flex-1 pr-md">
          <Text
            allowFontScaling={false}
            style={{ fontSize: 16, lineHeight: 21 }}
            className="font-medium text-ink"
          >
            {label}
          </Text>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ fontSize: 12 }}
            className="mt-[2px] text-ink-faint"
          >
            {hint}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </BubblePressable>
    </GlassSurface>
  );
}
