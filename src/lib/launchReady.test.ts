import { describe, expect, it } from 'vitest';

import {
  LAUNCH_CEILING_MS,
  LAUNCH_FLOOR_MS,
  launchReady,
  launchTicks,
  nextLaunchChangeMs,
} from './launchReady';

/**
 * The launch screen's two decisions: which chips are ticked, and whether it may
 * leave. A splash that leaves too early is a flash of a half-built screen; one
 * that never leaves is an app that does not open.
 */

const none = { history: null, tasks: null, money: null };

describe('the stage', () => {
  it('counts the stores that are ready', () => {
    expect(
      launchReady({ historyReady: true, tasksReady: false, moneyReady: true, elapsedMs: 100 })
        .stage,
    ).toBe(2);
  });
});

describe('the floor', () => {
  it('does not leave before 2.3 s even when everything is ready', () => {
    expect(
      launchReady({ historyReady: true, tasksReady: true, moneyReady: true, elapsedMs: 2299 }).exit,
    ).toBe(false);
  });

  it('leaves at 2.3 s once everything is ready', () => {
    expect(
      launchReady({
        historyReady: true,
        tasksReady: true,
        moneyReady: true,
        elapsedMs: LAUNCH_FLOOR_MS,
      }).exit,
    ).toBe(true);
  });

  it('waits past the floor for a store that is still loading', () => {
    expect(
      launchReady({ historyReady: true, tasksReady: false, moneyReady: true, elapsedMs: 4000 })
        .exit,
    ).toBe(false);
  });
});

describe('the ceiling', () => {
  it('leaves at 6 s whatever the stores say', () => {
    expect(
      launchReady({
        historyReady: false,
        tasksReady: false,
        moneyReady: false,
        elapsedMs: LAUNCH_CEILING_MS,
      }).exit,
    ).toBe(true);
  });
});

describe('the ticks', () => {
  it('ticks nothing before a store is ready', () => {
    expect(launchTicks(none, 5000)).toEqual({ history: false, tasks: false, money: false });
  });

  it('paces stores that finish at once into the three slots, in chip order', () => {
    const at = { history: 5, tasks: 5, money: 5 };
    expect(launchTicks(at, 699)).toEqual({ history: false, tasks: false, money: false });
    expect(launchTicks(at, 700)).toEqual({ history: true, tasks: false, money: false });
    expect(launchTicks(at, 1150)).toEqual({ history: true, tasks: true, money: false });
    expect(launchTicks(at, 1600)).toEqual({ history: true, tasks: true, money: true });
  });

  it('ticks in the order the stores actually finished', () => {
    const at = { history: 40, tasks: 900, money: 10 };
    // money finished first, so it takes the first slot.
    expect(launchTicks(at, 700)).toEqual({ history: false, tasks: false, money: true });
    expect(launchTicks(at, 1150)).toEqual({ history: true, tasks: false, money: true });
    expect(launchTicks(at, 1600)).toEqual({ history: true, tasks: true, money: true });
  });

  it('ticks a late store the moment it finishes, not at its slot', () => {
    const at = { history: 5, tasks: 5, money: 3000 };
    expect(launchTicks(at, 2999).money).toBe(false);
    expect(launchTicks(at, 3000).money).toBe(true);
  });
});

describe('the next change', () => {
  it('points at the next slot a ready store will tick in', () => {
    expect(nextLaunchChangeMs({ history: 5, tasks: 5, money: 5 }, 800)).toBe(1150);
  });

  it('points at the floor, then the ceiling, when nothing else is due', () => {
    expect(nextLaunchChangeMs(none, 100)).toBe(LAUNCH_FLOOR_MS);
    expect(nextLaunchChangeMs(none, 3000)).toBe(LAUNCH_CEILING_MS);
    expect(nextLaunchChangeMs(none, 7000)).toBeNull();
  });
});
