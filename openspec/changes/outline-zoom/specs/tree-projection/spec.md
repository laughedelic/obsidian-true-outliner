## ADDED Requirements

### Requirement: A node's subtree is available as a document in its own right
Given a document and one of its nodes, the algebra SHALL produce a document containing exactly
that node and its descendants, with the node at the root: no ancestors, no siblings, no preamble.

Like a projection, this operation SHALL NOT synthesise, merge, split or rewrite nodes — every node
in the result SHALL carry the same kind, level, list style, own lines and trailing gap as its
counterpart in the source, and SHALL retain its source parent-child relationships.

Unlike a projection, depth SHALL be RE-ROOTED rather than preserved: the subject node SHALL be at
depth 0 in the result whatever its depth in the source, and its descendants SHALL count outward
from it. This is the difference that makes the two operations siblings rather than one operation —
a projection keeps every ancestor of a match precisely so a match's depth is its source depth, and
a re-rooted subtree keeps none precisely so it is not.

The result SHALL satisfy the same consumer contract a projection does: any pure consumer of a
parsed document, including the decoration fact layer, SHALL accept it without special-casing and
derive the facts those nodes' relative depths call for.

Because a node's subtree occupies a contiguous run of source lines and the result has no preamble,
a line in the result SHALL correspond to the source line at the same offset from the subject
node's own start line.

#### Scenario: The subject is at depth 0 whatever its source depth
- **WHEN** a node four levels deep is taken as a document
- **THEN** it is the result's only root, at depth 0, with its children at depth 1

#### Scenario: Nothing outside the subtree survives
- **WHEN** a node with ancestors, siblings and a document preamble is taken as a document
- **THEN** none of them appear in the result

#### Scenario: Node content is carried through unmodified
- **WHEN** any node appears in the result
- **THEN** its kind, heading level, list style, own lines and trailing gap are identical to the
  source node's

#### Scenario: The decoration fact layer accepts it
- **WHEN** decoration facts are derived from a re-rooted subtree
- **THEN** the derivation succeeds and emits one fact per line, with the subject's own facts at
  depth 0

#### Scenario: A leaf node yields a single-node document
- **WHEN** a node with no children is taken as a document
- **THEN** the result contains exactly that node, and this is a normal result rather than an error

#### Scenario: Lines map by a constant offset
- **WHEN** a node whose subtree begins at source line N is taken as a document
- **THEN** line K of the result is line N + K of the source
