/**
 * BalanceSheet — the money you HAVE, typed in directly.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Cash                                       │
 *   │ WHAT YOU HAVE · AMD                        │
 *   │ ┌────────────────────────────────────────┐ │
 *   │ │ 40,000▎                                │ │
 *   │ └────────────────────────────────────────┘ │
 *   │ Set directly. Nothing is recorded as an    │
 *   │ income, and no month or chart moves.       │
 *   │ ╭──────────────── Save ────────────────╮   │
 *   ╰────────────────────────────────────────────╯
 *
 * Every other number in this app arrives as a logged event. This one does not,
 * and that is the whole point of it: what is already in a pocket on the day the
 * app is installed is not an income, and filing it as one would put a figure
 * nobody earned into September's incomes and into every chart drawn from them.
 *
 * So the field is the BALANCE, not the correction — the user types what they
 * have, exactly as they read it off the screen they tapped — and the difference
 * lands on the account's `opening` (`lib/money.ts`). Asking for the correction
 * instead would mean asking somebody to do the subtraction the app is holding
 * all the numbers for.
 *
 * A MINUS SIGN IS ALLOWED. An account can honestly hold less than nothing, and
 * a field that silently ate the `-` would make that unsayable.
 */

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Sheet } from './Sheet';
import { Kicker, PrimaryButton, TextButton } from './primitives';
import { useT } from '../hooks/useT';
import { formatValue } from '../lib/money';
import { palette } from '../theme/tokens';

interface BalanceSheetProps {
  /** The subsection being set — its name is the sheet's title. */
  title: string;
  /** What the screen is currently showing, so the field opens on it. */
  balance: number;
  currency: string;
  onSave: (balance: number) => void;
  onDismiss: () => void;
}

/** `-40 000` typed any which way → `-40000`. Digits and one leading minus. */
function parseSigned(text: string): { digits: string; value: number } {
  const negative = text.trim().startsWith('-');
  const digits = text.replace(/\D/g, '');
  return { digits: (negative ? '-' : '') + digits, value: Number(digits) * (negative ? -1 : 1) };
}

export function BalanceSheet({ title, balance, currency, onSave, onDismiss }: BalanceSheetProps) {
  const t = useT();
  const [digits, setDigits] = useState(String(balance));
  const parsed = parseSigned(digits);
  const shown = digits === '' || digits === '-' ? digits : formatValue(parsed.value);

  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Kicker className="mb-sm">
        {t('What you have')} · {currency}
      </Kicker>
      <View className="h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
        <TextInput
          value={shown}
          onChangeText={(text) => setDigits(parseSigned(text).digits)}
          placeholder="0"
          placeholderTextColor={palette.inkFaint}
          cursorColor={palette.greenBright}
          selectionColor={palette.greenBright}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
          accessibilityLabel={t('Amount in {currency}', { currency })}
          className="flex-1 text-title-xl font-semibold tabular-nums text-ink"
        />
      </View>

      <Text className="mt-sm text-label text-ink-faint">
        {t(
          'This sets the balance directly. Nothing is recorded as an income, and no month, category or chart moves.',
        )}
      </Text>

      <View className="mt-xl">
        <PrimaryButton label={t('Save')} onPress={() => onSave(parsed.value)} />
        <TextButton label={t('Cancel')} onPress={onDismiss} />
      </View>
    </Sheet>
  );
}
