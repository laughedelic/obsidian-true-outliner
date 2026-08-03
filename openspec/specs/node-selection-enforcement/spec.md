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
### Requirement: Within-node content selections and cursors are untouched
Selection ranges whose two ends both rest on a single node's own content lines SHALL
pass through unmodified.

Cursor (empty range) placement is no longer this layer's concern. The marker-clamp
mechanism this requirement previously defined — redirecting a cursor landing inside a
list item's marker prefix to its content-start column — is SUPERSEDED by
`content-space-caret`'s general rule that only content positions are addressable at all,
which subsumes the marker case and additionally covers gap lines. Its former guarantee
that GAP-LINE cursor placement stays byte-for-byte native is REVERSED for outline mode:
a caret can no longer be placed on a gap line, and a placement that would land there
resolves to the owning node's content end. Both changes are deliberate reversals of
invariants adopted in Phase B and recorded as needing their own design pass in
`docs/research/13` ("Gap-line cursor transparency"); see the `content-space-caret`
change's design.md (D1, D2, D11) for the rationale, including the measured finding that
the clamp's claimed input-agnosticism did not hold — Home reached positions ArrowLeft and
mouse clicks were both prevented from reaching.

Outside outline mode, cursor placement remains byte-for-byte stock, as it always was.

#### Scenario: Double-click word selection
- **WHEN** the user double-clicks a word inside a node
- **THEN** the native word selection is applied unmodified

#### Scenario: Within-node drag stays character-level
- **WHEN** the user drag-selects between two points on the same node's content lines
- **THEN** the native character-level selection is applied unmodified

#### Scenario: Cursor placement is never escalated
- **WHEN** the user clicks to place the cursor anywhere, on a gap line or otherwise
- **THEN** ESCALATION never moves it — this layer only ever widens non-empty ranges, and
  an empty range passes through `escalateRanges` untouched, exactly as before
- **AND** where that cursor may REST is now `content-space-caret`'s rule rather than this
  layer's: in outline mode a gap-line click resolves to the owning node's content end.
  The two mechanisms are separate, and only the second one changed.

#### Scenario: Cursor placement is governed by the caret capability
- **WHEN** any gesture would place the cursor on a gap line or inside a list item's
  marker prefix in outline mode
- **THEN** the resulting position is determined by `content-space-caret`, not by this
  layer, which no longer moves empty ranges at all

#### Scenario: Left arrow at a list item's content start jumps into the marker prefix, redirected to content start
- **WHEN** the cursor sits at a list item's content-start column and the user presses Left
- **THEN** SUPERSEDED by `content-space-caret`: the marker prefix is not an addressable
  position, so Left does not land inside it and is no longer *redirected out* of it —
  it crosses to the previous node's content end instead, since the content-space
  neighbour of a node's first content character is the previous node, not column 0 of
  its own line. Home is likewise specified there, and no longer shares this scenario's
  outcome: see that capability's own Home/End requirement.

#### Scenario: Vertical motion onto a shorter marker line still lands on content
- **WHEN** the user moves the cursor vertically from a longer line onto a list item whose
  marker column would otherwise place the cursor before its content
- **THEN** the cursor lands at that item's content-start column — unchanged in outcome,
  but now specified and implemented by `content-space-caret`'s addressable-position rule
  rather than by this layer's marker clamp

#### Scenario: Off-mode cursor placement is untouched
- **WHEN** the user clicks on a blank line between nodes in a note without outline mode
- **THEN** the cursor lands exactly where stock Obsidian would place it

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (within-node drag,
double-click, off-mode placement); `tests/escalate.test.ts` (empty ranges pass through
`escalateRanges` unchanged); the caret capability's own suites for placement itself.

### Requirement: A selection reaching a node's trailing gap escalates to that node
When a non-empty range's ends both resolve to the same node but at least one end rests
on one of that node's trailing gap lines (rather than its content lines), the filter
SHALL escalate the range to cover the node's whole subtree, INCLUDING the node's entire
owned trailing gap — so dragging past a node's last content line, before reaching the
next node, selects exactly that one node whole, gap and all, regardless of which line of
a multi-line gap the drag actually stopped on.

#### Scenario: Drag past the end of a node into the blank line below
- **WHEN** the user drag-selects from the middle of a node's text down onto the blank
  line that follows it, without reaching the next node
- **THEN** the selection covers that node's whole subtree (and no other node), including
  its entire owned trailing gap

#### Scenario: Drag stops on the first line of a multi-blank-line gap
- **WHEN** a node's owned trailing gap spans more than one blank line (a loose-list
  gap) and the user's drag stops on the first of those blank lines
- **THEN** the selection covers the node's whole subtree including every line of its
  owned trailing gap, not only the line the drag reached

#### Scenario: Within-content drag still returns to character level
- **WHEN** the user drags into the trailing gap and then back up into the node's own
  text before releasing
- **THEN** the selection is the native character-level selection again

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` ("dragging past a node's
end onto its gap line…"); `tests/escalate.test.ts` (gap-line trigger cases,
multi-blank-line gap case)

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

### Requirement: Boundary-crossing selections escalate to a forest of whole subtrees
In outline mode, when a `selection-only` transaction contains a non-empty range whose anchor
and head resolve to different nodes of the parsed tree, the filter SHALL replace that range
with the FOREST SPAN of the two ends:

- Let `firstNode` and `lastNode` be the two ends' nodes in document order.
- If one is an ancestor of the other, the span is the ANCESTOR's whole subtree cover.
- Otherwise the span's COVERED ROOTS are the maximal subtrees of the document-order run from
  `firstNode` to `lastNode` closed under descendants: take that run, add every descendant of
  every member, and the roots are the members whose parent is not itself a member. The span
  runs from the first root's subtree start to the last root's subtree end, which includes that
  root's owned trailing gap in full. The roots MAY sit at different depths.

Equivalently, and this is the form to check an implementation against: the span begins at
`firstNode`'s own subtree start, and ends at the subtree end of the OUTERMOST ancestor-or-self
of `lastNode` whose own start line is at or after that beginning. The start needs no such
qualification — every ancestor of `firstNode` begins above it, so none can fall inside the
span. The end does, and the qualifier is what distinguishes the two cases the rule must tell
apart:

- An ancestor that begins ABOVE the span is excluded, so crossing between two children of one
  parent does NOT reach that parent's later children.
- An ancestor whose own line falls INSIDE the span is included with its whole subtree, so
  a span that swallows a node's line also swallows its descendants below `lastNode`.

The end bound SHALL NOT be stated as "`lastNode`'s own subtree end". That under-expands
whenever an ancestor of `lastNode` begins inside the span: it would select that ancestor's
entire line while leaving its later children out, which is the downward-closure violation this
requirement exists to forbid, and would orphan those children on deletion.

The span is always a SINGLE CONTIGUOUS text range. Node order is text order and subtree covers
tile the document, so a document-order run closed under descendants is an interval in document
order, and an interval in document order is contiguous text. Every ancestor of a covered node
either sits entirely above the span or is itself covered with its whole subtree — never split
across it — so nothing needs bridging.

The governing invariant is DOWNWARD CLOSURE: **no node is ever selected without its whole
subtree.** The filter SHALL NOT expand a crossing range outward to a common ancestor's sibling
run — crossing out of a scope no longer pulls that scope's own root into the selection. A
covered node's owned trailing gap is never partially included: reaching any point of a node's
own content is enough to pull its whole gap into the cover.

*(Amendment 2026-07-25, `selection-as-subtree-set`: the replaced requirement expanded to the
contiguous run of children of the deepest common ancestor scope. Its recorded rationale — that
selecting a heading without its section, or an item without its children, has no valid
structural meaning — argues for downward closure only. The outward expansion was a consequence
of the common-ancestor formulation rather than a decision, and it made a single Shift+ArrowDown
from a subtree's last child select the whole document.)*

This requirement governs ranges the filter RECEIVES: pointer drags, stale or programmatically
restored ranges, and any other gesture that produces a raw boundary-crossing range. It does not
govern `Shift+ArrowUp`/`Shift+ArrowDown`, which `node-selection-extension` intercepts at the
keymap and which dispatch exact covers this layer leaves unchanged. (Carried forward unchanged
from the replaced requirement — this change alters the cover's SHAPE, not which gestures reach
the filter.)

#### Scenario: Crossing out of a scope does not pull in the parent
- **WHEN** a selection runs from inside the last child of a subtree into the following node,
  which is that subtree's parent's next sibling
- **THEN** the selection covers exactly those two subtrees, and the parent's own line is NOT
  part of it

#### Scenario: Crossing between two siblings does not reach their later siblings
- **WHEN** a selection runs from inside one child of a parent into the next child, where the
  parent has further children after both
- **THEN** the selection covers exactly those two children's subtrees — the parent's later
  children are not included, since the span ends at the second child's own subtree end

#### Scenario: Drag from mid-paragraph into the next paragraph
- **WHEN** the user drag-selects from the middle of one paragraph node into the middle of the
  next sibling paragraph
- **THEN** the selection becomes both paragraphs in full, including the second paragraph's own
  trailing gap

#### Scenario: An end inside an ancestor still covers the whole subtree
- **WHEN** a selection starts inside a heading's text and ends inside a paragraph within that
  heading's section
- **THEN** the selection covers the heading's entire subtree, since one end's node is an
  ancestor of the other's

#### Scenario: Roots may sit at different depths
- **WHEN** a selection covers a deeply nested item and a following top-level item
- **THEN** both are covered as whole subtrees at their own depths, and no common ancestor is
  added to make them siblings

#### Scenario: An ancestor swallowed mid-span brings its later children with it
- **WHEN** a selection runs from inside a nested item under one top-level node to inside the
  FIRST child of a later top-level node, which has further children after that child
- **THEN** the later top-level node is covered as a whole subtree, including the children below
  the end point — its own line is inside the span, so downward closure takes its whole subtree
  rather than ending at the node the drag stopped in

#### Scenario: A raw crossing range from any other source still escalates
- **WHEN** a `selection-only` transaction applies a range crossing from inside one node into
  the next by some means other than the extension keymap — a pointer drag, or a restored range
  that later becomes user-owned
- **THEN** the resulting selection is the forest span of the two ends, including the last
  root's owned trailing gap

#### Scenario: Reaching a node's content is enough, no second drag onto its gap needed
- **WHEN** the user drag-selects from the middle of one node's text to the middle of the next
  sibling node's text, stopping there without continuing onto that sibling's blank trailing gap
  line
- **THEN** the selection already includes the second node's whole owned trailing gap

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (forward/backward drags,
heading-subtree, cross-scope crossing, sibling crossing with later siblings present,
ancestor-swallowed-mid-span); `tests/escalate.test.ts` (forest-span computation,
downward-closure and contiguity properties over generated trees). Keyboard extension is covered
by `node-selection-extension`'s own suites instead.

