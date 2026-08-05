## MODIFIED Requirements

### Requirement: An exact whole-node or whole-subtree selection cover renders block-level chrome
When the current editor selection contains a non-empty range that covers a single node's
whole subtree, or a FOREST of whole subtrees — starting exactly at the covered node(s)'
first character, and reaching at least their last content character (whether it ends
precisely there or extends further into that same node's own trailing gap, as the gap-line
escalation trigger's expand-only rule retains) — every line that span covers SHALL render
distinguishing block-level highlight chrome. A range that does not reach this cover, or
that starts short of it, SHALL render no additional chrome.

Recognition SHALL be derived from the selection's current bounds against the document tree
— never from how the selection was produced — so a hand-made selection that happens to
match is decorated identically to an escalated one.

The covered roots MAY sit at different depths (`selection-as-subtree-set`). Chrome SHALL be
rendered for each covered root over that root's own subtree's lines, so a mixed-depth cover
reads as the set of subtrees it is rather than as one block at any single root's column.

#### Scenario: Escalated selection from a boundary-crossing drag gets chrome
- **WHEN** a drag selection escalates to a whole-subtree forest cover (per
  `node-selection-enforcement`)
- **THEN** every line of that cover renders the block-level selected-node chrome

#### Scenario: A drag past a node's end onto its trailing gap gets chrome
- **WHEN** the user drag-selects from the middle of a node's text down onto the blank
  line that follows it (the gap-line escalation trigger), landing on the gap rather
  than exactly at the node's last content character
- **THEN** the block-level chrome still renders for that node's whole subtree

#### Scenario: Selection that merely resembles a cover also gets chrome
- **WHEN** the user selects exactly a node's own full single line of text through
  ordinary native gestures (e.g. Home then Shift+End), without any boundary crossing
- **THEN** the same block-level chrome renders, since the current selection's bounds
  match that node's cover regardless of how the selection was produced

#### Scenario: A mixed-depth forest renders chrome per root
- **WHEN** the selection covers a nested item's subtree and a following shallower item's
  subtree
- **THEN** each covered root's own lines get chrome anchored from that root, and neither
  subtree is drawn as though it sat at the other's depth

#### Scenario: A within-node partial-content selection gets no chrome
- **WHEN** the user selects part, but not all, of a single node's own content, without
  reaching its trailing gap
- **THEN** only the native character-level highlight renders; no block-level chrome
  appears

#### Scenario: Cursors never get chrome
- **WHEN** the selection is an empty range (a cursor), anywhere including on a node
  boundary or a gap line
- **THEN** no block-level chrome renders

**Covered by**: `e2e/specs/63-selection-visual-treatment.e2e.ts` (drag-past-boundary,
whole-line-text match, mixed-depth forest, partial-content, cursor); a pure-module test
suite for the cover-membership query, mirroring `tests/escalate.test.ts`'s property style.

### Requirement: Chrome anchors one level beyond the covered root's own column, not each line's own
The chrome's left edge SHALL align to the same column for every line of a COVERED ROOT's
own subtree, regardless of how much more deeply any individual descendant line (a nested
list item, code fence, blockquote, or table) is itself indented. That shared column SHALL be
one level shallower than that root's own column — the same column the root's PARENT would
render an indentation guide at, clearing the root's own marker icon (which is centered ON
its own column) rather than bisecting it. A top-level root (no parent) SHALL use an
equivalent one-level offset rather than its own column. The chrome SHALL NOT reach any
further left than this (content further left belongs to a shallower ancestor, outside the
current selection). A list-item root has no additive column of its own (list indentation is
deferred entirely to native rendering, consistent with how indentation guides already treat
list-item ancestors) — its own line's shift, less one level, is used as the target instead.

A cover with SEVERAL roots at different depths (`selection-as-subtree-set`) SHALL resolve
this column independently PER ROOT, over that root's own subtree's lines. The edge is
therefore stepped, one step per root, rather than shared across the whole cover. Roots tile
the cover's span contiguously, so every covered line takes exactly one root's column. Taking
the cover's start line's column for every line would pin the whole selection to its DEEPEST
root's column, since a forest's roots run deepest-first, and would leave a shallower root's
own line outside its own highlight.

#### Scenario: A selected section's nested list/code/blockquote/table all align to one edge
- **WHEN** an escalated cover is rooted at a single heading and spans a nested list item, a
  code fence, a blockquote, and a table at various (deeper) depths
- **THEN** every one of those lines' chrome renders with its left edge at the SAME
  absolute column, one level shallower than the root heading's own column — none of
  them show a gap between that column and their own (more deeply indented) content

#### Scenario: Each root of a mixed-depth cover anchors to its own column
- **WHEN** an escalated cover has two roots at different depths — a nested item and a
  following shallower item
- **THEN** each root's own subtree lines take that root's own one-level-out column, so the
  shallower root's own line sits inside its own highlight rather than to the left of an
  edge computed from the deeper root

#### Scenario: Chrome clears the covered root's own marker instead of bisecting it
- **WHEN** an escalated cover is rooted at a heading that has its own marker icon
- **THEN** the chrome's left edge sits to the left of that marker's own column, so the
  marker renders fully inside the tinted region rather than being cut through its middle

#### Scenario: Chrome never reaches into a shallower ancestor's own territory
- **WHEN** an escalated cover is rooted at a nested (e.g. H3) heading inside a deeper
  document structure (H1 > H2 > H3)
- **THEN** the shallower ancestor headings' (H1, H2) own lines render no chrome

**Covered by**: e2e coverage comparing the resolved viewport position of the chrome's
left edge across a heading root, its descendants at varying depths (list, code,
blockquote), its shallower ancestors, and a mixed-depth two-root cover; a dedicated
blockquote-specific regression check (Obsidian's native blockquote side-bar rule sets
`width: 1px` on the same pseudo-element this chrome uses, which silently shrank the whole
chrome box before this rule explicitly reset `width`).
