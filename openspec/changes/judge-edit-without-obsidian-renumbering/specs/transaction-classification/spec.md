## MODIFIED Requirements

### Requirement: Multi-range user edits receive verdicts
A user edit transaction with more than one change range SHALL NOT be excluded from
verdict computation by construction. Each change range SHALL be evaluated, and the
transaction SHALL receive a verdict derived from all of them. Where any range's shape
is not one the verdict layer models, the transaction SHALL pass unmodified,
preserving today's conservative default.

A range that another filter appends to the user's edit to renumber an ordered list is
not one of the user's ranges. A range that replaces exactly one line's ordered marker —
its number, its delimiter and the space after it — with a different number, the same
delimiter and the same space, and touches nothing else, SHALL be set aside before the
verdict is computed, as long as at least one other range remains. The verdict is then
the one the remaining ranges receive on their own. A `rewrite` replaces the whole
transaction, the set-aside ranges included; a `pass` keeps them.

*(Added 2026-07-25, `fix-orphan-gap-on-node-deletion`: the verdict layer previously
declined any transaction with more than one change range unconditionally — a
deliberate conservative bias from `outline-edit-enforcement` D1 that left escalated
multi-range selections, reachable by ordinary multi-cursor gestures, unenforced.
Amended 2026-09-27, `judge-edit-without-obsidian-renumbering`: Obsidian's "Smart
lists" appends its renumbering to the user's transaction before the verdict layer
sees it, which made every deletion of an ordered item with following siblings an
unmodelled multi-range edit
(`docs/research/obsidian-list-renumbering`).)*

#### Scenario: Deleting a multi-range selection of exact covers is enforced
- **WHEN** the user deletes a selection consisting of two ranges, each exactly
  covering a whole subtree
- **THEN** a verdict is computed and the result is a structural deletion of both
  subtrees

#### Scenario: An unmodelled multi-range edit still passes
- **WHEN** a multi-range edit contains a range whose shape the verdict layer does not
  model
- **THEN** the transaction passes unmodified, as it does today

#### Scenario: An appended renumbering does not decide the verdict
- **WHEN** the user deletes the line `2. b` of `1. a` / `2. b` / `3. c`, and the
  transaction also carries a range rewriting `3. ` to `2. `
- **THEN** the verdict is the one the deletion alone receives, and the note reads
  `1. a` / `2. c`

#### Scenario: A range that rewrites more than a marker's number is the user's
- **WHEN** a multi-range edit carries a range that changes an ordered marker's
  delimiter, or text past the marker's space
- **THEN** that range is not set aside, and the transaction is judged with it
