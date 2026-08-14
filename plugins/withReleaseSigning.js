/**
 * Expo config plugin — sign release builds with a real keystore.
 *
 * `expo prebuild` generates an `android/` project whose RELEASE build type is
 * signed with the DEBUG keystore, with a comment telling you to fix it. Fixing
 * it by editing `android/app/build.gradle` doesn't survive the next prebuild —
 * that directory is generated output, not source. So the fix lives here, and
 * every prebuild reapplies it.
 *
 * The keystore itself and its passwords are NEVER in the repo. They come from
 * Gradle properties, which normally live in `~/.gradle/gradle.properties`:
 *
 *   WT_STORE_FILE=/absolute/path/to/workout-tracker-release.keystore
 *   WT_STORE_PASSWORD=…
 *   WT_KEY_ALIAS=workout-tracker
 *   WT_KEY_PASSWORD=…
 *
 * If those properties are absent the release build falls back to the debug
 * keystore, so a fresh clone still produces a runnable APK — it just produces
 * one that can't be shipped as an update to the real app.
 *
 * WHY THIS MATTERS FOR SIDELOADING: Android identifies an app by package name
 * + signing key. An APK signed with a different key than the installed one
 * cannot update it — Android rejects the install and the only way through is to
 * uninstall first, which deletes the workout history. Keeping one stable
 * keystore is what makes "copy the new APK over and install" work forever.
 */

const { withAppBuildGradle } = require('@expo/config-plugins');

/** The signingConfig this plugin injects, reading from Gradle properties. */
const RELEASE_SIGNING_CONFIG = `
        release {
            // Injected by plugins/withReleaseSigning.js — do not edit here.
            // Values come from Gradle properties (see ~/.gradle/gradle.properties).
            if (project.hasProperty('WT_STORE_FILE')) {
                storeFile file(WT_STORE_FILE)
                storePassword WT_STORE_PASSWORD
                keyAlias WT_KEY_ALIAS
                keyPassword WT_KEY_PASSWORD
            } else {
                // No keystore configured: fall back to debug so the project
                // still builds, and say so loudly in the build log.
                println('WARNING: WT_STORE_FILE not set — release APK will be ' +
                        'signed with the DEBUG key and cannot update a real install.')
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;

    // 1. Add the `release` signing config beside the generated `debug` one.
    if (!contents.includes("hasProperty('WT_STORE_FILE')")) {
      const debugConfig = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;
      if (!contents.includes(debugConfig)) {
        throw new Error(
          'withReleaseSigning: could not find the generated debug signingConfig. ' +
            'The Expo template changed — update this plugin to match android/app/build.gradle.',
        );
      }
      contents = contents.replace(debugConfig, debugConfig + '\n' + RELEASE_SIGNING_CONFIG);
    }

    // 2. Point the release build type at it. The generated line is
    //    `signingConfig signingConfigs.debug` inside `release { … }`, and the
    //    identical line also appears inside `debug { … }`, so anchor on the
    //    comment the template puts directly above the one we want.
    const releaseMarker =
      '// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug';
    if (contents.includes(releaseMarker)) {
      contents = contents.replace(
        releaseMarker,
        '// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.release',
      );
    } else if (!contents.includes('signingConfig signingConfigs.release')) {
      throw new Error(
        'withReleaseSigning: could not repoint the release buildType to the release ' +
          'signingConfig. Check android/app/build.gradle against this plugin.',
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
