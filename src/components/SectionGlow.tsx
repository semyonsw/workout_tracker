/**
 * SectionGlow — the two lamps the glass is lit by.
 *
 *   ╭─────────────────────────────╮
 *   │ ◜                           │   one behind the top-left corner,
 *   │                        ◝    │   one further down on the right
 *   │                             │
 *   ╰─────────────────────────────╯
 *
 * Two soft green radials behind everything a section draws, at 12–16% at their
 * centres and nothing by their edges. They carry no information, and that is the
 * point of stating it here: nothing in this app may be readable only because of
 * them, and a renderer that dropped this file entirely would lose atmosphere and
 * not a single fact.
 *
 * ── WHY THEY EXIST AT ALL ─────────────────────────────────────────────────
 *
 * Because the surfaces above them are GLASS now — a few percent of ink over the
 * page (`theme/tokens.ts`) — and glass over a flat black is just a slightly
 * lighter black. A card only reads as lying ON something if the something has
 * shape. These give the page that shape, in the one hue the app owns.
 *
 * `pointerEvents="none"` is load-bearing: this sits over the page background and
 * under the content, and a full-screen view that ate touches would make the
 * whole section inert.
 */

import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { palette } from '../theme/tokens';

export function SectionGlow() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowA" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.greenBright} stopOpacity={0.16} />
            <Stop offset="70%" stopColor={palette.greenBright} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.green} stopOpacity={0.12} />
            <Stop offset="70%" stopColor={palette.green} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Off the left edge at the top, and off the right a third of the way
            down: the two places a section's own content is thinnest. */}
        <Circle cx={60} cy={80} r={120} fill="url(#glowA)" />
        <Circle cx={340} cy={300} r={130} fill="url(#glowB)" />
      </Svg>
    </View>
  );
}
