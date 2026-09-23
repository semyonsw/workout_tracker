/**
 * A category's or a subsection's glyph — ONE picture, however many code points it
 * takes to spell.
 *
 * The field keeps only the last thing typed, so typing a new emoji over the old
 * one replaces it rather than appending. That used to be `[...text].slice(-1)`,
 * the last CODE POINT, and an emoji is frequently several: 👍🏽 is a thumb and a
 * skin tone, 👨‍👩‍👧 is three people glued with zero-width joiners, 🇦🇲 is two
 * regional letters. Each of those came out as its last fragment — a brown square,
 * a lone girl, a letter in a box.
 *
 * `Intl.Segmenter` answers it exactly where the engine has it. Hermes does not
 * ship it everywhere, so the fallback groups by the rules that cover every emoji
 * a keyboard produces: a joiner glues the next code point on, and modifiers,
 * variation selectors, tags, keycaps and combining marks attach to the one
 * before; regional indicators pair up.
 */

const ZWJ = 0x200d;

/** Code points that never start a picture, only extend the one before. */
function attaches(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // combining marks
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // skin tones
    (cp >= 0xe0020 && cp <= 0xe007f) || // tag sequences (subdivision flags)
    cp === 0x20e3 // keycap
  );
}

function isRegional(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/**
 * The grouping rules above, without `Intl`. Exported for its test — Node has a
 * Segmenter, so the fallback would otherwise never run anywhere but a phone.
 */
export function fallbackGraphemes(text: string): string[] {
  const out: string[] = [];
  let glueNext = false;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    const last = out.length - 1;
    const flagPair =
      isRegional(cp) &&
      last >= 0 &&
      [...out[last]].length === 1 &&
      isRegional(out[last].codePointAt(0) ?? 0);
    if (last >= 0 && (glueNext || cp === ZWJ || attaches(cp) || flagPair)) out[last] += char;
    else out.push(char);
    glueNext = cp === ZWJ;
  }
  return out;
}

/** Split into user-perceived characters. */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter !== 'function') return fallbackGraphemes(text);
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).map(
    (part) => part.segment,
  );
}

/** The last picture in what was typed, or '' for an emptied field. */
export function lastGlyph(text: string): string {
  const parts = graphemes(text.trim());
  return parts.length > 0 ? parts[parts.length - 1] : '';
}
