/**
 * MoneyScreen — the balance, the window, and where it went.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ EXPENSES                                 ⟲   │
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
 * ── THE CHARTS ARE A QUESTION A TOTAL CANNOT ANSWER, SO THEY LEFT ────────
 *
 * The window here says how much in September. Whether it is going UP is a series
 * rather than a filter, and it used to be stacked four scrolls under this screen
 * with a second range control that looked like the first one misbehaving. It is
 * behind the ⟲ in the corner now (`MoneyHistoryScreen`), the same glyph in the
 * same place as the training log's and the daily tasks'.
 *
 * ── A ZERO IS A FACT ──────────────────────────────────────────────────────
 *
 * A category with nothing in the window reads `0 AMD` (or whatever the currency
 * setting says) in `ink-faint` and keeps
 * its tile. Hiding it would make the grid rearrange itself every time the window
 * moved, and the empty categories are half the information: `Entertainment 0`
 * this month is a thing you want to see.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { Icon } from '../components/Icon';
import { SectionTopBar } from '../components/SectionTopBar';
import { Sheet } from '../components/Sheet';
import { pressedStyle } from '../components/motion';
import { Kicker, PrimaryButton, Separator, TextButton } from '../components/primitives';
import { dayKey } from '../lib/days';
import { tap } from '../lib/feedback';
import { useLanguage, useT } from '../hooks/useT';
import {
  INTERVALS,
  intervalLabel,
  type Direction,
  type Interval,
  type MoneyCategory,
  balanceOf,
  byCategory,
  describeInterval,
  formatMoney,
  formatValue,
  shiftAnchor,
  totalsIn,
} from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
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
  /** The ⟲ in the corner: the lines, the balance and where it went. */
  onOpenHistory: () => void;
}

export function MoneyScreen({ onOpenCategory, onAddAmount, onOpenHistory }: MoneyScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const addCategory = useMoney((s) => s.addCategory);

  /*
   * The window and the direction START where the settings say and are then this
   * screen's own. Reading them live would mean a section that snapped back to the
   * month every time the settings screen was visited, which is not what a default
   * is.
   */
  const currency = useSettings((s) => s.currencyCode);
  const [interval, setInterval] = useState<Interval>(
    () => useSettings.getState().moneyDefaultInterval,
  );
  const [anchor, setAnchor] = useState(() => dayKey(new Date()));
  const [direction, setDirection] = useState<Direction>(
    () => useSettings.getState().moneyDefaultDirection,
  );
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);
  /** The category a long press is asking about. Null = no sheet. */
  const [holding, setHolding] = useState<MoneyCategory | null>(null);

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

      <SectionTopBar
        title={t('Expenses')}
        onOpenHistory={onOpenHistory}
        historyLabel={t('Expense history')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <Kicker>{t('Overall balance')}</Kicker>
          <View className="mt-xs flex-row items-baseline">
            <Text className="text-display font-semibold tabular-nums text-ink">
              {formatValue(balance)}
            </Text>
            <Text className="ml-sm text-title font-semibold text-ink-muted">{currency}</Text>
          </View>
        </View>

        <View className="mx-lg mt-lg flex-row items-center justify-center">
          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, -1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The window before')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-left" size={20} color={palette.inkMuted} /> : null}
          </Pressable>

          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`${describeInterval(interval, anchor, lang)}. ${t('Change the time interval.')}`}
            style={pressedStyle}
            className="h-hit flex-row items-center px-md"
          >
            <Text className="mr-xs text-body font-medium tabular-nums text-ink">
              {describeInterval(interval, anchor, lang)}
            </Text>
            <Icon name="chevron-down" size={14} color={palette.inkMuted} />
          </Pressable>

          <Pressable
            onPress={() => setAnchor(shiftAnchor(interval, anchor, 1))}
            disabled={!steppable}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('The window after')}
            style={pressedStyle}
            className="h-hit w-[32px] items-center justify-center"
          >
            {steppable ? <Icon name="chevron-right" size={20} color={palette.inkMuted} /> : null}
          </Pressable>
        </View>

        <View className="mx-lg mt-md flex-row overflow-hidden rounded-surface border border-hairline bg-surface">
          <DirectionTile
            label={t('Expenses')}
            value={totals.expenses}
            currency={currency}
            selected={direction === 'expense'}
            onPress={() => setDirection('expense')}
          />
          <View className="w-hairline bg-hairline" />
          <DirectionTile
            label={t('Incomes')}
            value={totals.incomes}
            currency={currency}
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
                currency={currency}
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
              accessibilityLabel={t('Add category')}
              style={pressedStyle}
              className="flex-row items-center rounded-surface border border-dashed border-hairline p-md"
            >
              <View className="h-hit w-hit items-center justify-center rounded-surface bg-surface">
                <Icon name="plus" size={18} color={palette.inkMuted} />
              </View>
              <Text className="ml-md text-label font-medium text-ink-muted">{t('Add')}</Text>
            </Pressable>
          </View>
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={direction === 'expense' ? t('Add expense') : t('Add income')}
            onPress={() => onAddAmount(null, direction)}
          />
        </View>
      </ScrollView>

      {picking ? (
        <Sheet title={t('Time interval')} onDismiss={() => setPicking(false)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {INTERVALS.map((option, index) => (
              <View key={option}>
                {index > 0 ? <Separator inset={16} /> : null}
                <IntervalRow
                  label={intervalLabel(option, lang)}
                  detail={describeInterval(option, anchor, lang)}
                  selected={option === interval}
                  onPress={() => {
                    setInterval(option);
                    setPicking(false);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(false)} />
        </Sheet>
      ) : null}

      {naming ? (
        <CategoryEditorSheet
          title={t('Add category')}
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
              label={t('Edit category')}
              detail={t('Its name, its glyph and everything recorded in it')}
              onPress={() => {
                const category = holding;
                setHolding(null);
                onOpenCategory(category.id, interval, anchor);
              }}
            />
            <Separator inset={16} />
            <SheetRow
              label={direction === 'expense' ? t('Add an income here') : t('Add an expense here')}
              detail={
                direction === 'expense'
                  ? t('A tap on the tile adds an expense')
                  : t('A tap on the tile adds an income')
              }
              onPress={() => {
                const category = holding;
                setHolding(null);
                onAddAmount(category.id, direction === 'expense' ? 'income' : 'expense');
              }}
            />
          </View>
          <TextButton label={t('Cancel')} onPress={() => setHolding(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function DirectionTile({
  label,
  value,
  currency,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${formatMoney(value, currency)}`}
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
        {formatMoney(value, currency)}
      </Text>
    </Pressable>
  );
}

function CategoryTile({
  category,
  total,
  currency,
  onPress,
  onLongPress,
}: {
  category: MoneyCategory;
  total: number;
  currency: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useT();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${formatMoney(total, currency)}`}
      accessibilityHint={t('Long press to edit the category')}
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
          {formatMoney(total, currency)}
        </Text>
      </View>
    </Pressable>
  );
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
