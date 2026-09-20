## MODIFIED Requirements

### Requirement: Every transaction receives exactly one classification

In outline-mode editors the filter SHALL assign each transaction exactly one class from:
`programmatic`, `composition`, `plugin-own`, `selection-only`, `within-node-edit`,
`boundary-crossing-edit` — evaluated in that order, first match wins. Classification
SHALL be computed by a pure function over transaction facts and the parsed tree, unit-
and property-tested independently of Obsidian. Any transaction not confidently matching
an enforced class SHALL pass through unmodified (default-permit). Transactions
classified `boundary-crossing-edit` SHALL additionally be handed to the
node-edit-enforcement verdict layer, which determines whether they pass, are
rewritten, or are vetoed.

`boundary-crossing-edit` covers, beyond change ranges whose line spans touch more than
one node: pure insertions — and replacements made over a non-empty selection, per "A
replacement synthesized around a caret is not a paste" below — whose inserted text parses
as a multi-block sequence (landing on a node's own line), single-character deletions of a
line boundary whose adjacent lines belong to different nodes, and — per
node-edit-enforcement's chrome-transparency requirement (amendment 2026-07-21) —
chrome-boundary deletions whose merge intent is established by the pre-edit cursor
position: a deletion of a NODE marker's trailing space ending exactly at that node's first
content column with the cursor there — a list marker's or an ATX heading's alike, since
marker kind is a marker internal no editing semantic may read — and a deletion of the
newline ending a node's last content line
with the cursor at that node's content end (Delete into the node's own trailing
gap). The pre-edit main-selection cursor is a classification fact supplied by the
adapter for exactly these shapes; an edit with the same bytes but a different cursor
(editing the gap from within it) remains `within-node-edit`. So does the marker-space
shape when the marker's whitespace run is wider than the one character it needs: Backspace
at the content start of `-  a` removes the surplus space and leaves the marker its own,
which is ordinary editing rather than a merge intent, and the one place the surplus can be
removed from, since no column inside the run is addressable.

#### Scenario: Typing inside a node

- **WHEN** the user types a character in the middle of a paragraph node's text
- **THEN** the transaction is classified `within-node-edit` and applied unmodified

#### Scenario: Edit spanning two nodes counted but not altered

- **WHEN** a deletion's change range starts inside one node and ends inside the next
- **THEN** the transaction is classified `boundary-crossing-edit`, counted in the stats
  surface, and receives a verdict per the node-edit-enforcement capability (superseded
  by this change: "not altered" no longer holds unconditionally — a `rewrite` or
  `veto` verdict may change or block the edit; the byte-identical guarantee survives
  narrowed to a `pass` verdict, per the new "Text modification is confined to enforced
  verdicts" requirement below)

#### Scenario: Marker-space deletion at content start is enforced

- **WHEN** the cursor sits at a list item's or an ATX heading's first content
  character and Backspace deletes the marker's trailing space
- **THEN** the transaction is classified `boundary-crossing-edit` and handed to the
  verdict layer (a merge intent), not applied as a within-node marker corruption

#### Scenario: A marker's surplus whitespace is deleted, not merged

- **WHEN** the cursor sits at the content start of `-  a`, of `- [ ]  bar` or of `##  Two`,
  where the marker's whitespace run is wider than one character, and Backspace deletes the
  character before it
- **THEN** the transaction is classified `within-node-edit` and applied unmodified, leaving
  `- a`, `- [ ] bar` or `## Two` — the merge intent is recognized only once the run is down to
  the one character the marker needs

#### Scenario: A paragraph's indentation is not a marker column

- **WHEN** the cursor sits at the first content character of an INDENTED paragraph,
  whose leading whitespace the content-column rule reads as a content prefix, and
  Backspace deletes one space of that indentation
- **THEN** the transaction is classified `within-node-edit` — the shape is recognized
  by the node's marker, and a paragraph has none

#### Scenario: A column inside the marker's own characters stays native

- **WHEN** the deletion ends INSIDE a marker rather than at the content column —
  within a task item's `[ ]`, or within a heading's `#` run
- **THEN** the transaction is classified `within-node-edit`: those characters are the
  marker's own, and deleting one is ordinary editing

#### Scenario: The same bytes with a gap-line cursor stay native

- **WHEN** a deletion removes the newline between a node's last content line and its
  own trailing gap, with the pre-edit cursor ON the gap line
- **THEN** the transaction is classified `within-node-edit` and applied unmodified
  (deliberate whitespace authoring)

## ADDED Requirements

### Requirement: A replacement synthesized around a caret is not a paste

The multi-block reading — a change on one node's own line whose inserted text parses as a
structural block sequence is `boundary-crossing-edit` — SHALL apply to a pure insertion, and to a
replacement only when the selection before the change was NOT empty. A replacement made while the
selection was empty is the editor rewriting text around the caret, and the block sequence its
inserted text parses to was never pasted or typed over anything; it SHALL be classified by the
rules ahead of the multi-block reading and otherwise fall to `within-node-edit`.

Whether the pre-edit main selection was empty is a classification fact the adapter SHALL supply,
beside the pre-edit cursor it already supplies for the chrome-boundary shapes. A caller that does
not supply it keeps the reading a replacement has without it.

Measured in `docs/research/enter-inside-a-quote`: Obsidian's own Enter inside a quote, which the
keyboard grammar declines so that stock behaviour runs, replaces the character before the caret
with that character, a line break and the quote's `> `. Read as a paste, the one-character range
reached the verdict layer's deletion path, which escalated it to the whole quote and replaced the
quote with the two blocks — the character, and an empty quote line.

#### Scenario: Enter inside a quote continues it

- **WHEN** the caret is past a quote's, a callout's, or a nested list-in-quote's content start and
  the user presses Enter
- **THEN** the transaction Obsidian dispatches is classified `within-node-edit` and applied
  unmodified, and the document and caret are byte-identical to outline mode off

#### Scenario: The same bytes over a selection are a type-over

- **WHEN** a change with the same one-line range and the same multi-block inserted text is made
  while the selection was NOT empty
- **THEN** the transaction is classified `boundary-crossing-edit` and receives a verdict, as a
  type-over of that selection

#### Scenario: A paste at a caret is still a paste

- **WHEN** a multi-block sequence is inserted at a caret with nothing deleted
- **THEN** the transaction is classified `boundary-crossing-edit`, exactly as before this
  requirement

#### Scenario: The fact narrows one rule only

- **WHEN** a replacement made from a caret crosses a node boundary by line span, or exactly covers
  a whole subtree
- **THEN** it is classified `boundary-crossing-edit` by those rules, which read no selection fact
