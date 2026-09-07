## ADDED Requirements

### Requirement: A split is refused when its destination is outside the zoom scope
While a zoom scope is active (`outline-zoom`), a keypress that would place a new node in the zoom
root's SIBLING scope SHALL be refused — consuming the key, leaving the document unchanged, and
surfacing the standard rejection cue with the same typed reason the structural operations use for
leaving the scope. A sibling of the zoom root is outside the visible range, so the node would be
created where the user cannot see it.

The judgement SHALL be made on the DESTINATION SCOPE this capability already defines for each
case, NOT on whether the node being split is the zoom root. Splitting the zoom root is not by
itself out of scope: this capability sends an Enter at a node's content end to its CHILD scope
when the node has children, and makes an interior split's remainder a FIRST CHILD for a node with
children and for a heading always. Every one of those destinations is inside the zoom root's
subtree, and each SHALL be allowed.

The cases that resolve to the zoom root's sibling scope SHALL be refused: an Enter at the zoom
root's content START, an Enter at its content END when it has no children, and an interior Enter
on a childless non-heading zoom root. An Enter on a zoom root that is an EMPTY list item SHALL
also be refused, because this capability makes that keypress outdent or unwrap the item rather
than split it, which moves the zoom root itself.

A split anywhere inside the zoom root's subtree other than on the root SHALL be unaffected, and a
keypress the grammar declines for its own reasons SHALL keep that reason rather than acquiring
this one.

The structural keys — indent, outdent, move up and move down — resolve an operand rather than a
destination scope, and their refusal is stated once over that operand in
`selection-structural-ops`, so it is not restated here and the two cannot drift apart.

#### Scenario: Enter at the end of a childless zoom root is refused
- **WHEN** the zoom root has no children, the caret sits at the end of its own line, and the user
  presses Enter
- **THEN** no node is created, the document is unchanged, and the cue names the zoomed view

#### Scenario: Enter at the end of a zoom root with children creates a first child
- **WHEN** the zoom root has children, the caret sits at the end of its own line, and the user
  presses Enter
- **THEN** the new empty position is created in the root's child scope, inside the visible range,
  exactly as it would be with no zoom

#### Scenario: An interior Enter on a heading zoom root creates a child
- **WHEN** the zoom root is a heading and the user presses Enter in the middle of its text
- **THEN** the remainder lands as the heading's first child, inside the visible range

#### Scenario: Enter at the zoom root's content start is refused
- **WHEN** the caret is at the zoom root's content start and the user presses Enter
- **THEN** nothing is created above it and the document is unchanged

#### Scenario: Enter on an empty list-item zoom root is refused
- **WHEN** the zoom root is a list item with no content of its own and the user presses Enter
- **THEN** it is neither outdented nor unwrapped, and the document is unchanged

#### Scenario: Enter inside a child still splits
- **WHEN** the caret is inside a direct child of the zoom root and the user presses Enter
- **THEN** the child splits exactly as it would with no zoom

#### Scenario: Shift+Enter on the zoom root is unaffected
- **WHEN** the caret is in the zoom root's own line and the user presses Shift+Enter
- **THEN** the node continues onto a new line as it does with no zoom, since a continuation
  creates nothing outside the scope
