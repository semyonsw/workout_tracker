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
import { pressedStyle } from '../components/motion';
import { Kicker, PrimaryButton, Separator, TextButton } from '../components/primitives';
import { dayKey } from '../lib/days';
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
   */
  onOpenCategory: (categoryId: ID, interval: Interval, anchor: string) => void;
  onAddAmount: (categoryId: ID | null) => void;
}

export function MoneyScreen({ onOpenCategory, onAddAmount }: MoneyScreenProps) {
  const insets = useSafeAreaInsets();
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const addCategory = useMoney((s) => s.addCategory);

  const [interval, setInterval] = useState<Interval>('month');
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [direction, setDirection] = useState<Direction>('expense');
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);

  const balance = useMemo(() => balanceOf(amounts), [amounts]);
  const totals = useMemo(() => totalsIn(amounts, interval, anchor), [amounts, interval, anchor]);
  const perCategory = useMemo(
    () => byCategory(amounts, direction, interval, anchor),
    [amounts, direction, interval, anchor],
  );
  const live = categories.filter((category) => category.archivedAt === null);
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
                onPress={() => onOpenCategory(category.id, interval, anchor)}
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
            onPress={() => onAddAmount(null)}
          />
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
}: {
  category: MoneyCategory;
  total: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${formatAmd(total)}`}
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
