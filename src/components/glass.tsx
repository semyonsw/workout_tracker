/**
 * The glass vocabulary — five components, and every pane in the app is one of
 * them.
 *
 *   Lamps          layer 1: the radial greens the glass is lit BY
 *   SpecularEdge   the 1px lit line along a pane's top edge
 *   GlassSurface   layer 2: a blurred, tinted pane with a border and a shadow
 *   GlassBar       layer 4: the top bar and the nav pill, content scrolling under
 *   FloatingAction layer 3: the one commit action, right:16 bottom:92
 *   Toast          what a commit says on its way out
 *
 * ── WHY THE LIGHT HAS TO BE UNDER THE GLASS ───────────────────────────────
 *
 * The app already had glass tokens and section glows and still read flat, and
 * the reason was an ordering mistake rather than a value: the glow sat BEHIND a
 * surface with nothing to transmit. `SectionGlow` painted a radial, and then an
 * opaque-enough card was drawn over it, so the light had nowhere to go. Here the
 * lamps are the first child of the screen and every pane over them is
 * translucent enough to carry them through. That is the entire difference
 * between "tinted rectangle" and "pane".
 *
 * ── THE ANDROID RULES THIS FILE EXISTS TO HOLD ────────────────────────────
 *
 *  • A `BlurView` CLIPS ITS CHILDREN UNRELIABLY. So `GlassSurface` is a plain
 *    `View` with the radius and `overflow: hidden`, and the blur is a child of
 *    it filling the box. Never the other way round.
 *  • `elevation` CANNOT DO A COLOURED SHADOW. Every glow here is `boxShadow`,
 *    which React Native 0.76+ supports directly on the new architecture, and
 *    the whole app is already on it (`theme/tokens.ts` made the same call for
 *    the repeating glow). `elevation` is never used.
 *  • THERE IS NO INSET SHADOW. The specular edge is a real 1px `View` pinned to
 *    the top of the pane with the top two corners matching. Cheap, and it reads
 *    correctly at 1px on a 3× screen.
 *  • `BlurView` IS NOT FREE, and on Android it is not even ON by default —
 *    see `Pane` below for both halves of that. The budget is THREE blurred
 *    surfaces per screen: the top bar, the nav pill, and the one hero. Every
 *    repeating pane passes `flat`, which draws the same tint, border and
 *    specular with nothing behind them.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BubblePressable } from './bubbles';
import { Icon, type IconName } from './Icon';
import {
  LAMPS,
  barInset,
  elevation,
  floatingSlot,
  glassTier,
  halo,
  palette,
  radius as RADIUS,
  specularHeavy,
  type GlassTier,
  type LampSpec,
} from '../theme/tokens';

/**
 * The blurred half of a pane, and the one place `BlurView` is configured.
 *
 * ── `experimentalBlurMethod` IS NOT OPTIONAL ON ANDROID ───────────────────
 *
 * `expo-blur` defaults it to `'none'`, and `'none'` on Android does not blur at
 * all — it renders a semi-transparent view and nothing else. This app is
 * Android-only, so without this prop every pane in the redesign would be exactly
 * the flat alpha the redesign exists to replace, and it would look correct in a
 * simulator on a Mac while shipping nothing to the phone.
 *
 * ── AND `blurReductionFactor` IS WHY THE NUMBERS ARE THE DESIGN'S ─────────
 *
 * Android divides `intensity` by it, default 4. At 4 the design's 34 for the
 * bars arrives as 8 and the glass is a grey wash. At 1 the tier's number is the
 * radius, so `glassTier.blur` can hold the design's own px values instead of a
 * table of guesses about somebody else's divisor.
 *
 * ── IT COSTS SOMETHING, SO IT IS RATIONED ────────────────────────────────
 *
 * The Dimezis implementation re-draws what is behind the view every frame the
 * view or its background moves. The budget is THREE per screen — the two bars
 * and the one hero — and every repeating surface (rows, tiles, keypad keys,
 * chips) passes `flat` instead. A row's tint and specular edge are what make it
 * read as glass; the blur behind a 72 dp card that is 94% opaque is a cost with
 * nothing on the other side of it.
 */
function Pane({ intensity }: { intensity: number }) {
  return (
    <BlurView
      tint="dark"
      intensity={intensity}
      blurReductionFactor={1}
      experimentalBlurMethod="dimezisBlurView"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layer 1 — the lamps                                                 */
/* ------------------------------------------------------------------ */

/** Opacity 0.72 ↔ 1.0 over 7s. The one thing on a section root that is never still. */
const BREATH_MS = 7000;

/**
 * The two or three radial greens a section is lit by. Absolutely positioned,
 * `pointerEvents="none"`, and the first child of every section root.
 *
 * ONE `Svg` HOLDING ALL OF THEM rather than one per lamp: three overlapping
 * full-screen native views is three compositing layers for a decoration, and the
 * gradients are defined once in a shared `<Defs>` either way.
 *
 * `expo-linear-gradient` cannot do a radial, which is why this is SVG and not
 * the dependency the rest of the file's gradients come from. It also stays
 * tunable — the alternative the design offers is a pre-exported PNG at 2×/3×,
 * and a lamp you cannot move is a lamp that will be wrong on the next screen.
 */
export function Lamps({ section }: { section: keyof typeof LAMPS | string }) {
  const specs = LAMPS[section] ?? LAMPS.Workout;
  const { width, height } = useWindowDimensions();
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="lampBright" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.greenBright} stopOpacity={1} />
            <Stop offset="70%" stopColor={palette.greenBright} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="lampDim" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.green} stopOpacity={1} />
            <Stop offset="70%" stopColor={palette.green} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {specs.map((lamp: LampSpec, index: number) => (
          <Circle
            key={index}
            cx={lamp.x * width}
            cy={lamp.y}
            r={lamp.r}
            // The alpha rides on the CIRCLE and not on the gradient stops, so
            // one pair of gradients serves every lamp in the app.
            opacity={lamp.a}
            fill={lamp.hue === 'dim' ? 'url(#lampDim)' : 'url(#lampBright)'}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The specular edge                                                   */
/* ------------------------------------------------------------------ */

/**
 * The 1px lit line along a pane's top edge — React Native's stand-in for
 * `inset 0 1px 0 rgba(236,241,238,.1)`, which it has no way to draw.
 *
 * It is what makes a pane look like GLASS rather than like a tinted rectangle:
 * a real pane catches the light along the edge nearest it, and one flat tint
 * with a uniform border does not. Pinned inside the container, so the container
 * must be the thing carrying `overflow: hidden`.
 */
export function SpecularEdge({
  color,
  radius = RADIUS.card,
  height = 1,
}: {
  color: string;
  /** The container's own corner, so the line stops where the corner starts. */
  radius?: number;
  /** 2 for the floating action, which is the one heavier edge in the app. */
  height?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: color,
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layer 2 — content glass                                             */
/* ------------------------------------------------------------------ */

export type GlassTierName = 'well' | 'card' | 'lit' | 'bar';

export interface GlassSurfaceProps {
  tier?: GlassTierName;
  /** The pane's corner. Pass a number from `radius` in `theme/tokens.ts`. */
  radius?: number;
  /** `e1` cards and rows, `e2` heroes and floating things, `e3` the rest clock. */
  shadow?: 'none' | 'e1' | 'e2' | 'e3';
  /** A halo step, or a custom `boxShadow` array. `hero` is the soft card bloom. */
  glow?: 'none' | 'repeating' | 'single' | 'floating' | 'hero';
  /**
   * Draw the tint and the border WITHOUT the blur behind them.
   *
   * The blur budget is three per screen — the two bars and the one hero — and
   * the tasks list alone can ask for ten. A flat pane at the same tint is a far
   * smaller difference than a list that drops frames, and the light a blur would
   * carry is not doing any work behind a surface that is already 94% opaque.
   */
  flat?: boolean;
  /** A dashed edge — an empty slot, or a destructive action out of reach. */
  dashed?: boolean;
  /** Overrides the tier's tint. For the three states a task card has. */
  tint?: string;
  /** Overrides the tier's border. */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children?: ReactNode;
}

/**
 * One pane of glass: blur, tint, border, specular edge, shadow.
 *
 * The nesting is not decorative. `overflow: hidden` on a `BlurView` clips its
 * children unreliably on Android, so the OUTER view owns the radius and the
 * clipping and the blur is a child filling it — the order the design's
 * translation table calls for, and the one that leaves no unblurred hairline
 * along the corner.
 *
 * The shadow cannot be on that clipping view either, because a shadow is drawn
 * outside the box and `overflow: hidden` would cut it off. So it is on a
 * WRAPPER, and the wrapper is the node a caller's margin lands on.
 */
export function GlassSurface({
  tier = 'card',
  radius = RADIUS.card,
  shadow = 'none',
  glow = 'none',
  flat = false,
  dashed = false,
  tint,
  borderColor,
  style,
  className,
  children,
}: GlassSurfaceProps) {
  const spec: GlassTier = glassTier[tier];
  const boxShadow = [
    ...(glow === 'none' ? [] : halo[glow]),
    ...(shadow === 'none' ? [] : elevation[shadow]),
  ];

  return (
    <View
      // The radius is on the WRAPPER as well, and it is not redundant: a
      // `boxShadow` is cast from the view's own border box, so a square wrapper
      // around a rounded pane throws a square shadow with four visible corners.
      style={[boxShadow.length > 0 ? { boxShadow, borderRadius: radius } : null, style]}
      className={className}
    >
      <View
        style={{
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: borderColor ?? spec.border,
          // Only a FLAT pane paints its tint here. A blurred one paints it over
          // the `BlurView` instead — `BlurView` composites what is behind the
          // whole node, so a tint underneath it would be blurred into the glass
          // and then painted again, darkening the pane by twice what it asked
          // for.
          backgroundColor: flat ? (tint ?? spec.tint) : undefined,
        }}
      >
        {flat ? null : <Pane intensity={spec.blur} />}
        {/* The tint again, ON TOP of the blur. `BlurView` composites the page
            beneath it and would otherwise wash the tint out entirely — the
            background colour above is what a `flat` pane uses, this is what a
            blurred one does. */}
        {flat ? null : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: tint ?? spec.tint,
            }}
          />
        )}
        {spec.specular && !dashed ? <SpecularEdge color={spec.specular} radius={radius} /> : null}
        {children}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layer 4 — the bars                                                  */
/* ------------------------------------------------------------------ */

/**
 * A bar: the same pane as `GlassSurface` at the `bar` tier, positioned over the
 * content rather than in the flow with it.
 *
 * THE POINT OF IT IS WHAT YOU CAN SEE THROUGH IT. A docked bar and a floating
 * one look identical in a screenshot of a screen at rest; the difference only
 * appears in the half-second a list is moving, when rows pass under the glass
 * and the bar stops being a strip of chrome and becomes a layer. That is why
 * every section's scroll pays `barInset` in padding instead of the bars
 * claiming the space.
 */
export function GlassBar({
  radius = 0,
  style,
  children,
}: {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const spec = glassTier.bar;
  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: spec.tint,
          // A detached pill is bordered all round; a full-width bar has only
          // one edge that separates it from anything, so it draws only that one.
          borderWidth: radius > 0 ? 1 : 0,
          borderColor: spec.border,
          borderBottomWidth: 1,
          borderBottomColor: spec.border,
        },
        style,
      ]}
    >
      <Pane intensity={spec.blur} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: spec.tint,
        }}
      />
      {spec.specular ? <SpecularEdge color={spec.specular} radius={radius} /> : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layer 3 — the floating action                                       */
/* ------------------------------------------------------------------ */

/** The filled pill's fill. The one gradient in the app, and the ✓ marks share it. */
export const COMMIT_GRADIENT = ['#26935C', '#1A6B42'] as const;

/**
 * THE ONE COMMIT ACTION PER SECTION, in the same place in all four.
 *
 * `right: 16, bottom: 92`, 60 tall, radius 9999 — and the coordinates are the
 * substance, not the styling. Every Save, Finish, Add and Open in this app used
 * to live in the top-right corner of a header, which on an 800 dp phone is
 * about 620 dp of diagonal travel from a right thumb. The corner holds
 * DESTINATIONS now (history, routines, the library, the language switch) and
 * nothing that writes anything down.
 *
 * `ghost` is the one non-filled instance — Settings' `Back up now`. A section
 * whose action is a maintenance task should not shout in the same voice as one
 * whose action is the thing you opened the app to do.
 *
 * `asleep` is the keypad's Save before a digit exists: present, in position, at
 * 55%, so the button does not APPEAR when the first digit lands — it wakes. A
 * control that materialises under a thumb already on its way is a control that
 * gets pressed by accident.
 */
export function FloatingAction({
  label,
  icon,
  variant = 'filled',
  asleep = false,
  bottom = floatingSlot.bottom,
  onPress,
  accessibilityHint,
}: {
  label: string;
  icon?: IconName;
  variant?: 'filled' | 'ghost';
  asleep?: boolean;
  /** Raised off the slot for a screen with no nav pill under it. */
  bottom?: number;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const insets = useSafeAreaInsets();
  const filled = variant === 'filled' && !asleep;

  return (
    <View
      style={{
        position: 'absolute',
        right: floatingSlot.right,
        // The slot's 92 is measured from whatever the system leaves free, not
        // from the bottom edge of the glass: on a phone with a gesture strip the
        // pill would otherwise land on the nav pill it is supposed to clear.
        bottom: bottom + insets.bottom,
        borderRadius: RADIUS.pill,
        // A routine called `Pull (Tension on Back)` is 21 characters, and
        // `Open Pull (Tension on Back)` at 16/600 is wider than a 360 dp phone.
        // The pill floats OVER the list, so it must not be allowed to span it:
        // past three quarters of the width it stops reading as a layer and
        // starts reading as a bar that has come loose.
        maxWidth: '76%',
        boxShadow: [...(filled ? halo.floating : []), ...elevation.e2],
        opacity: asleep ? 0.55 : 1,
      }}
    >
      <BubblePressable
        onPress={onPress}
        radius="pill"
        // A green ring on a green fill is invisible; ink is the only colour that
        // can be seen leaving this surface.
        bubbleColor={filled ? palette.ink : palette.greenBright}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={{
          height: floatingSlot.height,
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: floatingSlot.paddingH,
        }}
      >
        {filled ? (
          <LinearGradient
            colors={[...COMMIT_GRADIENT]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <>
            <Pane intensity={26} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(236,241,238,0.07)',
                borderRadius: RADIUS.pill,
                borderWidth: 1,
                borderColor: 'rgba(236,241,238,0.10)',
              }}
            />
          </>
        )}
        {/* The one heavier specular in the app. At 2px it reads as a bevel
            rather than as an edge, which is what separates the thing you press
            from the panes it sits over. */}
        <SpecularEdge
          color={filled ? specularHeavy : 'rgba(236,241,238,0.14)'}
          radius={RADIUS.pill}
          height={filled ? 2 : 1}
        />
        {icon ? (
          <View style={{ marginRight: 9 }}>
            <Icon name={icon} size={17} color={filled ? palette.ink : palette.inkMuted} />
          </View>
        ) : null}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          // `shrink`, so the label ellipsises inside the capped pill instead
          // of pushing the icon out of it.
          style={{ color: filled ? palette.ink : palette.inkMuted, flexShrink: 1 }}
          className="text-body font-semibold"
        >
          {label}
        </Text>
      </BubblePressable>
    </View>
  );
}

/**
 * The SECONDARY of a pair, left of the primary and deliberately not its shape.
 *
 * Placement rule 4: on the session screen `Focus` is filled at 64 and `Finish`
 * is ghost at 52, with 10 between them. Different weight AND different geometry,
 * because muscle memory must not be able to end a workout — a thumb that has
 * pressed `Focus` sixty times this session should feel the difference before it
 * lands, not after.
 */
export function FloatingPair({
  secondary,
  primary,
  bottom = 24,
}: {
  secondary: { label: string; onPress: () => void };
  primary: { label: string; icon?: IconName; onPress: () => void };
  bottom?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        right: floatingSlot.right,
        bottom: bottom + insets.bottom,
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}
    >
      <View style={{ borderRadius: RADIUS.pill, boxShadow: [...elevation.e2], marginRight: 10 }}>
        <BubblePressable
          onPress={secondary.onPress}
          radius="pill"
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          style={{
            height: 52,
            borderRadius: RADIUS.pill,
            overflow: 'hidden',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <Pane intensity={26} />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(236,241,238,0.07)',
              borderRadius: RADIUS.pill,
              borderWidth: 1,
              borderColor: 'rgba(236,241,238,0.10)',
            }}
          />
          <SpecularEdge color="rgba(236,241,238,0.14)" radius={RADIUS.pill} />
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ color: palette.inkMuted }}
            className="text-label font-medium"
          >
            {secondary.label}
          </Text>
        </BubblePressable>
      </View>

      <View style={{ borderRadius: RADIUS.pill, boxShadow: [...halo.floating, ...elevation.e2] }}>
        <BubblePressable
          onPress={primary.onPress}
          radius="pill"
          bubbleColor={palette.ink}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          style={{
            height: 64,
            borderRadius: RADIUS.pill,
            overflow: 'hidden',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 24,
          }}
        >
          <LinearGradient
            colors={[...COMMIT_GRADIENT]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SpecularEdge color={specularHeavy} radius={RADIUS.pill} height={2} />
          {primary.icon ? (
            <View style={{ marginRight: 9 }}>
              <Icon name={primary.icon} size={17} color={palette.ink} />
            </View>
          ) : null}
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ color: palette.ink }}
            className="text-body font-semibold"
          >
            {primary.label}
          </Text>
        </BubblePressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The toast                                                           */
/* ------------------------------------------------------------------ */

/**
 * What a commit says on its way out: a ✓, four words, and gone.
 *
 * It sits in the floating slot's own band (`bottom: 92`) rather than at the top
 * of the screen, because that is where the thumb that just committed something
 * is already looking. `pointerEvents="none"` throughout — it never takes a
 * touch, so pressing the button underneath it twice in a row still works.
 *
 * The caller owns the timeout. A toast that dismissed itself would need to own
 * state that outlives the screen that raised it, and every caller here already
 * has a `useEffect` clearing the message it set.
 */
export function Toast({ label }: { label: string }) {
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: floatingSlot.bottom + insets.bottom,
        alignItems: 'center',
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      <View
        style={{
          height: 44,
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          backgroundColor: 'rgba(14,18,17,0.78)',
          borderWidth: 1,
          borderColor: 'rgba(63,169,108,0.3)',
          boxShadow: [{ offsetX: 0, offsetY: 12, blurRadius: 30, color: 'rgba(0,0,0,0.6)' }],
        }}
      >
        <Pane intensity={26} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(14,18,17,0.78)',
          }}
        />
        <SpecularEdge color="rgba(236,241,238,0.12)" radius={RADIUS.pill} />
        <Icon name="check" size={15} color={palette.greenBright} />
        <Text className="ml-sm text-label font-medium text-ink">{label}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * A filled ✓ mark — the gradient, the edge and the specular, at whatever size.
 *
 * Three places draw one and they must be the same object: a done task's mark, a
 * logged set's check, and focus mode's DONE. It was three hand-rolled circles
 * with three slightly different greens before this.
 */
export function CommitMark({
  size,
  glyph,
  glow = true,
  children,
}: {
  size: number;
  /** The ✓'s own size. Roughly half the circle. */
  glyph: number;
  /** Off in a column of them — see `halo` on why the rule is a count. */
  glow?: boolean;
  /** A label under the ✓, for the 176 dp one. */
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(63,169,108,0.5)',
        ...(glow ? { boxShadow: [...halo.repeating] } : {}),
      }}
    >
      <LinearGradient
        colors={[...COMMIT_GRADIENT]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SpecularEdge color={specularHeavy} radius={RADIUS.pill} height={size > 60 ? 2 : 1} />
      <Icon name="check" size={glyph} color={palette.ink} />
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What a section root's scroll has to pay so the two translucent bars never
 * cover a row.
 *
 * `barInset` in `theme/tokens.ts` is the bars' OWN heights — 64 for the top bar
 * without its status-bar padding, 178 for the nav pill plus the floating slot's
 * clearance. Neither of those knows about the phone, and the status bar is 24 on
 * one device and 48 on another with a cutout. So the tokens stay device-free and
 * this is the one place the two are added together.
 *
 * Every section root uses it. A screen that hard-codes `paddingTop: 64` is a
 * screen whose first row is under the glass on half the phones in the world.
 */
export function useBarInsets(): { top: number; bottom: number } {
  const insets = useSafeAreaInsets();
  return { top: insets.top + barInset.top, bottom: insets.bottom + barInset.bottom };
}
