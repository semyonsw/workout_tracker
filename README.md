# workout_tracker

A minimal, local-first Android workout tracker built around one rule: **logging a
set that repeats last session costs one tap.**

- **Stack** — Expo (React Native) + TypeScript + NativeWind + Zustand, everything
  persisted in AsyncStorage. No account, no server, no cloud build.
- **Design** — near-black + a single green scale, hairlines, tabular numerals,
  five type sizes, two radii, and exactly one shadow (under the timer). Colour
  means one thing: progressive overload.

```bash
npm ci                   # exactly the locked tree — see BUILD_ANDROID.md
npx expo start           # dev server
npm test                 # 310+ tests: timers, overload, trends, stores, backups
npm run typecheck
```

## What it does

| | |
| --- | --- |
| Pick your own workout | every routine is listed on the home screen and one tap from opening. Nothing is imposed |
| Open ≠ start | opening a routine shows its exercises and records nothing. The workout starts on `Start` inside it (or on the first logged set), and `Stop and exit` leaves without saving. Only `Finish` writes to history |
| The clock, up top | one big pill under the session header, shared by the rest countdown and the clock on a timed set. `+15`, `⏸` and `Skip`; it names which rest it is running, and inverts to a green slab for the last ten seconds |
| Count-in | the last N seconds of any countdown tick out loud and land on a long tone. Off screen it is a pair of scheduled notifications carrying the app's own WAVs, because a JS interval does not survive Doze |
| Timed sets | ▶ on the row: a get-ready count, then either a countdown that logs itself at the bell (a 2:00 plank, a boxing round) or an open hold you stop (a dead hang) |
| Training sequence | optional, off by default. Build an order — push → pull → push — and the home screen names the next one up and advances when you finish it. Off means invisible |
| Routines | add, rename, reorder by long-press-and-slide, remove an exercise with the ✕ on its row, delete the routine |
| Change the plan mid-set | `+ Add set` / `− Remove set` in every card, `+ Add an exercise` at the bottom (library picker and create screen included), long-press a card and slide to reorder |
| Exercise library | a muscle tree — `push → chest → dips` — with search, create-from-query, edit in place (a rename keeps every set ever logged) and delete |
| Overload nudges | derived from your own set history: a weight that has been the same for N days over M sessions, with the suggestion applied to every unlogged set in one tap |
| History | every finished workout, newest first, by month: date, duration, sets, volume, each exercise in the app's shorthand **and its total** — `+40 kg · 4 4 4` with `12 reps total` under it |
| Workout numbers | every workout carries an ordinal — `Workout 92`. Pin the number on any one session (`Set the workout number` inside it) and every other workout counts from there, backwards and forwards, so a log that starts at 91 because ninety happened before this app says so |
| Graphs | `History → Graphs`: reps per workout and kilograms per workout over time, or pick one exercise for its reps per session and top weight per session. Each line states its own direction — `up 34 reps since 11 Jun` — because the shape is visible but the arithmetic isn't |
| Settings | every duration the app counts, plus sound, vibration, screen-on and notification switches |
| Export / Import | everything you own — exercises, routines, the sequence, every workout with its set rows, your settings — as one readable JSON file, and back again through the phone's file browser |

## Android APK

Android-only, sideloaded. **[BUILD_ANDROID.md](BUILD_ANDROID.md)** covers
installing it on a phone, rebuilding, and — importantly — where the signing
keystore lives and why losing it costs you an uninstall.

```bash
npx expo prebuild -p android      # only when app.json or native deps changed
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Layout

```
App.tsx                     providers, the error boundary, notifications, audio
src/navigation/AppShell     five tabs and a stack; no tab bar during a session
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             SetRow, ExerciseCard, TimerPill, primitives,
                            ErrorBoundary, ConfirmSheet…
src/hooks/                  the two timers and the count-in
src/lib/                    the decisions: overload, set timer, count-in cue,
                            muscles, draft, completed workout, history, trends,
                            shape, units, backup — all pure, all tested. Plus
                            beeper/notify/feedback, the three wrappers around
                            native side effects that must never throw mid-set
src/state/                  the live session, the finished workouts, the library
                            (+ the sequence), the settings — zustand +
                            AsyncStorage, every one validated on rehydration
src/data/seed.ts            the starting library and three routines. No history,
                            no sequence: both are only ever yours
test/fixtures/history.ts    a real training log, as a test fixture only
src/theme/tokens.ts         the values className can't reach
plugins/                    Expo config plugins (release signing, no microphone)
```

Each file opens with a header explaining what it owns and why it is built the way
it is; those headers are the design document. Everything the user does persists:
finished workouts, a started session across a force-quit, and the library,
routines, sequence and settings across a relaunch. A fresh install starts with no
history and no sequence at all.
