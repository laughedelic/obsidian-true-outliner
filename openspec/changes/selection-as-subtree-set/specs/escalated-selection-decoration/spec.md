## MODIFIED Requirements

### Requirement: An exact whole-node or whole-subtree selection cover renders block-level chrome
When the current selection exactly covers one node's whole subtree, or a FOREST of whole
subtrees, the decoration layer SHALL render block-level chrome for the covered region
instead of leaving it as native character-level highlight. Recognition SHALL be derived
from the selection's current bounds against the document tree — never from how the
selection was produced — so a hand-made selection that happens to match is decorated
identically to an escalated one.

The covered roots MAY sit at different depths (`selection-as-subtree-set`). Chrome SHALL
be rendered for each covered root, anchored one level beyond that root's own column, so a
mixed-depth cover reads as the set of subtrees it is rather than as one block at the
shallowest root's column.

#### Scenario: A single covered subtree renders chrome
- **WHEN** the selection exactly covers one node's whole subtree
- **THEN** block-level chrome is rendered for it

#### Scenario: A mixed-depth forest renders chrome per root
- **WHEN** the selection covers a nested item's subtree and a following shallower item's
  subtree
- **THEN** each covered root gets chrome anchored to its own column, and neither is drawn
  as though it sat at the other's depth

#### Scenario: A partial selection renders no block chrome
- **WHEN** the selection covers only part of a node's content
- **THEN** native character-level highlight is shown, unchanged
