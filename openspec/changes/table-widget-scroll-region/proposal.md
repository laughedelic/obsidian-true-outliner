## Why

In outline mode a table that fits its line scrolls both horizontally and vertically. Reported
from real-vault use on `Notes/Edge Case Zoo`, a two-column, three-row table with room to spare.

The cause is measured in [docs/research/table-scroll-region](../../../docs/research/table-scroll-region.md): our own rule makes the widget's inner
`.table-wrapper` the scroll container, and that box is tight to the table by construction —
Obsidian positions four pieces of table-edit chrome flush outside the table's four edges, two
anchored to the wrapper and two to their own cells, and reserves room for all four in the OUTER
widget's own padding. Making the tight box a scroll container took every piece into its scrollable
overflow region. The two buttons are scrollable there and account for the reported scroll on both
axes; the two drag handles sit where a scroll container cannot reach and are clipped, which is why
a table's row and column drag handles are currently unreachable in outline mode — on mobile too,
where they are the only way to reorder. The vertical axis has a second cause on top: the rule
states `overflow-x` alone, and one axis `auto` beside `visible` computes the other to `auto` too.

## What Changes

- **The scroll container gets the chrome reservation the widget's own padding already is**, so
  its scroll region holds the table and nothing else. A table that fits scrolls on neither axis
  and returns to its stock box; a table wider than its line keeps the horizontal scroll that
  [docs/research/experiment-2-guide-lines](../../../docs/research/experiment-2-guide-lines.md) finding 4 introduced.
- **Both overflow axes are stated**, rather than one stated and the other promoted. Measured, this
  changes nothing once the reservation is in place; it is written to say on the box what Obsidian
  says on its own, and the note records that no assertion can fail without it.
- **The two add buttons are pulled inside the reservation by a transform**, at their stock size
  and their stock offset from the table, so nothing in the widget moves on screen. A transform
  rather than an inset: a percentage inset resolves against the visible padding box, so every
  inset form scrolls the button out of reach on a wide table — which the note records as
  predating this change rather than following from it.
- **The column drag handle comes back** with no rule of its own, because it tracks the table while
  the reservation moves the scrollport's edge out past it. The row drag handle does not: it sits on
  the inline-start side, which gets no reservation, because a leading one is a strip that a
  scrolled table renders its own cells into — and that strip is the marker's column. Real use
  found that; the note carries the figures.
- Every length in the rule derives from Obsidian's own `--table-drag-handle-size`, so the
  reservation follows the platform's own value rather than carrying one of ours.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outline-decorations`: "Guides coexist with native blockquote chrome and table scrolling"
  currently requires only that a wide table's own horizontal scroll keeps working. It gains the
  other half of the same contract — a table that does not need to scroll does not scroll, and the
  widget's native edit chrome stays where Obsidian puts it and stays reachable.

## Impact

- `styles/10-editor.css`: the `.table-wrapper` rule introduced by Experiment 2b, plus two rules
  for the add buttons.
- `e2e/specs/51-guides-gradient.e2e.ts`: the two table cases there assert the wide fixture's
  scroll and the outer element's own overflow; neither notices a fitting table scrolling. The
  fitting case and the chrome's reachability need assertions of their own.
- No TypeScript changes. The decoration pipeline, the marker and guide arithmetic, and
  `MarginCompensation`'s widget sweep are untouched — confirmed by measurement that the guide,
  the marker and the widget's own margin are unaffected by the wrapper's overflow.

## Non-goals

- **The alternative fix** — making the wrapper a scroll container only when the table is genuinely
  wider than its line — is measured and rejected in [docs/research/table-scroll-region](../../../docs/research/table-scroll-region.md), not deferred.
  It restores stock exactly for a fitting table and it is buildable on signals CM6 already
  provides, but its two failure directions are not comparable: stale one way costs an unneeded
  scrollbar, stale the other puts the whole note into sideways scroll, and the note measures the
  window in which a pane drag holds it there.
- **Where the add-column button sits on a genuinely wide table.** It is pinned to the scrollport's
  inline edge rather than the table's far right today, and stays there; the reservation moves it
  by the width the removed scrollbar was taking.
- **The outer widget's `overflow: visible` override and the `contain: none` override.** Both stay
  exactly as they are; this change touches only what happens inside them.
- **Wide-table ergonomics in general** — a nested scroll surface inside an outline is awkward and
  a better shape may exist. That question belongs in [docs/research/decoration-follow-ups](../../../docs/research/decoration-follow-ups.md), not here.
