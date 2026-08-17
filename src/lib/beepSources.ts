/**
 * Where the two tones come from.
 *
 * One line per sound, in its own file, for one reason: this is the only part of
 * the beeper that depends on the BUNDLER rather than on audio.
 * `require('…/beep.wav')` is a Metro asset reference — it evaluates to the module
 * id `createAudioPlayer` wants, and it is exactly what every React Native asset
 * lookup in the ecosystem looks like. Nothing else can resolve it: Vitest reads
 * the specifier and tries to parse 9 KB of RIFF header as JavaScript.
 *
 * Keeping it here means `beeper.ts` — which holds the behaviour that was actually
 * broken, and is now tested — can be exercised with this module mocked, while the
 * app keeps the asset resolution that is known to work on the phone. The lookup
 * stays lazy: the WAVs are decoded the first time something beeps, not at import.
 */

import type { BeepKind } from './beeper';

export function beepSource(kind: BeepKind): unknown {
  return kind === 'tick'
    ? require('../../assets/beep.wav')
    : require('../../assets/beep-final.wav');
}
