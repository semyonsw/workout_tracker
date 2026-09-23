/**
 * MoneySettingsScreen — what the expenses section counts in, and what it opens
 * on.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ EXPENSES SETTINGS                          │
 *   │ COUNTED IN                                   │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ AMD                                      │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ OPENS ON                                     │
 *   │ (Day)(Week)(Month)(Year)(All time)           │
 *   │ (Expenses)(Incomes)                          │
 *   │ HISTORY OPENS ON                             │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE CURRENCY IS A LABEL, AND THE SCREEN SAYS SO ────────────────────────
 *
 * Nothing is converted. Every amount is a plain integer with no currency on it,
 * and changing this field repaints every figure in the app without touching a
 * single one of them. Converting would need a rate, a date for that rate, and an
 * opinion about what last March's taxi cost in the new unit; the app has none of
 * those, and inventing them would rewrite somebody's history to make a label
 * change look tidy. The line under the field is not a disclaimer — it is the
 * whole contract, and it is why this can be a free text field instead of a list
 * of codes the app pretends to understand.
 *
 * ── AND THE TWO DEFAULTS ARE DEFAULTS, NOT LOCKS ───────────────────────────
 *
 * The window stepper and the two direction tiles still do exactly what they did.
 * These say where the section STARTS, which is the tap you were paying every
 * single time: somebody who records cash daily wants `Day`, and the month they
 * had to step back from was never the answer.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ScreenHeader } from '../components/ScreenHeader';
import { FieldWell, Kicker, SelectChip } from '../components/primitives';
import { useT, type Translate } from '../hooks/useT';
import { tap } from '../lib/feedback';
import { INTERVALS, INTERVAL_LABELS } from '../lib/money';
import { TREND_RANGES, TREND_RANGE_LABELS } from '../lib/trends';
import { useSettings } from '../state/settingsStore';

/*
 * A function rather than a constant, because the labels are translated: a
 * module-level array would be frozen in whichever language the app started in.
 */
function directions(t: Translate) {
  return [
    { value: 'expense' as const, label: t('Expenses') },
    { value: 'income' as const, label: t('Incomes') },
  ];
}

export function MoneySettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const settings = useSettings();

  /*
   * The field is uncontrolled-ish on purpose: the store sanitizes (uppercases,
   * trims, caps at four) and a controlled field fed straight from that fights the
   * keyboard — you could not type a lowercase letter, and clearing the field to
   * retype would snap it back to `AMD` under the cursor. So the draft is local
   * while the field has focus, and the store hears about it on blur.
   */
  const [draft, setDraft] = useState(settings.currencyCode);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader
        kicker={t('Expenses settings')}
        /* Commits on the way out as well as on blur: `‹` with the keyboard up
           unmounts the field before its blur runs, and `USD` was lost. */
        onBack={() => {
          if (draft !== settings.currencyCode) settings.setCurrencyCode(draft);
          onBack();
        }}
        bordered={false}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker className="mx-lg mb-sm mt-md">{t('Counted in')}</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={draft}
            placeholder="AMD"
            onChangeText={setDraft}
            selectAllOnFocus
            onBlur={() => {
              settings.setCurrencyCode(draft);
              // Back from the sanitizer, so the field shows what was actually
              // stored rather than what was typed at it.
              setDraft(useSettings.getState().currencyCode);
            }}
            accessibilityLabel={t('What amounts are counted in')}
          />
        </View>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {t(
            'A label, not a conversion. Every amount is stored as a plain number, so changing this changes what is printed after each figure and nothing else — no rate, no rewriting of what you already recorded. Up to four characters; points and tokens are as valid here as a currency.',
          )}
        </Text>

        <Kicker className="mx-lg mb-sm mt-xxl">{t('Opens on')}</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {INTERVALS.map((interval) => (
            <SelectChip
              key={interval}
              label={t(INTERVAL_LABELS[interval])}
              selected={interval === settings.moneyDefaultInterval}
              onPress={() => {
                tap();
                settings.setMoneyDefaultInterval(interval);
              }}
            />
          ))}
        </View>
        <View className="mx-lg flex-row flex-wrap">
          {directions(t).map((option) => (
            <SelectChip
              key={option.value}
              label={option.label}
              selected={option.value === settings.moneyDefaultDirection}
              onPress={() => {
                tap();
                settings.setMoneyDefaultDirection(option.value);
              }}
            />
          ))}
        </View>
        <Text className="mx-lg text-label text-ink-faint">
          {t(
            'The window and the direction the expenses section starts at. Both still change on that screen; this is only where it begins.',
          )}
        </Text>

        <Kicker className="mx-lg mb-sm mt-xxl">{t('History opens on')}</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {TREND_RANGES.map((range) => (
            <SelectChip
              key={range}
              label={t(TREND_RANGE_LABELS[range])}
              selected={range === settings.moneyTrendRange}
              onPress={() => {
                tap();
                settings.setMoneyTrendRange(range);
              }}
            />
          ))}
        </View>
        <Text className="mx-lg text-label text-ink-faint">
          {t('Which range the ⟲ in the corner of the expenses opens on.')}
        </Text>
      </ScrollView>
    </View>
  );
}
