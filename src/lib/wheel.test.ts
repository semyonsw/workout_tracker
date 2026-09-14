import { describe, expect, it } from 'vitest';

import { landing } from './wheel';

/**
 * Where a flick on the time wheel stops.
 *
 * The direction is the test that matters: a wheel that runs backwards is
 * perfectly usable-looking and sets the wrong time every single time, and it is
 * invisible in a screenshot. The bounds are the other half — an index past the
 * end reads `values[undefined]` and renders a blank column.
 */

const COLUMN = { rowHeight: 44, flickRows: 6, length: 60 };

function land(over: { index: number; dy: number; vy?: number; length?: number }) {
  return landing({ vy: 0, ...COLUMN, ...over });
}

describe('which way the wheel turns', () => {
  it('goes back through the values when the finger pulls down', () => {
    expect(land({ index: 30, dy: 88 })).toBe(28);
  });

  it('goes forward when the finger pulls up', () => {
    expect(land({ index: 30, dy: -88 })).toBe(32);
  });

  it('stays put for a drag too small to cross a row', () => {
    expect(land({ index: 30, dy: 10 })).toBe(30);
  });
});

describe('the flick', () => {
  it('carries further than the finger travelled', () => {
    const dragged = land({ index: 30, dy: -44 });
    const flicked = land({ index: 30, dy: -44, vy: -1 });
    expect(flicked).toBeGreaterThan(dragged);
  });

  it('carries the same way the finger was going', () => {
    expect(land({ index: 30, dy: -10, vy: -2 })).toBeGreaterThan(30);
    expect(land({ index: 30, dy: 10, vy: 2 })).toBeLessThan(30);
  });
});

describe('the ends of the column', () => {
  it('never lands past the last value, however hard it is thrown', () => {
    expect(land({ index: 59, dy: -4400, vy: -9 })).toBe(59);
  });

  it('never lands before the first', () => {
    expect(land({ index: 0, dy: 4400, vy: 9 })).toBe(0);
  });

  /*
   * Android hands back a NaN velocity on a gesture that is terminated rather
   * than released — rare, and it would otherwise clamp the column to 0 and
   * silently rewrite the user's time to midnight.
   */
  it('ignores a velocity or distance it cannot read', () => {
    expect(land({ index: 17, dy: 0, vy: Number.NaN })).toBe(17);
    expect(land({ index: 17, dy: Number.NaN })).toBe(17);
  });

  it('has somewhere to land even in an empty column', () => {
    expect(land({ index: 0, dy: -100, length: 0 })).toBe(0);
  });
});
