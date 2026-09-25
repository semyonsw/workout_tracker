import { describe, expect, it } from 'vitest';

import { digitCells } from './rollingDigits';

/**
 * The columns, not the animation. The animation is only right if the columns
 * keep their identity, and that is arithmetic — see the file header.
 */

describe('cutting a number into columns', () => {
  it('makes a column per digit and a glyph per separator', () => {
    expect(digitCells('9,020')).toEqual([
      { kind: 'digit', key: 'p5', digit: 9 },
      { kind: 'glyph', key: 'p4,', char: ',' },
      { kind: 'digit', key: 'p3', digit: 0 },
      { kind: 'digit', key: 'p2', digit: 2 },
      { kind: 'digit', key: 'p1', digit: 0 },
    ]);
  });

  it('keeps the ones column when the number gains a digit', () => {
    const before = digitCells('9');
    const after = digitCells('10');
    // The ones digit is p1 on both sides: it rolls 9 → 0 in place.
    expect(before[0]).toEqual({ kind: 'digit', key: 'p1', digit: 9 });
    expect(after[1]).toEqual({ kind: 'digit', key: 'p1', digit: 0 });
    // And the new digit is the one on the left.
    expect(after[0]).toEqual({ kind: 'digit', key: 'p2', digit: 1 });
  });

  it('does not reuse a separator key for a digit', () => {
    const keys = digitCells('1:05').map((cell) => cell.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('p3:');
  });

  it('treats a sign and a percent as glyphs', () => {
    expect(digitCells('+2%').map((cell) => cell.kind)).toEqual(['glyph', 'digit', 'glyph']);
  });

  it('is empty for an empty string', () => {
    expect(digitCells('')).toEqual([]);
  });
});
