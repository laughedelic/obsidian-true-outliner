## Why

Markdown separates most blocks with a blank line. An outline reads that blank line as an empty
row, so a note of five paragraphs renders as nine rows, four of which say nothing. Between list
items the same note renders with no empty row at all, because a tight list has no separator — so
the outline's vertical rhythm changes with the kind of node, for a reason that belongs to the
file format rather than to the tree.

The tree does not have this problem. A blank line is a node's `trailingGap` (`model.ts`), owned
by the node above it and never a node of its own, and `content-space-caret` already states that
it is not a position the caret may occupy. Every layer above the parse therefore already agrees
that a gap line is not a place. The rendering is the one layer that still draws it.

This change lets a reader collapse those rows. It is a rendering choice and nothing else: the
document keeps every byte, every gap keeps its owner, and no operation behaves differently.

## What Changes

- **A setting collapses every blank separator row between nodes**, off by default. With it on,
  a gap line's own decoration takes the row's height to zero and the rows either side of it
  become adjacent.
- **The row the caret is on is never collapsed.** This falls out of the layers as they already
  stand rather than being added: an empty cursor on a blank line is a PROVISIONAL POSITION, and
  a provisional position carries a full per-line fact, which a gap line by definition does not.
  The two sets are disjoint — measured in `docs/research/gap-line-hiding`.
- **The mechanism is a line decoration, not a block replacement.** The zoom hides lines by
  replacing them (`zoom-hiding-mechanism`); the design records the four costs either way, including
  the one that reopened the decision — the editor's height map counts an undrawn collapsed row at
  full height, so the scrollbar settles as the reader scrolls. That is accepted, on an opt-in
  setting, rather than paid down with a second decoration source.
- **The setting is marked EXPERIMENTAL on its own row**, as a chip drawn from the declaration
  rather than wording inside the description, and its description names what the reader gives up.

## Non-goals

- **Changing what a gap means.** Ownership, parsing, encoding and every structural operation are
  untouched. A note is byte-identical whichever way the setting is set, and the setting is not
  persisted into any note.
- **Tidying gaps.** Nothing collapses a run of several blank lines into one, deletes a gap, or
  normalises separation. A "tidy gaps" pass is a separate idea, parked since
  `docs/research/open-questions`' first mapping round.
- **Making the outline tell the reader how much whitespace is there.** The setting deliberately
  erases that distinction; what it costs is stated in the design and in the setting's own
  description rather than mitigated.
- **A per-note or per-tab choice.** One global appearance setting, like every other setting in
  its slice.

## Capabilities

### Modified Capabilities

- `outline-decorations`: the guide layer's existing rule that blank separator lines render
  guides gains a companion — which rows the layer draws at all, the one row it never collapses,
  and what the collapse is allowed to cost the editor's own scroll metrics. It also gains the
  rule that a setting still being judged says so on its own row.

## Impact

- `src/plugin/settings/appearance.ts`: one declaration.
- `src/plugin/main.ts`: the accessor pair and its `WRITERS` row.
- `src/plugin/decorations.ts`: `DecorationSource`, the render cache key, and `gapLineDecoration`
  — which now also emits for a gap line carrying no guide, since a top-level gap has none and
  still has to be collapsed.
- `styles/70-gap-lines.css` and `styles/80-settings.css`: one rule each, two new parts.
- `src/plugin/settings/declare.ts` and `src/plugin/settings.ts`: the `experimental` flag the chip
  is drawn from.
- `tests/decorate.test.ts` and a new e2e case; `docs/research/gap-line-hiding` records the
  measurement this rests on.
