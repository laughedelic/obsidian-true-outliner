## MODIFIED Requirements

### Requirement: Boundary-crossing selections escalate to whole sibling subtrees
In outline mode, when a `selection-only` transaction contains a non-empty range whose
anchor and head resolve to different nodes of the parsed tree, the filter SHALL replace
that range with the minimal contiguous cover of whole sibling subtrees that also
contains the original range: the run of children of the ends' deepest common ancestor
scope that spans both ends, extended at least from the first subtree's first character
to the last subtree's last character, INCLUDING the last subtree's own trailing
gap in full. A node is never partially selected together with content outside it, and a
covered node's owned trailing gap is never partially included — reaching any point of a
node's own content by crossing into it is enough to pull its whole gap into the cover,
with no separate drag onto the blank line required.

This requirement governs ranges the filter RECEIVES: pointer drags, stale or
programmatically restored ranges, and any other gesture that produces a raw
boundary-crossing range. It no longer governs `Shift+ArrowUp`/`Shift+ArrowDown`, which
`node-selection-extension` intercepts at the keymap and which dispatch exact covers this
layer leaves unchanged — its keyboard scenario is re-pointed accordingly, so no scenario
here attributes behavior to escalation that escalation no longer produces.

#### Scenario: Drag from mid-paragraph into the next paragraph
- **WHEN** the user drag-selects from the middle of one paragraph node into the middle
  of the next sibling paragraph
- **THEN** the selection becomes both paragraphs in full, including the second
  paragraph's own trailing gap

#### Scenario: Selection leaving a parent covers its subtree
- **WHEN** a selection starts inside a heading's text and ends inside a paragraph
  within that heading's section
- **THEN** the selection covers the heading's entire subtree (the heading line and all
  nodes in its section), including the section's last node's owned trailing gap

#### Scenario: A raw crossing range from any other source still escalates
- **WHEN** a `selection-only` transaction applies a range crossing from inside one node
  into the next by some means other than the extension keymap — a pointer drag, or a
  restored range that later becomes user-owned
- **THEN** the resulting selection covers both nodes' subtrees in full, including the
  second node's owned trailing gap

#### Scenario: Keyboard selection crossing a boundary
- **WHEN** the user extends a selection with Shift+ArrowDown from inside one node into
  the next node
- **THEN** the resulting selection covers both nodes' subtrees in full, including the
  second node's owned trailing gap

#### Scenario: Reaching a node's content is enough, no second drag onto its gap needed
- **WHEN** the user drag-selects from the middle of one node's text to the middle of
  the next sibling node's text, stopping there without continuing further down onto
  that sibling's blank trailing gap line
- **THEN** the selection already includes the second node's whole owned trailing gap

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (forward/backward drags,
heading-subtree); `tests/escalate.test.ts` (scope resolution, property tests,
gap-inclusive cover). Keyboard extension is covered by `node-selection-extension`'s own
suites instead.

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
`docs/research/13` ("Gap-line cursor transparency"); see the `content-space-navigation`
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
