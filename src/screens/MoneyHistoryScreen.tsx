/**
 * MoneyHistoryScreen — one day in full, then the two lines and the share.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ EXPENSE HISTORY · CASH                     │
 *   │ ONE DAY AT A TIME                            │
 *   │ ‹        12 September 2026        ›          │
 *   │ 🚌 Transport                    400 AMD    › │
 *   │    taxi to the gym                           │
 *   │ 🧊 Food                       2,600 AMD    › │
 *   │    no note                                   │
 *   │ Spent 3,000 AMD · received 0 AMD             │
 *   │ EXPENSES OVER TIME                           │
 *   │ (Expenses)(Incomes)                          │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   │  ╱╲    ╱╲                                    │
 *   │ ╱  ╲__╱  ╲___                                │
 *   │ BALANCE OVER THE SAME RANGE                  │
 *   │ WHERE IT WENT                                │
 *   │ 🚌 Transport        10,300 AMD      36%      │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE DAY LIST IS WHERE A NOTE FINALLY GETS READ ────────────────────────
 *
 * Every amount can carry a sentence saying what it was for, and for three
 * releases the only place one appeared was inside one category's own list, in
 * whatever window that screen had been opened with. So reading back a single
 * Tuesday — what did I actually spend this on — meant opening eight categories
 * and reassembling the day in your head, and the notes were in practice
 * write-only.
 *
 * The day list is that Tuesday, whole: every category, both directions, in the
 * order the amounts were written down, each with its note on a line of its own.
 * It is deliberately the FIRST thing on this screen and not a fourth chart,
 * because "what was that 2,600" is a question with an exact answer sitting in
 * the log, and everything below it is a shape rather than an answer.
 *
 * It does NOT follow the direction chips. Those pick which line is drawn; a day
 * is not a direction, and hiding the morning's income behind a chip meant for a
 * chart would make the day's own total unreadable against its rows.
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
 * THE SUBSECTION IS NOT ONE OF THE TWO QUESTIONS. It came with the tap — these
 * are the lines for the chip the money screen was reading — because a chart
 * whose total disagrees with the screen it was opened from is a chart nobody can
 * use, and that is exactly what summing Cash and Online here would produce.
 *
 * So the filter stays on the section and the series moved behind the glyph, which
 * is the same glyph in the same corner as the training log's and the daily tasks'.
 * The direction chips come WITH it: which of expenses or incomes a line is drawn
 * from is a property of the line, and reaching back to the tiles on the previous
 * screen to change it would be the one control that stayed behind.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import { GlassCard, Kicker, SelectChip, Separator, TextButton } from '../components/primitives';
import { dayKey, formatLongDay, shiftDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  categoryShares,
  moneyBalanceSeries,
  moneyTrendSeries,
  summarizeMoneyTrend,
} from '../lib/moneyTrends';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import {
  amountsOnDay,
  formatMoney,
  formatValue,
  inAccount,
  type Amount,
  type Direction,
  type MoneyAccount,
  type MoneyCategory,
} from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { glowRepeating, palette } from '../theme/tokens';
import { useSettings } from '../state/settingsStore';
import { useLanguage, useT, type Translate } from '../hooks/useT';
import { plural, t as translate, type Language } from '../lib/i18n';
import type { ID } from '../types/models';

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

export function MoneyHistoryScreen({
  account,
  day: openOn,
  onBack,
  onOpenAmount,
}: {
  /** The subsection the ⟲ was tapped in. Every line here is drawn from it alone. */
  account: MoneyAccount;
  /**
   * The day the money screen was anchored on. Not `today`: stepping back three
   * days and then opening the history is a question about THOSE three days ago,
   * and landing on today would be the screen forgetting where the user was.
   */
  day: string;
  onBack: () => void;
  /** A row of the day list, opened in the editor it was written in. */
  onOpenAmount: (amountId: ID) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const categories = useMoney((s) => s.categories);
  const all = useMoney((s) => s.amounts);
  const amounts = useMemo(() => inAccount(all, account.id), [all, account.id]);
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
  /*
   * Which day the list below is reading. Its own state and not the chart's range:
   * they answer different questions, and a day that moved when the range chips
   * were touched would be the one control on this screen that did two things.
   */
  const [day, setDay] = useState(openOn);
  const dayRows = useMemo(() => amountsOnDay(amounts, day), [amounts, day]);
  const dayTotals = useMemo(
    () =>
      dayRows.reduce(
        (sums, row) => ({
          spent: sums.spent + (row.direction === 'expense' ? row.value : 0),
          received: sums.received + (row.direction === 'income' ? row.value : 0),
        }),
        { spent: 0, received: 0 },
      ),
    [dayRows],
  );
  const series = useMemo(
    () => moneyTrendSeries(amounts, direction, range, today, lang),
    [amounts, direction, lang, range, today],
  );
  const balanceLine = useMemo(
    () => moneyBalanceSeries(amounts, range, today, lang),
    [amounts, lang, range, today],
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
      <ScreenHeader
        kicker={`${t('Expense history')} · ${account.name}`}
        onBack={onBack}
        bordered={false}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">{t('One day at a time')}</Kicker>

        {/* THE DAY. Both directions, every category, and the note on its own line —
            see the file header. The chevrons step ONE day, like the window picker
            on the money screen, so where a tap lands is never a surprise; `Today`
            is the way back from a walk into last month. */}
        <View className="mx-lg flex-row items-center">
          <Pressable
            onPress={() => {
              tap();
              setDay((current) => shiftDay(current, -1));
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The day before')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            <Icon name="chevron-left" size={20} color={palette.inkMuted} />
          </Pressable>
          <Text className="flex-1 text-center text-body font-medium tabular-nums text-ink">
            {formatLongDay(day, lang)}
          </Text>
          <Pressable
            onPress={() => {
              tap();
              setDay((current) => shiftDay(current, 1));
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The day after')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            <Icon name="chevron-right" size={20} color={palette.inkMuted} />
          </Pressable>
        </View>

        {dayRows.length > 0 ? (
          <>
            <GlassCard className="mx-lg mt-sm">
              {dayRows.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Separator /> : null}
                  <DayRow
                    amount={row}
                    category={namesById[row.categoryId] ?? null}
                    currency={currency}
                    onPress={() => onOpenAmount(row.id)}
                  />
                </View>
              ))}
            </GlassCard>
            <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
              {t('Spent {spent} · received {received}', {
                spent: money(dayTotals.spent),
                received: money(dayTotals.received),
              })}
            </Text>
          </>
        ) : (
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            {t(
              'Nothing recorded on this day. A whole-month amount is on no day at all, so it is not here either.',
            )}
          </Text>
        )}

        {day !== today ? (
          <View className="mx-lg">
            <TextButton
              label={t('Today')}
              onPress={() => {
                tap();
                setDay(today);
              }}
            />
          </View>
        ) : null}

        <Kicker className="mx-lg mb-sm mt-xxl">
          {direction === 'expense' ? t('Expenses over time') : t('Incomes over time')}
        </Kicker>
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
                <GlassCard className="mx-lg">
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
                </GlassCard>
              </>
            ) : null}
          </>
        ) : (
          <GlassCard className="mx-lg mt-md p-lg">
            <Kicker>{t('Not enough yet')}</Kicker>
            <Text className="mt-sm text-body text-ink-muted">
              {t('Nothing recorded in this range. Put something in and the line draws itself.')}
            </Text>
          </GlassCard>
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
 * ONE AMOUNT, ON THE DAY IT WAS RECORDED — the glyph, the category, and the NOTE.
 *
 * The note is why this row exists. It was written at the till, it is the only
 * record of what the 2,600 actually was, and until now the single screen that
 * showed it was one category's own list in one window — so reading back a
 * Tuesday meant opening eight categories and reassembling it by hand.
 *
 * So the note is a LINE OF ITS OWN and not a tail on the meta line: it is a
 * sentence a person wrote, it is the longest thing in the row, and truncating it
 * to fit beside a date would hide exactly the half that says why. Two lines of it,
 * then an ellipsis — the editor is one tap away and holds the rest.
 *
 * A row with no note says `no note` in `ink-faint` rather than collapsing. An
 * amount nobody explained is a fact about that amount, and a list whose rows
 * changed height depending on it would be harder to scan than one that does not.
 */
function DayRow({
  amount,
  category,
  currency,
  onPress,
}: {
  amount: Amount;
  /** Null once the category has been archived — the amount outlives it. */
  category: MoneyCategory | null;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
  onPress: () => void;
}) {
  const t = useT();
  const note = amount.note.trim();
  const name = category?.name ?? t('Archived');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${formatMoney(amount.value, currency)}. ${note === '' ? t('no note') : note}`}
      style={pressedStyle}
      className="justify-center px-lg py-md"
    >
      <View className="flex-row items-center">
        <Text className="mr-sm text-label">{category?.glyph ?? '•'}</Text>
        <Text numberOfLines={1} className="flex-1 text-body text-ink">
          {name}
        </Text>
        <Text className="ml-md text-body tabular-nums text-ink">
          {amount.direction === 'income' ? '+' : ''}
          {formatMoney(amount.value, currency)}
        </Text>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </View>
      <Text
        numberOfLines={2}
        className={`ml-[22px] mt-[2px] text-label ${note === '' ? 'text-ink-faint' : 'text-ink-muted'}`}
      >
        {note === '' ? t('no note') : note}
      </Text>
    </Pressable>
  );
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
      <View className="mt-sm h-[4px] overflow-hidden rounded-pill bg-green-dim">
        <View
          className="h-[4px] rounded-pill bg-green-bright"
          style={{
            width: `${percent}%`,
            // The bar is the one place a share is a length rather than a number,
            // so it gets the glow: at 4px, a lit bar is legible where a flat one
            // is a hairline in the same colour as the track. Five of these in a
            // card, so it is the repeating value — see `theme/tokens.ts`.
            boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 5, color: glowRepeating }],
          }}
        />
      </View>
    </View>
  );
}
