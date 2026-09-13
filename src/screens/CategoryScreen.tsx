/**
 * CategoryScreen — one bucket, inside the window the Money tab is looking at.
 *
 * It answers the question a tile cannot: the tile says `Transport · 10,300 AMD`, and
 * this says which amounts those were. Every row opens the editor, which is what makes
 * "edit history" a normal operation rather than a feature — a wrong amount from three
 * months ago is two taps from being right.
 *
 * THE WINDOW IS THE TAB'S, not this screen's. Coming in from `September 2026` and
 * finding a screen showing all time would be the app losing the user's place; there
 * is one period in the Money section and it is owned by the shell.
 *
 * Renaming is inline at the top rather than behind an `Edit` mode, because a category
 * is two fields and a mode for two fields is ceremony. `Delete` states which of the
 * two things it will do before it does it — remove the bucket, or archive it because
 * amounts are filed under it — since those are very different outcomes and the button
 * is the only place to say so.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  AddRow,
  FieldWell,
  Kicker,
  ListCard,
  Separator,
  TextButton,
} from '../components/primitives';
import { formatAmount, matchesPeriod, periodLabel, transactionsIn } from '../lib/money';
import { useFinance } from '../state/financeStore';
import { palette } from '../theme/tokens';
import type { MoneyCategory, Period, Transaction } from '../types/finance';
import { dateSummary } from './TransactionEditorScreen';
import type { ID } from '../types/models';

interface CategoryScreenProps {
  category: MoneyCategory;
  period: Period;
  onBack: () => void;
  onOpenTransaction: (txnId: ID) => void;
  onAddTransaction: () => void;
  onDeleted: () => void;
}

export function CategoryScreen({
  category,
  period,
  onBack,
  onOpenTransaction,
  onAddTransaction,
  onDeleted,
}: CategoryScreenProps) {
  const insets = useSafeAreaInsets();
  const transactions = useFinance((s) => s.transactions);
  const currency = useFinance((s) => s.currency);
  const updateCategory = useFinance((s) => s.updateCategory);
  const deleteCategory = useFinance((s) => s.deleteCategory);

  const [name, setName] = useState(category.name);
  const [glyph, setGlyph] = useState(category.glyph);

  const rows = useMemo(
    () => transactionsIn(transactions, period).filter((txn) => txn.categoryId === category.id),
    [transactions, period, category.id],
  );
  const total = useMemo(
    () =>
      transactions
        .filter((txn) => txn.categoryId === category.id && matchesPeriod(period, txn))
        .reduce((sum, txn) => sum + txn.amount, 0),
    [transactions, period, category.id],
  );
  const everUsed = transactions.some((txn) => txn.categoryId === category.id);

  const commitName = () => updateCategory(category.id, { name, glyph });

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={category.name}
        subtitle={`${periodLabel(period)} · ${formatAmount(total, currency)}`}
        onBack={onBack}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Kicker className="mx-lg mb-sm">Name</Kicker>
        <View className="mx-lg flex-row">
          <View className="w-[72px]">
            <FieldWell
              value={glyph}
              onChangeText={setGlyph}
              onBlur={commitName}
              accessibilityLabel="Category glyph"
            />
          </View>
          <View className="ml-sm flex-1">
            <FieldWell
              value={name}
              onChangeText={setName}
              onBlur={commitName}
              selectAllOnFocus
              accessibilityLabel="Category name"
            />
          </View>
        </View>

        <Kicker className="mx-lg mb-sm mt-xl">
          {rows.length === 1 ? '1 amount' : `${rows.length} amounts`}
        </Kicker>

        <ListCard className="mx-lg">
          {rows.map((txn, index) => (
            <View key={txn.id}>
              {index > 0 ? <Separator /> : null}
              <TransactionRow
                txn={txn}
                currency={currency}
                onPress={() => onOpenTransaction(txn.id)}
              />
            </View>
          ))}

          {rows.length === 0 ? (
            <View className="h-row-lg justify-center px-lg">
              <Text className="text-label text-ink-faint">
                Nothing filed here in {periodLabel(period)}.
              </Text>
            </View>
          ) : null}

          <Separator inset={0} />
          <AddRow label="Add to this category" onPress={onAddTransaction} />
        </ListCard>

        <View className="mx-lg mt-xl">
          <ListCard>
            <TextButton
              label={everUsed ? 'Archive this category' : 'Delete this category'}
              onPress={() => {
                deleteCategory(category.id);
                onDeleted();
              }}
            />
          </ListCard>
          <Text className="mt-sm text-label text-ink-faint">
            {everUsed
              ? 'It has amounts against it, so it is hidden rather than removed — the history keeps its name.'
              : 'Nothing has ever been filed here, so there is nothing to keep.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function TransactionRow({
  txn,
  currency,
  onPress,
}: {
  txn: Transaction;
  currency: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatAmount(txn.amount, currency)}, ${dateSummary(txn.date)}`}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <View className="flex-1 pr-md">
        <Text className="text-body font-medium tabular-nums text-ink">
          {formatAmount(txn.amount, currency)}
        </Text>
        <Text numberOfLines={1} className="mt-[2px] text-label tabular-nums text-ink-faint">
          {[dateSummary(txn.date), txn.note].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={palette.inkFaint} />
    </Pressable>
  );
}
