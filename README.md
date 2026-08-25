# workout_tracker

A minimal, local-first Android workout tracker built around one rule: **logging a
set that repeats last session costs one tap.**

- **Stack** — Expo (React Native) + TypeScript + NativeWind + Zustand. The
  finished-workout log lives in SQLite; the library, routines and settings are a
  few dozen rows and stay in AsyncStorage. No account, no server, no cloud build.
- **Design** — near-black + a single green scale, hairlines, tabular numerals,
  five type sizes, two radii, and exactly one shadow (under the timer). Colour
  means one thing: progressive overload.

```bash
npm ci                   # exactly the locked tree — see BUILD_ANDROID.md
npx expo start           # dev server
npm test                 # 670+ tests: ladders, timers, overload, trends, stores, backups, migration
npm run typecheck
npm run lint             # also what CI runs, on every push
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
| The plan is editable | tap a row in the routine editor and it opens in place: sets, the rep range, and how long to rest, all on ± chips. Rest names which of the two it is using — this exercise's own, or your Settings value — and can be put back to following Settings |
| Supersets | one toggle, `with the exercise above`. Members share a green rule down their left edge, no rest fires between them, and rest comes after the last one of the round |
| Change the plan mid-set | `+ Add set` / `− Remove set` in every card, `+ Add an exercise` at the bottom (library picker and create screen included), long-press a card and slide to reorder |
| …and it learns | on `Finish`, if you did five sets where the routine plans four, one extra tap writes that back. Declining changes nothing and it does not ask twice |
| Warm-up sets | a chip in the set editor. A warm-up reads `W` instead of a number and counts towards nothing — not the volume, not the set count, not the shorthand, not the suggestions |
| Exercise library | a muscle tree — `push → chest → dips` — with search, create-from-query, edit in place (a rename keeps every set ever logged) and delete |
| Rep ladder | one number, and the whole session follows. **Max 16 → `16 + 10 + 8 + 8 + 6`** — an all-out top set, backoff sets around half of it, and a total that is always three times your max. Meet every set and one rep is added, bottom set up; three met sessions and the max itself moves. Miss it and the same numbers come back. Hit 18 when the plan said 16 and every set under it re-shapes mid-workout to the ladder for 18 |
| Overload nudges | derived from your own set history: a weight, a hold or a rep count that has been the same for N days over M sessions, with the suggestion applied to every unlogged set in one tap. Planks and push-ups get the same treatment as the barbell — `3× at 2:00 — try 2:15`. Silent on an exercise running a ladder: two systems prescribing one exercise's reps is one of them being wrong |
| Plate maths | `20 + 2×10 + 2×2.5` under the weight cell of a barbell lift. It informs and never rounds: a weight your plates cannot make shows no line rather than the nearest one |
| History | every finished workout, newest first, by month: date, duration, sets, volume, each exercise in the app's shorthand **and its total** — `+40 kg · 4 4 4` with `12 reps total` under it. Tapping a workout anywhere in the app opens that workout |
| Workout numbers | every workout carries an ordinal — `Workout 92`. Pin the number on any one session (`Set the workout number` inside it) and every other workout counts from there, backwards and forwards, so a log that starts at 91 because ninety happened before this app says so |
| Graphs | `History → Graphs`: reps per workout and kilograms per workout over time, or pick one exercise for its reps per session and top weight per session. Each line states its own direction — `up 34 reps since 11 Jun` — because the shape is visible but the arithmetic isn't |
| Sets per cluster | pull 42 · push 31 · legs 8, over 4 weeks, 12 weeks or all of it. Counts and bars, and a zero is the point |
| Numbers it will not fake | volume needs a bodyweight to weigh a push-up or an assisted pull-up. Without one the clause is dropped rather than printed short, and no bodyweight is ever guessed |
| Correct a typo | inside an open workout, one logged set at a time, on the same ± chips. Everything derived from it is recomputed rather than patched |
| Settings | every duration the app counts, plus sound, vibration, screen-on and notification switches. Your bodyweight, which is what makes push-ups and assisted work countable. Which plates the gym has. And what you actually rest, measured, with one tap to adopt it |
| Export / Import | everything you own — exercises, routines, the sequence, every workout with its set rows, your settings — as one readable JSON file, and back again through the phone's file browser. The pinned workout number travels with it, because it is the one fact that cannot be recomputed. `Add workouts from a file` merges a second phone's log instead of replacing yours; a CSV of every set row is there too, for a spreadsheet |

## The rep ladder

```
max 16, five sets   16 + 10 + 8 + 8 + 6      48 reps  = 3 × max
...met                16 + 10 + 8 + 8 + 7      49
...met                16 + 10 + 9 + 8 + 7      50
...met                17 + 10 + 9 + 8 + 7      51      ← a new max
```

Switched on per exercise, on the create/edit screen, by typing one number: your
max. Everything else is arithmetic — the top set is all out, the backoffs sit
around half of it, and the five of them come to three times the max at every max
there is.

**It is the progression, not a table.** Meet every prescribed set and one rep is
added on `Finish`, to the lowest set that still needs it; after enough of those
the plan has arrived exactly at the next max's ladder and the top set moves —
which in practice is every five to eight workouts, because a session that comes
up short earns nothing and repeats. Nothing deloads on a miss: a program that
cuts your numbers because you slept badly is a program you stop trusting.

**It watches the top set.** The max is a guess until the bar says otherwise, so
logging the first set re-shapes every unlogged set under it — up when you beat the
plan, down when you don't. A set you edited by hand is yours and is left alone.

The scheme is the pull-up family this app's owner trained on for two years: Pavel
Tsatsouline's [Fighter Pull-Up
Program](https://www.strongfirst.com/the-fighter-pullup-program-revisited/) — one
all-out set, "then add a rep to the last set, then a rep to the set before that" —
the [Recon Ron](https://thechamplair.com/training/recon-ron-pullup-program/)
table, and the 50–60%-of-max backoff volume that
[grease-the-groove](https://www.strongfirst.com/how-to-increase-your-pull-ups-50-percent/)
prescribes. `src/lib/repLadder.ts` reproduces the reference table exactly — all 26
rows of it, in the test file, from arithmetic rather than from a lookup — so the
app runs the program rather than something that resembles it.

## Android APK

Android-only, sideloaded, from the **[Releases page](../../releases)** — a `v*`
tag builds and signs it in CI and attaches it there.
**[BUILD_ANDROID.md](BUILD_ANDROID.md)** covers installing it on a phone,
rebuilding locally, and — importantly — where the signing keystore lives and why
losing it costs you an uninstall.

```bash
npx expo prebuild -p android      # only when app.json or native deps changed
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

## Layout

```
App.tsx                     providers, the error boundary, notifications, audio,
                            and the one-time history migration
src/navigation/AppShell     five tabs and a stack; no tab bar during a session
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             SetRow, ExerciseCard, TimerPill, primitives,
                            ErrorBoundary, ConfirmSheet…
src/hooks/                  the two timers and the count-in
src/lib/                    the decisions: overload, set timer, count-in cue,
                            muscles, draft, routine plan, superset, balance,
                            rest history, plates, reorder, completed workout,
                            history, trends, shape, units, backup, csv — all
                            pure, all tested. Plus beeper/notify/feedback, the
                            three wrappers around native side effects that must
                            never throw mid-set
src/state/                  the live session, the finished workouts, the library
                            (+ the sequence), the settings — zustand, every one
                            validated on the way in. historyDb.ts is the SQLite
                            schema and the migration off AsyncStorage; the other
                            three stores are a few dozen rows and stay there
src/data/seed.ts            the starting library and three routines. No history,
                            no sequence: both are only ever yours
test/fixtures/history.ts    a real training log, as a test fixture only
test/*Stub.ts               the three native modules the suite aliases away.
                            expoSqliteStub is the odd one out: a thin adapter
                            over Node's own `node:sqlite`, so the schema and the
                            migration are tested against a real engine
src/theme/tokens.ts         the values className can't reach
plugins/                    Expo config plugins (release signing, no microphone)
.github/workflows/          ci.yml on every push (test, typecheck, lint) and
                            release.yml on a `v*` tag (the signed APK)
```

Each file opens with a header explaining what it owns and why it is built the way
it is; those headers are the design document. Everything the user does persists:
finished workouts, a started session across a force-quit, and the library,
routines, sequence and settings across a relaunch. A fresh install starts with no
history and no sequence at all.
