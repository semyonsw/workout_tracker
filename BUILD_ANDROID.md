# Building the Android APK

A sideloadable, self-contained release APK for a Galaxy S24 (or any arm64 Android
phone). No Expo account, no cloud build, no Metro server — the JS bundle is
compiled into the APK, so it runs with the laptop switched off.

## 0.10.0 — what changed on the phone

`versionCode` 10. **It needs a prebuild**: `expo-sqlite` (and the Drizzle
packages behind it) were unused and are gone, so the set of native modules in the
APK is different from 0.9.0's.

- **Opening a workout no longer starts it.** A routine opens on its exercise list
  with nothing timed and nothing dated; the session begins on **`Start the
  workout`** (or on the first set you log). **`Stop and exit`** leaves without
  saving — it asks first if anything is logged — and only **`Finish`** writes to
  history. Backing out of a workout you never started leaves no trace at all.
- **The timer moved to the top of the screen and got much bigger** — 52 px
  numerals under the header instead of a small pill over your thumb. It still
  carries `+15`, `⏸`/`▶` and `Skip`, still names which rest it is running, and
  still inverts to a green slab for the last ten seconds.
- **No workout is suggested by default.** Every routine is listed on the home
  screen and you pick. The old shipped push/boxing/pull split is gone.
- **`Routines → Training sequence`** is the replacement, and it is **off and
  empty** until you build one: add steps in any order (push → pull → push),
  reorder them with ⌃/⌄, tap a step to make it the next one up, and switch it on.
  When it is on, the home screen names the next routine and advances the queue
  when you finish that workout. When it is off, nothing about it is shown.
- **✕ on any row of the routine editor removes that exercise from the routine.**
  It asks first, and the exercise itself stays in the library with all its
  history.
- **History states a total per exercise**: `+40 kg · 4 4 4` now carries
  `12 reps total` under it (or `4:00 total` for holds). Workouts logged before
  0.10.0 get their totals computed from the set rows already in the file, so old
  sessions show them too.
- **Dates are the phone's, not UTC.** A workout finished after midnight used to be
  listed under the previous day.

Before installing anything, open **Settings → `Export data`** and put that file
somewhere off the phone. That is the seatbelt for every install below.

## ⚠️ An APK built without the release keystore cannot update your install

Android identifies an app by **package name + signing key**. The release keystore
lives on the Windows machine (see [Signing](#signing--read-this-before-you-lose-it)),
NOT in this repo — so a build made anywhere else falls back to the debug key and
Android refuses to install it over the real app
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, worded "app not installed" on Samsung).

Two ways through, and they are both fine:

1. **Rebuild on the machine that has the keystore** (three commands below) and
   install straight over the top, keeping everything.
2. **Install the debug-signed APK** as a fresh app: `Export data` first, uninstall
   Workout Tracker, install, then `Import data` from the file. Costs ten minutes
   and nothing else — this is exactly what the export/import pair is for.

Check which key an APK carries before trusting it:

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

`CN=Workout Tracker` updates in place. `CN=Android Debug` needs route 2.

## Install it on the phone

1. Copy `workout-tracker-<version>.apk` to the phone (USB, Drive, Telegram —
   anything).
2. Open it in **Files** and tap install. The first time, Android asks to allow
   installs from that app; allow it and tap install again.
3. Play Protect will warn that the developer is unknown, because the APK is
   signed with a personal key rather than one Google has seen. **More details →
   Install anyway.**
4. On first launch, **allow notifications**. This is not a nicety: it is the ONLY
   way either timer reaches you once the app leaves the screen — the in-app beep
   is a JS timer, and Android stops those in the background. You get a tick five
   seconds before the deadline and the long tone at zero, both in the app's own
   voice. While the app is open, nothing is posted; the pill and its beeps do the
   work.
   On Samsung, also set **Battery → Unrestricted** for the app and make sure it is
   not in **Sleeping apps** — a restricted app's alarms are dropped.
5. Check the beep once, in **Settings → Countdown → Test the beep**. It plays the
   real 3 · 2 · 1 · go. If it's silent, the phone's media volume is down — the
   cue plays on the media stream so it can be heard over music, which also means
   it obeys the media slider rather than the ringer.

Minimum Android 24 (7.0); the S24 ships far newer.

## Rebuild after a code change

On the Windows machine (PowerShell), with the portable toolchain under
`C:\Users\user\dev-tools`:

```powershell
$env:JAVA_HOME  = "C:\Users\user\dev-tools\jdk17"
$env:ANDROID_HOME = "C:\Users\user\dev-tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

npm ci                                   # NOT `npm install --legacy-peer-deps`, see below
npx expo prebuild -p android --clean     # when app.json or a native dep changed
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

On Linux the same three lines are `export JAVA_HOME=…`, `export ANDROID_HOME=…`,
`./gradlew assembleRelease …`.

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

`arm64-v8a` is the only ABI built — every phone from roughly 2017 on is arm64,
and a single-ABI APK is ~40 MB smaller than a universal one. Drop the
`-PreactNativeArchitectures` flag to build all four ABIs.

### Install dependencies with `npm ci`

`npm install --legacy-peer-deps` **silently breaks this project**:
`react-native-reanimated@4` declares `react-native-worklets` as a peer dependency
rather than a dependency, and `--legacy-peer-deps` means "do not install peers".
The result installs and typechecks fine, then produces an APK whose animation
runtime has no native part. `npm ci` installs exactly the tree in
`package-lock.json`, worklets included, which is what a reproducible APK needs.

If npm ever refuses the tree outright, the command that actually fixes it is
`npx expo install --fix` (it aligns native versions with the Expo SDK), not
`--legacy-peer-deps`.

### Windows: the 260-character path limit, and the one fix that works

A build can fail after half an hour with:

```
ninja: error: Stat(safeareacontext_autolinked_build/CMakeFiles/…/
  safeareacontextJSI-generated.cpp.o): Filename longer than 260 characters
```

That object path is ~300 characters, and no amount of moving the project up the
tree fixes it: most of the length is the New Architecture codegen path *inside*
`node_modules/react-native-safe-area-context/android/build/generated/…`. Two
settings matter:

1. **`LongPathsEnabled = 1`** in
   `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem`. Without it nothing below
   helps.
2. **A long-path-aware `ninja`.** The Android SDK's `cmake;3.22.1` bundles ninja
   **1.10.2**, which refuses any path over `MAX_PATH` in its own `Stat()`
   regardless of what the OS allows. Ninja gained the `longPathAware` manifest in
   1.11, so swap the binary:

```powershell
$cmakeBin = "$env:ANDROID_HOME\cmake\3.22.1\bin"
Copy-Item "$cmakeBin\ninja.exe" "$cmakeBin\ninja-1.10.2-bundled.exe"   # keep the original
# from https://github.com/ninja-build/ninja/releases (v1.12.1, ninja-win.zip)
Copy-Item "C:\Users\user\dev-tools\ninja\ninja.exe" "$cmakeBin\ninja.exe" -Force
```

Nothing in the repo changes: CMake invokes whatever `ninja.exe` sits beside it,
so this is a property of the machine's toolchain rather than of the project. It
also survives `expo prebuild`, which a patched `android/app/build.gradle` would
not.

### Verify permissions on the APK, never on the source manifest

`expo-audio` ships recording and playback in one module, and its AAR manifest
declares `RECORD_AUDIO`. Android's manifest merger takes the **union** of every
library's permissions, so that line reaches the APK no matter what
`android/app/src/main/AndroidManifest.xml` says — `recordAudioAndroid: false`
only stops expo-audio's own plugin from adding it to the *app* manifest, which is
a different file from the one that ships.

`plugins/withoutMicrophone.js` is what actually removes it, via
`tools:node="remove"`. Because this is a merge-time behaviour, the only honest
check reads the built artifact:

```bash
aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk \
  | grep -E "permission|microphone"
```

Expect **no** `RECORD_AUDIO` and **no** `uses-implied-feature ... microphone`.
`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` are expected and
left in place: same library manifest, but they grant no hardware or personal-data
access and prompt for nothing.

Also expect `USE_EXACT_ALARM` and `POST_NOTIFICATIONS` — those are what make a
timer alert land on time with the app off screen.

Grepping the source manifest proves nothing and will happily report success while
the APK asks for the mic.

## Shipping an update to a phone that already has it

Bump `android.versionCode` in `app.json` (an integer that must increase), rebuild,
and install over the top. The install keeps existing data.

`versionName` (`"version"` in `app.json`) is the human string and can be
anything; `versionCode` is what Android compares.

## Signing — read this before you lose it

An APK signed with a different key than the one already installed **cannot update
it** — see the box at the top of this file. That is not hypothetical: it is
exactly what happened between 0.3.0 and 0.4.0, and it cost an uninstall.

This app's key:

| | |
| --- | --- |
| Keystore | `C:\Users\user\.workout-tracker-signing\workout-tracker-release.keystore` |
| Alias | `workout-tracker` |
| Store / key password | `workouttracker` |
| Valid until | 2056 (11 000 days) |
| Package | `com.semyonsw.workouttracker` |

Recreate it, if it is ever lost, with:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\.workout-tracker-signing\workout-tracker-release.keystore" `
  -alias workout-tracker -keyalg RSA -keysize 2048 -validity 11000 `
  -storepass workouttracker -keypass workouttracker `
  -dname "CN=Workout Tracker, OU=Personal, O=semyonsw, L=Yerevan, C=AM"
```

…knowing that a recreated key is a NEW key, and costs another uninstall.

**Back that keystore file up somewhere off that machine.** It is deliberately
outside the repo and `.gitignore`d — a keystore in git is a keystore anyone with
repo access can ship updates with. Gradle reads its location and passwords from
`~/.gradle/gradle.properties`:

```properties
WT_STORE_FILE=C:/Users/user/.workout-tracker-signing/workout-tracker-release.keystore
WT_STORE_PASSWORD=workouttracker
WT_KEY_ALIAS=workout-tracker
WT_KEY_PASSWORD=workouttracker
```

Those four properties are consumed by `plugins/withReleaseSigning.js`. Without
them the release build still succeeds but falls back to the debug key and prints a
warning — which is the wrong key to hand a phone, for the reason above.

> **Windows trap: write that file WITHOUT a BOM.** `Set-Content -Encoding utf8`
> and `>` in PowerShell 5.1 both prepend a UTF-8 BOM, and Java's `Properties`
> loader reads the file as raw bytes — so the BOM becomes part of the FIRST key
> name and `WT_STORE_FILE` silently does not exist. The build then succeeds, signs
> with the debug key, and produces an APK that cannot update the real app. Write it
> with
> `[System.IO.File]::WriteAllLines($path, $lines, (New-Object System.Text.UTF8Encoding($false)))`,
> and verify the key **on the artifact** with the `apksigner` command at the top of
> this file.

The password is weak on purpose: it protects a key for a personal app that is
never published, and it lives on the same machine as the keystore. Change both if
this app ever goes anywhere near a store.

## Why `android/` is not in git

`npx expo prebuild` **generates** `android/`. Anything edited by hand inside it is
destroyed by the next prebuild. `app.json` and `plugins/*` are the source of
truth; the signing config is a config plugin precisely so it is reapplied on every
regeneration rather than being a manual step someone forgets.

## Toolchain this was built with

| | |
| --- | --- |
| JDK | 17 or 21 (Temurin/OpenJDK) — RN 0.81 requires 17+ |
| Android SDK | platform 36, build-tools 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1, with its bundled ninja replaced by **1.12.1** on Windows (see the path-limit section) |
| Expo | SDK 54 · React Native 0.81.5 |
