## ADDED Requirements

### Requirement: An accepted operation carries fold state to the result

After an accepted structural operation, every node that was folded before it SHALL be folded
after it, at wherever the operation put it. This holds for the operand itself and for folded
nodes inside the operand, and it holds for the group forms as well as the single-node ones.

The rule is stated here because it is a property of the operation, not of any one entry point: a
command, a keyboard binding and a rewritten edit that all dispatch the same operation SHALL agree
about it. `outline-folding` states the same requirement from the folding side.

Fold state outside the operand SHALL be untouched.

#### Scenario: Move keeps the fold
- **WHEN** the move-node-down command runs on a folded node
- **THEN** the node is in its new position and still folded

#### Scenario: A group move keeps every fold in it
- **WHEN** a selection covering two subtrees, one of them folded, is moved up
- **THEN** both subtrees are in their new position and the folded one is still folded
