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

**THE `-PWT_STORE_FILE` FLAGS ARE NOT OPTIONAL.** Android identifies an app by
package name + signing key, and the phone has an app signed `CN=Android Debug`
(`FA:C6:17:45…`). An APK signed with anything else cannot install over it — the
only way in is uninstall, which deletes the training log. Those flags point the
release build at `android/app/debug.keystore` so the key stays the same one
forever. See `BUILD_ANDROID.md` for the whole story.

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
