/**
 * NumberSheet — type one number, in the bottom third where the keyboard is.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Which workout was this?                    │
 *   │ Everything before and after renumbers from │
 *   │ this one.                                  │
 *   │ ╭ 91                                     ╮ │
 *   │ ╭──────────────── Save ──────────────────╮ │
 *   │ ╰─────────────── Cancel ─────────────────╯ │
 *   ╰────────────────────────────────────────────╯
 *
 * `ConfirmSheet` with a field in it, deliberately kept as its own component
 * rather than a mode of that one: a confirmation is "yes or no" and its safe
 * answer is the scrim, while this has a THIRD state — a value that isn't a usable
 * number yet — and `Save` has to be able to refuse. Sharing one component would
 * mean a disabled-button branch inside the sheet every confirmation in the app
 * pays for.
 *
 * The keyboard is opened on mount and the current value is selected, so the first
 * keystroke replaces it: nobody opens this to append a digit.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme/tokens';
import { FieldWell, PrimaryButton } from './primitives';

interface NumberSheetProps {
  title: string;
  body?: string;
  /** What the field starts at. Empty for "no number yet". */
  initial: number | null;
  /** Smallest value `Save` will accept. Anything below it keeps Save inert. */
  min?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export function NumberSheet({
  title,
  body,
  initial,
  min = 1,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: NumberSheetProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial == null ? '' : String(initial));

  /* Digits only — a workout number has no sign, no decimal point and no spaces. */
  const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const valid = Number.isFinite(parsed) && parsed >= min;

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        className="flex-1"
        style={{ backgroundColor: palette.scrim }}
      />

      <View
        style={{ paddingBottom: insets.bottom + 16 }}
        className="rounded-t-surface border-t border-t-hairline bg-surface px-lg pt-xl"
      >
        <Text className="text-title font-medium text-ink">{title}</Text>
        {body ? <Text className="mt-sm text-body text-ink-muted">{body}</Text> : null}

        <View className="mt-lg">
          <FieldWell
            value={text}
            onChangeText={setText}
            keyboardType="number-pad"
            autoFocus
            selectAllOnFocus
            placeholder={String(min)}
            accessibilityLabel={title}
          />
        </View>

        <View className="mt-xl">
          {/* Inert rather than hidden while the field holds nothing usable: a
              button that vanishes as you delete a digit is a moving target. */}
          <PrimaryButton
            label={confirmLabel}
            variant={valid ? 'primary' : 'ghost'}
            onPress={valid ? () => onConfirm(parsed) : () => {}}
          />
          <View className="h-sm" />
          <PrimaryButton label={cancelLabel} variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}
