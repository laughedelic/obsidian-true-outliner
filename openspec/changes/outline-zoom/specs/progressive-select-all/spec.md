## MODIFIED Requirements

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

**While a zoom scope is active** (`outline-zoom`), the ladder SHALL be BOUNDED by that scope
rather than by the document: no rung SHALL exceed the zoom root's own whole subtree, ancestors
above the zoom root SHALL NOT contribute rungs, and the whole-outline-body rung SHALL be replaced
by the zoom root's whole subtree as the ladder's top. The fall-through to native Select All SHALL
be suppressed for as long as the zoom is active, because native Select All would select hidden
content. A press at the top of a bounded ladder SHALL leave the selection unchanged.

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

#### Scenario: While zoomed, the ladder tops out at the zoom root
- **WHEN** the user is zoomed into a node and presses Mod-A repeatedly until the selection stops
  growing
- **THEN** the largest selection reached is the zoom root's own whole subtree, and no press ever
  selects hidden content or falls through to native Select All

#### Scenario: While zoomed, ancestors above the root contribute no rungs
- **WHEN** the caret is in a grandchild of the zoom root and the user presses Mod-A repeatedly
- **THEN** the ladder climbs through that node's own rungs and its ancestors only up to the zoom
  root, and stops

#### Scenario: Clearing the zoom restores the unbounded ladder
- **WHEN** the user clears the zoom and presses Mod-A repeatedly
- **THEN** the ladder climbs to the whole outline body and falls through to native Select All
  exactly as it does with no zoom

#### Scenario: Outside outline mode, Mod-A is untouched
- **WHEN** the active file is not in outline mode and the user presses Mod-A
- **THEN** native Select All runs exactly as it does without this plugin

**Covered by**: `tests/select-all-ladder.test.ts` (unit and property tests,
mirroring `tests/escalate.test.ts`'s style, including the scope-bounded ladder);
`e2e/specs/64-progressive-select-all.e2e.ts` (real Obsidian instance, keyboard-driven);
`e2e/specs/80-outline-zoom.e2e.ts` (the bounded ladder in a live instance).
