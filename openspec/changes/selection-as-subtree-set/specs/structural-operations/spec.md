## ADDED Requirements

### Requirement: A subtree payload's roots normalize to the destination level
When a payload of whole subtrees is inserted at a destination, its ROOTS SHALL become
siblings at the destination's depth, regardless of the depths they occupied at their
source, and each root's own internal relative structure SHALL be preserved exactly. A
payload whose roots came from different depths SHALL NOT attempt to preserve the depth
differences between roots — with the roots' common ancestor absent from the payload,
those differences have nothing to be relative to.

#### Scenario: Roots from two different depths land as siblings
- **WHEN** a payload consisting of a deeply nested item's subtree followed by a top-level
  item's subtree is inserted at some destination depth
- **THEN** both roots appear at the destination depth as siblings, each with its own
  descendants at their original relative offsets beneath it

#### Scenario: A single root is unaffected
- **WHEN** a payload of exactly one subtree is inserted
- **THEN** the behavior is the existing one — the root takes the destination depth and its
  descendants keep their relative structure
