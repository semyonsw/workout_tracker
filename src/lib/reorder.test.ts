import { describe, expect, it } from 'vitest';

import { dropIndex, liftIndex, moveToIndex, type CardLayout } from './reorder';

/**
 * The trickiest arithmetic in the app, finally somewhere it can be asked
 * questions.
 *
 * It lived inside `ActiveWorkoutScreen` — whose own header calls the reorder the
 * genuinely awkward part — and none of these four cases can be reached from a test
 * that has to render a screen. The one that matters most is the FIRST: an expanded
 * card is four times the height of a collapsed one, so anything dividing a
 * travelled distance by a constant row height lands on the wrong exercise, and
 * lands further wrong the further you drag.
 */

/** Cards stacked from y = 0, each as tall as the height given. */
function stack(heights: number[]): {
  ids: string[];
  layouts: Record<string, CardLayout>;
} {
  const ids: string[] = [];
  const layouts: Record<string, CardLayout> = {};
  let y = 0;
  heights.forEach((height, i) => {
    const id = `e${i}`;
    ids.push(id);
    layouts[id] = { y, height };
    y += height;
  });
  return { ids, layouts };
}

/** Five collapsed cards, 80 tall: midpoints at 40, 120, 200, 280, 360. */
const collapsed = stack([80, 80, 80, 80, 80]);

const at = (
  fixture: { ids: string[]; layouts: Record<string, CardLayout> },
  liftedId: string,
  dy: number,
) =>
  dropIndex({
    ids: fixture.ids,
    liftedId,
    layouts: fixture.layouts,
    dy,
    fallbackIndex: fixture.ids.indexOf(liftedId),
  });

/* ------------------------------------------------------------------ */

describe('dropIndex', () => {
  it('is a no-op when the card has not moved', () => {
    // Its own index, in the list without it — which is why there is no off-by-one
    // correction anywhere and dropping a card back is free.
    expect(at(collapsed, 'e0', 0)).toBe(0);
    expect(at(collapsed, 'e2', 0)).toBe(2);
    expect(at(collapsed, 'e4', 0)).toBe(4);
  });

  it('counts a card passed once the midpoints cross', () => {
    // e0's centre is 40. e1's is 120, so it takes +81 to pass it.
    expect(at(collapsed, 'e0', 79)).toBe(0);
    expect(at(collapsed, 'e0', 81)).toBe(1);
    expect(at(collapsed, 'e0', 161)).toBe(2);
  });

  it('counts backwards the same way', () => {
    // e4's centre is 360; e3's is 280.
    expect(at(collapsed, 'e4', -79)).toBe(4);
    expect(at(collapsed, 'e4', -81)).toBe(3);
    expect(at(collapsed, 'e4', -400)).toBe(0);
  });

  it('THE EXPANDED CARD CASE: midpoints, not a row height', () => {
    /*
     * One expanded card among four collapsed ones — a header, a nudge, eighteen set
     * rows and a footer against one name and one line of shorthand. Heights
     * 80, 80, 320, 80, 80, so the midpoints are 40, 120, 320, 520, 600.
     *
     * Dragging the FIRST card down by 200 puts its centre at 240: past e1 (120),
     * not past e2 (320), so it lands at index 1. That is the assertion the whole
     * function exists for — 200 dp is two and a half COLLAPSED cards, so any
     * reading that divides the distance by a row height drops it at 2, past the
     * exercise the user was looking at.
     */
    const mixed = stack([80, 80, 320, 80, 80]);
    expect(at(mixed, 'e0', 200)).toBe(1);
    // Two and a half rows of travel, and the answer is still one card.
    expect(Math.round(200 / 80)).toBe(3);

    // Far enough to clear the tall one: centre 40 + 300 = 340 > 320.
    expect(at(mixed, 'e0', 280)).toBe(1);
    expect(at(mixed, 'e0', 300)).toBe(2);

    // Dragging the TALL card up: its centre is 320, e1's is 120, e0's is 40.
    expect(at(mixed, 'e2', -220)).toBe(1);
    expect(at(mixed, 'e2', -300)).toBe(0);
  });

  it('reaches the first position', () => {
    expect(at(collapsed, 'e3', -1000)).toBe(0);
  });

  it('reaches the last position, and does not overshoot it', () => {
    // Four cards without the lifted one, so 4 is the last insert position.
    expect(at(collapsed, 'e1', 1000)).toBe(4);
    expect(at(collapsed, 'e0', 100_000)).toBe(4);
  });

  it('leaves the card alone when its OWN layout has not been measured', () => {
    // No centre to compare with, so no answer that cannot be wrong. The fallback is
    // the index it was lifted from, which makes the drag a no-op rather than a jump.
    const { ids, layouts } = collapsed;
    expect(
      dropIndex({
        ids,
        liftedId: 'e_never_rendered',
        layouts,
        dy: 500,
        fallbackIndex: 2,
      }),
    ).toBe(2);
  });

  it('SKIPS an unmeasured neighbour rather than reading it as y = 0', () => {
    /*
     * `onLayout` has not run for a card that has never been on screen. Treating a
     * missing layout as `y = 0` would put it at the top of the list and drag every
     * drop target up with it — so a drag downwards would report a SMALLER index
     * than the truth.
     */
    const layouts: Record<string, CardLayout | undefined> = { ...collapsed.layouts };
    delete layouts.e1;

    // e0's centre is 40; with e1 gone from the count, only e2 (200) and beyond can
    // be passed. +200 puts the centre at 240, past e2 alone — and NOT at 2, which
    // is what reading the missing layout as y = 0 would have produced.
    expect(
      dropIndex({ ids: collapsed.ids, liftedId: 'e0', layouts, dy: 200, fallbackIndex: 0 }),
    ).toBe(1);
  });

  it('is 0 for a single-card list, whatever the finger does', () => {
    const one = stack([80]);
    expect(at(one, 'e0', 0)).toBe(0);
    expect(at(one, 'e0', 500)).toBe(0);
    expect(at(one, 'e0', -500)).toBe(0);
  });

  it('is 0 for an empty list', () => {
    expect(dropIndex({ ids: [], liftedId: 'e0', layouts: {}, dy: 100, fallbackIndex: 0 })).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('moveToIndex', () => {
  const list = ['a', 'b', 'c', 'd'];
  const move = (id: string, to: number) => moveToIndex(list, (x) => x === id, to);

  it('moves an item to a position in the list WITHOUT it', () => {
    expect(move('a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(move('d', 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('is a no-op when the item goes back where it came from', () => {
    // The reason there is no off-by-one correction in either caller.
    expect(move('b', 1)).toEqual(list);
    expect(move('a', 0)).toEqual(list);
    expect(move('d', 3)).toEqual(list);
  });

  it('clamps a drag that ran off either end', () => {
    // Past the last card means the last position, which is what the finger said.
    expect(move('a', 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(move('d', -99)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('returns a copy when the item is not in the list', () => {
    const result = moveToIndex(list, (x) => x === 'z', 1);
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it('never mutates the input', () => {
    const original = [...list];
    move('a', 3);
    expect(list).toEqual(original);
  });

  it('handles a one-item and an empty list', () => {
    expect(moveToIndex(['a'], (x) => x === 'a', 0)).toEqual(['a']);
    expect(moveToIndex(['a'], (x) => x === 'a', 5)).toEqual(['a']);
    expect(moveToIndex([], () => true, 0)).toEqual([]);
  });
});

describe('liftIndex', () => {
  it('is where the card sits now', () => {
    expect(liftIndex(['a', 'b', 'c'], 'b')).toBe(1);
  });

  it('is 0 rather than −1 for a card that is not in the list', () => {
    // −1 is an insert position no splice can honour.
    expect(liftIndex(['a', 'b'], 'z')).toBe(0);
    expect(liftIndex([], 'a')).toBe(0);
  });
});
