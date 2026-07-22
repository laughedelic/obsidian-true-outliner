# node-selection-enforcement Delta

## MODIFIED Requirements

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
