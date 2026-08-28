## Purpose

Defines the pure subset algebra over a parsed block tree: given a document and a predicate over
its nodes, which nodes survive, and what guarantees the surviving tree carries. Separately, it
defines how a projected tree's unbranching ancestor runs collapse into lineage chains for
display. Both are pure functions of a tree — no editor, no DOM, no file access — so every
surface that shows a filtered view of a document (backlinks today; zoom and search later) agrees
on what a filtered tree means.

## ADDED Requirements

### Requirement: A projection is a subset of the source tree

Given a document and a predicate over its nodes, a projection SHALL produce a document
containing exactly: every node satisfying the predicate (a MATCH), every ancestor of a match,
and every descendant of a match down to a caller-supplied depth. No other node SHALL survive.

A projection SHALL NOT synthesise, merge, split, or rewrite nodes: every surviving node SHALL
carry the same kind, level, list style, own lines and trailing gap as its counterpart in the
source. Surviving nodes SHALL appear in source document order, and each SHALL retain its
source parent-child relationships restricted to the surviving set.

#### Scenario: Only paths reaching a match survive

- **WHEN** a document contains a subtree with no matching node anywhere inside it
- **THEN** no node of that subtree appears in the projection

#### Scenario: Ancestors of a match survive even without matching themselves

- **WHEN** a match sits three levels deep
- **THEN** all three of its ancestors appear in the projection, in order, each still the parent
  of the next

#### Scenario: Descendants survive to the requested depth only

- **WHEN** a match has children, grandchildren, and great-grandchildren, and a descendant depth
  of 1 is requested
- **THEN** its children appear and its grandchildren and below do not

#### Scenario: Node content is carried through unmodified

- **WHEN** any node survives a projection
- **THEN** its kind, heading level, list style, own lines and trailing gap are identical to the
  source node's

#### Scenario: Projection is idempotent

- **WHEN** a projection is taken, and the same predicate is applied again to the result
- **THEN** the second projection is structurally identical to the first

#### Scenario: A predicate matching nothing yields an empty document

- **WHEN** no node satisfies the predicate
- **THEN** the projection contains no nodes, and this is a normal result rather than an error

### Requirement: A projection is a valid document its consumers can treat as any other

A projection SHALL be a document of the same type the parser produces, such that any pure
consumer of a parsed document — including the decoration fact layer — accepts it without
special-casing and derives the same per-node facts it would derive for those nodes in a document
where they sat at the same relative depths.

Depth in a projection SHALL be measured within the projection, not inherited from the source: a
node whose source ancestors were all pruned SHALL be at depth 0.

#### Scenario: The decoration fact layer accepts a projection

- **WHEN** decoration facts are derived from a projection
- **THEN** the derivation succeeds and emits one fact per line of every surviving node, with
  kind and atom/list-item classification matching what the same nodes yield in the source
  document

#### Scenario: Depth is relative to the projection

- **WHEN** every ancestor of a match is pruned because the caller requested no ancestors
- **THEN** the match is at depth 0 in the projection

### Requirement: Lineage chains collapse unbranching ancestor runs

A lineage pass over a projected tree SHALL group each maximal run of consecutive nodes that are
neither matches nor branch points into a single ordered lineage chain. A node is a BRANCH POINT
when it has two or more children in the projection.

A chain SHALL absorb the branch point that terminates it as the chain's last element, and the
branch point's children SHALL be presented one level below the chain. A chain terminated by a
match SHALL NOT absorb that match.

Collapsing SHALL apply recursively and independently to every sub-branch, not only to the
common prefix: after a branch point, each arm collapses on its own.

#### Scenario: An unbranching run becomes one chain

- **WHEN** a match sits under four ancestors, none of which has another surviving child
- **THEN** the four ancestors form one lineage chain in source order, and the match is presented
  one level below it

#### Scenario: The branch point terminates and joins its chain

- **WHEN** a run of single-child ancestors leads to a node with two surviving children
- **THEN** that node is the last element of the chain, and both of its children are presented
  one level below the chain

#### Scenario: Each arm of a branch collapses independently

- **WHEN** a branch point has three surviving children — a match, a one-ancestor path to a
  match, and a three-ancestor path to a match
- **THEN** the match is presented directly, and the other two arms each form their own lineage
  chain of the corresponding length, each with its match one level below it

#### Scenario: A single ancestor still forms a chain

- **WHEN** exactly one node separates the root from a branch point
- **THEN** it forms a lineage chain of one element rather than being presented as an ordinary
  node

#### Scenario: A match at the root has no chain

- **WHEN** a match has no surviving ancestors
- **THEN** no lineage chain is produced for it

### Requirement: A lineage chain identifies itself by its first element's kind

Each lineage chain SHALL expose the node kind of its first element, so a consumer can mark the
chain with the same kind notation it uses for an ordinary node. A chain SHALL also expose each
element's own text separately from the joined form, so a consumer may shorten elements without
re-deriving the chain.

#### Scenario: A chain beginning at a heading reports that kind

- **WHEN** a lineage chain's first element is a heading node
- **THEN** the chain reports the heading kind

#### Scenario: Elements remain individually addressable

- **WHEN** a lineage chain of three elements is produced
- **THEN** each element's own text is available separately, in order
