# Installing Workout Tracker

There are two different things called "installing" here. The installer does
both.

| I want… | What to do |
|---|---|
| **the app on my phone** | plug the phone in (USB debugging on) and run the installer — or copy the `.apk` across and tap it |
| **the project set up on my computer** | **Windows:** double-click `Install.bat` · **Linux/macOS/WSL:** `./install.sh` |

---

## What the installer actually does

1. Finds Node.js 20+ (Expo SDK 54 / React Native 0.81 need it). On Windows it
   offers to install the current LTS for you via `winget`.
2. Installs the dependency tree with `npm ci` — the exact locked versions —
   falling back to `npm install`, then `--legacy-peer-deps`, and explaining the
   difference if it has to.
3. **Runs `npm run typecheck` and the whole test suite** (700-odd tests: rep
   ladders, timers, overload maths, cold starts, stores, backups, migrations).
   "Install complete" therefore means the code works on your machine.
4. Looks for a `workout-tracker-*.apk` next to it and for `adb`. If a phone is
   plugged in, it offers to push the APK over USB, and knows what each Android
   refusal means (`UPDATE_INCOMPATIBLE`, `VERSION_DOWNGRADE`,
   `INSUFFICIENT_STORAGE`, `unauthorized`).
5. Checks whether a JDK and the Android SDK are present — **only** needed to
   build an APK yourself, so it warns rather than fails.
6. Windows: writes `Start Dev Server.bat` and `Install on phone.bat`.

Everything is logged to `install.log`. Re-running is safe.

---

## Putting it on the phone by hand

No computer setup needed at all:

1. Download `workout-tracker-<version>.apk` from the
   [Releases page](../../releases) (on the phone, or copy it across by USB,
   Drive, Telegram — anything).
2. Open it in **Files** and tap install. The first time, Android asks to allow
   installs from that app — allow it and tap install again.
3. Play Protect will warn that the developer is unknown, because the APK is
   signed with a personal key. **More details → Install anyway.**
4. On first launch, **allow notifications**. This is not a nicety: it is the
   only way either timer reaches you once the app leaves the screen.
5. On Samsung, also set **Battery → Unrestricted** and keep the app out of
   **Sleeping apps**, or its alarms get dropped.

Minimum Android 24 (7.0). Full detail: **[BUILD_ANDROID.md](BUILD_ANDROID.md)**.

---

## Troubleshooting

| Message | What it means | Fix |
|---|---|---|
| *Node.js 20 or newer is required* | Node missing or too old | Windows: let the installer fetch the LTS. Linux: `nvm install --lts` |
| *the installed Node.js version is not supported* | EBADENGINE | Same — install the current LTS |
| *two packages asked for conflicting dependency versions* | ERESOLVE | Already retried with `--legacy-peer-deps`; if it persists, delete `node_modules` and `package-lock.json` and re-run |
| *package-lock.json does not match package.json* | Lockfile drift | Already retried with `npm install`; commit the updated lockfile afterwards |
| *npm could not write into the project folder* | Permissions / OneDrive | Don't use `sudo`; pause OneDrive syncing while installing |
| *the disk is full, or the inotify watch limit was hit* | ENOSPC on Linux | `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |
| *TypeScript reported errors* | Code issue, not an install issue | Read the end of `install.log`; the dev server still runs |
| *adb was not found* | No platform-tools | Copy the APK across by hand, or install platform-tools |
| *the phone already has a copy signed with a different key* | Android refuses the swap | Export a backup **from inside the app**, uninstall on the phone, install again |
| *the phone has not authorised this computer* | USB debugging prompt not accepted | Unlock the phone, accept "Allow USB debugging?", re-run |
| *not set up to build an APK* | No JDK / Android SDK | Only matters for building. [BUILD_ANDROID.md](BUILD_ANDROID.md) |

### The dev server starts but the phone shows a blank screen

Phone and computer must be on the same network, and Expo Go's version must match
Expo SDK 54. `npx expo start --tunnel` works around a hostile network.

### Windows: the build fails with paths that are too long

That is the 260-character limit, and it has one real fix — documented in
[BUILD_ANDROID.md](BUILD_ANDROID.md#windows-the-260-character-path-limit-and-the-one-fix-that-works).

### Starting over from scratch

```bash
rm -rf node_modules install.log
./install.sh
```

Nothing about your phone's data is affected — that lives on the phone, in
SQLite, and only an uninstall removes it. Export a backup from
**Settings → Export** first if you are about to uninstall.

---

## Uninstalling

On the computer: delete the folder (and the two `.bat` launchers if you copied
them elsewhere). Nothing was installed system-wide.

On the phone: uninstall as usual — but **export your log first**, because
uninstalling deletes the database with it.
