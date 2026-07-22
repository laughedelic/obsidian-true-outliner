# node-selection-enforcement Specification

## Purpose
Defines node-boundary selection enforcement, built on the transaction-classification
funnel: when and how a boundary-crossing selection escalates to whole-node coverage
(including single-node selection via the gap-line trigger), the expand-only and
orientation guarantees, uniform multi-range semantics, and the stock-behavior
guarantees outside outline mode and outside the funnel's jurisdiction. Architecture
and rationale: the outline-selection-enforcement change's design.md (D4/D5 and their
amendments from two real-vault manual passes); deferred selection-UX threads:
`docs/research/13`.
## Requirements
### Requirement: Boundary-crossing selections escalate to whole sibling subtrees
In outline mode, when a `selection-only` transaction contains a non-empty range whose
anchor and head resolve to different nodes of the parsed tree, the filter SHALL replace
that range with the minimal contiguous cover of whole sibling subtrees that also
contains the original range: the run of children of the ends' deepest common ancestor
scope that spans both ends, extended at least from the first subtree's first character
to the last subtree's last character. A node is never partially selected together with
content outside it.

#### Scenario: Drag from mid-paragraph into the next paragraph
- **WHEN** the user drag-selects from the middle of one paragraph node into the middle
  of the next sibling paragraph
- **THEN** the selection becomes both paragraphs in full

#### Scenario: Selection leaving a parent covers its subtree
- **WHEN** a selection starts inside a heading's text and ends inside a paragraph
  within that heading's section
- **THEN** the selection covers the heading's entire subtree (the heading line and all
  nodes in its section)

#### Scenario: Keyboard selection crossing a boundary
- **WHEN** the user extends a selection with Shift+ArrowDown from inside one node into
  the next node
- **THEN** the resulting selection covers both nodes' subtrees in full

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (forward/backward drags,
heading-subtree, Shift+ArrowDown); `tests/escalate.test.ts` (scope resolution,
property tests)

### Requirement: Within-node content selections and cursors are untouched
Selection ranges whose two ends both rest on a single node's own content lines SHALL
pass through unmodified. Empty ranges (cursors) SHALL never be moved by this layer
for GAP-LINE placement — a cursor placed on a blank gap line stays exactly where
stock Obsidian would place it, unchanged from before this amendment. For LIST-ITEM
MARKER placement, a cursor-only selection (no document change accompanies it) that
would land inside the item's marker prefix — its leading indentation, marker
character, and the single space after it, together the same span
`contentColumnCh` already treats as non-content — SHALL instead be redirected to the
marker's content-start column, regardless of the gesture that produced the position
(Left arrow, Home, a mouse click, vertical motion landing on a shorter marker line).
This applies input-agnostically, the same way node-edit-enforcement's merge
recognition reads intent from the edit/cursor shape rather than the key pressed.

#### Scenario: Double-click word selection
- **WHEN** the user double-clicks a word inside a node
- **THEN** the native word selection is applied unmodified

#### Scenario: Cursor placement is never escalated
- **WHEN** the user clicks to place the cursor on a blank gap line between nodes
- **THEN** the cursor lands exactly where stock Obsidian would place it — gap-line
  cursor placement is unchanged by this amendment (narrowed by this change: this
  guarantee no longer extends to list-item marker positions, which redirect per
  the scenarios below)

#### Scenario: Left arrow at a list item's content start jumps into the marker prefix, redirected to content start
- **WHEN** the cursor sits at a list item's content-start column and the user
  presses Left (or Home, or clicks inside the marker's rendered whitespace)
- **THEN** the cursor lands at the content-start column, never inside the marker
  prefix itself

#### Scenario: Vertical motion onto a shorter marker line still lands on content
- **WHEN** the user moves the cursor vertically from a longer line onto a list
  item whose marker column would otherwise place the cursor before its content
- **THEN** the cursor lands at that item's content-start column

**Covered by**: `e2e/specs/62-outline-edit-enforcement.e2e.ts` (marker-cursor
scenarios); a new pure-module test suite for the marker-clamp logic, mirroring
`tests/escalate.test.ts`'s own property style.

### Requirement: A selection reaching a node's trailing gap escalates to that node
When a non-empty range's ends both resolve to the same node but at least one end rests
on one of that node's trailing gap lines (rather than its content lines), the filter
SHALL escalate the range to cover the node's whole subtree — so dragging past a node's
last content line, before reaching the next node, selects exactly that one node whole.

#### Scenario: Drag past the end of a node into the blank line below
- **WHEN** the user drag-selects from the middle of a node's text down onto the blank
  line that follows it, without reaching the next node
- **THEN** the selection covers that node's whole subtree (and no other node)

#### Scenario: Within-content drag still returns to character level
- **WHEN** the user drags into the trailing gap and then back up into the node's own
  text before releasing
- **THEN** the selection is the native character-level selection again

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` ("dragging past a node's
end onto its gap line…"); `tests/escalate.test.ts` (gap-line trigger cases)

### Requirement: Escalation never shrinks the selection
An escalated range SHALL always contain the original range: escalation only ever moves
the ends outward. Ends the user placed beyond the computed subtree cover — on trailing
gap lines or at the document end — are retained, never pulled back.

#### Scenario: Select All without frontmatter is byte-identical to stock
- **WHEN** the user presses Select All in an outline-mode note with no frontmatter
- **THEN** the resulting selection spans the entire document exactly as in stock
  Obsidian, including any trailing newline

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` ("Select All without
frontmatter…"); `tests/escalate.test.ts` (containment property over generated trees)

### Requirement: Escalation preserves orientation and transaction integrity
An escalated range SHALL preserve the original anchor/head orientation (backward
selections stay backward), and the replacement SHALL occur within the same transaction
via the filter's return value — no additional dispatch, no history entry, and no
observable intermediate selection state.

#### Scenario: Backward drag stays backward
- **WHEN** the user drags a selection upward from a lower node into an upper node
- **THEN** the escalated selection covers both subtrees with the head at the start side

#### Scenario: Escalation during live drag is stable
- **WHEN** the user drags across a node boundary and continues dragging
- **THEN** each pointer update yields the escalated selection without flicker between
  native and escalated states

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (backward drag, live-drag
stability); `tests/escalate.test.ts` (orientation property); undo-stack
non-interference in `e2e/specs/60-transaction-classification.e2e.ts`

### Requirement: Multi-range selections escalate uniformly
For multi-cursor/multi-range selections, each non-empty range SHALL first be evaluated
under the same per-range rules; additionally, once any range escalates, every other
non-empty in-jurisdiction range SHALL escalate to at least its own node's whole
subtree. An escalated multi-range selection is therefore always a set of whole-subtree
ranges, so copying it yields a concatenation of complete subtrees — a structurally
valid sequence of nodes, never a mix of block-level and mid-node fragments. Cursors
(empty ranges) and preamble ranges remain untouched, and standard `EditorSelection`
normalization merges any overlapping results. When no range escalates, all ranges stay
byte-for-byte native.

#### Scenario: Two ranges, one crossing a boundary
- **WHEN** a multi-range selection has one within-node range and one boundary-crossing
  range
- **THEN** the crossing range escalates to whole subtrees and the within-node range
  escalates to its own node's whole subtree

#### Scenario: All ranges within nodes stay native
- **WHEN** a multi-range selection consists only of within-node content ranges
- **THEN** every range passes through unmodified

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (uniform multi-range,
all-within-native); `tests/escalate.test.ts` (escalateRanges cases incl. cursors and
preamble ranges)

### Requirement: Preamble and out-of-jurisdiction selections pass through
Selection ranges with either end in the document preamble (frontmatter or other content
before the first node) SHALL pass through unmodified. Select All SHALL behave exactly as
stock Obsidian.

#### Scenario: Select All is native
- **WHEN** the user presses the Select All shortcut in an outline-mode note with
  frontmatter
- **THEN** the entire document is selected exactly as in stock Obsidian

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (Select All with
frontmatter vs off-mode reference); `tests/escalate.test.ts` (preamble jurisdiction)

### Requirement: Enforcement is scoped to outline mode and enforced classes only
Selection escalation SHALL apply only in outline-mode editors and only to transactions
classified `selection-only`. Transactions of every other class — including
`programmatic`, `composition`, and `plugin-own` — SHALL keep their selections untouched,
and off-mode notes SHALL show byte-for-byte stock selection behavior.

#### Scenario: Off-mode drag selection is native
- **WHEN** the user drag-selects across paragraphs in a note without outline mode
- **THEN** the selection is exactly the native character-level selection

#### Scenario: Programmatic selection restore is untouched
- **WHEN** a transaction without a user event restores a mid-node selection (e.g.
  workspace restore)
- **THEN** the selection is applied exactly as dispatched, even if it crosses node
  boundaries

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (off-mode drag,
programmatic restore)

