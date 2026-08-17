/**
 * Expo config plugin — keep the MICROPHONE out of the merged manifest.
 *
 * This app plays exactly two sounds: a 110 ms tick and a 420 ms tone, for the
 * countdown in `src/lib/beeper.ts`. It has never recorded anything and has no
 * feature that could.
 *
 * `expo-audio` ships one module for both directions, and its AAR manifest
 * declares the permissions for the half we don't use:
 *
 *   node_modules/expo-audio/android/src/main/AndroidManifest.xml
 *     <uses-permission android:name="android.permission.RECORD_AUDIO" />
 *
 * Android's manifest merger takes the UNION of every library's permissions, so
 * that line lands in the APK whatever the app manifest says. The plugin option
 * `recordAudioAndroid: false` in `app.json` only stops expo-audio's own config
 * plugin from ADDING the permission to the app manifest — it cannot retract what
 * the library's manifest contributes. Checking `android/app/src/main/
 * AndroidManifest.xml` therefore proves nothing; the merged manifest is what
 * ships, and it can be read back with:
 *
 *   aapt2 dump badging app-release.apk | grep permission
 *
 * The only thing that actually removes a merged permission is a `tools:node`
 * directive, which is what this plugin writes:
 *
 *   <uses-permission android:name="android.permission.RECORD_AUDIO"
 *                    tools:node="remove" />
 *
 * WHY BOTHER. A sideloaded APK that asks for the microphone is one the user has
 * to take on trust, and `RECORD_AUDIO` additionally makes Android infer
 * `uses-feature android.hardware.microphone`. A workout tracker requesting the
 * mic to beep is exactly the kind of thing that makes an app un-installable for
 * anyone paying attention — and it would be asking for a capability the code
 * cannot use.
 *
 * FOREGROUND_SERVICE and FOREGROUND_SERVICE_MEDIA_PLAYBACK are left alone: they
 * come from the same library manifest but grant no access to hardware or personal
 * data, they trigger no runtime prompt, and expo-audio's playback service is
 * declared against them. Removing those would be fighting the library over
 * something that costs the user nothing.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/** Permissions to strip from the MERGED manifest, whoever contributed them. */
const REMOVE = ['android.permission.RECORD_AUDIO'];

module.exports = function withoutMicrophone(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;

    // `tools:` is what makes `node="remove"` mean anything to the merger. It is
    // normally absent from the generated manifest, and adding it twice is a
    // duplicate-attribute error, so this is written idempotently.
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const existing = manifest['uses-permission'] ?? [];

    for (const name of REMOVE) {
      // Drop any plain grant of the same permission first: leaving both a grant
      // and a removal in one manifest is a merger conflict, not a subtraction.
      const others = existing.filter((entry) => entry?.$?.['android:name'] !== name);
      others.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      manifest['uses-permission'] = others;
    }

    return androidConfig;
  });
};
