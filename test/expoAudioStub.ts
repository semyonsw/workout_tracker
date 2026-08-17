/**
 * In-memory `expo-audio`, aliased in by `vitest.config.ts`.
 *
 * Exists so `src/lib/beeper.ts` can be tested at all: the real module is a native
 * module and cannot load under Node. The stub records the ORDER of calls on each
 * player, because order is the thing the beeper gets right or wrong — `seekTo`
 * fired without waiting, while a tone is still sounding, is what turned one cue
 * into two audible beeps.
 */

export interface FakePlayerCall {
  method: 'pause' | 'seekTo' | 'play' | 'remove';
  at: number;
}

export interface AudioPlayer {
  volume: number;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  remove: () => void;
}

export interface FakePlayer extends AudioPlayer {
  source: unknown;
  calls: FakePlayerCall[];
  /** Set to make `seekTo` reject, the way a released player would. */
  failSeek: boolean;
}

/** Every player created since the last `resetAudioStub()`. */
export const createdPlayers: FakePlayer[] = [];
export let audioModeCalls = 0;
/** Set to make `createAudioPlayer` throw, the way a missing module would. */
export let failCreate = false;

export function resetAudioStub(options: { failCreate?: boolean } = {}): void {
  createdPlayers.length = 0;
  audioModeCalls = 0;
  failCreate = options.failCreate ?? false;
}

export function createAudioPlayer(source: unknown): AudioPlayer {
  if (failCreate) throw new Error('no audio module');

  const player: FakePlayer = {
    source,
    volume: 0,
    calls: [],
    failSeek: false,
    play() {
      player.calls.push({ method: 'play', at: Date.now() });
    },
    pause() {
      player.calls.push({ method: 'pause', at: Date.now() });
    },
    async seekTo() {
      player.calls.push({ method: 'seekTo', at: Date.now() });
      if (player.failSeek) throw new Error('released');
    },
    remove() {
      player.calls.push({ method: 'remove', at: Date.now() });
    },
  };

  createdPlayers.push(player);
  return player;
}

export async function setAudioModeAsync(): Promise<void> {
  audioModeCalls += 1;
}
