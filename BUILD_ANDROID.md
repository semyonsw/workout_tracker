# Building the Android APK

A sideloadable, self-contained release APK for a Galaxy S24 (or any arm64 Android
phone). No Expo account, no cloud build, no Metro server — the JS bundle is
compiled into the APK, so it runs with the laptop switched off.

## 0.9.0 installs straight over 0.8.0

Same signing key, `versionCode` 9. Copy it over, tap install, keep your data — and
then, before anything else, open **Settings → Back up & restore → `Save a backup
file…`** and put a copy somewhere off the phone. That is what the version exists
for: everything you own is now exportable to one readable JSON file and importable
back, so the next reinstall costs nothing.

What else is new on the phone:

- **`+ Add set` / `− Remove set`** in every exercise card mid-workout, and on an
  exercise down to one row the second one reads `Remove exercise`.
- **`+ Add an exercise`** at the bottom of a running workout: the library picker,
  and the create screen under it, both landing the exercise at the end of the
  session with one set.
- **Long-press an exercise card and slide** to reorder the session.
- **`START THE CLOCK NOW`** in the session header, for a workout that was opened
  before the warm-up and reads 350 minutes.
- **Every weight ± is `0.5` and `2` kg**, everywhere.

## 0.5.0 installs straight over 0.4.0

Same signing key, `versionCode` 5. Copy it over, tap install, keep your data.

Two things about it worth knowing on the phone:

- **The timer cue when the app isn't open is a notification now**, carrying the
  app's own two tones (a tick 5 s out, the long tone at zero). A JS interval
  playing a WAV cannot survive Doze, a Restricted battery setting, or a
  swipe-away; a scheduled alarm can. That means notifications must be **allowed**,
  and on Samsung the app should be **Unrestricted** under battery usage and NOT in
  the *Sleeping apps* list — otherwise Android is free to drop the alarm.
- The app now starts with **no history at all**. The ten fake logged sessions that
  used to ship are gone, so `RECENT`, the exercise charts and the overload nudges
  are empty until you finish workouts of your own.

## ⚠️ 0.4.0 needed to be installed over an UNINSTALL, once

Android identifies an app by **package name + signing key**, and 0.4.0 is signed
with a different key than 0.3.0 was: the 0.3.0 keystore lived on the Linux
machine that built it and is not on this one. There is no way to re-create a lost
key, so 0.4.0 cannot install *over* 0.3.0 — Android refuses with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` (Samsung words it "app not installed").

So, one time only:

1. Uninstall **Workout Tracker** on the phone (long-press the icon → Uninstall).
2. Install `app-release.apk` from this build.

What that costs: the settings you had changed, any exercise you created and any
routine you edited on the phone. It costs no workout history — 0.3.0 never
persisted a finished workout, which is one of the things 0.4.0 fixes.

**From 0.4.0 onwards, updates install straight over the top**, because the
keystore now lives at `~/.workout-tracker-signing/` on this machine and every
later build reuses it. Back that file up — see [Signing](#signing--read-this-before-you-lose-it).

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

On the Windows machine this is now built on (PowerShell), with the portable
toolchain under `C:\Users\user\dev-tools`:

```powershell
$env:JAVA_HOME  = "C:\Users\user\dev-tools\jdk17"
$env:ANDROID_HOME = "C:\Users\user\dev-tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

npm ci                                   # NOT `npm install --legacy-peer-deps`, see below
npx expo prebuild -p android             # only if app.json or deps changed
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

On Linux the same three lines are `export JAVA_HOME=…/java-17-openjdk`,
`export ANDROID_HOME=…/android-sdk`, `./gradlew assembleRelease …`.

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

The first 0.4.0 build failed after 30 minutes with:

```
ninja: error: Stat(safeareacontext_autolinked_build/CMakeFiles/…/
  safeareacontextJSI-generated.cpp.o): Filename longer than 260 characters
```

That object path is ~300 characters, and no amount of moving the project up the
tree fixes it: most of the length is the New Architecture codegen path *inside*
`node_modules/react-native-safe-area-context/android/build/generated/…`, and the
same again for `react-native-svg`. Shortening the project directory buys ~30
characters against a ~40-character overrun.

What actually matters is two settings, and only one of them was in place:

1. **`LongPathsEnabled = 1`** in
   `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem` — already on, on this
   machine. Without it nothing below helps.
2. **A long-path-aware `ninja`.** The Android SDK's `cmake;3.22.1` bundles ninja
   **1.10.2**, which refuses any path over `MAX_PATH` in its own `Stat()`
   regardless of what the OS allows. Ninja gained the `longPathAware` manifest in
   1.11, so the fix is to swap the binary:

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

The alternative — passing `-DCMAKE_OBJECT_PATH_MAX=200` so CMake hashes the long
object names — would mean a config plugin to survive prebuild, and it changes what
the build produces on every platform to work around one platform. The swapped
binary is the smaller change.

### 0.5.0 needs the prebuild step

No new native module, but `app.json` changed in two ways that only reach the APK
through a prebuild:

- `android.permissions` gained **`USE_EXACT_ALARM`**, which is what makes a timer
  notification land on time. Unlike `SCHEDULE_EXACT_ALARM` it is granted at install
  and cannot be revoked, and unlike a foreground service it costs nothing while
  idle. (Google Play restricts this permission to alarm-shaped apps; this one is
  sideloaded, and a rest timer is exactly the intended case.)
- `expo-notifications` gained `sounds: [...]`, which copies `assets/beep_tick.wav`
  and `assets/beep_final.wav` into `android/app/src/main/res/raw/`. On Android 8+
  the sound belongs to the CHANNEL, so those files are how a notification can play
  the app's own tones instead of the system ding. Verify them after a prebuild:

```powershell
Get-ChildItem android\app\src\main\res\raw   # expect beep_tick.wav + beep_final.wav
```

The asset files are named with UNDERSCORES for this reason — an Android resource
name cannot contain a hyphen, and `beep-final.wav` would fail the build.

### 0.4.0 did not need a prebuild for its own sake

Everything in 0.4.0 was JS (rest fixes, the beeper, the History section). That
build ran one only because `android/` did not exist on this machine yet.

### 0.3.0 needed the prebuild step

`expo-audio` was added for the countdown beep, which means a NEW NATIVE MODULE:
a JS-only rebuild will bundle code that calls into something the old APK does not
contain. Run the `prebuild` line above (or `npx expo prebuild -p android`) before
`assembleRelease` for this version. `app.json` also gained
`recordAudioAndroid: false` — the audio plugin requests the MICROPHONE by
default, and an app that plays two 200 ms tones has no business asking for it.

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

Grepping the source manifest proves nothing and will happily report success while
the APK asks for the mic.

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
**deletes your entire workout history**. That is not hypothetical — it is exactly
what happened between 0.3.0 and 0.4.0, and it is why the box at the top of this
file exists.

Since 0.9.0 there is a seatbelt for exactly this: **Settings → Back up & restore →
`Save a backup file…`** writes every exercise, routine and finished workout to a
JSON file in a folder you pick. Do that BEFORE any install you are not certain
about, and an uninstall costs you nothing but the reinstall. It is not a substitute
for keeping the keystore — a signature mismatch is still an uninstall — but it is
the difference between losing a year of training and losing ten minutes.

This app's key (regenerated for 0.4.0 on the Windows machine):

| | |
| --- | --- |
| Keystore | `C:\Users\user\.workout-tracker-signing\workout-tracker-release.keystore` |
| Alias | `workout-tracker` |
| Store / key password | `workouttracker` |
| Valid until | 2056 (11 000 days) |
| Package | `com.semyonsw.workouttracker` |

Recreate it, if it is ever lost again, with:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\.workout-tracker-signing\workout-tracker-release.keystore" `
  -alias workout-tracker -keyalg RSA -keysize 2048 -validity 11000 `
  -storepass workouttracker -keypass workouttracker `
  -dname "CN=Workout Tracker, OU=Personal, O=semyonsw, L=Yerevan, C=AM"
```

…knowing that a recreated key is a NEW key, and costs another uninstall.

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

> **Windows trap: write that file WITHOUT a BOM.** `Set-Content -Encoding utf8`
> and `>` in PowerShell 5.1 both prepend a UTF-8 BOM, and Java's `Properties`
> loader reads the file as raw bytes — so the BOM becomes part of the FIRST key
> name and `WT_STORE_FILE` silently does not exist. The build then succeeds, signs
> with the debug key, and produces an APK that cannot update the real app. This
> happened on the first 0.4.0 build. Write it with
> `[System.IO.File]::WriteAllLines($path, $lines, (New-Object System.Text.UTF8Encoding($false)))`,
> and **verify the key on the artifact, never on the config**:
>
> ```powershell
> & "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --print-certs `
>   android\app\build\outputs\apk\release\app-release.apk
> ```
>
> Expect `CN=Workout Tracker`. `CN=Android Debug` means the properties did not
> load, whatever the file looks like in an editor.

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
| CMake | 3.22.1, with its bundled ninja replaced by **1.12.1** (see the path-limit section) |
| Expo | SDK 54 · React Native 0.81.5 |

`npm install` needs `--legacy-peer-deps` on some trees; `npx expo install --fix`
is the command that actually keeps the native dependency versions consistent
with the Expo SDK, and it is what resolved the original
reanimated-vs-react-native peer conflict.

## What is not wired yet

The UI is complete for all 14 designed screens — plus timed sets and the muscle
cluster library added in 0.2.0 — but the app is still running on
`src/data/seed.ts` rather than a database:

- Finishing a session logs the payload to the console instead of writing to
  SQLite, so **workouts do not persist across a force-quit after finishing**. An
  in-progress session *does* survive being killed — that is `AsyncStorage` via
  the zustand `persist` middleware, and it now covers a running set timer too: a
  plank keeps counting across a relaunch, because what is stored is the instant
  start was pressed rather than a number ticking down.
- Creating an exercise or editing a routine holds the change in memory for the
  session only. Muscles picked on the create screen therefore last one session.
- The split cursor does not advance when a workout completes.

`src/db/schema.ts` already has the Drizzle schema; the shapes returned by
`draftToSetHistory()` match it, so wiring persistence is a matter of replacing
the seed reads in `src/navigation/AppShell.tsx` and the `onFinish` handler.
