## ADDED Requirements

### Requirement: Node-splitting keys refuse to split the zoom root
While a zoom scope is active (`outline-zoom`), a keypress that would SPLIT the zoom root's own
node SHALL be refused — consuming the key, leaving the document unchanged, and surfacing the
standard rejection cue with the same typed reason the structural operations use for leaving the
scope. A split of the zoom root produces a sibling of the root, which is outside the scope and
therefore invisible.

This requirement covers the splitting keys only. The structural keys — indent, outdent, move up
and move down — resolve an operand rather than a split point, and their refusal is stated once
over that operand in `selection-structural-ops`, so it is not restated here and the two cannot
drift apart.

Every other keypress SHALL behave exactly as it does with no zoom: splitting, merging and
continuing nodes strictly inside the subtree are unaffected, and a keypress the grammar declines
for its own reasons SHALL keep that reason rather than acquiring this one.

#### Scenario: Enter on the zoom root's own line is refused
- **WHEN** the caret sits at the end of the zoom root's own line and the user presses Enter
- **THEN** no node is created, the document is unchanged, and the cue names the zoomed view

#### Scenario: Enter inside the zoom root's text is refused
- **WHEN** the caret sits in the middle of the zoom root's own text and the user presses Enter
- **THEN** the node is not split and the document is unchanged

#### Scenario: Enter inside a child still splits
- **WHEN** the caret is inside a direct child of the zoom root and the user presses Enter
- **THEN** the child splits exactly as it would with no zoom

#### Scenario: Shift+Enter on the zoom root is unaffected
- **WHEN** the caret is in the zoom root's own line and the user presses Shift+Enter
- **THEN** the node continues onto a new line as it does with no zoom, since a continuation
  creates nothing outside the scope
