## MODIFIED Requirements

### Requirement: Non-heading outdent moves brother to uncle
Outdent on a non-heading node SHALL make it the next sibling of its former parent
(brother→uncle), subtree included, and SHALL be rejected with `at-top-level` when the node
has no parent to escape. If the node has following siblings under the same former parent, they
SHALL be re-parented as the outdented node's own trailing children — appended, in their
original relative order, after any children the node already had — rather than remaining
under the former parent. Re-parented following siblings SHALL have their encoding recomputed
by the same context-determined rule used for the outdented node itself (Requirement:
Context-determined encoding on reparent), evaluated against their new parent (the outdented
node).

#### Scenario: Outdent with children keeps the subtree attached
- **WHEN** outdent is applied to list item `x` (child of paragraph `Para.`) where `x` has
  child `y`
- **THEN** `x` becomes `Para.`'s next sibling with `y` still its child, expressed via the
  attachment rule

#### Scenario: Outdent re-parents following siblings as the node's own children
- **WHEN** outdent is applied to the middle item of `- p\n\t- x\n\t- y\n\t- z\n` (outdenting
  `x`, which has no children of its own, where `y` and `z` are `x`'s former following
  siblings under `p`)
- **THEN** `x` becomes `p`'s next sibling, and `y`/`z` become `x`'s own children in that
  order (`- p\n- x\n\t- y\n\t- z\n`), rather than `x` jumping out past `y`/`z` while they
  remain under `p`

#### Scenario: Re-parented following siblings append after the node's pre-existing children
- **WHEN** outdent is applied to a node `x` that already has child `w`, and `x` has following
  siblings `y`, `z` under its former parent
- **THEN** `x`'s children become `[w, y, z]` in that order — `y`/`z` are appended after `w`,
  not inserted before it

#### Scenario: Outdent with no following siblings is unaffected
- **WHEN** outdent is applied to a node that is the last child of its former parent (no
  following siblings)
- **THEN** the result is byte-for-byte identical to outdent's existing behavior — no siblings
  are re-parented because none exist
