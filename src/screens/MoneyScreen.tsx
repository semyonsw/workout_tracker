/**
 * MoneyScreen — the `Money` tab: what is in the account, what left it, and where it
 * went.
 *
 * Three facts stacked in the order they are asked for:
 *
 *   1. THE BALANCE, over all time and never filtered. A balance for "this week" is
 *      not a balance, it is a delta — and both deltas are the row underneath.
 *   2. OUT and IN for the window, side by side. Tapping one switches the grid, so
 *      the pair is both the summary and the control; two totals that are always
 *      visible is what stops "did I earn more than I spent this month" needing a
 *      second screen.
 *   3. THE CATEGORIES, as a grid of tiles, every one of them showing its share of
 *      the window — including the zeroes. A category that shows nothing when it has
 *      had nothing spent on it makes the grid rearrange itself every month, and the
 *      thing that makes a grid readable is that the tile you want is where it was
 *      last time.
 *
 * ADDING A CATEGORY IS A TILE IN THE GRID, not a row in Settings. Money goes
 * somewhere the app has never heard of at the moment you are recording it, so the
 * place to make the bucket is the place you are already looking at.
 *
 * The screen holds no data of its own: the period lives in the shell (so a trip into
 * a category and back does not reset the month you were reading) and everything else
 * is the finance store.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { PeriodBar } from '../components/PeriodBar';
import { Kicker, PrimaryButton } from '../components/primitives';
import { formatAmount, overallBalance, totalFor, totalsByCategory } from '../lib/money';
import { useFinance, visibleCategories } from '../state/financeStore';
import { palette } from '../theme/tokens';
import type { MoneyCategory, MoneyKind, Period } from '../types/finance';
import type { ID } from '../types/models';

interface MoneyScreenProps {
  period: Period;
  onChangePeriod: (period: Period) => void;
  kind: MoneyKind;
  onChangeKind: (kind: MoneyKind) => void;
  onOpenPeriodPicker: () => void;
  onOpenCategory: (categoryId: ID) => void;
  onAddCategory: () => void;
  onAddTransaction: () => void;
}

export function MoneyScreen({
  period,
  onChangePeriod,
  kind,
  onChangeKind,
  onOpenPeriodPicker,
  onOpenCategory,
  onAddCategory,
  onAddTransaction,
}: MoneyScreenProps) {
  const insets = useSafeAreaInsets();
  const categories = useFinance((s) => s.categories);
  const transactions = useFinance((s) => s.transactions);
  const currency = useFinance((s) => s.currency);

  const balance = useMemo(() => overallBalance(transactions), [transactions]);
  const spent = useMemo(() => totalFor(transactions, period, 'expense'), [transactions, period]);
  const earned = useMemo(() => totalFor(transactions, period, 'income'), [transactions, period]);
  const totals = useMemo(
    () => totalsByCategory(transactions, period, kind),
    [transactions, period, kind],
  );
  const shown = useMemo(() => visibleCategories(categories, kind), [categories, kind]);

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <Kicker>Overall balance</Kicker>
          <Text className="mt-xs text-display font-semibold tabular-nums text-ink">
            {formatAmount(balance, currency)}
          </Text>
        </View>

        <View className="mt-md">
          <PeriodBar period={period} onChange={onChangePeriod} onOpenPicker={onOpenPeriodPicker} />
        </View>

        <View className="mx-lg mt-md flex-row rounded-surface border border-hairline bg-surface p-xs">
          <DirectionTile
            label="Expenses"
            value={formatAmount(spent, currency)}
            selected={kind === 'expense'}
            onPress={() => onChangeKind('expense')}
          />
          <DirectionTile
            label="Incomes"
            value={formatAmount(earned, currency)}
            selected={kind === 'income'}
            onPress={() => onChangeKind('income')}
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">
          {kind === 'expense' ? 'Spent on' : 'Came from'} · {shown.length}
        </Kicker>

        {/* Two columns, and the gutter is the tile's own margin rather than a gap
            property: `gap` on a wrapping row is the one flexbox feature that has
            behaved differently on the two RN versions this app has shipped on. */}
        <View className="flex-row flex-wrap px-md">
          {shown.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              amount={totals[category.id] ?? 0}
              currency={currency}
              onPress={() => onOpenCategory(category.id)}
            />
          ))}
          <AddCategoryTile onPress={onAddCategory} />
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={kind === 'expense' ? 'Add expense' : 'Add income'}
            onPress={onAddTransaction}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * `Expenses · 28,970 AMD`, as half of a two-segment control.
 *
 * Built like `Segmented` but two lines tall, because the value is the point: a
 * segmented control that hides one of the two numbers behind a tap would make the
 * comparison — the only reason both are on screen — cost an interaction.
 */
function DirectionTile({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${value}`}
      style={pressedStyle}
      className={[
        'flex-1 items-center justify-center rounded-surface py-md',
        selected ? 'bg-surface-alt' : '',
      ].join(' ')}
    >
      <Text
        className={[
          'text-label',
          selected ? 'font-semibold text-ink' : 'font-medium text-ink-faint',
        ].join(' ')}
      >
        {label}
      </Text>
      <Text
        className={[
          'mt-[2px] text-title font-semibold tabular-nums',
          selected ? 'text-green-bright' : 'text-ink-muted',
        ].join(' ')}
      >
        {value}
      </Text>
    </Pressable>
  );
}

/**
 * One category, with what it took in this window.
 *
 * A zero is `ink-faint` rather than absent. The tile is a place, and a place you
 * spent nothing at is information — the grid is read by scanning for the ones that
 * are lit.
 */
function CategoryTile({
  category,
  amount,
  currency,
  onPress,
}: {
  category: MoneyCategory;
  amount: number;
  currency: string;
  onPress: () => void;
}) {
  const spent = amount > 0;
  return (
    <View className="w-1/2 p-xs">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${category.name}, ${formatAmount(amount, currency)}`}
        style={pressedStyle}
        className="flex-row items-center rounded-surface border border-hairline bg-surface p-md"
      >
        <View className="h-[44px] w-[44px] items-center justify-center rounded-surface bg-surface-alt">
          <Text className="text-body">{category.glyph}</Text>
        </View>
        <View className="ml-md flex-1">
          <Text numberOfLines={1} className="text-label font-medium text-ink">
            {category.name}
          </Text>
          <Text
            numberOfLines={1}
            className={[
              'mt-[2px] text-label font-semibold tabular-nums',
              spent ? 'text-green-bright' : 'text-ink-faint',
            ].join(' ')}
          >
            {formatAmount(amount, currency)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** The last tile in the grid: a dashed slot that makes a new bucket. */
function AddCategoryTile({ onPress }: { onPress: () => void }) {
  return (
    <View className="w-1/2 p-xs">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add category"
        style={pressedStyle}
        className="flex-row items-center rounded-surface border border-dashed border-hairline p-md"
      >
        <View className="h-[44px] w-[44px] items-center justify-center rounded-surface bg-surface-alt">
          <Icon name="plus" size={16} color={palette.greenBright} />
        </View>
        <Text className="ml-md flex-1 text-label font-medium text-ink-muted">Add</Text>
      </Pressable>
    </View>
  );
}
