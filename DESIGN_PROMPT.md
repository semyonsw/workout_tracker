# Design prompt — dark / green UI

Copy everything below the line into a fresh Claude conversation (Claude with
artifacts enabled works best — it will build a clickable mockup).

---

You are a senior product designer specializing in premium, minimal iOS/Android
apps. Design the complete UI for **a workout tracker built on one rule: logging a
set that repeats last session costs exactly one tap.**

Deliver a **single self-contained HTML artifact** — a clickable, high-fidelity
mockup at 390 × 844 (iPhone frame), with every screen and component state below,
using real content (no lorem ipsum). Inline all CSS. No external fonts, images,
or libraries.

## Product in one paragraph

A gym app for someone who trains 5×/week and already keeps a written log: heavy
compound work, boxing rounds, swimming. They open the app mid-set with cold
hands in a loud room. It must show what they lifted last time, take the new
numbers in one tap, run a rest timer they can read from three feet away, and
quietly tell them when a weight has gone stale. Nothing else.

## Visual direction — dark, near-black, green

Deep OLED-black canvas with a green undertone. Green is the app's only hue and
it carries meaning through **intensity, not variety**: dim green = structure,
solid green = completed, bright green = the one thing asking for attention.
No second accent colour anywhere.

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#060807` | Page. Near-black — true OLED off-pixels, faint green cast |
| `surface` | `#0E1211` | Cards, set rows |
| `surface-alt` | `#141A18` | Wells, the primed next set, inline editors |
| `hairline` | `#1E2523` | 1px separators — the only "border" in the app |
| `ink` | `#ECF1EE` | Primary text. Never pure white — it blooms on OLED |
| `ink-muted` | `#8A968F` | Secondary text |
| `ink-faint` | `#57615C` | Micro-labels, ghosted prefilled values |
| `green-wash` | `#0C1A12` | Tinted card background for the overload nudge |
| `green-dim` | `#15452C` | Inactive rings, progress tracks, timeline connectors |
| `green` | `#1E7A4C` | Primary fills — completed set marks, primary buttons |
| `green-bright` | `#3FA96C` | Text/icons on black, active timer, the nudge |

Rules: green-on-black text uses `green-bright` only (`green` fails contrast at
small sizes). Text on a `green` fill is `ink`, semibold. Elevation comes from
hairlines and surface steps — one real shadow exists in the whole app, under the
floating rest timer.

## Typography

System font (SF Pro / Roboto). Five sizes, no more. **All numerals tabular** — a
weight must not shift a pixel going from 9 to 10 reps.

- Display 40/44, tracking −1.2 — the value being edited, the rest countdown
- Title 22/28, tracking −0.4 — exercise names, set weights and reps
- Body 16/22 — suggestions, collapsed headers
- Label 13/18 — secondary lines
- Micro 11/14, tracking +1.1, UPPERCASE — `KG`, `REPS`, `SET`, timeline labels

On dark, drop one weight step vs. a light UI: light text on black looks heavier
than it is. Use 500/600, never 700+.

## Shape, space, motion

- Exactly **two radii**: 14px (surfaces) and 999px (pills). No third.
- 4pt grid: 4 / 8 / 12 / 16 / 24 / 40.
- 56pt set rows, 44pt minimum tap target, everything reachable in the bottom 2/3.
- Motion: 140ms row states, 240ms cards, ease `cubic-bezier(.22,1,.36,1)`.

## Screens to design

**1. Active Workout (the hero screen — spend most of your effort here)**
Header: routine name, `11 of 18 sets · 42 min`, Finish pill. Below: a vertical
list of exercises where **one is expanded and the rest are collapsed** to a
single line (`Wide pull-ups machine · 80 kg · 8 6 5 5 · 0/4`). The expanded card
shows set rows:

```
 1     +40 kg      ×    4 reps                    ( ✓ )
 2     +40 kg      ×    4 reps                    (   )
 +  Add set
```

- Values arrive **pre-filled from last session, rendered ghost-faint** — the
  visual promise of "tap ✓ if nothing changed".
- The next uncompleted row sits on a slightly lifted surface.
- A completed row: value goes full ink, the circle fills solid `green` with an
  ink checkmark.
- Weight cell is **absent, not disabled**, for bodyweight/cardio exercises
  (push-ups, swimming, boxing rounds) — show both variants.

**2. Inline value editor** — tapping a number opens a panel *under* that row (no
modal, no keyboard): `−5 −2.5 [ 32.5 KG ] +2.5 +5`, plus small "Type" and
"Remove set" actions. Show it open.

**3. Floating rest timer** — a pill above the list, ink-inverted or green-lit:
`1:28   +15   Skip`, with a 2px drain line across its base. Show running and
final-10-seconds states (the pill goes `green-bright`).

**4. Progressive overload nudge** — a `green-wash` card above the set rows:
`SAME +25 KG FOR 23 DAYS · 5 SESSIONS` / **Try 27.5 kg** / `[ Use ]` `[ × ]`.
Understated, factual, no exclamation marks, no trophies. Also design its
collapsed hint: a single 6px `green-bright` dot on the collapsed exercise card.

**5. Home / split timeline** — a horizontal strip of the training cycle:
`Push ● — Boxing ● — Pull ◉ — Push ○ — Rest ○` (filled = done, ring = today,
hollow = upcoming), plus a "Start Pull + swimming" primary button and a compact
recent-sessions list.

**6. Routine editor** — reorderable exercise rows with sets × rep-range and rest
time, an "Add exercise" affordance, and a plain text field for the routine name.

**7. Exercise library / add exercise** — search, and a create form whose key
control is a `Requires weight` toggle that visibly changes which inputs exist
below it (weight+reps vs. reps-only vs. time vs. rounds).

**8. Exercise history** — one exercise over time: a sparse line chart of top
working weight (green line, `green-dim` grid, no fill gradient), and a list of
past sessions in `+30 kg · 8 6 5 4` shorthand.

## Real content to use

Exercises: *Weighted 90° pull-ups (+40 kg × 4)*, *Wide pull-ups machine (80 kg ×
8 6 5 5)*, *Pull to stomach (55 kg × 10 10 10 10)*, *Brachialis curls (15 kg ×
16 16 14 14)*, *Weighted sit-ups (+25 kg × 12 12 12)*, *Weighted dips (+30 kg ×
12 8 6 5)*, *Boxing bag (12 rounds × 3 min)*, *Swimming (50 min)*.
Routines: "Pull + swimming", "Push", "Boxing (cardio)".

## Hard constraints

- One tap to log an unchanged set. Three taps to log one 2.5 kg heavier. Show
  that this is true in the layout.
- No neon, no gradients, no glassmorphism, no glow, no drop shadows except the
  timer pill.
- No second colour. No red for failure, no amber for warnings, no coloured
  category chips.
- No gamification: no streaks, badges, confetti, motivational copy, or
  percentage-complete rings.
- No bottom tab bar during an active workout — the session owns the screen.
- No icon without a purpose; use a minimal stroke set (check, plus, chevron,
  trending-up, x) drawn as inline SVG.
- Every interactive element ≥ 44pt, and legible at arm's length.

## Also give me

1. A short rationale (max 200 words) for the layout of the Active Workout screen.
2. The final palette and type scale as a design-token table I can paste into a
   Tailwind config.
3. Anything you deliberately removed, and why.
