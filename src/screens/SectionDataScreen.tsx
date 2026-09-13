/**
 * SectionDataScreen — one section, out to a file and back.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ Daily tasks                                │
 *   │ Daily tasks, on their own                    │
 *   │ 9 tasks · 341 answered days                  │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Export daily tasks                       │ │
 *   │ │ Replace daily tasks from a file          │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ Saved workout-tracker-tasks-2026-09-13-0912… │
 *   └──────────────────────────────────────────────┘
 *
 * ONE SCREEN, THREE SECTIONS. The section is a prop, every sentence on it is
 * built from `SECTION_LABELS`, and the file it writes carries which section it
 * is — so a money file picked here says so and is refused rather than restored as
 * "no tasks". Three copies of this screen would be three places for that check to
 * go missing from.
 *
 * ── IT REPLACES, AND IT SAYS SO TWICE ─────────────────────────────────────
 *
 * Importing a section is the same operation `Replace everything from a file` is,
 * scoped: the section becomes what the file says, and what was there goes. So the
 * row is named `Replace …`, the confirmation states both counts — what is in the
 * file and what is on the phone — and neither of them is the number the file
 * CLAIMS: the counts come back from the stores after their own validators have
 * run. `state/dataTransfer.ts` has the argument in full.
 *
 * The blast radius is the whole point. Restoring the money cannot touch a set,
 * and restoring the tasks cannot touch an amount.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, Separator, TextButton } from '../components/primitives';
import { describeError, pickJsonFile, readTextFile, saveJsonFile } from '../lib/backupFile';
import { commit, tap } from '../lib/feedback';
import {
  SECTION_LABELS,
  countSection,
  describeSectionCounts,
  parseSection,
  sectionBaseName,
  type SectionCounts,
  type SectionName,
} from '../lib/sectionBackup';
import { applySection, exportSectionText, sectionSnapshot } from '../state/dataTransfer';

interface SectionDataScreenProps {
  section: SectionName;
  onBack: () => void;
}

/** A file read and understood, waiting for a yes. */
interface PendingSection {
  file: string;
  data: unknown;
  counts: SectionCounts;
}

/** The one line under the rows. `quiet` is "nothing happened", not an alarm. */
interface Status {
  tone: 'ok' | 'quiet';
  text: string;
}

export function SectionDataScreen({ section, onBack }: SectionDataScreenProps) {
  const label = SECTION_LABELS[section];
  const lower = label.toLowerCase();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState<PendingSection | null>(null);

  /*
   * What is on the phone right now, counted the same way a file is, and read at
   * the moment it is needed rather than subscribed to — this screen is a
   * destination you visit, not something that has to track a live log.
   */
  const onThisPhone = () => countSection(section, sectionSnapshot(section));

  const exportSection = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await saveJsonFile(sectionBaseName(section), exportSectionText(section));
      if (!outcome.saved) {
        setStatus({ tone: 'quiet', text: 'No folder picked, so nothing was saved.' });
        return;
      }
      commit();
      setStatus({
        tone: 'ok',
        text: `Saved ${outcome.name} to ${outcome.where} — ${describeSectionCounts(onThisPhone())}.`,
      });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Reading the file and APPLYING it are two steps, like every other import in
   * the app: this replaces a log, so the sheet gets to state what is in the file
   * and what is on the phone before anything goes.
   */
  const importSection = async () => {
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
      // `section` is passed, so a file from another section is refused by name
      // rather than sanitized down to nothing and reported as a success.
      const result = parseSection(await readTextFile(file.uri), section);
      if (!result.ok) {
        setStatus({ tone: 'quiet', text: `${file.name}: ${result.error}` });
        return;
      }
      setPending({ file: file.name, data: result.envelope.data, counts: result.counts });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const applied = applySection(section, pending.data);
    commit();
    setPending(null);
    // What LANDED, not what the file claimed.
    setStatus({ tone: 'ok', text: `Restored ${describeSectionCounts(applied)}.` });
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1" style={pending ? { opacity: 0.28 } : undefined}>
        <StatusBar style="light" />
        <ScreenHeader kicker={label} onBack={onBack} bordered={false} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={pending == null}
        >
          <Text className="mx-lg mt-sm text-title font-semibold text-ink">
            {label}, on their own
          </Text>
          <Text className="mx-lg mt-xs text-label tabular-nums text-ink-muted">
            {describeSectionCounts(onThisPhone())} on this phone
          </Text>

          <Kicker className="mx-lg mb-sm mt-xl">This section only</Kicker>
          <View className="mx-lg overflow-hidden rounded-surface border border-hairline bg-surface">
            <TextButton
              label={`Export ${lower}`}
              tone="green"
              onPress={() => void exportSection()}
            />
            <Separator inset={0} />
            <TextButton
              label={`Replace ${lower} from a file`}
              tone="green"
              onPress={() => void importSection()}
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
            One readable JSON file holding {lower} and nothing else — so you can move this section
            to another phone, or put it back, without touching the rest of the app.{' '}
            <Text className="text-ink-muted">Replace</Text> makes {lower} look like the file, so
            export first if there is anything here you would miss. A file from another section is
            refused rather than imported as nothing.
          </Text>
          <Text className="mx-lg mt-md text-label text-ink-faint">
            Everything at once — this section, the other two, and your settings — is{' '}
            <Text className="text-ink-muted">Export data</Text> in Settings.
          </Text>
        </ScrollView>
      </View>

      {pending ? (
        <ConfirmSheet
          title={`Replace ${lower} with this file?`}
          body={[
            `${pending.file} holds ${describeSectionCounts(pending.counts)}.`,
            `This phone has ${describeSectionCounts(onThisPhone())}, and all of it goes.`,
            'Nothing outside this section is touched. This cannot be undone.',
          ].join(' ')}
          confirmLabel="Import it"
          cancelLabel="Keep what I have"
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}
