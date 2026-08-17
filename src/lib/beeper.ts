/**
 * The beeper — the last five seconds of any countdown, out loud.
 *
 *   rest 2:00   ...  0:05  0:04  0:03  0:02  0:01   0:00
 *                     ·     ·     ·     ·     ·      ▔▔▔
 *                    tick  tick  tick  tick  tick   GO
 *
 * Why this exists at all: a haptic buzz is useless when the phone is face-up on
 * a bench three feet away, and a notification arrives at zero — which is a beat
 * too late to be standing under the bar. The count-in is the whole point: you
 * hear five, you get set, you go on the long tone.
 *
 * Design notes worth keeping:
 *
 *  • TWO TONES, NOT ONE LOUDER. The tick is 880 Hz / 110 ms; the final tone is
 *    1320 Hz / 420 ms. A count-in you can identify without counting is one you
 *    can act on while looking at the ceiling.
 *  • TWO PLAYERS, NOT ONE. A shared player would have to seek back to zero
 *    between a tick and the final tone, and at a one-second cadence that race is
 *    audible as a swallowed beep.
 *  • IT NEVER THROWS. Audio is the least important thing in a gym app: if the
 *    native module is missing, the session is muted by the OS, or the player was
 *    released under us, the workout must carry on in silence. Every entry point
 *    here is wrapped, and failures are latched so a broken device doesn't retry
 *    on every tick.
 *  • Playback is `mixWithOthers`: people train to music, and an app that pauses
 *    their playlist to say "four" is an app they mute.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type BeepKind = 'tick' | 'final';

/*
 * `require` rather than `import`: these are Metro asset references (numeric
 * module ids), which is exactly what `createAudioPlayer` wants, and keeping them
 * lazy means the WAVs are only decoded once something actually beeps.
 */
const SOURCES: Record<BeepKind, () => unknown> = {
  tick: () => require('../../assets/beep.wav'),
  final: () => require('../../assets/beep-final.wav'),
};

const players: Partial<Record<BeepKind, AudioPlayer>> = {};
/** Set once audio has proven unusable on this device — stops per-tick retries. */
let disabled = false;
let audioModeRequested = false;

/**
 * Put the audio session in the right mode for short cues.
 *
 * Safe to call more than once, and safe to never call at all — a beep works
 * without it, just with the wrong interruption behaviour. Called from the app
 * entry so the first beep of a session doesn't pay for the setup.
 */
export async function prepareAudio(): Promise<void> {
  if (audioModeRequested || disabled) return;
  audioModeRequested = true;
  try {
    await setAudioModeAsync({
      // Someone counting down a plank has their phone on silent more often than
      // not. The cue has to survive that or it isn't a cue.
      playsInSilentMode: true,
      // Duck nothing, pause nothing: their music keeps playing.
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Wrong mode is survivable; a thrown error mid-workout is not.
  }
}

function playerFor(kind: BeepKind): AudioPlayer | null {
  if (disabled) return null;
  const existing = players[kind];
  if (existing) return existing;
  try {
    const player = createAudioPlayer(SOURCES[kind]() as never);
    player.volume = 1;
    players[kind] = player;
    return player;
  } catch {
    // No audio module, no decoder, no memory — whatever it was, stop trying.
    disabled = true;
    return null;
  }
}

/**
 * Play one cue. Fire-and-forget by design: nothing upstream should ever await a
 * beep, and nothing should branch on whether it was audible.
 *
 * The rewind is unconditional because the previous tick may still be mid-tail;
 * `play()` on a finished player would otherwise be a no-op at the end position.
 */
export function playBeep(kind: BeepKind): void {
  const player = playerFor(kind);
  if (!player) return;
  try {
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // A released or busy player is not a reason to interrupt a set.
  }
}

/**
 * Release both players.
 *
 * Not wired to a component: the players are process-scoped on purpose (they
 * outlive every screen and are reused across sessions). This exists for the
 * error-boundary reset path, where the safest assumption is that native state is
 * suspect and should be rebuilt from scratch.
 */
export function releaseBeeper(): void {
  for (const kind of Object.keys(players) as BeepKind[]) {
    try {
      players[kind]?.remove();
    } catch {
      // Already gone.
    }
    delete players[kind];
  }
  disabled = false;
  audioModeRequested = false;
}
