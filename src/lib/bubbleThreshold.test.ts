import { describe, expect, it } from 'vitest';

import { nextBubbleVisible } from './bubbleThreshold';

/**
 * The hysteresis. The bug this prevents is visible only on a phone — a capsule
 * blinking at a list that has come to rest on the threshold — so it is pinned
 * here instead.
 */

describe('crossing up', () => {
  it('appears once the scroll passes 190', () => {
    expect(nextBubbleVisible(false, 191)).toBe(true);
  });

  it('does not appear at 190 exactly, or anywhere below it', () => {
    expect(nextBubbleVisible(false, 190)).toBe(false);
    expect(nextBubbleVisible(false, 170)).toBe(false);
  });
});

describe('crossing down', () => {
  it('leaves once the scroll drops under 150', () => {
    expect(nextBubbleVisible(true, 149)).toBe(false);
  });

  it('stays at 150 exactly', () => {
    expect(nextBubbleVisible(true, 150)).toBe(true);
  });
});

describe('jitter inside the band', () => {
  it('keeps whatever it was doing between 150 and 190', () => {
    let visible = false;
    for (const y of [160, 185, 155, 189, 151]) visible = nextBubbleVisible(visible, y);
    expect(visible).toBe(false);

    visible = true;
    for (const y of [160, 185, 155, 189, 151]) visible = nextBubbleVisible(visible, y);
    expect(visible).toBe(true);
  });

  it('flips exactly once on a scroll down and back', () => {
    let visible = false;
    let flips = 0;
    for (const y of [0, 100, 180, 200, 400, 200, 170, 152, 149, 60, 0]) {
      const next = nextBubbleVisible(visible, y);
      if (next !== visible) flips += 1;
      visible = next;
    }
    expect(flips).toBe(2);
    expect(visible).toBe(false);
  });

  it('ignores a scroll event with no number in it', () => {
    expect(nextBubbleVisible(true, Number.NaN)).toBe(true);
  });
});
