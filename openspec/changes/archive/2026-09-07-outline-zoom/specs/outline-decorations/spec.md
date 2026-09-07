## MODIFIED Requirements

### Requirement: Indentation is additive, and every kind takes the same grid
Every node's lines SHALL carry an indentation contribution equal to `depth × unit`,
computed from the node's distance from the document root in the parsed tree — not from raw
markdown indentation or heading level. **While a zoom scope is active** (`outline-zoom`), that
distance SHALL be measured from the ZOOM ROOT instead: the zoom root contributes depth 0 and its
descendants count outward from it, and no line carries a contribution for a level above the zoom
root. Which CSS property carries that contribution SHALL be
determined by the line's RENDERED FORM, not by its node's kind: a line rendered as plain
text with no visible box of its own takes it as `padding-left`; a line that renders a
visible box of its own — an atom, or any line Obsidian replaces with an opaque widget —
takes it as `margin-left`, since padding does not move a visible box's own edges.

A LIST ITEM takes its contribution in two parts, which together put it on that same grid:
`supplementalDepth × unit` as `margin-left`, where `supplementalDepth` is the count of
non-list-item ancestors above the nearest list root, plus the item's own depth WITHIN its
list, which Obsidian's own list rendering supplies once the outline unit is the unit it
renders a list level at. The plugin SHALL retarget that native rendering by supplying the
unit, and SHALL state the item's own hanging indent; it SHALL NOT reposition a list item by
overriding native rendering line by line.

Because re-basing SHALL NOT reposition a list item line by line either, only the part this plugin
supplies is re-based: a zoom root that is a list item SHALL keep the within-list depth Obsidian's
list rendering supplies. This is a stated limit of re-basing, not a defect in it, and it applies
to no other kind.

Nodes at the same tree depth SHALL receive the same indentation contribution regardless of
whether their depth is encoded via heading level, list indentation, or paragraph adjacency,
AND regardless of whether the line is currently rendered as plain text or as an opaque widget.

#### Scenario: Heading and list depth align
- **WHEN** a `### Heading` two tree-levels deep (nested under an `#` and a `##` ancestor)
  and a twice-indented list item are both visible in the same document
- **THEN** both render the same indentation contribution

#### Scenario: A list shifts as a whole under a non-list ancestor, and steps by the unit within itself
- **WHEN** a list sits under a heading
- **THEN** the list's start position shifts right by the heading's own depth contribution,
  and each of its own nesting levels is one unit from the last — the same unit the heading
  levels use

#### Scenario: Multiline continuation lines match their node's first line
- **WHEN** a paragraph or list item spans multiple physical lines (via a hard line break)
- **THEN** every continuation line carries the same indentation contribution as the node's
  first line

#### Scenario: A widget-rendered line aligns with its same-depth plain siblings
- **WHEN** a line whose node is NOT an atom (e.g. a paragraph consisting of a note embed,
  `![[Another note]]`) is rendered by Obsidian as an opaque replacement element, and a plain
  paragraph sits at the same tree depth in the same document
- **THEN** both start at the same column — the widget-rendered line's indentation
  contribution is its node's, exactly as though it had rendered as plain text

#### Scenario: A zoomed heading renders at the left margin
- **WHEN** the user zooms into a heading two levels deep
- **THEN** it carries no indentation contribution from this plugin, and its children carry one
  unit

#### Scenario: A zoomed list item keeps its within-list indentation
- **WHEN** the user zooms into a twice-nested list item
- **THEN** its `supplementalDepth` contribution is gone and the within-list depth Obsidian's list
  rendering supplies is unchanged

#### Scenario: Clearing the zoom restores document-root depths
- **WHEN** the user clears an active zoom
- **THEN** every line's indentation contribution is identical to its pre-zoom value

**Covered by**: `tests/decorate.test.ts` and `tests/project.test.ts` (the re-based facts come from
decorating the zoom root's subtree as a document, so they are covered by the same detached-tree
guarantee `tests/projection-decorate.test.ts` already pins);
`e2e/specs/50-decorations.e2e.ts` and `e2e/specs/56-list-grid.e2e.ts` for the unzoomed grid;
`e2e/specs/80-outline-zoom.e2e.ts` for re-basing in a live instance, including the list-item
root's retained within-list indentation.

### Requirement: Markers are fixed-size and coexist with native and guide chrome
A marker's size SHALL NOT vary with the kind, heading level, or font size of the line it sits
on: every marker a surface draws SHALL render at one size. A surface MAY choose what that size
is, including expressing it relative to its own text, provided the size is the same for every
line that surface renders — the invariant is that a heading's marker is no larger than a
paragraph's, not that any particular unit is used to say so.

A marker SHALL NOT remove, replace, or visibly collide with Obsidian's native blockquote bar,
the CSS containment/specificity rules widget atoms carry, or Obsidian's native fold chevron on
a heading.

A marker in the EDITOR is also a control: it SHALL accept pointer events, show a pointer cursor,
brighten to the accent while the pointer is on it, and zoom into its node when clicked
(`outline-zoom`). The accent is what names the node the gesture would act on, which a cursor alone
does not. Where a node's mark is Obsidian's own — a list item's bullet or number — that element
SHALL be the control instead, and SHALL be reachable: a native affordance whose invisible hit area
covers it SHALL NOT take the click, while every pixel that affordance actually PAINTS SHALL keep
it. This SHALL hold for every list item, whether or not it is foldable. A marker a surface draws as
pure chrome, in a lineage row or a trail, is not a node mark and SHALL keep that surface's own
behaviour.

#### Scenario: Marker size is font-size-independent
- **WHEN** a marker renders on a heading line and on a paragraph line
- **THEN** its rendered width and height are identical despite the heading's larger font

#### Scenario: Blockquote native bar and marker coexist
- **WHEN** a blockquote line also carries a marker
- **THEN** both Obsidian's native colored bar and the marker render, neither clobbering the
  other

#### Scenario: A depth-0 widget atom's marker is not clipped
- **WHEN** a table with no ancestor (tree depth 0) renders a marker
- **THEN** the marker is fully visible, not clipped by Obsidian's native `contain: paint`
  containment

#### Scenario: Fold chevron stays clear of the marker and any active guide
- **WHEN** a heading has a foldable child, so Obsidian renders its native fold chevron
- **THEN** the chevron does not overlap the heading's own marker or an ancestor's guide
  line passing through the same row

#### Scenario: A list item's mark is reachable past the fold indicator
- **WHEN** the user clicks the bullet or number of a FOLDABLE list item, whose native collapse
  indicator's hit area covers it
- **THEN** the click reaches the mark

#### Scenario: A mark under the pointer says which node it would act on
- **WHEN** the pointer rests on a marker
- **THEN** the marker shows the accent, as the node in play does elsewhere

**Covered by**: `e2e/specs/52-block-markers-icons.e2e.ts` (as before, for size, coexistence,
containment and the chevron); `e2e/specs/80-outline-zoom.e2e.ts` for the marks as controls.

## ADDED Requirements

### Requirement: Indentation guides re-base with the zoom scope
While a zoom scope is active, the indentation guides drawn for a visible line SHALL correspond to
its depth relative to the zoom root, on the same single column definition every other layer reads.
Guides representing levels above the zoom root SHALL NOT be rendered at all, so the zoomed view
shows no guide column standing in for hidden ancestors.

Clearing the zoom SHALL restore every line's guides exactly as they were before it.

#### Scenario: No guide column for hidden ancestors
- **WHEN** the user zooms into a node three levels deep
- **THEN** its own line carries no ancestor guide column, and its children carry exactly one

#### Scenario: Guides are restored on zoom out
- **WHEN** the user clears the zoom
- **THEN** every line's guides are identical to their pre-zoom rendering
