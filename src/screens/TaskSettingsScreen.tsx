/**
 * TaskSettingsScreen — the two decisions the daily tasks screen cannot make for
 * itself.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ DAILY TASKS SETTINGS                       │
 *   │ ANSWERING                                    │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ Let the app tick what it knows    [ ●━ ] │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ HISTORY                                      │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THE AUTOMATIC TICK IS A SWITCH AND NOT A FACT ──────────────────────
 *
 * Two of the seeded tasks are answered by the rest of the app: finishing a
 * workout ticks the training one, recording an amount ticks the money one. That
 * is the best thing about them and it is also the one behaviour in the app that
 * happens without a thumb — and a tick nobody can account for is a tick you stop
 * trusting, which is the failure mode a habit log cannot survive. So it is on by
 * default (a tick you did not have to give is why those rows exist) and it can be
 * switched off, which turns both rows into ordinary tasks that mean "I said so".
 *
 * ── AND WHY THE RANGE IS A SETTING RATHER THAN A MEMORY ────────────────────
 *
 * The history screen's chips still change the range for as long as you are on it.
 * This is what it OPENS on, which is a different question: somebody who thinks in
 * weeks should not have to re-pick `Week` every time, and somebody who only ever
 * looks at the year should not be paying a tap for a month they never read.
 *
 * There is no row here for the tasks themselves. A task is content, not
 * configuration — it is added, renamed, scheduled and reordered on the screen
 * where it is answered, which is where you are standing when you decide any of
 * that.
 */

import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, SelectChip, SwitchRow } from '../components/primitives';
import { tap } from '../lib/feedback';
import { TREND_RANGES, TREND_RANGE_LABELS } from '../lib/trends';
import { useSettings } from '../state/settingsStore';

export function TaskSettingsScreen({ onBack }: { onBack: () => void }) {
  const autoTickTasks = useSettings((s) => s.autoTickTasks);
  const setFlag = useSettings((s) => s.setFlag);
  const tasksTrendRange = useSettings((s) => s.tasksTrendRange);
  const setTasksTrendRange = useSettings((s) => s.setTasksTrendRange);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker="Daily tasks settings" onBack={onBack} bordered={false} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm mt-md">Answering</Kicker>
        <ListCard className="mx-lg">
          <SwitchRow
            label="Let the app tick what it knows"
            hint="Finishing a workout ticks the training task; recording an amount ticks the expense one"
            value={autoTickTasks}
            onChange={(value) => setFlag('autoTickTasks', value)}
          />
        </ListCard>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {autoTickTasks
            ? 'Both rows are still ordinary tasks — you can tick them, skip them, and change what they say. This only means something else usually gets there first.'
            : 'Every task waits for you. Nothing in the app answers a row on its own, and marks already given stay exactly as they are.'}
        </Text>

        <Kicker className="mx-lg mb-sm mt-xxl">History opens on</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {TREND_RANGES.map((range) => (
            <SelectChip
              key={range}
              label={TREND_RANGE_LABELS[range]}
              selected={range === tasksTrendRange}
              onPress={() => {
                tap();
                setTasksTrendRange(range);
              }}
            />
          ))}
        </View>
        <Text className="mx-lg text-label text-ink-faint">
          Which range the ⟲ in the corner of the daily tasks opens on. The chips on that screen
          still change it while you are reading.
        </Text>
      </ScrollView>
    </View>
  );
}
