# Workout Tracker — Architecture & Design System

Philosophy: **zero friction**. The benchmark for every decision is *how many taps
does it cost mid-set, with cold hands, in a loud room*. Repeating last session's
set — the overwhelmingly common case — costs **one tap**.

---

## Step 1 — Tech stack

**React Native + Expo (SDK 54) + TypeScript + NativeWind v4.**

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Expo (managed, dev-client ready) | Rest timers need `expo-notifications`, `expo-haptics`, `expo-keep-awake` — all first-party, config-plugin driven, no manual native work. EAS handles builds/OTA. |
| Styling | NativeWind v4 | Tailwind constraints are what keep a minimal app minimal. The config amputates the default palette, so a stray `text-blue-500` is a compile error, not a design review. |
| Local state | Zustand + `persist` | One store, for the live session only. A crash or a phone call mid-workout costs nothing. |
| Server/DB state | TanStack Query over SQLite | History and library are cached reads, not mutable app state — different tool, deliberately. |
| Storage | `expo-sqlite` + Drizzle ORM | **Local-first.** A gym has no signal. SQLite is the source of truth, sync is a later feature, not a dependency. Drizzle gives typed queries against the exact index the overload engine needs. |
| Animation | Reanimated 4 | UI-thread animation for the timer and card transitions; the JS thread stays free while logging. |
| Navigation | Expo Router | File-based, typed, deep-linkable ("resume workout" from a notification). |
| Tests | Vitest for `lib/` | The overload engine is pure and dependency-free — it tests in milliseconds without a native runtime. |

**Why not Flutter?** It would be a fine choice — arguably better raw list
performance. React Native wins here on three specifics: Expo's notification +
haptics + background story is less work for the exact features in this spec;
NativeWind enforces a design system in a way Flutter's widget styling does not;
and the pure-TypeScript domain layer (`lib/progressiveOverload.ts`) can be reused
verbatim in a future web dashboard or server. Nothing in this app is
GPU-expensive enough for Flutter's advantages to show.

**Why local-first, no backend on day one?** Every feature in the spec works
offline. Adding auth and a server before the app is used once buys latency and a
login screen. The schema is UUID-keyed and timestamped, so a sync layer
(Turso/Postgres, last-write-wins per set row) drops in later without a migration.

---

## Step 2 — Data models

Full interfaces in [src/types/models.ts](src/types/models.ts); SQLite/Drizzle
schema in [src/db/schema.ts](src/db/schema.ts). The four decisions that matter:

1. **`SetHistory` is denormalized on purpose.** Each row carries `exerciseId` +
   `performedAt` + `weightKg`, so an overload verdict is one indexed range scan
   (`idx_set_history_exercise_time`) — no joins, no session hydration.
2. **Load and count are separate axes**, not one enum:
   `requiresWeight` (does a weight input render at all?) ×
   `countUnit` (`reps` | `seconds` | `meters` | `rounds`) ×
   `loadMode` (`external` | `added_bodyweight` | `assisted` | `none`) ×
   `timerMode` (`manual` | `countdown` | `countup`).
   That covers "weighted dips +30 kg 8 6 5 4", "machine 80 kg 8 6 5 5",
   "push-ups 14 13 10 10", "12 rounds × 3 min", "2:00 plank" and "dead hang to
   failure" in one model. `countUnit` says what the number means; `timerMode`
   says who produces it — the user, or the phone.
3. **Weight lives on the set, never on the exercise.** Real sessions ramp and
   drop inside one exercise ("15 kg × 5, then 10 kg × 12 9 8"); a per-exercise
   weight would fabricate plateaus.
4. **`WorkoutSplit.cycleMode: 'rolling'`.** A split is a queue that advances when
   a session completes, not a calendar that judges you for a missed Tuesday.
   `weekly` is available for people who train on fixed days.

`weightKg` is `NULL` — never `0` — for bodyweight and cardio work. Zero is a
weight; `NULL` is the absence of the concept, and the engine depends on it.
All weights are stored in kilograms; imperial is a render-time conversion, so a
unit toggle can never corrupt history.

### Muscles, and the clusters over them

`Exercise.muscleGroups` is an **ordered** list, primary first, and that order is
data: the first muscle decides which **cluster** the exercise files under.
Fourteen muscle groups sit under five movement clusters —

| Cluster | Muscle groups |
| --- | --- |
| `push` | chest · shoulders · triceps |
| `pull` | back · traps · biceps · forearms · neck |
| `legs` | quads · hamstrings · glutes · calves |
| `core` | core |
| `cardio` | cardio |

— declared once in [src/lib/muscles.ts](src/lib/muscles.ts), where a
`Exclude<MuscleGroup, …>` check makes the map's totality a **compile** error if a
muscle is ever added without a cluster. There is no `cluster` column and no
`cluster` field on `Exercise`: the cluster is a total function of data that is
already there, and a derived copy is one more thing that can disagree with
itself.

Three consequences that are the actual feature:

- **The library is a hierarchy when you browse it** and a flat ranked list the
  moment you type. Browsing asks "what have I got for back day" — the answer is
  a shape. Searching asks "where is the plank" — the answer is one row.
- **Search matches muscles and clusters**, not just names: "back" finds
  *Pull to stomach*, and "pull" finds the whole pull cluster.
- **A routine says what day it actually is.** `routineFocus` reads the
  exercises, not the name, and answers `Pull · back, biceps, forearms` — so a
  routine called "Pull" that is secretly three quad movements says `Legs`. Both
  the Today card and the routine list lead with that line. The dominant cluster
  wins by count, which is why the sit-ups and the 50-minute swim on the end of a
  pull session don't turn it into a core day.

Filing is single-cluster (one row, one place, never two). *Filtering* is
deliberately generous — an exercise counts as pull work if **any** muscle it
works is pull work — and when a filter is on, sections re-file within it, so a
`Push` filter can never render a `PULL · TRAPS` header.

---

## Step 3 — Design system

### Colour

Monochrome, plus exactly one accent that means one thing.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#FAFAF9` | `#0B0B0C` | Page |
| `surface` | `#FFFFFF` | `#151517` | Cards, set rows |
| `surface-alt` | `#F2F2F0` | `#1D1D20` | Wells, the primed next set, QuickAdjust |
| `ink` | `#0E0E10` | `#F4F4F2` | Primary text, completed marks |
| `ink-muted` | `#6B6B70` | `#8E8E93` | Secondary text |
| `ink-faint` | `#A0A0A5` | `#5C5C61` | Micro-labels, ghosted prefills |
| `hairline` | `#E5E5E2` | `#27272B` | 1px separators |
| `signal` | `#8A5A2B` | `#E0B183` | **Progressive overload only** |

No green for "done", no red for "failed". Completion is expressed by *weight of
ink*, not hue. Because colour appears exactly once in the app, the overload
nudge is impossible to miss without ever shouting. Both themes are defined as
CSS variables in [global.css](global.css) and consumed as semantic names
(`bg-surface`, `text-ink`), so no component knows which theme is active.

### Typography

System font (SF Pro / Roboto) — a custom typeface would cost a download and buy
nothing at these sizes. Five sizes, no more:

| Role | Size / leading | Notes |
| --- | --- | --- |
| `display` | 40 / 44, tracking −1.2 | QuickAdjust value, rest countdown |
| `title` | 22 / 28, tracking −0.4 | Exercise name, set values |
| `body` | 16 / 22 | Suggestions, collapsed headers |
| `label` | 13 / 18 | Secondary lines |
| `micro` | 11 / 14, tracking +1.1, uppercase | `KG`, `REPS`, `SET`, timeline |

**Every number is tabular.** A weight that shifts a pixel going from 9 to 10 reps
is the difference between an app and an instrument.

### Shape, space, motion

- **Two radii only**: `14` for surfaces, `999` for pills. No third option.
- **Hairlines, not shadows.** One elevation exists in the whole app: the floating
  rest timer, because it must read as *above* the list.
- **4pt grid**, five steps (`4 / 8 / 12 / 16 / 24 / 40`).
- **56pt rows, 44pt minimum tap targets** — everything in the logging flow is
  thumb-sized.
- **Motion**: 140 ms for row state, 240 ms for cards, easing `[0.22, 1, 0.36, 1]`.
  Fast enough to feel immediate, slow enough not to twitch.
- **Haptics carry meaning**: medium impact = set logged, light = undo,
  selection tick = value nudged, success notification = rest over. The user can
  tell what happened without looking.

### The logging screen, in taps

| Action | Taps |
| --- | --- |
| Log a set identical to last time | **1** (the ✓) |
| Log a set 2.5 kg heavier | **3** (weight → +2.5 → ✓) |
| Run and log a 2:00 plank | **1** (the ▶ — the bell logs it) |
| Log a dead hang to failure | **2** (▶, then Stop) |
| Accept an overload suggestion for all remaining sets | **1** (Use) |
| Add 15 s of rest | **1** |
| Type an exact weight | 2 + keyboard |

---

## Step 4 — What's in the code

| File | Role |
| --- | --- |
| [src/screens/ActiveWorkoutScreen.tsx](src/screens/ActiveWorkoutScreen.tsx) | The logging screen — composition and wiring only |
| [src/components/SetRow.tsx](src/components/SetRow.tsx) | One set: prefilled, ghosted, one-tap commit |
| [src/components/QuickAdjust.tsx](src/components/QuickAdjust.tsx) | Inline ± editor; keyboard is the fallback, not the default |
| [src/components/ExerciseCard.tsx](src/components/ExerciseCard.tsx) | Expanded / collapsed exercise; one open at a time |
| [src/components/FloatingPill.tsx](src/components/FloatingPill.tsx) | The hovering pill both timers live in — the app's one shadow |
| [src/components/RestTimerPill.tsx](src/components/RestTimerPill.tsx) | Rest countdown with `+15` and `Skip` on the pill |
| [src/components/SetTimerPill.tsx](src/components/SetTimerPill.tsx) | The clock on a plank / hang / round |
| [src/components/OverloadNudge.tsx](src/components/OverloadNudge.tsx) | The only coloured element in the app |
| [src/components/SplitTimeline.tsx](src/components/SplitTimeline.tsx) | Push → Pull → Boxing → Rest strip |
| [src/lib/progressiveOverload.ts](src/lib/progressiveOverload.ts) | The engine — pure, injectable clock, zero deps |
| [src/lib/setTimer.ts](src/lib/setTimer.ts) | Two-phase set clock — pure, one stored fact |
| [src/lib/muscles.ts](src/lib/muscles.ts) | Muscle → cluster hierarchy; "what day is this" |
| [src/lib/draft.ts](src/lib/draft.ts) | Prefill from history; draft → `SetHistory` on save |
| [src/hooks/useRestTimer.ts](src/hooks/useRestTimer.ts) | Deadline-based timer, background-safe |
| [src/hooks/useSetTimer.ts](src/hooks/useSetTimer.ts) | Ticks, haptics, the bell, and auto-logging |
| [src/state/activeWorkoutStore.ts](src/state/activeWorkoutStore.ts) | The only global state |

### Timed sets

A plank, a dead hang and a boxing round are the same feature with one flag
different, and the whole thing rests on **one stored fact: when start was
pressed.** Phase, clock reading and "what would be logged if you stopped now" are
all derived from `now`, so there is no state machine to get stuck in the wrong
state when the OS suspends the JS thread mid-hold — the same doctrine as the rest
timer's absolute deadline, extended to a two-phase clock.

```
press ▶ ──► GET READY 5 4 3 2 1 ──► 2:00 ◄─ countdown ─► 0:00  bell, auto-logged
                              └──► 0:00 ─── count up ──► 1:47  Stop, logs 1:47
```

| Mode | For | Logs |
| --- | --- | --- |
| `manual` | a 50-minute swim — the phone is in a locker | what you type |
| `countdown` | a prescribed hold: 2:00 plank, 3:00 round | the target if you reach the bell, **what you actually held if you stop early** |
| `countup` | an open hold: a dead hang to failure | the time on the clock when you stop |

`prepareSeconds` is the get-ready count — nobody is hanging off a bar when they
press start — and it is per-exercise, so a boxing round can have none.

The rule that matters is the last column: **the number logged is the number the
user saw.** A plank abandoned at 36 seconds and logged as 2:00 poisons every
future comparison, so a countdown stopped early logs 36. That is what
[src/lib/setTimer.test.ts](src/lib/setTimer.test.ts) exists to pin down, along
with the suspension cases — five minutes past the bell still reads 2:00, never
7:00.

The bell also reaches a phone in a pocket (a `timeSensitive` local notification
scheduled at the deadline), the screen is held awake for the whole hold, and a
countdown **logs itself** when it ends: nobody breaks a two-minute plank to tap a
checkmark. On the row, ▶ sits beside the ✓ rather than replacing it — ▶ is "run
the clock for me", ✓ is "I did this, take my word for it", and the ✓ never
changes meaning anywhere in the app.

### Progressive overload rules

Judged on the **top working weight per session** (never per set), over the streak
of recent sessions sharing that weight — the *plateau run*.

| Verdict | Condition | UI |
| --- | --- | --- |
| `insufficient_data` | No history, or `requiresWeight: false` | silent |
| `progressing` | Latest session is heavier than the one before | silent |
| `regressing` | A heavier top weight within the last 60 days | silent — they're rebuilding, never nudge into a deload |
| `building` | Plateau exists but under the threshold | silent (`3× at this weight` in dev) |
| `due_reps` | Plateau ≥ 14 days **and** ≥ 3 sessions, but reps < target | "Reps first — go for 5" |
| `due_weight` | Plateau ≥ 14 days **and** ≥ 3 sessions, reps owned | "Try 27.5 kg" |

Both thresholds must pass: **days** catch true stagnation, **sessions** stop a
two-week holiday from reading as one. Increments come from the exercise
(`incrementKg`) so a dumbbell movement offers ±2.5 and a cable stack ±5 — the app
never suggests a weight that cannot be loaded. Imperial users get 5 lb jumps, not
an unloadable 5.5 lb conversion of 2.5 kg.

Verified in [src/lib/progressiveOverload.test.ts](src/lib/progressiveOverload.test.ts)
against real logged sessions (#80–#87, 21 Jul – 11 Aug 2026) — 9 cases, all
passing, including the ramp-then-drop and deload traps.

Timed work never produces a nudge: `requiresWeight: false` returns
`insufficient_data` before any history is read, because a plank has no load to
add. Progression there is the routine's target going up, not the engine's.

---

## Running it

```bash
npx expo install   # pin every dependency to the installed SDK
npx expo start
npm test           # overload engine, set timer, muscle clusters, display shorthand
```

> Dependency versions in `package.json` are SDK-54-era ranges written by hand.
> Run `npx expo install` to let Expo resolve the exact compatible set before the
> first build.

## Not built yet (deliberate next steps)

- Persistence wiring: `draftToSetHistory()` → Drizzle insert → advance
  `split.cursor`. The seam exists (`onFinish`), the writer does not.
- Routine/exercise editor screens (the models and store support them fully).
- Superset grouping in the UI (`RoutineItem.supersetGroup` is modelled).
- Editing an existing exercise's muscles: the picker only exists on the create
  screen, so the pre-hierarchy rows would need it to be reachable from the
  library. They render under `Unfiled` until then rather than disappearing.
- A per-cluster volume view ("sets of back this week"). The cluster hierarchy is
  what that feature needs and it is now in place.
- Plate-math helper for barbell loading.
- Sync. Schema is ready; the feature is not needed until there is a second device.
