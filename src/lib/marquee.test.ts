import { describe, expect, it } from 'vitest';

import { MARQUEE_FADE, marqueePhases, marqueeTravel } from './marquee';

/**
 * Running text, without a renderer.
 *
 * The failure worth guarding is a label that moves when it should not: a short
 * name sliding back and forth inside a button that has room for it reads as the
 * app being broken, not as a feature. And the other one — a long name whose end
 * is still under the fade at the far end of the slide.
 */

describe('whether a label moves at all', () => {
  it('stays still when it fits', () => {
    expect(marqueeTravel(180, 200)).toBe(0);
  });

  it('stays still on a rounding hair of overflow', () => {
    expect(marqueeTravel(200.6, 200)).toBe(0);
  });

  it('stays still before either width has been measured', () => {
    expect(marqueeTravel(0, 200)).toBe(0);
    expect(marqueeTravel(300, 0)).toBe(0);
  });

  it('travels the overflow plus the fade, so the last glyph clears it', () => {
    expect(marqueeTravel(300, 200)).toBe(100 + MARQUEE_FADE);
  });
});

describe('the loop', () => {
  it('is never shorter than five seconds', () => {
    expect(marqueePhases(10).cycleMs).toBe(5000);
  });

  it('grows with the travel at reading speed', () => {
    // 140 px at 28 px/s is five seconds of travel, plus four of holding.
    expect(marqueePhases(140).cycleMs).toBe(9000);
  });

  it('adds up to exactly one cycle, in the 18/50/66/96 shape', () => {
    const p = marqueePhases(200);
    const sum = p.holdStartMs + p.outMs + p.holdEndMs + p.backMs + p.restMs;
    expect(sum).toBeCloseTo(p.cycleMs, 6);
    expect(p.holdStartMs / p.cycleMs).toBeCloseTo(0.18, 6);
    expect((p.holdStartMs + p.outMs) / p.cycleMs).toBeCloseTo(0.5, 6);
    expect((p.holdStartMs + p.outMs + p.holdEndMs) / p.cycleMs).toBeCloseTo(0.66, 6);
    expect((p.cycleMs - p.restMs) / p.cycleMs).toBeCloseTo(0.96, 6);
  });
});
