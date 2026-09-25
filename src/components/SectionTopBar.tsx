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
 * ── THE CORNER HOLDS DESTINATIONS ONLY ─────────────────────────────────────
 *
 * Placement rule 1, and this component is where it is enforced: an action takes
 * an ICON and nothing else, so there is no way to put a word like `Save` up
 * here. Every commit action in the app lives in the floating slot
 * (`components/glass.tsx`) instead — `right: 16, bottom: 92`, which on an 800 dp
 * phone is about 620 dp of diagonal closer to a right thumb than this corner.
 *
 * ── THE ONE THAT IS NOT A GLYPH ────────────────────────────────────────────
 *
 * Settings' corner holds `РУ` and `EN`, and they are letters rather than a flag
 * for the obvious reason — a flag names a country and this names a language —
 * and rather than a word ("Русский") because the corner is 36px tall and the
 * point of a language switch is that it is legible to somebody who cannot read
 * the language currently on screen. Two letters in their own script are.
 *
 * ── IT IS A PANE NOW, AND THE CONTENT RUNS UNDER IT ────────────────────────
 *
 * Absolutely positioned, at the `bar` tier, with each section's scroll paying
 * `barInset.top` in padding rather than the bar claiming the space in the flow.
 * Together with the detached nav pill (`components/TabBar.tsx`) that is the
 * load-bearing half of the redesign: a list that visibly passes behind glass is
 * the only thing that tells the eye a bar is a LAYER and not a strip of chrome.
 *
 * ── WHY NOT `ScreenHeader` ─────────────────────────────────────────────────
 *
 * That one is for a screen you are INSIDE: it leads with back, and its kicker
 * reads as a place you can leave. A section root is somewhere you already are —
 * nothing to go back to, and the tab bar says where you are as well. So this is
 * the same type scale and the same safe-area handling with the two halves
 * swapped: no back, and a row of actions.
 */

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { BubblePressable } from './bubbles';
import { GlassBar, SpecularEdge } from './glass';
import { pressedStyle } from './motion';
import { SlidingThumb } from './SlidingThumb';
import { useT } from '../hooks/useT';
import { palette, radius } from '../theme/tokens';

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
    <View
      // `zIndex` rather than order in the tree: the bar is declared BEFORE the
      // scroll in every screen that has one, because that is the reading order
      // of the file, and without this the list would paint straight over it.
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
    >
      <GlassBar>
        <View style={{ paddingTop: insets.top }} className="pb-sm pl-lg pr-md">
          <View className="h-[56px] flex-row items-center">
            <View className="flex-1 pr-sm">
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={{ letterSpacing: 1.3 }}
                className="text-micro font-semibold uppercase text-ink-muted"
              >
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
      </GlassBar>
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
      style={(state) => [
        pressedStyle(state),
        {
          marginLeft: 7,
          height: 36,
          width: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.07)',
          backgroundColor: 'rgba(236,241,238,0.055)',
        },
      ]}
    >
      {/* No `BlurView` inside these. Three of them sit on a bar that is already
          the heaviest blur in the app; blurring a 36 dp circle against a surface
          that is itself blurred buys nothing the tint does not, and it would be
          three more native layers on the one bar that is always on screen. */}
      <SpecularEdge color="rgba(236,241,238,0.10)" radius={radius.pill} />
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
 * band as the glyph row beside it and a segmented control is 44 with its own
 * track. It is still the same idea — one of two, the selected one on green — so
 * it reads as the app's vocabulary rather than as a new control.
 *
 * The green is ONE 44 × 26 pill that SLIDES between the two letters (300 ms, a
 * slight overshoot) rather than each letter lighting its own background: the
 * change of language is a change of position, and the pane says where it went.
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
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === active),
  );
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('Application language')}
      style={{
        backgroundColor: 'rgba(236,241,238,0.04)',
        borderColor: 'rgba(236,241,238,0.07)',
      }}
      className="h-[34px] flex-row items-center rounded-pill border p-[3px]"
    >
      <SlidingThumb
        index={index}
        count={options.length}
        trackWidth={options.length * SEGMENT + 6}
        inset={3}
        duration={300}
        bezier={[0.34, 1.3, 0.64, 1]}
        style={{
          borderRadius: 9999,
          backgroundColor: palette.green,
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(63,169,108,0.3)' }],
        }}
      />
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
            className="h-[28px] w-[44px] items-center justify-center rounded-pill"
          >
            <Text
              allowFontScaling={false}
              className={[
                'text-label',
                selected ? 'font-semibold text-ink' : 'font-semibold text-ink-faint',
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

/** One letter's cell, and the width the thumb covers. */
const SEGMENT = 44;
