/**
 * TabBar — Workout / Tasks / Expenses / Settings, as one detached pane of glass.
 *
 *   ╭──────────────────────────────────────────────╮
 *   │ ▬▬▬▬▬▬▬▬     ·          ·          ·         │
 *   │ Workout    Tasks    Expenses    Settings     │
 *   ╰──────────────────────────────────────────────╯
 *          ← 12 →                        ← 12 →
 *
 * This bar exists ONLY outside a session. During a workout the session owns the
 * whole screen: there is nothing else to do while you are mid-set, and a tab bar
 * would put another log one thumb-slip away from the ✓.
 *
 * ── IT IS DETACHED NOW, AND THAT IS THE WHOLE CHANGE ──────────────────────
 *
 * It used to be a docked strip: a hairline, an opaque `bg-bg`, and the scroll
 * ending above it. It is inset 12 on three sides now, 64 tall, radius 26, and
 * the section's content scrolls VISIBLY UNDER it. That is not decoration — it
 * is the single clearest read on whether the glass in this app is working. A
 * docked bar and a floating one look identical in a screenshot of a screen at
 * rest; the difference appears in the half-second a list is moving, and it is
 * the difference between chrome and a layer.
 *
 * What pays for it is `barInset.bottom` in every section's scroll padding. A
 * translucent bar that hid the last row would be worse than an opaque one.
 *
 * Text only, no icons. Words are faster to read than glyphs you have to learn,
 * and the app's icon budget is spent on things that do something. The icon set
 * was drawn and compared; it cost the label two pixels and the app five glyphs,
 * and bought nothing a word was not already saying.
 *
 * What the active tab gained instead is a DOT that grows into a bar: 4px when the
 * section is one of the other three, 18 when it is the one you are in, over the
 * app's one curve. It is the same trick the rest of the redesign uses — a shape
 * carrying the state so the colour does not have to carry it alone — and it
 * survives being read at a glance in a way a slightly greener word does not. The
 * lit tab also sits on a `lit` pane, which is what gives the thumb a target with
 * an edge rather than four words in a row.
 *
 * ── THE PANE IS DRAWN ONCE, AND IT SLIDES ─────────────────────────────────
 *
 * It used to be four panes, three of them invisible, and a tab change was one
 * switching off and another switching on. It is ONE absolutely positioned pane
 * now (`SlidingThumb`), a quarter of the bar wide, that travels to the new tab
 * over 420 ms on the `spring` curve — a slight overshoot, so it lands rather than
 * stops. The swipe between sections moves it too, because both go through the
 * same `active` prop. The dot still grows 4 → 18 under it, and a tab sinks to
 * 0.92 under the thumb.
 *
 * ── FOUR SECTIONS, AND THE TWO THAT LEFT ──────────────────────────────────
 *
 * It was Today · Tasks · Money · History · More. `History` was never a section:
 * it is the PAST of one, and putting it on the bar meant the training log had a
 * root of its own while the tasks' and the money's were buried at the bottom of
 * their screens. It is a ⟲ in each section's own corner now — see
 * `components/SectionTopBar.tsx` — which is the same tap from all three.
 *
 * `More` was a lobby: one screen whose whole job was to hold the door for three
 * others. Settings is a root because it is the one of the three you actually
 * open, and it leads with a row per section. Routines and the exercise library
 * belong to the training log and now sit in the Workout section's own corner.
 *
 * The order is `lib/sectionNav.ts`, because a swipe moves along it — this bar
 * renders that array rather than declaring a second one. The array holds the
 * ENGLISH names, because it is also the route key — what is drawn goes through
 * `t()`, so the bar reads `Тренировка` while the navigation still says `Workout`.
 * A translated value used as an identifier is a router that breaks when somebody
 * changes language mid-session.
 *
 * The labels stay at 12px; `Тренировка` is the longest of the eight names across
 * both languages and does not truncate at 360 dp inside a 12-inset pill.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { GlassBar } from './glass';
import { usePressScale } from './motion';
import { SlidingThumb } from './SlidingThumb';
import { useMotionScale } from '../hooks/useMotionScale';
import { useT } from '../hooks/useT';
import { SECTIONS, type SectionTab } from '../lib/sectionNav';
import { curve, motion, palette, radius } from '../theme/tokens';

/** The app's one curve. */
const EASING = curve(motion.ease);

export const TABS = SECTIONS;
export type TabName = SectionTab;

interface TabBarProps {
  active: TabName;
  onSelect: (tab: TabName) => void;
}

export function TabBar({ active, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [rowWidth, setRowWidth] = useState(0);

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        // The inset is 12 from whatever the system leaves free, not from the
        // glass edge of the screen: on a phone with a gesture strip the pill
        // would otherwise sit under the thing you swipe up from.
        bottom: 12 + insets.bottom,
        borderRadius: radius.navPill,
        // Upward, and black: the pill is the layer above the section, and the
        // only shadow in the app that is cast up rather than down.
        boxShadow: [{ offsetX: 0, offsetY: -2, blurRadius: 30, color: 'rgba(0,0,0,0.6)' }],
      }}
    >
      <GlassBar radius={radius.navPill}>
        <View
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          style={{ height: 64, flexDirection: 'row', alignItems: 'center', padding: 6 }}
        >
          {/* The one lit pane, under the four words. See the file header. */}
          <SlidingThumb
            index={TABS.indexOf(active)}
            count={TABS.length}
            trackWidth={rowWidth}
            inset={6}
            duration={420}
            bezier={motion.spring}
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: 'rgba(63,169,108,0.28)',
              backgroundColor: 'rgba(63,169,108,0.16)',
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(63,169,108,0.22)' },
              ],
            }}
          />
          {TABS.map((tab) => (
            <TabItem
              key={tab}
              label={t(tab)}
              active={tab === active}
              onPress={() => onSelect(tab)}
            />
          ))}
        </View>
      </GlassBar>
    </View>
  );
}

function TabItem({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const press = usePressScale(0.92);
  return (
    <BubblePressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      radius={20}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{ flex: 1, height: 52, borderRadius: 20 }}
    >
      <Animated.View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          transform: press.style.transform,
        }}
      >
        <TabDot active={active} />
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={{ marginTop: 6, fontSize: 12, lineHeight: 15 }}
          className={active ? 'font-semibold text-green-bright' : 'font-medium text-ink-muted'}
        >
          {label}
        </Text>
      </Animated.View>
    </BubblePressable>
  );
}

/**
 * 4px of hairline, or 18px of lit green. Width and colour are the whole
 * component: an icon here would have to be learned, and this only has to be seen.
 */
function TabDot({ active }: { active: boolean }) {
  const grow = useRef(new Animated.Value(active ? 1 : 0)).current;
  const scale = useMotionScale();

  useEffect(() => {
    Animated.timing(grow, {
      toValue: active ? 1 : 0,
      duration: 300 * scale,
      easing: EASING,
      // Width is layout, so this one cannot run on the UI thread. It is four
      // pixels of a 64-high bar moving once per tab change, which is the one
      // place in the app that can afford it.
      useNativeDriver: false,
    }).start();
  }, [active, grow, scale]);

  return (
    <Animated.View
      style={{
        height: 4,
        borderRadius: 999,
        width: grow.interpolate({ inputRange: [0, 1], outputRange: [4, 18] }),
        backgroundColor: active ? palette.greenBright : palette.hairline,
        ...(active
          ? {
              boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(63,169,108,0.8)' }],
            }
          : {}),
      }}
    />
  );
}
