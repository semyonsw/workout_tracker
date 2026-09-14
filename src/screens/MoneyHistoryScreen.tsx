/**
 * MoneyHistoryScreen — the two lines and the share, behind the ⟲.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ EXPENSE HISTORY                            │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   │ (Expenses)(Incomes)                          │
 *   │ EXPENSES OVER TIME                           │
 *   │  ╱╲    ╱╲                                    │
 *   │ ╱  ╲__╱  ╲___                                │
 *   │ BALANCE OVER THE SAME RANGE                  │
 *   │ WHERE IT WENT                                │
 *   │ 🚌 Transport        10,300 AMD      36%      │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE WINDOW AND THE RANGE ARE STILL TWO QUESTIONS ───────────────────────
 *
 * That argument has not changed and it is why this screen exists at all: the
 * expenses screen's `‹ September 2026 ›` is a FILTER — how much this month — and
 * everything here is a SERIES — is it going up. They were stacked on one screen,
 * which meant the answer to the second question was four scrolls under the answer
 * to the first, and the two controls sat close enough together to look like one
 * control that was behaving strangely.
 *
 * So the filter stays on the section and the series moved behind the glyph, which
 * is the same glyph in the same corner as the training log's and the daily tasks'.
 * The direction chips come WITH it: which of expenses or incomes a line is drawn
 * from is a property of the line, and reaching back to the tiles on the previous
 * screen to change it would be the one control that stayed behind.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ScreenHeader } from '../components/ScreenHeader';
import { TrendChart } from '../components/TrendChart';
import { Kicker, SelectChip, Separator } from '../components/primitives';
import { dayKey } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  categoryShares,
  moneyBalanceSeries,
  moneyTrendSeries,
  summarizeMoneyTrend,
} from '../lib/moneyTrends';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import { formatMoney, formatValue, type Direction } from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useLanguage, useT, type Translate } from '../hooks/useT';
import { plural, t as translate, type Language } from '../lib/i18n';

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

export function MoneyHistoryScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const currency = useSettings((s) => s.currencyCode);
  /*
   * Seeded from the setting, then the chips own it — the same rule the task
   * history follows. A range that wrote itself back would make "what this opens
   * on" and "what I am looking at" one fact, and then a glance at the year would
   * silently change tomorrow.
   */
  const opensOn = useSettings((s) => s.moneyTrendRange);
  const [range, setRange] = useState<TrendRange>(opensOn);
  const [direction, setDirection] = useState<Direction>(
    () => useSettings.getState().moneyDefaultDirection,
  );

  const today = dayKey(new Date());
  const series = useMemo(
    () => moneyTrendSeries(amounts, direction, range, today),
    [amounts, direction, range, today],
  );
  const balanceLine = useMemo(
    () => moneyBalanceSeries(amounts, range, today),
    [amounts, range, today],
  );
  const trend = useMemo(() => summarizeMoneyTrend(series), [series]);
  const shares = useMemo(
    () => categoryShares(amounts, direction, range, today),
    [amounts, direction, range, today],
  );
  const namesById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const money = (value: number) => formatMoney(value, currency);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Expense history')} onBack={onBack} bordered={false} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-lg flex-row flex-wrap">
          {directions(t).map((option) => (
            <SelectChip
              key={option.value}
              label={option.label}
              selected={option.value === direction}
              onPress={() => {
                tap();
                setDirection(option.value);
              }}
            />
          ))}
        </View>

        <Kicker className="mx-lg mb-sm mt-xxl">
          {direction === 'expense' ? t('Expenses over time') : t('Incomes over time')}
        </Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {TREND_RANGES.map((option) => (
            <SelectChip
              key={option}
              label={t(TREND_RANGE_LABELS[option])}
              selected={option === range}
              onPress={() => {
                tap();
                setRange(option);
              }}
            />
          ))}
        </View>

        {/* A range with nothing in it is not a flat line at zero — it is a range
            with nothing in it, and the card says so. Every bucket is present by
            then (`lib/moneyTrends.ts` plots quiet days rather than skipping them),
            so the length alone would always be enough to draw. */}
        {series.length >= 2 && trend.total > 0 ? (
          <>
            <View className="mx-lg mt-md">
              <TrendChart points={series} formatValue={(value) => formatValue(value)} />
            </View>
            <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
              {t('{total} over {count} {buckets} · about {average} each', {
                total: money(trend.total),
                count: trend.buckets,
                buckets: bucketNoun(range, trend.buckets, lang),
                average: money(trend.average),
              })}
              {trend.peak
                ? ` · ${t('most on {label}, {value}', {
                    label: trend.peak.label,
                    value: money(trend.peak.value),
                  })}`
                : ''}
            </Text>

            <Kicker className="mx-lg mb-sm mt-xl">{t('Balance over the same range')}</Kicker>
            <View className="mx-lg">
              <TrendChart points={balanceLine} formatValue={(value) => formatValue(value)} />
            </View>
            <Text className="mx-lg mt-sm text-label text-ink-faint">
              {t(
                'Incomes less expenses, running. It starts from what you already had, so the left edge is where the range opened rather than zero.',
              )}
            </Text>

            {shares.length > 0 ? (
              <>
                <Kicker className="mx-lg mb-sm mt-xl">{t('Where it went')}</Kicker>
                <View className="mx-lg overflow-hidden rounded-surface border border-hairline bg-surface">
                  {shares.slice(0, 5).map((share, index) => (
                    <View key={share.categoryId}>
                      {index > 0 ? <Separator /> : null}
                      <ShareRow
                        glyph={namesById[share.categoryId]?.glyph ?? '•'}
                        name={namesById[share.categoryId]?.name ?? t('Archived')}
                        value={share.value}
                        percent={share.percent}
                        currency={currency}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <View className="mx-lg mt-md rounded-surface border border-hairline bg-surface p-lg">
            <Kicker>{t('Not enough yet')}</Kicker>
            <Text className="mt-sm text-body text-ink-muted">
              {t('Nothing recorded in this range. Put something in and the line draws itself.')}
            </Text>
          </View>
        )}

        <Text className="mx-lg mt-md text-label text-ink-faint">
          {t(
            'Up to three months the line is one point a day; past that it is one a month. A whole-month amount has no day to sit on, so it only appears once the buckets are months.',
          )}
        </Text>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function bucketNoun(range: TrendRange, count: number, lang: Language): string {
  /*
   * Spelled out rather than pluralised by appending an `s`, which is what this
   * did and which is wrong in the language this app now ships in: Russian has
   * three forms of a counted noun and none of them is the singular with a letter
   * on the end. `few` is the Russian-only form, so it is the Russian word.
   */
  const forms =
    range === 'year' || range === 'all'
      ? { one: translate('month', lang), few: 'месяца', many: translate('months', lang) }
      : { one: translate('day', lang), few: 'дня', many: translate('days', lang) };
  return plural(count, lang, forms);
}

/**
 * WHERE IT WENT — the five categories with the most in them, each with a bar.
 *
 * The bar is the share of the range's total, so the five read as a division of
 * one thing rather than as five unrelated totals. Five and not all of them:
 * a list long enough to need scrolling stops being a shape.
 */
function ShareRow({
  glyph,
  name,
  value,
  percent,
  currency,
}: {
  glyph: string;
  name: string;
  value: number;
  percent: number;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
}) {
  return (
    <View className="h-row-lg justify-center px-lg">
      <View className="flex-row items-center">
        <Text className="mr-sm text-label">{glyph}</Text>
        <Text numberOfLines={1} className="flex-1 text-body text-ink">
          {name}
        </Text>
        <Text className="ml-md text-body tabular-nums text-green-bright">
          {formatMoney(value, currency)}
        </Text>
        <Text className="ml-sm w-[40px] text-right text-label tabular-nums text-ink-faint">
          {percent}%
        </Text>
      </View>
      <View className="mt-xs h-[4px] overflow-hidden rounded-pill bg-green-dim">
        <View className="h-[4px] rounded-pill bg-green-bright" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
