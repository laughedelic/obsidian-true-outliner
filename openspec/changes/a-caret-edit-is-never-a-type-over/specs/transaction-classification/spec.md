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
