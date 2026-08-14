# Handoff: Workout Tracker — Android UI (14 screens/states)

## Overview

A workout tracker built on one rule: **logging a set that repeats last session costs exactly one tap.** Target user trains 5×/week (heavy compounds, boxing rounds, swimming), opens the app mid-set with cold hands in a loud room. The UI must show what was lifted last time, take the new numbers in one tap, run a rest timer readable from three feet, and quietly report when a weight has gone stale.

Platform: **Android only.** Design canvas 390 × 844 (px = dp). Existing codebase: `semyonsw/workout_tracker` — React Native + Expo + NativeWind v4.

## About the design files

`Workout Tracker Android.dc.html` in this bundle is a **design reference created in HTML** — a static, high-fidelity gallery of 14 screens and states showing intended look, not production code. Do not port the HTML. The task is to **recreate these screens in the existing React Native / NativeWind codebase**, using its established patterns (`src/components/*`, `src/theme/tokens.ts`, `global.css`, `tailwind.config.js`).

The file is a "Design Component": one big inline-styled markup tree, no logic. Every screen is a `<div data-screen-label="…">` containing a 390 × 844 frame. Open it in a browser to read exact values off any element with devtools; the inline styles ARE the spec.

> **One deliberate divergence:** the repo's current tokens are monochrome + a brown `signal` color. This design uses a near-black + green scale instead (see Design tokens). That was an explicit product decision — replace the repo palette, don't merge the two. Everything else (component names, data model, `requiresWeight` / `countUnit` / `loadMode` semantics, seed data) follows the repo as it stands.

## Fidelity

**High-fidelity.** Final colors, type, spacing, and states. Recreate pixel-accurately. The gallery is not clickable — interaction behavior is specified in prose below, and states that would be transient (timer at 1:28 vs 0:08, editor open, row mid-drag) are each drawn as their own frame.

---

## Design tokens

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#060807` | Page. Near-black, faint green cast (OLED off-pixels) |
| `surface` | `#0E1211` | Cards, set rows |
| `surface-alt` | `#141A18` | Wells, the primed next set, inline editors, the timer pill |
| `hairline` | `#1E2523` | 1px separators — the only "border" in the app |
| `ink` | `#ECF1EE` | Primary text. Never pure white |
| `ink-muted` | `#8A968F` | Secondary text |
| `ink-faint` | `#57615C` | Micro-labels, ghosted prefilled values |
| `green-wash` | `#0C1A12` | Tinted card background — overload nudge only |
| `green-dim` | `#15452C` | Progress tracks, timeline connectors, drop-target rules |
| `green` | `#1E7A4C` | Primary fills — completed set marks, primary buttons |
| `green-bright` | `#3FA96C` | Green text/icons on black, active timer, the nudge |

Rules, enforce these:
- Green-on-black **text** uses `green-bright` only. `green` fails contrast at small sizes.
- Text on a `green` fill is `ink`, semibold (600).
- **No second hue anywhere.** No red for destructive, no amber for warnings, no colored category chips.
- Elevation = hairlines + surface steps. Exactly **one** real shadow in the app: under the floating rest timer (`0 14px 36px rgba(0,0,0,0.65)`).

Tailwind config (drop-in replacement for the repo's `theme.extend.colors`):

```js
colors: {
  bg:            '#060807',
  surface:       '#0E1211',
  'surface-alt': '#141A18',
  hairline:      '#1E2523',
  ink:           '#ECF1EE',
  'ink-muted':   '#8A968F',
  'ink-faint':   '#57615C',
  'green-wash':  '#0C1A12',
  'green-dim':   '#15452C',
  green:         '#1E7A4C',
  'green-bright':'#3FA96C',
},
```

### Type

System font (Roboto on Android). **Five sizes, no more.** All numerals tabular (`font-variant-numeric: tabular-nums`; in RN use `fontVariant: ['tabular-nums']`) — a weight must not shift a pixel going from 9 to 10 reps. On dark, drop one weight step vs a light UI: use **500 / 600, never 700+**.

| Name | Size / line-height | Tracking | Weight | Use |
| --- | --- | --- | --- | --- |
| Display | 40 / 44 | −1.2 | 600 | The value being edited; big numeric wells |
| Title | 22 / 28 | −0.4 | 500–600 | Exercise names; set weights and reps |
| Body | 16 / 22 | 0 | 400–600 | Collapsed headers, list rows, sheet copy |
| Label | 13 / 18 | 0 | 400–500 | Secondary lines, chip labels, dates |
| Micro | 11 / 14 | +1.1 | 600 | `KG`, `REPS`, `SET`, `ROUND`, all section kickers — UPPERCASE |

```js
fontSize: {
  display: ['40px', { lineHeight: '44px', letterSpacing: '-1.2px' }],
  title:   ['22px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
  body:    ['16px', { lineHeight: '22px' }],
  label:   ['13px', { lineHeight: '18px' }],
  micro:   ['11px', { lineHeight: '14px', letterSpacing: '1.1px' }],
},
```

### Shape, space, motion

- **Exactly two radii:** `14px` (surfaces) and `999px` (pills). No third. Nothing else is rounded.
- 4pt grid: `4 / 8 / 12 / 16 / 24 / 40`. Screen gutter is 16.
- Row heights: **56** set rows and list rows, **64** editor/library rows (two lines of text), **44** minimum tap target, **96** numeric wells.
- Motion: 140ms row state changes, 240ms cards/sheets, easing `cubic-bezier(.22,1,.36,1)`. Nothing else animates.
- Everything interactive sits in the bottom two thirds where possible.

### Icons

Minimal stroke set, inline SVG, 5 glyphs only: **check, plus, chevron, trending-up, x**. Stroke `2` (chevrons, x, trending-up) or `2.5` (check, plus), round caps and joins, 24×24 viewBox. No icon without a purpose. Drag handles are three 1.5px lines in a 16×16 box. All are drawn inline in the HTML — copy the paths from there rather than redrawing; in RN use `react-native-svg` or an equivalent already in the repo.

---

## Screens / views

Frames appear in the HTML in the order below, each labelled `data-screen-label`.

### Shared chrome

**Status bar** (mock, top of every frame): 36 high, 20 side padding, clock left in `ink-muted` 12/16 tabular, three glyphs right (wifi / signal / battery) at 13px filled `ink-muted`. In the real app this is the OS status bar — do not draw it.

**Gesture nav** (bottom of every frame): 24 high, a 108 × 4 `hairline` pill centered. Also OS-owned.

**Session header** (screens 01–06): 4 top / 16 side / 12 bottom padding, `hairline` bottom border. Left: 32-wide 44-high hit area holding a 22px back chevron in `ink-muted`. Center column, gap 4: routine name in Micro `ink-faint` uppercase, then `11 of 18 sets · 42 min` in Label 500 `ink-muted` tabular. Right: Finish pill — 36 high, 16 side padding, radius 999, `green` fill, label Label 600 `ink`.

**Set row** — the most important 56 dp in the app. Height 56, 16 side padding, `display:flex; align-items:center`:

| Cell | Spec |
| --- | --- |
| Index | 24 wide, Micro 600 `ink-faint`, tabular |
| Weight | min-width 96, baseline-aligned row, gap 4: value Title 600 tabular + `KG` in Micro `ink-faint` |
| `×` | Label `ink-faint`, 8 margin each side |
| Count | min-width 76, same construction: value + `REPS` / `ROUND` micro-label |
| spacer | `flex:1` |
| Check | 44 × 44, radius 999 |

Row states:
- **Logged** — values `ink`, check circle filled `green` with a 20px `ink` checkmark, row background `surface`.
- **Next (primed)** — row background `surface-alt`, values `ink-faint` (ghosted, carried over from last session), check circle = 1px `hairline` border with an `ink-faint` checkmark. This is the visual promise of "tap ✓ if nothing changed."
- **Later** — background `surface`, values `ink-faint`, empty bordered circle.
- Separators: 1px `hairline`, inset 16 from the left (full-bleed only above the Add-set footer).
- Footer: 56 high, centered, plus glyph `ink-faint` + "Add set" Label 500 `ink-muted`.

**Collapsed exercise card**: 16 padding, radius 14, `surface` on 1px `hairline`, 8 gap between cards. Line 1: name Body 600 `ink` + `0/4` Label 500 `ink-faint` tabular. Line 2 (4 below): `80 kg · 8 6 5 5` Label 400 `ink-faint` tabular. A finished exercise dims the name to `ink-faint` and appends a 14px check. **Nudge hint:** a single 6px `green-bright` dot, absolutely positioned right 16 / top 19 — that is the entire collapsed signal for a waiting overload suggestion.

---

### 01 · Active workout (default) — the hero screen

One exercise expanded, all others collapsed to a single line. Above the expanded card: name Title 500 `ink` and a subtitle `4 × 4–6 reps` in `ink-muted` with `· last: +40 kg · 4 4` continuing in `ink-faint`. Sets 1–2 logged, set 3 primed on `surface-alt`, set 4 later. Then 24 of space, then collapsed cards (Wide pull-ups machine — carrying the green dot, Pull to stomach, Brachialis curls).

**No bottom tab bar.** The session owns the screen.

### 02 · Overload nudge + rest timer running

Nudge card sits **above** the set rows, inside the exercise, margin 16 side / 8 below: radius 14, `green-wash` fill, **no border**, 14 padding (16 left), flex row gap 12. Trending-up icon 16px `green-bright`; text column gap 4 — `SAME +25 KG FOR 23 DAYS · 5 SESSIONS` in Micro `green-bright`, then **Try 27.5 kg** in Body 600 `ink`; then a `green` `Use` pill (36 high) and a 28-wide dismiss `×` in `green-bright`. Factual, no exclamation marks, no trophies. `Use` rewrites every remaining set of that exercise to 27.5 kg in one tap.

**Rest timer pill** — floating, `position:absolute`, left/right 16, bottom 40, radius 999, `surface-alt` on 1px `hairline`, the app's only shadow. Inner row 54 high, 24 side padding: `1:28` in Title 600 `green-bright` tabular; right side `+15` (Label 600 `ink-muted`) and `Skip` (Label 600 `ink`), each in a 44-high hit area. Base: a 2px drain line — `green-dim` track, `green-bright` fill at the remaining fraction (62% here). It floats rather than pushing layout, so the row under the thumb never moves.

### 03 · Inline value editor

Tapping a number opens a panel **directly under that row** — no modal, no keyboard, list does not scroll. The tapped cell gets a `surface` chip behind it (radius 14, 2/8 padding, −8 left margin) inside the `surface-alt` row.

Panel: `surface-alt`, 1px `hairline` top border, 12 padding. Row 1 — `−5` `−2.5` on the left, the live value as Display 600 `ink` + `KG` micro in the middle, `+2.5` `+5` on the right. Chips: 44 high, min-width 46, 8 side padding, radius 999, `surface` on `hairline`, label Label 500 `ink`, `box-sizing: border-box`, 8 gap. Row 2 (12 below), three 44-high actions spread apart: `Type` and `Remove set` in Label 500 `ink-muted`, `Done` in Label 600 `green-bright`.

**This is where the tap-count promise is proven:** one tap logs an unchanged set (the ✓). Three taps log 2.5 kg heavier — the weight cell, `+2.5`, the ✓. The row's value goes full `ink` the moment it stops matching last session.

### 04 · Rest timer, final ten seconds

Same pill, inverted: fill `green-bright`, countdown `0:08` in `#060807`, `+15` in `#0C1A12`, `Skip` in `#060807`, drain fill `#060807` on the `green-dim` track at 7%. Readable from three feet without reading the numerals. Behind it, the nudge from 02 has been accepted: all three sit-up sets read `+27.5` in full ink.

### 05 · Rounds variant (Boxing bag)

The weight cell is **absent, not disabled.** The count cell moves into its place (min-width 96) so rounds, minutes and reps land under the same thumb position a weight would. Value `3:00`, micro-label `ROUND`. Footer reads "Add round". Subtitle `12 × 3 min · last: 12 rounds`.

### 06 · Reps-only variant (Push-ups)

Same row, one cell: value + `REPS`. Sets 1–2 logged at 15 and 13 (beat last session), 3–4 still ghosted at 10.

### 07 · Finish-workout confirm

Bottom sheet, not a dialog. Backdrop `rgba(6,8,7,0.78)` over the dimmed (opacity .28) list; status-bar glyphs drop to `ink-faint`. Sheet: `surface`, 1px `hairline` top, radius `14 14 0 0`, padding 24/16/16. Title `Finish workout?` Title 500 `ink`; body `7 sets are still unlogged. They won't be saved.` Body `ink-muted`. Then two stacked 56-high 999-radius buttons, 8 gap: `Finish · 11 sets` on `green` with Body 600 `ink`, and `Keep going` on `surface-alt` + `hairline` with Body 500 `ink`. Both stay in the bottom third. The destructive path is stated as a fact in the same green as every other primary action — there is no red in this app.

### 08 · Home / split timeline

Kicker `PUSH / PULL / BOXING · ROLLING` Micro `ink-faint`. 24 below, a five-cell strip, 74 per cell, 8 side padding. Each cell: a 14-high connector row (1px `green-dim` left of and between completed nodes, `hairline` for upcoming, transparent at the ends) with the node centered, then the label 8 below.

- Done: 14px circle filled `green`, label Label 400 `ink-faint`.
- Today: 14px circle, 3px `green-bright` ring, `bg` center; label Label 600 `ink` plus `TODAY` in Micro `green-bright` 4 below.
- Upcoming: 14px circle, 1px `hairline` border, `surface` fill (or transparent for Rest); label Label 400 `ink-muted`.

A split is a queue, not a calendar — the strip advances when a session completes.

40 below, the Today card: `surface` on `hairline`, radius 14, 16 padding — `TODAY` kicker, `Pull + swimming` Title 500, `6 exercises · 18 sets · 1 nudge waiting` Label `ink-muted`, then a 56-high `green` 999-radius **Start Pull + swimming** button with Body 600 `ink`.

40 below, `RECENT` kicker and a `surface` card of 56-high rows: name Body 500 `ink` left, `8 Aug · 74 min` Label `ink-faint` tabular right, 1px hairlines inset 16.

**Tab bar** (`Today` / `Routines` / `Library`) — 64 high, `hairline` top, three equal 44-high cells, active in Label 600 `green-bright`, inactive Label 500 `ink-muted`. **This bar exists only outside a session.**

### 09 · Routine editor

Header: back chevron, `EDIT ROUTINE` Micro kicker, `green` Save pill.

`ROUTINE NAME` kicker, then a 56-high `surface-alt` field on `hairline`, radius 14, 16 side padding, value in Title 500 `ink` followed by a 2 × 26 `green-bright` caret. Plain text field — nothing clever.

`EXERCISES · 6` kicker, then one `surface` card containing six 64-high rows: 12 left / 16 right padding, gap 12 — drag handle (16px, three 1.5px `ink-faint` lines), a two-line column (name Body 500 `ink`; `4 × 4–6 · rest 3:00` Label `ink-faint` tabular), trailing 18px chevron `ink-faint`. Hairlines inset 40 (past the handle). Footer row 56 high: `green-bright` plus + `Add exercise` in Label 500 `green-bright`. Below the card, a 56-high `Delete routine` in Label 500 `ink-muted` — no red, no confirmation styling.

Rows are 64 to fit two lines and still clear the handle. Sets, rep range and rest collapse to one summary line so the list stays scannable; tapping the row opens them.

### 10 · Routine editor, reorder in progress

Header kicker becomes `MOVING · PULL TO STOMACH` in `green-bright`; Save demotes to `surface-alt` + `hairline` with `ink-muted` label. Remaining rows drop to opacity .5 and lose their chevrons. The gap the row will fall into is a 64-high `bg` band with 1px `green-dim` top and bottom borders and `DROP HERE` centered in Micro `green-dim`. The lifted row leaves the list and follows the finger: 16 margin, radius 14, `surface-alt` on 1px `green-dim`, handle in `green-bright`, name Body 600 `ink`, subtitle `position 3 of 6` in Label `green-bright`. **No shadow** — the app's one elevation belongs to the timer.

### 11 · Exercise library / search

Header: back chevron + `ADD EXERCISE` kicker, no border. Search field: 56 high, radius 999, `surface-alt` on `hairline`, 20 side padding — query `pull` in Body 400 `ink` plus a 2 × 20 `green-bright` caret. `4 MATCHES` kicker.

Result rows, 64 high in one `surface` card: two-line column (name Body 500 `ink`; shape line in Micro `ink-faint` — `KG · REPS · ADDED BODYWEIGHT`, `KG · REPS · EXTERNAL`, `REPS ONLY`) plus a trailing 16px `green-bright` plus. The micro line is the exercise's *shape* — which inputs it will render.

Below: create-from-query as a row in the same list, not a separate screen — 56 high, radius 14, `surface-alt` on `hairline`, `green-bright` plus + `Create "pull"` in Body 500 `ink`. Then `RECENTLY USED` and a two-row `surface` card.

### 12 · Create exercise — Requires weight ON

`NAME` kicker + 56-high `surface-alt` field, value Title 500 `ink`.

The key control: a 64-high `surface-alt` row on `hairline`, radius 14 — label `Requires weight` Body 500 `ink`, helper `A weight cell renders on every set` Label `ink-faint`, and a 52 × 32 toggle (radius 999, `green` track, 24px `ink` knob right, 4 padding).

It **visibly changes which inputs exist below it.** Kicker `SET INPUTS · WEIGHT + REPS` in `green-bright`, then two equal 96-high wells (8 gap, radius 14, `surface-alt` on `hairline`, 12/16 padding, `justify-content: space-between`): micro label top, then Display 600 `ink` value + micro unit. `DEFAULT KG 30` and `TARGET REPS 12`.

`LOAD MODE` kicker + a 44-high segmented pill: `surface` on `hairline`, 4 padding, three equal 36-high 999-radius segments — selected `green` fill with Label 600 `ink`, unselected Label 500 `ink-muted`. Options External / **Added** / Assisted.

Then a `surface` card of two 56-high rows: `Increment  ± 2.5 kg`, `Rest  2:00` (value `ink-muted`). Increment lives on the exercise, so a dumbbell offers ±2.5 and a pin stack ±5 — the nudge can never suggest a weight that cannot be loaded.

### 13 · Create exercise — Requires weight OFF

Toggle off: track `hairline`, knob `ink-faint`, knob left; helper becomes `No weight cell renders at all`. The weight well is **removed**, not disabled. A new `COUNTED IN` segmented control appears with four segments (Reps / Time / Metres / **Rounds**). Kicker becomes `SET INPUTS · ROUNDS ONLY` and the two wells become `ROUNDS 12 ×` and `ROUND LENGTH 3:00`. Settings card: `Rest between rounds 1:00`, `Overload nudges  Off · no load to add` (value `ink-faint`) — an exercise with no load has no plateau to report. Footnote: reps / time / metres swap the same two wells (reps only · duration · distance + duration).

### 14 · Exercise history

Name Title 500 `ink`, then `8 sessions · top 80 kg · same weight for 16 days` Label `ink-muted` tabular. `TOP WORKING WEIGHT` kicker.

Chart: 342 × 160 inline SVG, no fill gradient, no axes box. Three 1px `green-dim` gridlines at y 8 / 56 / 104 with Micro `ink-faint` labels (80 / 70 / 60) in a 34-wide gutter; a 1px `hairline` baseline at y 128. Data: a 2px `green-bright` polyline, round caps and joins, through `52,104 108,80 164,56 220,32 276,8 320,8`; each point a 3r circle with `bg` fill and 2px `green-bright` stroke, the latest a solid 4r `green-bright` dot. Date labels in Micro `ink-faint` at y 150.

Plot **top working weight per session, never per set** — a ramp inside one exercise would fabricate a plateau.

`SESSIONS` kicker, then a `surface` card of 56-high rows: 64-wide date in Label `ink-faint`, then the shorthand in Body 500 `ink` tabular — `80 kg · 8 6 5 5`. Drop sets stay on the same line in `ink-faint` and out of the chart line (`80 kg · 7 · 75 kg · 7 7 6`).

---

## Interactions & behavior

| Action | Result |
| --- | --- |
| Tap ✓ on the primed row | Logs it with the pre-filled (last-session) values. Values go full `ink`, circle fills `green`, next row lifts to `surface-alt`, rest timer starts at the exercise's rest value. **One tap. This is the product.** |
| Tap ✓ on a logged row | Un-logs it. Values return to `ink-faint`, circle empties, timer cancels. No confirmation. |
| Tap a number cell | Opens the inline editor under that row; the tapped cell chips up. No keyboard, no modal, no scroll jump. |
| `±` chip | Steps by the exercise's increment; value updates live in both the well and the row. |
| `Type` | Reveals the numeric keypad for that one field. The only path to a keyboard in a session. |
| `Remove set` | Deletes the row, closes the editor. |
| `Done` / tap elsewhere | Closes the editor. Edits are already applied — there is no cancel. |
| `Add set` | Appends a row pre-filled from the previous set of that exercise. |
| Tap a collapsed exercise | Expands it, collapses the previous one. One expanded at a time. |
| `Use` on the nudge | Rewrites all remaining (unlogged) sets of that exercise to the suggested weight, in full `ink`; card disappears. |
| `×` on the nudge | Dismisses for this session; the collapsed green dot goes too. |
| `+15` on the timer | Adds 15s; drain line re-scales. |
| `Skip` | Ends rest immediately; pill animates out. |
| Timer ≤ 10s | Pill flips to the `green-bright` inverted state. Any alert is haptic + sound, never visual-only. |
| Timer hits 0 | Pill dismisses itself. |
| `Finish` | If unlogged sets remain, the sheet from 07; otherwise saves and returns home. |
| Long-press a routine row | Enters reorder (state 10). Release drops into the marked gap. |
| Toggle `Requires weight` | Adds/removes the weight well and the `COUNTED IN` control; turns overload nudges off when weight is off. |

Motion: 140ms for row state changes (background, ink color, circle fill), 240ms for cards and sheets, easing `cubic-bezier(.22,1,.36,1)`. Nothing else moves. No confetti, no celebration, no progress rings.

## State management

Per session: `routineId`, `startedAt`, `expandedExerciseId`, `editingCell` (`{setId, field} | null`), `restTimer` (`{endsAt, total} | null`), `dismissedNudges: Set<exerciseId>`.

Per set: `weight`, `count`, `logged: boolean`, `prefilledFrom` (last-session value — this is what decides ghost vs full ink: render `ink-faint` while `logged === false`, and full `ink` as soon as the value differs from `prefilledFrom` OR the set is logged).

Derived: `loggedCount / totalSets` for the header, elapsed minutes, and the nudge (see `src/lib/progressiveOverload.ts` — same weight across N sessions / D days on an exercise with `requiresWeight`, suggestion = top weight + that exercise's increment).

Local-first, as today. Sets persist the instant they're logged — the app must survive being killed mid-session.

## Assets

None. All 5 icons are inline SVG in the reference file (copy the paths). No images, no external fonts, no libraries.

## Files

- `Workout Tracker Android.dc.html` — the 14-frame reference gallery. **Open this first.**
- `support.js` — runtime needed only to render the HTML locally; not part of the design.
- `github.md` — source-repo association and the screen → repo-file map.

Repo files this design derives from: `src/screens/ActiveWorkoutScreen.tsx`, `src/components/{SetRow,ExerciseCard,QuickAdjust,OverloadNudge,RestTimerPill,SplitTimeline}.tsx`, `src/types/models.ts`, `src/lib/progressiveOverload.ts`, `src/data/seed.ts`, `src/theme/tokens.ts`, `global.css`, `tailwind.config.js`. Screens 08–14 have no upstream implementation — they are new.

## Deliberately absent — do not add back

Streaks, badges, confetti, motivational copy, percentage-complete rings, 1RM estimates, volume totals, muscle-group diagrams, rest-day reminders, social features, a second accent color, red for destructive actions, amber for warnings, colored category chips, gradients, glassmorphism, glows, shadows other than the timer's, a third radius, a sixth type size, and a bottom tab bar during an active workout.

## Content used (real, keep it)

Exercises: Weighted 90° pull-ups (+40 kg × 4), Wide pull-ups machine (80 kg × 8 6 5 5), Pull to stomach (55 kg × 10 10 10 10), Brachialis curls (15 kg × 16 16 14 14), Weighted sit-ups (+25 kg × 12 12 12), Weighted dips (+30 kg × 12 8 6 5), Boxing bag (12 rounds × 3 min), Swimming (50 min), Push-ups (14 13 10 10). Routines: "Pull + swimming", "Push", "Boxing (cardio)".
