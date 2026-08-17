/**
 * ConfirmSheet — "are you sure", in the bottom third where the thumb already is.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Delete “Weighted dips”?                    │
 *   │ It's in 2 routines. Sets you already logged │
 *   │ stay in your history.                       │
 *   │                                            │
 *   │ ╭──────────────── Delete ────────────────╮ │
 *   │ ╰──────────────── Keep it ───────────────╯ │
 *   ╰────────────────────────────────────────────╯
 *
 * A sheet rather than a dialog, for the same reason `FinishSheet` is one: both
 * answers have to stay under the thumb. A centred dialog puts the destructive
 * option in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button, and fear is not information. What makes this safe is
 * that the SAFE answer is bigger, lower, and also the whole scrim.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme/tokens';
import { PrimaryButton } from './primitives';

interface ConfirmSheetProps {
  /** "Delete “Weighted dips”?" — a question, naming the actual subject. */
  title: string;
  /** What will happen, and what won't. States consequences, never scolds. */
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      {/* Tapping the scrim is the safe answer: the easy gesture is never the
          irreversible one, even when the easy gesture is a mis-tap. */}
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

        <View className="mt-xl">
          <PrimaryButton label={confirmLabel} onPress={onConfirm} />
          <View className="h-sm" />
          <PrimaryButton label={cancelLabel} variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}
