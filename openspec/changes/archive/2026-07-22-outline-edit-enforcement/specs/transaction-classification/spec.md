# transaction-classification Delta

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
one node: pure insertions whose inserted text parses as a multi-block sequence
(landing on a node's own line), single-character deletions of a line boundary whose
adjacent lines belong to different nodes, and — per node-edit-enforcement's
chrome-transparency requirement (amendment 2026-07-21) — chrome-boundary deletions
whose merge intent is established by the pre-edit cursor position: a deletion of a
list marker's trailing space ending exactly at the item's first content column with
the cursor there, and a deletion of the newline ending a node's last content line
with the cursor at that node's content end (Delete into the node's own trailing
gap). The pre-edit main-selection cursor is a classification fact supplied by the
adapter for exactly these shapes; an edit with the same bytes but a different cursor
(editing the gap from within it) remains `within-node-edit`.

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
- **WHEN** the cursor sits at a list item's first content character and Backspace
  deletes the marker's trailing space
- **THEN** the transaction is classified `boundary-crossing-edit` and handed to the
  verdict layer (a merge intent), not applied as a within-node marker corruption

#### Scenario: The same bytes with a gap-line cursor stay native
- **WHEN** a deletion removes the newline between a node's last content line and its
  own trailing gap, with the pre-edit cursor ON the gap line
- **THEN** the transaction is classified `within-node-edit` and applied unmodified
  (deliberate whitespace authoring)

## REMOVED Requirements

### Requirement: Document text is never modified by this layer
**Reason**: Superseded by the node-edit-enforcement verdict layer — the funnel now
rewrites or vetoes recognized boundary-crossing user edits, so an unconditional
never-modify contract no longer describes the system.
**Migration**: The guarantee survives in narrowed form as "Text modification is
confined to enforced verdicts" (added below): every class except user
`boundary-crossing-edit` retains the byte-identical pass-through contract, and the
fidelity of rewritten edits is governed by node-edit-enforcement's "Rewritten edits
always yield a valid tree" and "Rewritten edits are single, faithful undo steps"
requirements.

## ADDED Requirements

### Requirement: Text modification is confined to enforced verdicts
The funnel SHALL NOT add, remove, or alter any change spec of any transaction
classified `programmatic`, `composition`, `plugin-own`, `selection-only`, or
`within-node-edit`, under any condition — for these classes the buffer SHALL remain
byte-identical to the same dispatches applied with the filter absent. Only
transactions classified `boundary-crossing-edit` may have their changes replaced, and
only as prescribed by the node-edit-enforcement capability.

#### Scenario: Pass-through classes stay byte-identical
- **WHEN** a sequence of within-node edits, programmatic replacements, and plugin-own
  grammar operations is dispatched in an outline-mode note
- **THEN** the resulting buffer is byte-identical to the same sequence applied with
  the filter absent

#### Scenario: Off-mode is untouched by the verdict layer
- **WHEN** any boundary-crossing edit is made in a note without outline mode
- **THEN** the transaction is applied exactly as dispatched, with no classification
  or verdict recorded
