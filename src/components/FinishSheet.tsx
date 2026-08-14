/**
 * FinishSheet — "you have unlogged sets, are you sure".
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Finish workout?                            │
 *   │ 7 sets are still unlogged. They won't be   │
 *   │ saved.                                     │
 *   │                                            │
 *   │ ╭────────── Finish · 11 sets ───────────╮  │
 *   │ ╰────────────── Keep going ─────────────╯  │
 *   ╰────────────────────────────────────────────╯
 *
 * A sheet, not a dialog, for one reason: both buttons have to stay in the bottom
 * third where the thumb already is. A centred dialog puts the destructive option
 * in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button they press after every workout.
 */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme/tokens';
import { PrimaryButton } from './primitives';

interface FinishSheetProps {
  /** Sets the user planned but never logged. Drives the whole copy. */
  unloggedCount: number;
  loggedCount: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function FinishSheet({
  unloggedCount,
  loggedCount,
  onConfirm,
  onDismiss,
}: FinishSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      {/* Scrim. Tapping it is the same as "Keep going": the safe option is
          always the easy one, even when the easy one is a mis-tap. */}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Keep going"
        className="flex-1"
        style={{ backgroundColor: palette.scrim }}
      />

      <View
        style={{ paddingBottom: insets.bottom + 16 }}
        className="rounded-t-surface border-t border-t-hairline bg-surface px-lg pt-xl"
      >
        <Text className="text-title font-medium text-ink">Finish workout?</Text>
        <Text className="mt-sm text-body tabular-nums text-ink-muted">
          {unloggedCount} {unloggedCount === 1 ? 'set is' : 'sets are'} still unlogged. They won't be
          saved.
        </Text>

        <View className="mt-xl">
          <PrimaryButton label={`Finish · ${loggedCount} sets`} onPress={onConfirm} />
          <View className="h-sm" />
          <PrimaryButton label="Keep going" variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
