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
heading-subtree, Shift+ArrowDown); `tests/escalate.test.ts` (scope resolution,
property tests, gap-inclusive cover)

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
