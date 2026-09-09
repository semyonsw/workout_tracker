/**
 * Clamping the history shorthand down to something that fits beside a name.
 *
 *   +32 kg · 5 4 4 4                    fits — untouched
 *   15 sec · 15 sec · 15 sec · 15 sec …  seven held sets, clamped to four
 *   20 13 12 10 8 6 5 →  20 13 12 10 8 …
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 *
 * The history row is `name … summary`, and the summary column sized itself to
 * whatever the shorthand happened to be. An exercise with seven timed sets
 * produced a two-line summary wide enough to take the whole row, the name's
 * `flex-1` collapsed to nothing, and the row rendered as a wall of `15 sec` with
 * NO EXERCISE NAME ON IT AT ALL. A log you cannot read the name of is not a log.
 *
 * So the summary is now bounded before it is rendered, and the row keeps the name
 * a floor of width no summary can take (see `HistoryScreen`). The clamp is what
 * makes the bound honest rather than an ellipsis the renderer applies mid-number:
 * `15 se…` is noise, `15 sec · 15 sec …` is a sentence that stops.
 *
 * ── WHAT A "VALUE" IS ───────────────────────────────────────────────────────
 *
 * The shorthand's grammar (`lib/history.ts`) is groups joined by ` · `, where a
 * group of reps is itself space-separated numbers: `+32 kg · 5 4 4 4`. So the
 * things worth counting are the ` · ` segments EXCEPT that a run of rep counts is
 * a segment holding several. Both are clamped through the same list, which is why
 * `20 13 12 10 8 6` clamps as well as seven `15 sec`s do — one long set list and
 * one long chain of drop sets are the same problem.
 *
 * A load label (`+32 kg`) counts as a value too. Overpaying by one on the rare
 * clamped weighted row is worth not having to teach this function which segments
 * are weights — it renders text, it does not know what a kilogram is.
 *
 * Nothing here renders the ellipsis: the screen draws its own, in green, because
 * on that row the dots are the control that opens every set (a `…` baked into the
 * string would look like punctuation, and it would be the one part of the row you
 * cannot tap).
 */

/** The shorthand's group separator. See `lib/history.ts`. */
const SEPARATOR = ' · ';

/** A rep-count group: `5 4 4 4`. Everything else is one value on its own. */
const COUNTS = /^\d+(?: \d+)*$/;

export interface ClampedSummary {
  /** The summary, cut to length. Whole values only — never a cut-off number. */
  text: string;
  /** How many values were left out. 0 means `text` IS the summary. */
  hidden: number;
}

/**
 * The summary, cut to at most `maxValues` values.
 *
 * The default of 5 is what keeps the common rows whole: `+32 kg · 5 4 4 4` is a
 * label and four sets, which is the shape of most weighted work in this log. Six
 * or more values is where a row starts pushing at a name.
 */
export function clampSummary(summary: string, maxValues = 5): ClampedSummary {
  /* Which segment each value came out of, so the rejoin can put back the right
     separator — a space inside a rep group, ` · ` between groups. */
  const values: { text: string; segment: number }[] = [];

  summary
    .split(SEPARATOR)
    .filter((segment) => segment.length > 0)
    .forEach((segment, index) => {
      if (COUNTS.test(segment)) {
        for (const count of segment.split(' ')) values.push({ text: count, segment: index });
      } else {
        values.push({ text: segment, segment: index });
      }
    });

  if (values.length <= maxValues) return { text: summary, hidden: 0 };

  const kept = values.slice(0, maxValues);
  const text = kept.reduce(
    (line, value, index) =>
      index === 0
        ? value.text
        : line + (value.segment === kept[index - 1].segment ? ' ' : SEPARATOR) + value.text,
    '',
  );

  return { text, hidden: values.length - kept.length };
}
