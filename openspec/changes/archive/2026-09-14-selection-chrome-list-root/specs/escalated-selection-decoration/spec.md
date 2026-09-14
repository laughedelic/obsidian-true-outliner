## MODIFIED Requirements

### Requirement: Chrome anchors one level beyond the covered root's own column, not each line's own
The chrome's left edge SHALL align to the same column for every line of a COVERED ROOT's
own subtree, regardless of how much more deeply any individual descendant line (a nested
list item, code fence, blockquote, or table) is itself indented. That shared column SHALL be
one level shallower than that root's own column — the same column the root's PARENT would
render an indentation guide at, clearing the root's own marker icon (which is centered ON
its own column) rather than bisecting it. A top-level root (no parent) SHALL use an
equivalent one-level offset rather than its own column. The chrome SHALL NOT reach any
further left than this (content further left belongs to a shallower ancestor, outside the
current selection). This holds for a list-item root exactly as for any other kind: a list
item's column is its depth on the outline grid, so a nested bullet's selection starts at its
parent bullet's guide, never at the top of its list or at the view edge.

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

#### Scenario: A nested list-item root anchors to its parent's guide
- **WHEN** an escalated cover is rooted at a bullet nested one or more levels inside a list
- **THEN** the chrome's left edge sits at the column of the parent bullet's guide — one level
  out from the root's own depth — and a root one level deeper sits one level further in;
  the edge never reaches past the list's ancestors to the view edge

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
blockquote), its shallower ancestors, a mixed-depth two-root cover, a list-item root at
each of three depths, and a pure-list mixed-depth cover; a dedicated
blockquote-specific regression check (Obsidian's native blockquote side-bar rule sets
`width: 1px` on the same pseudo-element this chrome uses, which silently shrank the whole
chrome box before this rule explicitly reset `width`).
