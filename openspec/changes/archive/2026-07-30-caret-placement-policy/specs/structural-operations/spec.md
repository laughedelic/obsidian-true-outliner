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

The anchor's value for each operation is unchanged by the RENAME: the subject's own landing
line for indent, outdent, move and heading level shifts; the interior position for split,
merge and insertion; and, for deletion, the surviving neighbour the operation selects.

One deletion case does change, and direct `OpOutput` consumers should not rely on the old
value. The neighbour SHALL be a node that survives the COMBINED removal. The preference
order is unchanged — the following sibling, then the preceding one, then the nearest
ancestor — but a candidate removed by another group is skipped rather than named, so a
multi-group deletion can anchor on a farther sibling or an ancestor than before. Previously
the first group's following sibling was named even when a later group removed it, and the
anchor then degraded to line 0, which reads as a legitimate position and points at whatever
occupies it (in a note with frontmatter, the preamble). When nothing in scope survives, the
anchor SHALL be the end of what remains rather than a coordinate past the document.

#### Scenario: A multi-group deletion anchors on a survivor
- **WHEN** two adjacent sibling runs are removed as separate groups, so the first group's
  following sibling is itself removed by the second
- **THEN** the anchor names a node that still exists in the result, not the removed
  neighbour and not a degraded line 0

#### Scenario: Emptying the document yields a position inside it
- **WHEN** a deletion removes every node from a note whose frontmatter has no trailing
  blank line
- **THEN** the anchor is a real position in the resulting text — the end of what remains —
  rather than one line past its end

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
