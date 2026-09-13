/**
 * NewCategoryScreen — a bucket, in three fields.
 *
 * Separate from `CategoryScreen` (which edits an existing one) for the reason the
 * exercise library keeps `create` and `edit` apart: a new category has no history, no
 * total and nothing to delete, so half of that screen would be empty states. This one
 * is a form and a button.
 *
 * The direction cannot be changed later, and that is deliberate rather than missing:
 * flipping a category from expense to income would flip the sign of every amount ever
 * filed under it, which is a rewrite of history dressed up as a setting. Make the
 * other one; archive this.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { FieldWell, Kicker, PrimaryButton, Segmented } from '../components/primitives';
import type { MoneyKind } from '../types/finance';

export function NewCategoryScreen({
  initialKind,
  onCreate,
  onBack,
}: {
  initialKind: MoneyKind;
  onCreate: (input: { name: string; kind: MoneyKind; glyph: string }) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState('•');
  const [kind, setKind] = useState<MoneyKind>(initialKind);
  const ready = name.trim().length > 0;

  const create = () => {
    if (!ready) return;
    onCreate({ name, kind, glyph });
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker="New category"
        onBack={onBack}
        action={{ label: 'Add', tone: ready ? 'primary' : 'muted', onPress: create }}
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
            <FieldWell value={glyph} onChangeText={setGlyph} accessibilityLabel="Category glyph" />
          </View>
          <View className="ml-sm flex-1">
            <FieldWell
              value={name}
              onChangeText={setName}
              placeholder="Groceries"
              autoFocus
              accessibilityLabel="Category name"
            />
          </View>
        </View>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          One or two characters in the box on the left — an emoji, a symbol, initials. It is what
          tells the tiles apart.
        </Text>

        <Kicker className="mx-lg mb-sm mt-xl">Direction</Kicker>
        <View className="mx-lg">
          <Segmented
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={kind}
            onChange={setKind}
            accessibilityLabel="Direction"
          />
        </View>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          Fixed once it is made: changing it later would flip the sign of everything already filed
          here.
        </Text>

        <View className="mx-lg mt-xl">
          <PrimaryButton
            label="Add category"
            variant={ready ? 'primary' : 'ghost'}
            onPress={create}
          />
        </View>
      </ScrollView>
    </View>
  );
}
