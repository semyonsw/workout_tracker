# Building the Android APK

A sideloadable, self-contained release APK for a Galaxy S24 (or any arm64 Android
phone). No Expo account, no cloud build, no Metro server — the JS bundle is
compiled into the APK, so it runs with the laptop switched off.

## Install it on the phone

1. Copy `workout-tracker-<version>.apk` to the phone (USB, Drive, Telegram —
   anything).
2. Open it in **Files** and tap install. The first time, Android asks to allow
   installs from that app; allow it and tap install again.
3. Play Protect will warn that the developer is unknown, because the APK is
   signed with a personal key rather than one Google has seen. **More details →
   Install anyway.**
4. On first launch, allow notifications — that's how the rest timer reaches you
   with the phone in a pocket. The timer also works without it, just silently.

Minimum Android 24 (7.0); the S24 ships far newer.

## Rebuild after a code change

```bash
export ANDROID_HOME=/root/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

npx expo prebuild -p android --clean     # only if app.json or deps changed
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

`arm64-v8a` is the only ABI built — every phone from roughly 2017 on is arm64,
and a single-ABI APK is ~40 MB smaller than a universal one. Drop the
`-PreactNativeArchitectures` flag to build all four ABIs.

## Shipping an update to a phone that already has it

Bump `android.versionCode` in `app.json` (an integer that must increase — 1 → 2
→ 3), rebuild, and install over the top. The install keeps existing data.

`versionName` (`"version"` in `app.json`) is the human string and can be
anything; `versionCode` is what Android compares.

## Signing — read this before you lose it

Android identifies an app by **package name + signing key**. An APK signed with
a different key than the one already installed **cannot update it**: Android
refuses the install, and the only way through is uninstall-then-install, which
**deletes your entire workout history**.

This app's key:

| | |
| --- | --- |
| Keystore | `~/.workout-tracker-signing/workout-tracker-release.keystore` |
| Alias | `workout-tracker` |
| Store / key password | `workouttracker` |
| Valid until | 2056 |
| Package | `com.semyonsw.workouttracker` |

**Back that keystore file up somewhere off this machine.** If it is lost, every
future build is a different app as far as the phone is concerned.

It is deliberately outside the repo and `.gitignore`d — a keystore in git is a
keystore anyone with repo access can ship updates with. Gradle reads its location
and passwords from `~/.gradle/gradle.properties`:

```properties
WT_STORE_FILE=/root/.workout-tracker-signing/workout-tracker-release.keystore
WT_STORE_PASSWORD=workouttracker
WT_KEY_ALIAS=workout-tracker
WT_KEY_PASSWORD=workouttracker
```

Those four properties are consumed by `plugins/withReleaseSigning.js`. Without
them the release build still succeeds but falls back to the debug key and prints
a warning — which is the wrong key to hand a phone, for the reason above.

The password is weak on purpose: it protects a key for a personal app that is
never published, and it lives on the same machine as the keystore, so a strong
one would add ceremony without adding security. Change both if this app ever
goes anywhere near a store.

## Why `android/` is not in git

`npx expo prebuild` **generates** `android/`. Anything edited by hand inside it
is destroyed by the next prebuild. `app.json` and `plugins/*` are the source of
truth; the signing config is a config plugin precisely so it is reapplied on
every regeneration rather than being a manual step someone forgets.

## Toolchain this was built with

| | |
| --- | --- |
| JDK | 17 (Temurin/OpenJDK) — RN 0.81 requires 17 |
| Android SDK | platform 36, build-tools 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |
| Expo | SDK 54 · React Native 0.81.5 |

`npm install` needs `--legacy-peer-deps` on some trees; `npx expo install --fix`
is the command that actually keeps the native dependency versions consistent
with the Expo SDK, and it is what resolved the original
reanimated-vs-react-native peer conflict.

## What is not wired yet

The UI is complete for all 14 designed screens, but the app is still running on
`src/data/seed.ts` rather than a database:

- Finishing a session logs the payload to the console instead of writing to
  SQLite, so **workouts do not persist across a force-quit after finishing**. An
  in-progress session *does* survive being killed — that is `AsyncStorage` via
  the zustand `persist` middleware.
- Creating an exercise or editing a routine holds the change in memory for the
  session only.
- The split cursor does not advance when a workout completes.

`src/db/schema.ts` already has the Drizzle schema; the shapes returned by
`draftToSetHistory()` match it, so wiring persistence is a matter of replacing
the seed reads in `src/navigation/AppShell.tsx` and the `onFinish` handler.
