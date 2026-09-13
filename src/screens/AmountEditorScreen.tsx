/**
 * AmountEditorScreen — one amount, written down.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  NEW EXPENSE                      [ Save ] │
 *   │ AMOUNT · AMD                                 │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ 2,400▎                                   │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ DIRECTION      ╭ Expense ╮╭ Income ╮         │
 *   │ CATEGORY   🧊 Food  💡 me  🚌 Transport …    │
 *   │ WHEN           ╭ A day ╮╭ Whole month ╮      │
 *   │                ‹ 12 September 2026 ›         │
 *   │ NOTE                                         │
 *   │ ╭──────────── Save expense ──────────────╮   │
 *   │ Delete this amount                           │
 *   └──────────────────────────────────────────────┘
 *
 * ── FIVE FIELDS, AND THE FIRST ONE IS THE KEYBOARD ────────────────────────
 *
 * The amount is what you came to type, so it is the only thing focused on
 * arrival and the only thing at `title-xl`. Everything under it has a sensible
 * answer already — expense, the category you tapped in from, today — so the
 * fastest path through this screen is a number and `Save`.
 *
 * ── `A DAY` OR `WHOLE MONTH` ──────────────────────────────────────────────
 *
 * The second switch is the one people do not expect, so the screen says in words
 * what it does: a whole month counts towards the month, the year and the
 * balance, and towards no single day. Rent is not spent on the 3rd, and filing
 * it there makes the 3rd a lie every time you open it. See `lib/money.ts`.
 *
 * ── DELETE IS A SENTENCE, NOT A RED BUTTON ────────────────────────────────
 *
 * `ink-muted` text, like every destructive action in this app, behind the same
 * `ConfirmSheet` everything else uses. It only exists when there is something to
 * delete — a new amount has no row to remove.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { pressedStyle } from '../components/motion';
import { Kicker, PrimaryButton, Segmented, TextButton } from '../components/primitives';
import { dayKey, formatLongDay, formatMonth, parseDay, shiftDay } from '../lib/days';
import { type Amount, type AmountWhen, type Direction, formatValue } from '../lib/money';
import { useMoney } from '../state/moneyStore';
import { palette } from '../theme/tokens';
import type { ID } from '../types/models';

const DIRECTIONS = [
  { value: 'expense' as const, label: 'Expense' },
  { value: 'income' as const, label: 'Income' },
];

const SPANS = [
  { value: 'day' as const, label: 'A day' },
  { value: 'month' as const, label: 'Whole month' },
];

interface AmountEditorScreenProps {
  /** The amount being edited, or null for a new one. */
  amount: Amount | null;
  /** Which category a new amount lands in. Ignored when editing. */
  categoryId: ID | null;
  /**
   * Which way a NEW amount points, decided by whatever opened this screen.
   *
   * The money grid is already showing expenses or incomes when a tile is tapped,
   * and arriving on the other one would mean the first field a user corrects is
   * the one they had just told the app. Ignored when editing: an amount already
   * knows its own direction, and the segmented control is right there.
   */
  direction?: Direction;
  onBack: () => void;
}

export function AmountEditorScreen({
  amount,
  categoryId,
  direction: initialDirection = 'expense',
  onBack,
}: AmountEditorScreenProps) {
  const categories = useMoney((s) => s.categories);
  const addAmount = useMoney((s) => s.addAmount);
  const updateAmount = useMoney((s) => s.updateAmount);
  const deleteAmount = useMoney((s) => s.deleteAmount);

  const live = categories.filter(
    (category) => category.archivedAt === null || category.id === amount?.categoryId,
  );

  const today = dayKey(new Date());
  const [digits, setDigits] = useState(amount ? String(amount.value) : '');
  const [direction, setDirection] = useState<Direction>(amount?.direction ?? initialDirection);
  const [category, setCategory] = useState<ID | null>(
    amount?.categoryId ?? categoryId ?? live[0]?.id ?? null,
  );
  const [span, setSpan] = useState<'day' | 'month'>(amount?.when.kind ?? 'day');
  const [day, setDay] = useState(amount?.when.kind === 'day' ? amount.when.date : today);
  const [monthAnchor, setMonthAnchor] = useState(() =>
    amount?.when.kind === 'month'
      ? dayKey(new Date(amount.when.year, amount.when.month, 1))
      : today,
  );
  const [note, setNote] = useState(amount?.note ?? '');
  const [deleting, setDeleting] = useState(false);

  const value = Number(digits.replace(/\D/g, '')) || 0;
  const savable = value > 0 && category !== null;
  const noun = direction === 'expense' ? 'expense' : 'income';

  const whenOf = (): AmountWhen => {
    if (span === 'day') return { kind: 'day', date: day };
    const at = parseDay(monthAnchor) ?? new Date();
    return { kind: 'month', year: at.getFullYear(), month: at.getMonth() };
  };

  const save = () => {
    if (!savable || category === null) return;
    const draft = { categoryId: category, direction, value, when: whenOf(), note };
    if (amount) updateAmount(amount.id, draft);
    else addAmount(draft);
    onBack();
  };

  const stepWhen = (delta: number) => {
    if (span === 'day') {
      setDay(shiftDay(day, delta));
      return;
    }
    const at = parseDay(monthAnchor) ?? new Date();
    // Day 1 first, so stepping off the 31st does not skip February.
    setMonthAnchor(dayKey(new Date(at.getFullYear(), at.getMonth() + delta, 1)));
  };
  const whenLabel = (() => {
    if (span === 'day') return formatLongDay(day);
    const at = parseDay(monthAnchor) ?? new Date();
    return formatMonth(at.getFullYear(), at.getMonth());
  })();

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader
        kicker={amount ? `Edit ${noun}` : `New ${noun}`}
        onBack={onBack}
        bordered={false}
        action={{ label: 'Save', onPress: save, tone: savable ? 'primary' : 'muted' }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Kicker className="mx-lg mb-sm mt-lg">Amount · AMD</Kicker>
        <View className="mx-lg h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
          <TextInput
            value={digits === '' ? '' : formatValue(value)}
            onChangeText={(text) => setDigits(text.replace(/\D/g, ''))}
            placeholder="0"
            placeholderTextColor={palette.inkFaint}
            cursorColor={palette.greenBright}
            selectionColor={palette.greenBright}
            keyboardType="number-pad"
            autoFocus={amount === null}
            accessibilityLabel="Amount in AMD"
            className="flex-1 text-title-xl font-semibold tabular-nums text-ink"
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Direction</Kicker>
        <View className="mx-lg">
          <Segmented
            options={DIRECTIONS}
            value={direction}
            onChange={setDirection}
            accessibilityLabel="Money out, or money in"
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Category</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {live.map((option) => {
            const selected = option.id === category;
            return (
              <Pressable
                key={option.id}
                onPress={() => setCategory(option.id)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option.name}
                style={pressedStyle}
                className={[
                  'mb-sm mr-sm h-[36px] flex-row items-center rounded-pill px-md',
                  selected ? 'bg-green' : 'border border-hairline bg-surface',
                ].join(' ')}
              >
                <Text className="mr-sm text-label">{option.glyph}</Text>
                <Text
                  className={[
                    'text-label',
                    selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
                  ].join(' ')}
                >
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">When</Kicker>
        <View className="mx-lg">
          <Segmented
            options={SPANS}
            value={span}
            onChange={setSpan}
            accessibilityLabel="A single day, or a whole month"
          />
        </View>

        <View className="mx-lg mt-md h-hit flex-row items-center justify-between rounded-surface border border-hairline bg-surface-alt px-lg">
          <Pressable
            onPress={() => stepWhen(-1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Earlier"
            style={pressedStyle}
          >
            <Icon name="chevron-left" size={18} color={palette.inkMuted} />
          </Pressable>
          <Text className="text-body tabular-nums text-ink">{whenLabel}</Text>
          <Pressable
            onPress={() => stepWhen(1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Later"
            style={pressedStyle}
          >
            <Icon name="chevron-right" size={18} color={palette.inkMuted} />
          </Pressable>
        </View>

        {span === 'month' ? (
          <Text className="mx-lg mt-sm text-label text-ink-faint">
            A whole month counts towards the month, the year and the balance, and towards no single
            day.
          </Text>
        ) : null}

        <Kicker className="mx-lg mb-sm mt-xl">Note</Kicker>
        <View className="mx-lg h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What it was for"
            placeholderTextColor={palette.inkFaint}
            cursorColor={palette.greenBright}
            selectionColor={palette.greenBright}
            accessibilityLabel="Note"
            returnKeyType="done"
            className="flex-1 text-body text-ink"
          />
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton label={`Save ${noun}`} onPress={save} />
        </View>
        {amount ? (
          <View className="mx-lg">
            <TextButton label="Delete this amount" onPress={() => setDeleting(true)} />
          </View>
        ) : null}
      </ScrollView>

      {deleting && amount ? (
        <ConfirmSheet
          title="Delete this amount?"
          body="It leaves the category, the month, the year and the balance. Nothing else changes."
          confirmLabel="Delete it"
          cancelLabel="Keep it"
          onConfirm={() => {
            deleteAmount(amount.id);
            setDeleting(false);
            onBack();
          }}
          onCancel={() => setDeleting(false)}
        />
      ) : null}
    </View>
  );
}
