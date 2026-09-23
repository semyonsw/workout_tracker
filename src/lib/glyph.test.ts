import { describe, expect, it } from 'vitest';

import { fallbackGraphemes, graphemes, lastGlyph } from './glyph';

/**
 * One picture, however many code points spell it. The old `slice(-1)` kept the
 * last code point, which turned 👍🏽 into a skin-tone swatch and a family into
 * one child.
 */

const CASES = ['🛒', '👍🏽', '👨‍👩‍👧', '🇦🇲', '1️⃣', '❤️'];

describe('the glyph field', () => {
  it('keeps a whole emoji, modifiers and joiners included', () => {
    for (const glyph of CASES) expect(lastGlyph(glyph)).toBe(glyph);
  });

  it('keeps the NEW one when typed over the old one', () => {
    expect(lastGlyph('🛒👍🏽')).toBe('👍🏽');
    expect(lastGlyph('🚌🇦🇲')).toBe('🇦🇲');
  });

  it('empties to nothing, not to a space', () => {
    expect(lastGlyph('')).toBe('');
    expect(lastGlyph('  ')).toBe('');
  });

  it('groups the same way without Intl.Segmenter, which Hermes may not have', () => {
    for (const glyph of CASES) expect(fallbackGraphemes(glyph)).toEqual([glyph]);
    expect(fallbackGraphemes('🇦🇲🇷🇺')).toEqual(['🇦🇲', '🇷🇺']);
    expect(fallbackGraphemes('ab')).toEqual(graphemes('ab'));
  });
});
