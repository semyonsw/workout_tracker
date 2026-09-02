# Working on this repo

## Finish every change with a release

A change that only exists in `src/` has not reached the phone. The app is
sideloaded — there is no store, no OTA — so **shipping is part of the task, not a
follow-up**. After every change, without being asked:

1. **Bump the version.** `app.json` (`version` and `android.versionCode`, both) and
   `package.json`. Patch bump unless the change is bigger than that.
2. **Build the APK** (below) and copy it to the repo root as
   `workout-tracker-<version>.apk`.
3. **Commit and push to `main`.** Short, plain commit message — one line, no essay.

The point of step 2 is that the user copies that file to the phone and installs it
over the old one. Leave the previous APK on disk as a rollback; do not delete it.

## Building the APK

The SDK lives at `/root/android-sdk` (installed 2026-08-26; `android/local.properties`
points at it). If it is gone, reinstall: cmdline-tools, `platforms;android-35`,
`platforms;android-36`, `build-tools;35.0.0`, `build-tools;36.0.0`,
`ndk;27.1.12297006`, `cmake;3.22.1`.

```bash
npx expo prebuild -p android          # app.json changed, so always
cd android
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
  -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
```

Takes ~10 minutes; run it in the background. Output lands at
`android/app/build/outputs/apk/release/app-release.apk`.

### On the Windows box

The same build, with the paths it actually has (installed 2026-08-30): JDK 17 at
`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`, SDK at `E:\android-sdk`
(C: is short on space), and `android/local.properties` holding
`sdk.dir=E\:\\android-sdk` — Java-properties escaping, so that is a real
double backslash in the file. Set `JAVA_HOME`/`ANDROID_HOME` per command, since
neither is on the machine's PATH, and call `gradlew.bat` with the same flags.

**THE ONE TRAP: `ninja: error: Filename longer than 260 characters`.** The C++
codegen step writes object paths that embed the project's absolute path twice, and
they run past `MAX_PATH`. `LongPathsEnabled` is already 1 in the registry, but the
ninja shipped inside `cmake;3.22.1` is 1.10.2, which predates the check that reads
that flag. The fix is a drop-in binary swap: ninja 1.12.1 over
`E:\android-sdk\cmake\3.22.1\bin\ninja.exe`, with the 1.10.2 original kept beside
it as `ninja-1.10.2.exe.bak`. Reinstalling the SDK's cmake package undoes it.

## Native dependencies

Two, and both are config-plugin-driven, so `npx expo prebuild -p android` is what
applies them:

- **`react-native-health-connect`** writes a finished workout to Health Connect
  (`src/lib/healthConnect.ts`). It is `require`d lazily inside a `try`, so the app
  runs identically in a build that does not contain it — which is what makes it
  removable by deleting the dependency and the plugin entry. It needs
  `android.permission.health.WRITE_EXERCISE` in `app.json`'s `permissions` (the
  plugin adds the rationale intent-filters but NOT the permission itself) and it
  forces `minSdkVersion` 26.
- **`expo-build-properties`** exists only to set that `minSdkVersion`. Check
  `android/gradle.properties` says `android.minSdkVersion=26` after a prebuild;
  Health Connect will not compile below it.

`android/app/debug.keystore` IS THE ONLY COPY. `/android/` is gitignored, so that
file exists nowhere else — not in the repo, not in CI. It is the key the phone's
install is signed with (`FA:C6:17:45…`), and losing it means the only way to update
the app is an uninstall that deletes the training log. Back it up before anything
that regenerates `android/`, and check its checksum afterwards.

## Verify the artifact, never the source

```bash
export PATH="/root/android-sdk/build-tools/36.0.0:$PATH"
apksigner verify --print-certs <apk> | grep "certificate DN"   # CN=Android Debug
aapt2 dump badging <apk> | head -1                             # versionCode/Name
aapt2 dump badging <apk> | grep -E "permission|microphone"     # no RECORD_AUDIO
```

`RECORD_AUDIO` is the one that bites: `expo-audio`'s AAR manifest declares it and
the merger takes the union, so grepping `AndroidManifest.xml` reports success while
the APK asks for the mic. `plugins/withoutMicrophone.js` removes it at merge time,
and the only honest check reads the built file.

Worth also grepping `assets/index.android.bundle` inside the APK for a string your
change introduced — it is the one proof the JS that shipped is the JS you wrote.
Use `grep -a`; the bundle is binary and plain `grep` silently reports nothing.

**Pick an ASCII string.** The release bundle is Hermes bytecode, and its string
table holds anything containing a non-ASCII character as UTF-16 — so a `grep -a`
for a sentence with a curly apostrophe or an em dash in it reports 0 matches on a
bundle that contains the string. Either grep an ASCII-only fragment, or match
`s.encode('utf-16-le')` in Python.

## `.gitignore` has `*.apk`

The committed APK is force-added. `git add -f workout-tracker-<version>.apk`, or the
release quietly contains no release.

## Before committing

`npx tsc --noEmit`, `npx vitest run`, `npx eslint src`, `npx prettier --write src`.
All four, every time. The suite is the project's memory of bugs that already
happened once.

## House style

Read a neighbouring file before writing one. This codebase comments the *decision*
and the *why*, not the mechanics — file headers explain what the thing is for and
which alternatives were rejected. Match that. Decisions live in `src/lib/` as pure
functions so they can be tested without a renderer; screens are composition.
