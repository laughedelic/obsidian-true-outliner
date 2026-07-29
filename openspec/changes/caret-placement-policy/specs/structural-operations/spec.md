## ADDED Requirements

### Requirement: An operation result states a structural anchor, not a caret
An accepted operation's result SHALL carry a structural ANCHOR — where the operation's
subject, or the surviving neighbour it leaves behind, landed in the result tree — and
SHALL NOT be read as the caret. The caret is decided by `caret-placement-policy` from the
anchor and the surrounding facts.

The anchor is load-bearing beyond caret placement, which is why it is stated as its own
output rather than dropped. Operations return a FRESHLY RE-PARSED tree, so node identity
does not survive an operation; composing code that must locate a node across that
boundary — the enforcement layer's delete-then-splice, which needs the surviving neighbour
in the post-deletion tree — locates it by the anchor's line. Reading the caret for that
purpose conflates a decision with a fact, and makes the caret convention unchangeable
without silently changing which node a paste or type-over splices against.

The anchor's value for each operation is unchanged by this requirement: the subject's own
landing line for indent, outdent, move and heading level shifts; the interior position for
split, merge and insertion; and, for deletion, the surviving neighbour the operation
already selects.

#### Scenario: Anchor and caret can differ
- **WHEN** a structural deletion runs
- **THEN** the result's anchor identifies the surviving neighbour, while the caret is
  placed by `caret-placement-policy` at the preceding node's content end, and the two need
  not coincide

#### Scenario: Composing operations read the anchor
- **WHEN** a type-over deletes a covered range and splices replacement content against the
  surviving neighbour
- **THEN** it locates that neighbour by the deletion result's anchor, and its behaviour is
  unaffected by any change to the caret convention

#### Scenario: Operations state no caret
- **WHEN** any structural operation is called directly, outside the editor
- **THEN** its result describes the new tree, the minimal edits, and the anchor — and
  makes no claim about where a caret should go
