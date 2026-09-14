/**
 * SectionTopBar — the strip at the top of a section root.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WORKOUT                        ≡   📖    ⟲   │
 *   │ DAILY TASKS                              ⟲   │
 *   │ SETTINGS                            РУ  EN   │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THE HISTORY GLYPH IS UP HERE ───────────────────────────────────────
 *
 * Every section used to keep its own past at the BOTTOM of the screen it was
 * looking at: the tasks' month grid and trend under the day's rows, the money's
 * charts under the category tiles. So "how has this been going" was a scroll
 * through everything you already know before you reach the part you came for,
 * and it got longer every time the top of the screen grew. One tap in a corner
 * that never moves is the same distance from every section, and the past gets a
 * screen of its own rather than a tail.
 *
 * ── AND WHY IT IS NOW A ROW OF THEM ────────────────────────────────────────
 *
 * The workout section's other two destinations — the routines and the exercise
 * library — lived at the FOOT of its scroll, under the routines they are about.
 * That was the right call when the alternative was a tab of their own, and it is
 * the wrong one against this corner: they are the same kind of thing as the ⟲.
 * All three are "somewhere else in this section", none of them is content, and
 * two of the three were a scroll away while the third was a tap.
 *
 * So the corner takes a LIST of actions, laid out right to left in the order
 * they are declared, all at the same 36px. Same size is not a detail — it is
 * what makes them read as one row of destinations rather than one button and two
 * things beside it. The ⟲ stays rightmost, under the thumb, because it is the
 * one every section has.
 *
 * ── THE ONE THAT IS NOT A GLYPH ────────────────────────────────────────────
 *
 * Settings' corner holds `РУ` and `EN`, and they are letters rather than a flag
 * for the obvious reason — a flag names a country and this names a language —
 * and rather than a word ("Русский") because the corner is 36px tall and the
 * point of a language switch is that it is legible to somebody who cannot read
 * the language currently on screen. Two letters in their own script are.
 *
 * ── WHY NOT `ScreenHeader` ─────────────────────────────────────────────────
 *
 * That one is for a screen you are INSIDE: it leads with back, and its kicker
 * reads as a place you can leave. A section root is somewhere you already are —
 * nothing to go back to, and the tab bar says where you are as well. So this is
 * the same type scale and the same safe-area handling with the two halves swapped:
 * no back, a row of actions, and no hairline, because every section below puts
 * its own first surface right under it.
 */

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { BubblePressable } from './bubbles';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { glass, palette } from '../theme/tokens';

export interface TopBarAction {
  /** Stable across renders, so a row of three does not re-key on every tick. */
  key: string;
  icon: IconName;
  /** Spoken, and the only name this control has. */
  label: string;
  onPress: () => void;
  /** Lit, for an action that is currently the answer — the language in force. */
  active?: boolean;
}

interface SectionTopBarProps {
  /** Uppercase Micro kicker — the section's own name. */
  title: string;
  /** Second line, for a count or a total the section wants in the corner. */
  subtitle?: string;
  /**
   * The ⟲ on the right. Absent on a section that has no past to show.
   *
   * Kept as its own prop rather than folded into `actions` because every section
   * has one and it is always last: a section that had to remember to put it at
   * the end of an array is a section that can put it in the middle.
   */
  onOpenHistory?: () => void;
  /** What the glyph opens, spoken. "Training history", "Task history". */
  historyLabel?: string;
  /** Everything to the LEFT of the ⟲, in declared order. */
  actions?: readonly TopBarAction[];
  /** Anything the corner cannot be — Settings' two letters. */
  trailing?: ReactNode;
}

export function SectionTopBar({
  title,
  subtitle,
  onOpenHistory,
  historyLabel = 'History',
  actions = [],
  trailing,
}: SectionTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + 4 }} className="bg-bg px-lg pb-sm">
      <View className="h-hit flex-row items-center">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-micro font-semibold uppercase text-ink-faint">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-xs text-label font-medium tabular-nums text-ink-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        {trailing}

        {actions.map((action) => (
          <TopBarButton key={action.key} action={action} />
        ))}

        {onOpenHistory ? (
          <TopBarButton
            action={{
              key: 'history',
              icon: 'history',
              label: historyLabel,
              onPress: onOpenHistory,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * One 36px circle. The size is fixed here rather than passed, because the whole
 * argument for the row is that they are the same size — see the file header.
 */
function TopBarButton({ action }: { action: TopBarAction }) {
  return (
    <BubblePressable
      onPress={action.onPress}
      hitSlop={8}
      radius="pill"
      accessibilityRole="button"
      accessibilityState={{ selected: action.active }}
      accessibilityLabel={action.label}
      style={(state) => [pressedStyle(state), { backgroundColor: glass.sunken }]}
      className="ml-sm h-[36px] w-[36px] items-center justify-center rounded-pill border border-hairline"
    >
      <Icon
        name={action.icon}
        size={18}
        color={action.active ? palette.greenBright : palette.inkMuted}
      />
    </BubblePressable>
  );
}

/**
 * The language switch: two letters, the one in force lit.
 *
 * A pair of buttons rather than a `Segmented`, because it has to fit in the same
 * 36px band as the glyph row beside it and a segmented control is 44 with its
 * own track. It is still the same idea — one of two, the selected one on green —
 * so it reads as the app's vocabulary rather than as a new control.
 */
export function LanguageToggle({
  options,
  active,
  onSelect,
}: {
  options: readonly { value: string; label: string; name: string }[];
  active: string;
  onSelect: (value: string) => void;
}) {
  const t = useT();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('Application language')}
      style={{ backgroundColor: glass.sunken }}
      className="h-[36px] flex-row items-center rounded-pill border border-hairline p-[3px]"
    >
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <BubblePressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            radius="pill"
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.name}
            style={pressedStyle}
            className={[
              'h-[30px] items-center justify-center rounded-pill px-md',
              selected ? 'bg-green' : '',
            ].join(' ')}
          >
            <Text
              allowFontScaling={false}
              className={[
                'text-label',
                selected ? 'font-semibold text-ink' : 'font-medium text-ink-faint',
              ].join(' ')}
            >
              {option.label}
            </Text>
          </BubblePressable>
        );
      })}
    </View>
  );
}
