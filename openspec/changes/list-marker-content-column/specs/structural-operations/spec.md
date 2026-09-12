## MODIFIED Requirements

### Requirement: Fallback indent unit for brand-new indentation
When a structural operation materializes indentation, it SHALL take the leading
whitespace of a SIBLING AT THE DESTINATION whenever one exists — of any kind, not
list items only. Siblings share an indentation level by construction, so copying
theirs is what keeps the new node at their level; consulting only list-item siblings
made a node landing among indented siblings of another kind (an atom, a paragraph)
take the document's inferred unit instead, and a mismatch there re-parents those
siblings underneath the new node, changing the tree's shape beyond the operation.

When there is no destination sibling to copy from, the operation SHALL infer the
unit from any other indented list item in the document. When that too comes up
empty — no evidence anywhere — the operation SHALL accept an optional
caller-supplied fallback indent unit and use it instead of an unconditional default.
When no fallback is supplied, the existing two-space default SHALL still apply.
Existing-document inference SHALL still take priority over the fallback whenever it
has evidence to act on — the fallback only ever governs the true no-evidence case.

Under a LIST-ITEM parent, whatever the chosen unit, the resulting indentation
SHALL REACH that parent's content column. Every source of the unit — a sibling,
the document, the fallback — is evidence about width alone, and none of it knows
how wide the destination parent's marker is: a two-space unit under an ordered
parent whose content column is three left the new node SHORT of the column, so
the re-parse kept it a SIBLING of that parent. The operation reported success and
consumed an undo step while changing nothing structurally. This is the mirror of
the too-deep case above, and only a shortfall is repaired — indentation that
already clears the column keeps the unit the evidence chose.

The content column reached is the one `document-tree-mapping` defines: past the
marker's whole whitespace run. A bullet followed by two spaces has a content column
of three, so it is a wide marker for this rule exactly as an ordered marker is, and a
child written under it reaches three columns — the column Obsidian's own reader nests
at. Written one column short, the child was a sibling to Obsidian and, once its list
stack emptied, the child's deeper descendants after a blank line an indented code
block (`docs/research/list-marker-content-column`).

A list item is the only parent whose content column the parse REQUIRES a child to
reach, and the rule SHALL NOT extend past it. A paragraph's child list attaches by
ADJACENCY, so its column is free: an indented paragraph may own a flush-left list,
and widening a new sibling to the paragraph's own indent buries it under that list
instead of placing it beside it. Under a paragraph, heading, or root destination
the chosen indentation therefore stands as the evidence gave it.

#### Scenario: Indentation short of the destination's content column is widened
- **WHEN** a node is indented under a LIST-ITEM parent whose content column is wider
  than the unit the document infers (an ordered item, a wide marker)
- **THEN** the new indentation reaches that content column, and the re-parsed tree
  has the node as a CHILD of that parent rather than its sibling

#### Scenario: Indentation that already clears the column keeps its unit
- **WHEN** the inferred or supplied unit is wider than the destination parent's
  content column
- **THEN** that unit is used unchanged rather than narrowed to the column

#### Scenario: A paragraph destination keeps its sibling's indentation
- **WHEN** a node is indented under a paragraph that is itself indented and already
  owns a flush-left child list
- **THEN** the new node takes that child list's own indentation and lands BESIDE it,
  not widened to the paragraph's indent and nested underneath it

#### Scenario: A destination sibling's indentation wins, whatever its kind
- **WHEN** a node is placed among children that are indented with a tab and none
  of them is a list item
- **THEN** the new node is indented with that same tab, and every existing sibling
  keeps its own depth in the re-parsed tree

#### Scenario: No fallback supplied keeps the existing two-space default
- **WHEN** a node is indented under a bulleted list-item parent with no existing
  indented list item anywhere in the document, and no fallback indent unit is supplied
- **THEN** the unit chosen is two spaces, exactly as before this requirement existed,
  and it is also the final indentation — a bullet's content column is two, so there
  is nothing to pad

#### Scenario: A supplied fallback governs brand-new indentation
- **WHEN** the same indent is performed with a caller-supplied fallback of a tab
  character (or a specific space width)
- **THEN** the unit chosen is that exact unit instead of the two-space default, and
  under a bulleted parent it is the final indentation unchanged

#### Scenario: A bullet followed by two spaces is a wide marker too
- **WHEN** a node is indented under `-  a`, whose marker is followed by two spaces, with
  the two-space unit the document infers or defaults to
- **THEN** the new indentation is three columns, the re-parsed tree has the node as a
  CHILD of `-  a`, and Obsidian reads it as nested one level deeper than `-  a`

#### Scenario: A chosen unit narrower than the content column is padded, not replaced
- **WHEN** either of the two scenarios above is performed under an ORDERED parent,
  whose content column is wider than the chosen unit
- **THEN** the chosen unit still governs — the fallback is not overridden by some
  other unit — and the final indentation is that unit padded out to the content
  column, because a unit that stops short of it does not nest the node at all

#### Scenario: Existing document indentation still wins over the fallback
- **WHEN** the document already has an indented list item using tabs elsewhere, and a
  node is indented under a list-item parent with no fallback OR a spaces-based
  fallback supplied
- **THEN** the new indentation still infers tabs from the existing document content —
  the fallback never overrides an already-established indentation style
