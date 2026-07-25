## ADDED Requirements

### Requirement: A change exactly covering whole subtrees is a boundary-crossing edit
A user change whose range exactly covers one or more whole subtrees — including each covered
subtree's owned trailing gap — SHALL be classified `boundary-crossing-edit` so that it reaches
the verdict layer, even when the raw line span it touches falls inside a single node. Cover
recognition SHALL reuse the exported cover computation rather than deriving subtree bounds a
second time.

#### Scenario: Deleting one exactly-selected node reaches the verdict layer
- **WHEN** the user deletes a selection that exactly covers a single node's whole subtree
- **THEN** the transaction is classified `boundary-crossing-edit` and a verdict is computed,
  rather than passing as a within-node edit

#### Scenario: An ordinary within-node deletion is unaffected
- **WHEN** the user deletes a few characters inside a node's text
- **THEN** the transaction is still classified `within-node-edit` and passes unmodified

### Requirement: Multi-range user edits receive verdicts
A user edit transaction with more than one change range SHALL NOT be excluded from verdict
computation by construction. Each change range SHALL be evaluated, and the transaction SHALL
receive a verdict derived from all of them. Where any range's shape is not one the verdict
layer models, the transaction SHALL pass unmodified, preserving today's conservative default.

#### Scenario: Deleting a multi-range selection of exact covers is enforced
- **WHEN** the user deletes a selection consisting of two ranges, each exactly covering a whole
  subtree
- **THEN** a verdict is computed and the result is a structural deletion of both subtrees

#### Scenario: An unmodelled multi-range edit still passes
- **WHEN** a multi-range edit contains a range whose shape the verdict layer does not model
- **THEN** the transaction passes unmodified, as it does today
