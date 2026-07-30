# progressive-select-all Specification

## Purpose
Defines the progressive Select All ladder: repeated Mod-A presses climb node-aware
selection rungs — own content, own whole subtree, siblings run, each ancestor level in
turn, whole outline body — before falling through to native Select All at the top.
Stateless, keymap-level (not the transaction funnel), built on
`node-selection-enforcement`'s existing subtree-cover geometry (`escalate.ts`'s
`subtreeCoverOf`, gap-inclusive per `escalate-include-owned-gap`). Architecture and
rationale: the `progressive-select-all` change's design.md; originating discussion:
`docs/research/13`'s "Progressive Select All (the selection ladder)".

## Requirements

### Requirement: Repeated Mod-A climbs a node-aware selection ladder
In outline mode, pressing Mod-A (Select All) SHALL be intercepted before CM6's/
Obsidian's native Select All runs. For each range in the current selection, the
handler SHALL compute the ordered ladder of rungs for the node the range's anchor
resolves to — own content, own whole subtree (including that node's owned
trailing gap in full, per the gap-inclusive subtree-cover geometry), that node's
combined run with its siblings at the same level, each ancestor's whole subtree
and its own siblings' combined run outward to the top level, then the whole
outline body — and replace that range with the smallest rung in the sequence
that CONTAINS the range, strictly advancing past any rung the range already
exactly equals. Two adjacent rungs with identical bounds (e.g. a node's own
subtree and its siblings' run, when it has no real siblings) collapse to a
single step. When the resulting selection for every range equals the
whole-document rung, the handler SHALL NOT intercept and SHALL let native
Select All run instead, so the top of the ladder is byte-identical to stock
Select All.

#### Scenario: First press with cursor inside a leaf node selects its own content
- **WHEN** the cursor is inside a paragraph node with no children and the user
  presses Mod-A
- **THEN** the selection becomes that paragraph's own content text only, not
  its trailing gap

#### Scenario: Second press escalates to the node's whole subtree, gap included
- **WHEN** the current selection already exactly equals a node's own content rung
  and the user presses Mod-A again
- **THEN** the selection becomes that node's whole subtree, including any
  descendants and the node's own owned trailing gap in full

#### Scenario: Further presses climb through the siblings run and each ancestor
- **WHEN** the current selection already exactly equals a node's whole-subtree
  rung
- **THEN** pressing Mod-A again selects that node's combined run with its
  siblings at the same level (the parent's own line not yet included, if any);
  a further press selects the parent's whole subtree; repeated presses
  continue outward through each remaining level in turn

#### Scenario: Top of the ladder falls through to native Select All
- **WHEN** the current selection already equals the whole outline body (all
  top-level nodes, no more ancestors to climb to) and the user presses Mod-A
- **THEN** the handler does not intercept the keypress and native Select All
  produces the whole document, including any frontmatter, identical to stock
  Obsidian behavior with the plugin disabled

#### Scenario: Outside outline mode, Mod-A is untouched
- **WHEN** the active file is not in outline mode and the user presses Mod-A
- **THEN** native Select All runs exactly as it does without this plugin

**Covered by**: `tests/select-all-ladder.test.ts` (unit and property tests,
mirroring `tests/escalate.test.ts`'s style); `e2e/specs/64-progressive-select-
all.e2e.ts` (real Obsidian instance, keyboard-driven).

### Requirement: The ladder declines inside a nested editor
Mod-A SHALL decline when the view is a nested editor (a table cell's own `EditorView`),
leaving native select-all to act on the cell. The check SHALL be DOM ancestry, not file
resolution, for the reason given in `outline-keyboard-grammar`: `editorInfoField` resolves a
nested cell to the same outline-mode host file.

#### Scenario: Mod-A in a table cell is native
- **WHEN** the caret is inside a table cell whose text is `- word` and Mod-A is pressed
- **THEN** the selection is the cell's entire text including the literal `- `, not the
  ladder's content rung — the cell's text is never parsed as outline structure, so a
  leading `- ` the user typed is content, not a marker

### Requirement: Ladder progression is stateless
The handler SHALL determine the next rung solely from the CURRENT selection
compared against the ladder recomputed from the document tree on every
keypress — no press-count timer, debounce window, or stored "last rung" state
SHALL be used. A selection that does not exactly match any rung (e.g. a manual
selection made by the user, or one left over after an edit) SHALL advance to the
smallest rung that contains it, rather than requiring an exact match to a prior
rung before advancing.

#### Scenario: Interruption between presses does not break progression
- **WHEN** the user presses Mod-A once (selecting a node's own content), then
  clicks elsewhere, edits the document, or switches to another pane and back,
  then places the cursor back inside the same node and presses Mod-A again
- **THEN** the ladder starts over from that node's own content rung — no
  broken or skipped state from the earlier press

#### Scenario: A hand-made selection advances from its containing rung
- **WHEN** the user manually selects a range that falls strictly inside a node's
  whole-subtree cover but does not exactly match the node's own-content rung, and
  presses Mod-A
- **THEN** the selection becomes that node's whole subtree — the smallest rung
  containing the original selection

**Covered by**: `tests/select-all-ladder.test.ts`; `e2e/specs/64-progressive-
select-all.e2e.ts` ("is stateless: an interruption between presses restarts the
ladder from own content").

### Requirement: List-item content rung excludes the marker
For a list-item node, the "own content" rung (the first, most specific rung in
the ladder) SHALL start at the item's content-start column on its first line —
the same marker-transparent boundary used elsewhere in this project for cursor
placement and splitting — excluding the leading indentation, marker character,
and the single space after it. For heading and paragraph nodes, which have no
marker, the "own content" rung SHALL start at column 0 of the node's first line.

#### Scenario: First press on a list item excludes its marker
- **WHEN** the cursor is inside a list item's text (e.g. `- some text`) and the
  user presses Mod-A
- **THEN** the selection covers `some text` only, not the leading `- ` marker

#### Scenario: First press on a heading includes the full line
- **WHEN** the cursor is inside a heading node (e.g. `## Heading`) and the user
  presses Mod-A
- **THEN** the selection covers the entire heading line including `## `

**Covered by**: `tests/select-all-ladder.test.ts`; `e2e/specs/64-progressive-
select-all.e2e.ts` ("a list item's first press selects its content only,
excluding the marker").

### Requirement: Each range in a multi-range selection climbs its own ladder independently
When the selection has multiple ranges, the handler SHALL compute and advance
each range's rung independently against its own containing node's ladder, then
construct the resulting selection from all ranges together, allowing normal
selection-range normalization to merge any ranges that now overlap. Ranges are
not forced to a common or uniform rung as part of this ladder progression.

#### Scenario: Two ranges in sibling nodes at different depths
- **WHEN** the selection has one range inside a shallow node's own content and
  another range inside a deeply nested node's own content, and the user presses
  Mod-A
- **THEN** each range independently advances to its own node's whole subtree —
  the shallow node's range does not jump ahead to an ancestor merely because the
  other range is deeper

#### Scenario: Escalating ranges that now overlap merge into one
- **WHEN** two ranges' ladders both advance to overlapping or adjacent sibling
  subtrees such that their resulting covers touch or overlap
- **THEN** the final selection presents them as a single merged range, consistent
  with normal selection-range normalization

**Covered by**: `tests/select-all-ladder.test.ts`; `e2e/specs/64-progressive-
select-all.e2e.ts` ("each range in a multi-range selection climbs its own
ladder independently").
