## Why

`--to-decor-unit` — one tree level's worth of horizontal distance — has been `1.5rem` since
Experiment 1, chosen the way `MARKER_GUTTER_REM` was chosen: it worked. `marker-text-gap` has
since derived the gutter and tightened it from `1.25rem` to `0.875rem`, which changes how the
unit reads. A mark and its text are now one row rather than two things beside each other, and
against that the step from one level to the next is the loosest relationship left on screen —
the rows tightened and the ladder did not.

Widening it is a small edit. What is worth stating is the other half: **the unit is already
adjustable from CSS, and nothing says so or holds it.** Measured against the current build,
overriding `--to-decor-unit` the way a snippet would retargets every column on both surfaces —
indentation, guides, markers, the hanging indent, Obsidian's own `--list-indent` bridge, the
footer's rows and its group inset all follow. That is a real property of the design, arrived at
by the layer's own discipline of deriving every column from one value.

It is also, today, entirely incidental. No test covers it, so the next change to touch a column
can take it away silently. And `chrome-tokens.ts` still exports `DECOR_UNIT_REM` and
`DECOR_UNIT_CSS` — the unit's value as a JS number and a JS string, unused by anything, sitting
there for the first caller who needs "the number". The moment one is used to position
something, an override moves the columns and leaves that one piece behind. That is the same
shape as the stale gutter fallback `marker-text-gap` found in the footer's heading, before it
has happened.

## What Changes

- **The default unit widens to `1.75rem`.** Judged on screenshots across both bundled themes
  against the tightened gutter. `1.625rem` was measured and shot too and is barely
  perceptible; `2rem` reads wide enough that a four-deep list starts spending real width on
  chrome. Slight is what was asked for and `1.75rem` is the step that delivers it.

- **Adjustability becomes a requirement, not a property.** The spec gains the rule that every
  surface takes its unit from one declaration a snippet can override, and that no layer may
  hold a second copy of its value in any form. An e2e spec applies an override the way a
  snippet would and asserts both surfaces move together, so the guarantee has something
  holding it.

- **The unused JS copies of the value go.** `DECOR_UNIT_REM` and `DECOR_UNIT_CSS` are deleted
  rather than kept for a caller that does not exist. `UNIT_EXPR` — `var(--to-decor-unit)`, with
  no fallback — is the only way JS may refer to the unit, which is already how every live
  caller refers to it.

- **The one e2e literal reads the published value.** `56-list-grid.e2e.ts` spells `UNIT = 24`,
  which asserts the number this file was written against rather than that a level steps by the
  unit. It takes the same treatment `marker-text-gap` gave the gutter.

## Non-goals

- **A setting.** One derived default, retunable by a snippet. A settings surface is a separate
  change with a UI to design, and the CSS route already serves the reader who cares.
- **Per-level or per-kind units.** The grid's single-unit rule is what makes every layer agree;
  a unit that varies by level would need a different spec, not a wider number.
- **Touching the gutter.** `marker-text-gap` derived it from the marks it holds. The unit is
  level-to-level and independent, and this change must leave a mark's distance from its own
  text exactly where that derivation put it.

## Capabilities

### Modified Capabilities

- `outline-decorations`: the single-unit rule gains what it has always implied but never
  said — that the one value is a custom property every surface reads from one declaration, that
  a snippet overriding it retargets the whole grid on every surface at once, and that no layer
  may restate it.

## Impact

- **Modified**: one declaration in `styles.css`; two unused exports removed from
  `src/plugin/chrome-tokens.ts`. Every column on both surfaces follows from the declaration.
- **Tests**: `e2e/specs/56-list-grid.e2e.ts` reads the published unit instead of `24`. A new
  spec covers the override on both surfaces.
- **Regenerated**: the screenshot corpus. The footer's structural baseline records no pixels
  and is unaffected.
- **Risk**: low, and bounded below rather than above. A wider unit only increases the clearance
  between a child's mark and its parent's text; the floor measured in
  `docs/research/21-marker-text-gap.md` is `gutter + widest ink-left`, which the current unit
  already clears and a wider one clears by more.
