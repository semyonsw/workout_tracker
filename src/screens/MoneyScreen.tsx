/**
 * MoneyScreen — the balance, the window, and where it went.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │              OVERALL BALANCE                 │
 *   │                9,020 AMD                     │
 *   │          ‹  September 2026 ▾  ›              │
 *   │ ┌──────────────────┬───────────────────────┐ │
 *   │ │ EXPENSES         │ INCOMES               │ │
 *   │ │ 28,970 AMD       │ 36,200 AMD            │ │
 *   │ └──────────────────┴───────────────────────┘ │
 *   │ ┌───────────────┐ ┌────────────────────────┐ │
 *   │ │ 🚌 Transport  │ │ 🧊 Food                │ │
 *   │ │   10,300 AMD  │ │    9,360 AMD           │ │
 *   │ └───────────────┘ └────────────────────────┘ │
 *   │ ╭──────────── Add expense ───────────────╮   │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE BALANCE DOES NOT MOVE WHEN THE WINDOW DOES ────────────────────────
 *
 * It is the one number the screen is about, so it is the biggest thing on it,
 * and it is ALL-TIME — "what do I have" is not a question about September. The
 * picker under it changes everything below, and nothing above. Putting a
 * windowed total in that slot is the single most tempting mistake here, and it
 * would make the largest figure on the screen the one that means least.
 *
 * ── THE TWO TILES ARE A SELECTOR, NOT A SUMMARY ───────────────────────────
 *
 * Tapping `Expenses` or `Incomes` changes which direction the grid below is
 * totalling. The selected one sits on `surface-alt` with its figure in
 * `green-bright`; the other is flat and muted. That is the whole of what colour
 * means here — THIS IS THE ONE YOU ARE READING. Neither direction is good or
 * bad, there is no red in this app, and an income is not a green number.
 *
 * ── A TILE IS THE FASTEST WAY TO RECORD SOMETHING ─────────────────────────
 *
 * TAP a category and the editor opens ON that category, in the direction the two
 * tiles are currently showing — so a taxi is Transport, a number, Save. It used
 * to open the category's own screen, which meant the common act (write this
 * down) went through the rare one (look at what I wrote down) and cost two more
 * taps and a category chip.
 *
 * LONG PRESS is where the rare one went: a sheet with `Edit category` on it, and
 * with the OTHER direction — because an income into a category whose tile is
 * showing expenses is the one thing a tap can no longer express. The same
 * long-press-for-the-other-thing that the rest of the app uses to reorder.
 *
 * ── THE CHART IS THE QUESTION A TOTAL CANNOT ANSWER ───────────────────────
 *
 * The window above says how much in September. The line below says whether it is
 * going up, over a range of its own — `lib/moneyTrends.ts` owns every bucket in
 * it. Two controls rather than one because they really are two questions, and
 * the day window (the only one that has a `‹ ›`) is not a range a trend can be
 * read over.
 *
 * ── A ZERO IS A FACT ──────────────────────────────────────────────────────
 *
 * A category with nothing in the window reads `0 AMD` in `ink-faint` and keeps
 * its tile. Hiding it would make the grid rearrange itself every time the window
 * moved, and the empty categories are half the information: `Entertainment 0`
 * this month is a thing you want to see.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import { Kicker, PrimaryButton, SelectChip, Separator, TextButton } from '../components/primitives';
import { dayKey } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  categoryShares,
  moneyBalanceSeries,
  moneyTrendSeries,
  summarizeMoneyTrend,
} from '../lib/moneyTrends';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import {
  INTERVALS,
  INTERVAL_LABELS,
  type Direction,
  type Interval,
  type MoneyCategory,
  balanceOf,
  byCategory,
  describeInterval,
  formatAmd,
  formatValue,
  shiftAnchor,
  totalsIn,
} from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

interface MoneyScreenProps {
  /**
   * The window travels WITH the tap. The category screen is this screen's tile,
   * opened, and landing on a different window from the one you were reading is
   * the kind of small lie that makes a total untrustable.
   *
   * Reached by LONG PRESS now — see the header — because the tap belongs to the
   * thing you came here to do.
   */
  onOpenCategory: (categoryId: ID, interval: Interval, anchor: string) => void;
  /** The editor, opened on a category and a direction it does not have to be told twice. */
  onAddAmount: (categoryId: ID | null, direction: Direction) => void;
  /** Export or import the money log on its own. See `SectionDataScreen`. */
  onOpenData: () => void;
}

export function MoneyScreen({ onOpenCategory, onAddAmount, onOpenData }: MoneyScreenProps) {
  const insets = useSafeAreaInsets();
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const addCategory = useMoney((s) => s.addCategory);

  const [interval, setInterval] = useState<Interval>('month');
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [direction, setDirection] = useState<Direction>('expense');
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);
  /** The category a long press is asking about. Null = no sheet. */
  const [holding, setHolding] = useState<MoneyCategory | null>(null);
  const [range, setRange] = useState<TrendRange>('month');

  const balance = useMemo(() => balanceOf(amounts), [amounts]);
  const totals = useMemo(() => totalsIn(amounts, interval, anchor), [amounts, interval, anchor]);
  const perCategory = useMemo(
    () => byCategory(amounts, direction, interval, anchor),
    [amounts, direction, interval, anchor],
  );
  const live = categories.filter((category) => category.archivedAt === null);
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
  // `All time` has no next or previous window to step to.
  const steppable = interval !== 'all';

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <Kicker>Overall balance</Kicker>
          <View className="mt-xs flex-row items-baseline">
            <Text className="text-display font-semibold tabular-nums text-ink">
              {formatValue(balance)}
            </Text>
            <Text className="ml-sm text-title font-semibold text-ink-muted">AMD</Text>
          </View>
        </View>

        <View className="mx-lg mt-lg flex-row items-center justify-center">
          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, -1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The window before"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-left" size={20} color={palette.inkMuted} /> : null}
          </Pressable>

          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`${describeInterval(interval, anchor)}. Change the time interval.`}
            style={pressedStyle}
            className="h-hit flex-row items-center px-md"
          >
            <Text className="mr-xs text-body font-medium tabular-nums text-ink">
              {describeInterval(interval, anchor)}
            </Text>
            <Icon name="chevron-down" size={14} color={palette.inkMuted} />
          </Pressable>

          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, 1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="The window after"
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-right" size={20} color={palette.inkMuted} /> : null}
          </Pressable>
        </View>

        <View className="mx-lg mt-md flex-row overflow-hidden rounded-surface border border-hairline bg-surface">
          <DirectionTile
            label="Expenses"
            value={totals.expenses}
            selected={direction === 'expense'}
            onPress={() => setDirection('expense')}
          />
          <View className="w-hairline bg-hairline" />
          <DirectionTile
            label="Incomes"
            value={totals.incomes}
            selected={direction === 'income'}
            onPress={() => setDirection('income')}
          />
        </View>

        <View className="mx-lg mt-xl flex-row flex-wrap">
          {live.map((category) => (
            <View key={category.id} className="w-1/2 p-[6px]">
              <CategoryTile
                category={category}
                total={perCategory[category.id] ?? 0}
                onPress={() => onAddAmount(category.id, direction)}
                onLongPress={() => {
                  tap();
                  setHolding(category);
                }}
              />
            </View>
          ))}
          <View className="w-1/2 p-[6px]">
            <Pressable
              onPress={() => setNaming(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a category"
              style={pressedStyle}
              className="flex-row items-center rounded-surface border border-dashed border-hairline p-md"
            >
              <View className="h-hit w-hit items-center justify-center rounded-surface bg-surface">
                <Icon name="plus" size={18} color={palette.inkMuted} />
              </View>
              <Text className="ml-md text-label font-medium text-ink-muted">Add</Text>
            </Pressable>
          </View>
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={direction === 'expense' ? 'Add expense' : 'Add income'}
            onPress={() => onAddAmount(null, direction)}
          />
        </View>

        {/* ----------------------------------------------------------
            THE TREND. Its own range, because the window above is a filter
            and this is a series — see the header. */}
        <Kicker className="mx-lg mb-sm mt-xxl">
          {direction === 'expense' ? 'Expenses over time' : 'Incomes over time'}
        </Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {TREND_RANGES.map((option) => (
            <SelectChip
              key={option}
              label={TREND_RANGE_LABELS[option]}
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
              {formatAmd(trend.total)} over {trend.buckets} {bucketNoun(range, trend.buckets)} ·
              about {formatAmd(trend.average)} each
              {trend.peak ? ` · most on ${trend.peak.label}, ${formatAmd(trend.peak.value)}` : ''}
            </Text>

            <Kicker className="mx-lg mb-sm mt-xl">Balance over the same range</Kicker>
            <View className="mx-lg">
              <TrendChart points={balanceLine} formatValue={(value) => formatValue(value)} />
            </View>
            <Text className="mx-lg mt-sm text-label text-ink-faint">
              Incomes less expenses, running. It starts from what you already had, so the left edge
              is where the range opened rather than zero.
            </Text>

            {shares.length > 0 ? (
              <>
                <Kicker className="mx-lg mb-sm mt-xl">Where it went</Kicker>
                <View className="mx-lg overflow-hidden rounded-surface border border-hairline bg-surface">
                  {shares.slice(0, 5).map((share, index) => (
                    <View key={share.categoryId}>
                      {index > 0 ? <Separator /> : null}
                      <ShareRow
                        glyph={namesById[share.categoryId]?.glyph ?? '•'}
                        name={namesById[share.categoryId]?.name ?? 'Archived'}
                        value={share.value}
                        percent={share.percent}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <View className="mx-lg mt-md rounded-surface border border-hairline bg-surface p-lg">
            <Kicker>Not enough yet</Kicker>
            <Text className="mt-sm text-body text-ink-muted">
              Nothing recorded in this range. Put something in and the line draws itself.
            </Text>
          </View>
        )}

        <Text className="mx-lg mt-md text-label text-ink-faint">
          Up to three months the line is one point a day; past that it is one a month. A whole-month
          amount has no day to sit on, so it only appears once the buckets are months.
        </Text>

        <View className="mx-lg mt-xxl">
          <Pressable
            onPress={onOpenData}
            accessibilityRole="button"
            accessibilityLabel="Export or import the money log"
            style={pressedStyle}
            className="h-row flex-row items-center rounded-surface border border-hairline bg-surface px-lg"
          >
            <Text className="flex-1 text-body font-medium text-ink">Export or import money</Text>
            <Icon name="chevron-right" size={16} color={palette.inkFaint} />
          </Pressable>
        </View>
      </ScrollView>

      {picking ? (
        <Sheet title="Time interval" onDismiss={() => setPicking(false)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {INTERVALS.map((option, index) => (
              <View key={option}>
                {index > 0 ? <Separator inset={16} /> : null}
                <IntervalRow
                  label={INTERVAL_LABELS[option]}
                  detail={describeInterval(option, anchor)}
                  selected={option === interval}
                  onPress={() => {
                    setInterval(option);
                    setPicking(false);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label="Cancel" onPress={() => setPicking(false)} />
        </Sheet>
      ) : null}

      {naming ? (
        <CategoryEditorSheet
          title="New category"
          onSave={(name, glyph) => {
            addCategory(name, glyph);
            setNaming(false);
          }}
          onDismiss={() => setNaming(false)}
        />
      ) : null}

      {/* The long press. Two rows: the category's own screen — where the name,
          the glyph, its amounts and `Archive` all live — and the direction a tap
          can no longer reach. */}
      {holding ? (
        <Sheet title={`${holding.glyph}  ${holding.name}`} onDismiss={() => setHolding(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            <SheetRow
              label="Edit category"
              detail="Its name, its glyph and everything recorded in it"
              onPress={() => {
                const category = holding;
                setHolding(null);
                onOpenCategory(category.id, interval, anchor);
              }}
            />
            <Separator inset={16} />
            <SheetRow
              label={direction === 'expense' ? 'Add an income here' : 'Add an expense here'}
              detail={`A tap on the tile adds ${direction === 'expense' ? 'an expense' : 'an income'}`}
              onPress={() => {
                const category = holding;
                setHolding(null);
                onAddAmount(category.id, direction === 'expense' ? 'income' : 'expense');
              }}
            />
          </View>
          <TextButton label="Cancel" onPress={() => setHolding(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function DirectionTile({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${formatAmd(value)}`}
      style={pressedStyle}
      className={['flex-1 p-lg', selected ? 'bg-surface-alt' : ''].join(' ')}
    >
      <Text
        className={[
          'text-micro font-semibold uppercase',
          selected ? 'text-ink' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={[
          'mt-xs text-title tabular-nums',
          selected ? 'font-semibold text-green-bright' : 'font-medium text-ink-muted',
        ].join(' ')}
      >
        {formatAmd(value)}
      </Text>
    </Pressable>
  );
}

function CategoryTile({
  category,
  total,
  onPress,
  onLongPress,
}: {
  category: MoneyCategory;
  total: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${formatAmd(total)}`}
      accessibilityHint="Long press to edit the category"
      style={pressedStyle}
      className="flex-row items-center rounded-surface border border-hairline bg-surface p-md"
    >
      <View className="h-hit w-hit items-center justify-center rounded-surface bg-surface-alt">
        <Text className="text-[20px]">{category.glyph}</Text>
      </View>
      <View className="ml-md flex-1">
        <Text numberOfLines={1} className="text-label font-medium text-ink">
          {category.name}
        </Text>
        <Text
          numberOfLines={1}
          className={[
            'text-label font-medium tabular-nums',
            total > 0 ? 'text-green-bright' : 'text-ink-faint',
          ].join(' ')}
        >
          {formatAmd(total)}
        </Text>
      </View>
    </Pressable>
  );
}

/** "days" or "months", matching what the chart actually plotted. */
function bucketNoun(range: TrendRange, count: number): string {
  const unit = range === 'year' || range === 'all' ? 'month' : 'day';
  return count === 1 ? unit : `${unit}s`;
}

/**
 * A row on the long-press sheet: a label, why you would tap it, and nothing else.
 *
 * `IntervalRow` below is the same geometry carrying a CHOICE — it renders a ✓ and
 * lives in a radio group. This one is a door, so it has neither.
 */
function SheetRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1 pr-md">
        <Text className="text-body text-ink">{label}</Text>
        <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={palette.inkFaint} />
    </Pressable>
  );
}

/**
 * One category's share of the range, as a figure and a bar.
 *
 * Not a chart: eight lines on one plot is eight lines and no answer. What the
 * grid above cannot say is WHICH category is the reason the line moved, and a
 * sorted five with a bar apiece says exactly that.
 */
function ShareRow({
  glyph,
  name,
  value,
  percent,
}: {
  glyph: string;
  name: string;
  value: number;
  percent: number;
}) {
  return (
    <View className="h-row-lg justify-center px-lg">
      <View className="flex-row items-center">
        <Text className="mr-sm text-label">{glyph}</Text>
        <Text numberOfLines={1} className="flex-1 text-body text-ink">
          {name}
        </Text>
        <Text className="ml-md text-body tabular-nums text-green-bright">{formatAmd(value)}</Text>
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

function IntervalRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${detail}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1">
        <Text
          className={['text-body', selected ? 'font-semibold text-green-bright' : 'text-ink'].join(
            ' ',
          )}
        >
          {label}
        </Text>
        <Text className="text-label tabular-nums text-ink-faint">{detail}</Text>
      </View>
      {selected ? <Icon name="check" size={16} color={palette.greenBright} /> : null}
    </Pressable>
  );
}
