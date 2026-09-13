/**
 * TransactionEditorScreen — one amount, added or edited.
 *
 * The same screen for both, and for both kinds, because the fields do not differ:
 * an income is an expense with the arrow the other way, and editing is adding with
 * the values already in the boxes. What changes is the header, the verb on the
 * button, and whether `Delete` exists.
 *
 * ── THE DATE CONTROL IS THE WHOLE POINT OF THIS SCREEN ─────────────────────
 *
 * `Day` files the amount against a date. `Whole month` files it against a MONTH —
 * the entire feature that lets somebody bring a year of past spending into the app
 * without inventing which Tuesday each coffee was on. A month lump counts in its
 * month, its year and the balance, and appears on no day screen at all; see
 * `types/finance.ts` for why the distinction lives in the date string itself.
 *
 * Stepping the date rather than opening a calendar: the amounts being entered are
 * either today's (zero steps) or a month somebody is reconstructing (one arrow per
 * month, held). A date picker is three taps and a modal for the case that is already
 * one tap away.
 *
 * The amount is a plain numeric field rather than the app's `NumberSheet`: that
 * control steps a bounded quantity by an increment somebody chose, which is right
 * for reps and wrong for `28970`.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  FieldWell,
  Kicker,
  ListCard,
  PrimaryButton,
  Segmented,
  SelectChip,
  TextButton,
} from '../components/primitives';
import { addDays, addMonths, dayLabel, monthKeyOf, monthLabel, parseAmount } from '../lib/money';
import { useFinance, visibleCategories } from '../state/financeStore';
import type { TransactionDraft } from '../state/financeStore';
import { palette } from '../theme/tokens';
import type { MoneyKind, Transaction } from '../types/finance';
import type { ID } from '../types/models';

interface TransactionEditorScreenProps {
  /** The transaction being edited, or `null` for a new one. */
  existing: Transaction | null;
  /** What a new transaction starts as — the tab's current direction and window. */
  initialKind: MoneyKind;
  initialDate: string;
  initialCategoryId?: ID;
  onSave: (draft: TransactionDraft) => void;
  onDelete?: () => void;
  onBack: () => void;
}

export function TransactionEditorScreen({
  existing,
  initialKind,
  initialDate,
  initialCategoryId,
  onSave,
  onDelete,
  onBack,
}: TransactionEditorScreenProps) {
  const insets = useSafeAreaInsets();
  const categories = useFinance((s) => s.categories);
  const currency = useFinance((s) => s.currency);

  const [kind, setKind] = useState<MoneyKind>(existing?.kind ?? initialKind);
  const [amount, setAmount] = useState(existing ? `${existing.amount}` : '');
  const [note, setNote] = useState(existing?.note ?? '');
  /*
   * Held as a DAY key even while the screen is in month mode, so switching back and
   * forth does not lose which day you were on. `dateFor` is what turns the pair into
   * the value that gets stored.
   */
  const [day, setDay] = useState(
    existing ? (existing.date.length === 7 ? `${existing.date}-01` : existing.date) : initialDate,
  );
  const [wholeMonth, setWholeMonth] = useState(existing ? existing.date.length === 7 : false);
  const [categoryId, setCategoryId] = useState<ID | null>(
    existing?.categoryId ?? initialCategoryId ?? null,
  );

  const options = visibleCategories(categories, kind);
  const chosen = options.find((category) => category.id === categoryId) ?? null;
  const parsed = parseAmount(amount);
  const ready = parsed !== null && chosen !== null;

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={existing ? 'Edit amount' : kind === 'expense' ? 'New expense' : 'New income'}
        subtitle={existing ? dateSummary(existing.date) : undefined}
        onBack={onBack}
        action={
          ready
            ? {
                label: 'Save',
                onPress: () =>
                  onSave({
                    categoryId: chosen.id,
                    kind,
                    amount: parsed,
                    date: dateFor(day, wholeMonth),
                    note,
                  }),
              }
            : { label: 'Save', tone: 'muted', onPress: () => {} }
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Amount · {currency}</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="number-pad"
            autoFocus={!existing}
            selectAllOnFocus
            accessibilityLabel="Amount"
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Direction</Kicker>
        <View className="mx-lg">
          <Segmented
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={kind}
            onChange={(next) => {
              setKind(next);
              // A category belongs to one direction, so the old pick cannot survive
              // the switch — and a silently-kept one would file an income under Food.
              setCategoryId(null);
            }}
            accessibilityLabel="Direction"
          />
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">Category</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {options.map((category) => (
            <SelectChip
              key={category.id}
              label={`${category.glyph}  ${category.name}`}
              selected={category.id === categoryId}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
          {options.length === 0 ? (
            <Text className="text-label text-ink-faint">
              No {kind === 'expense' ? 'expense' : 'income'} categories yet. Add one on the Money
              tab.
            </Text>
          ) : null}
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">When</Kicker>
        <View className="mx-lg">
          <Segmented
            options={[
              { value: 'day', label: 'A day' },
              { value: 'month', label: 'Whole month' },
            ]}
            value={wholeMonth ? 'month' : 'day'}
            onChange={(next) => setWholeMonth(next === 'month')}
            accessibilityLabel="Date precision"
          />
        </View>

        <ListCard className="mx-lg mt-sm">
          <View className="h-row flex-row items-center px-sm">
            <StepArrow
              icon="chevron-left"
              label="Earlier"
              onPress={() => setDay(wholeMonth ? addMonths(day, -1) : addDays(day, -1))}
            />
            <Text className="flex-1 text-center text-body font-medium tabular-nums text-ink">
              {wholeMonth ? monthLabel(day) : dayLabel(day)}
            </Text>
            <StepArrow
              icon="chevron-right"
              label="Later"
              onPress={() => setDay(wholeMonth ? addMonths(day, 1) : addDays(day, 1))}
            />
          </View>
        </ListCard>

        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {wholeMonth
            ? 'Counts towards the month, the year and the balance — and towards no single day.'
            : 'Counts towards that day, and ticks the expense task for it.'}
        </Text>

        <Kicker className="mx-lg mb-sm mt-xl">Note</Kicker>
        <View className="mx-lg">
          <FieldWell
            value={note}
            size="body"
            onChangeText={setNote}
            placeholder="Optional"
            accessibilityLabel="Note"
          />
        </View>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label={existing ? 'Save' : kind === 'expense' ? 'Add expense' : 'Add income'}
            variant={ready ? 'primary' : 'ghost'}
            onPress={() => {
              if (!ready) return;
              onSave({
                categoryId: chosen.id,
                kind,
                amount: parsed,
                date: dateFor(day, wholeMonth),
                note,
              });
            }}
          />
        </View>

        {onDelete ? <TextButton label="Delete this amount" onPress={onDelete} /> : null}
      </ScrollView>
    </View>
  );
}

function StepArrow({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={pressedStyle}
      className="h-hit w-hit items-center justify-center"
    >
      <Icon name={icon} size={18} color={palette.ink} />
    </Pressable>
  );
}

/** The stored date: a day key, or the month it falls in. */
function dateFor(day: string, wholeMonth: boolean): string {
  return wholeMonth ? monthKeyOf(day) : day;
}

/** What the header says a stored date is. */
export function dateSummary(date: string): string {
  return date.length === 7 ? `${monthLabel(date)} · whole month` : dayLabel(date);
}
