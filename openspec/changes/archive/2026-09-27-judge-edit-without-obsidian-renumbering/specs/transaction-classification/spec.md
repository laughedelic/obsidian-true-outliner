## ADDED Requirements

### Requirement: A transaction is judged on the user's own changes
A transaction's class and its verdict SHALL be computed from the user's own changes. A
change another filter appends to the user's edit to renumber an ordered list is not
one of them: a change that replaces exactly one line's ordered marker — its number, its
delimiter and the space after it — with a number of different text, the same delimiter
and the same space SHALL be set aside before the transaction is classified, as long as at least
one other change remains. Changes SHALL be read individually for this, so that a
set-aside change touching one of the user's is separated from it; the user's own
changes that touch each other are read joined, as they are with nothing set aside. A
`rewrite` replaces the whole transaction, the set-aside changes included; a `pass` keeps
them, and what is dispatched for a pass — the set-aside changes with it — is what
`outline-zoom`'s escape check judges.

*(Added 2026-09-27, `judge-edit-without-obsidian-renumbering`: Obsidian's "Smart lists"
appends its renumbering to the user's transaction before the enforcement filter sees
it. "Multi-range user edits receive verdicts" then read every deletion of an ordered
item with following siblings as an unmodelled multi-range edit, and a linewise cut
arrived joined with the renumbering after it as one range across two nodes
(`docs/research/obsidian-list-renumbering`).)*

#### Scenario: An appended renumbering does not decide the verdict
- **WHEN** the user deletes the line `2. b` of `1. a` / `2. b` / `3. c`, and the
  transaction also carries a change rewriting `3. ` to `2. `
- **THEN** the verdict is the one the deletion alone receives, and the note reads
  `1. a` / `2. c`

#### Scenario: An appended renumbering does not decide the class
- **WHEN** the user deletes `b` from `   1. ab` in `1. p` / `   1. ab` / `2. `, and the
  transaction also rewrites `   1. ` to `   2. ` and `2. ` to `3. `
- **THEN** the transaction is classified `within-node-edit` and passes, as the deletion
  alone would

#### Scenario: A linewise cut is read apart from the renumbering it touches
- **WHEN** the caret is in `2. b` in `1. a` / `2. b` / `3. c`, nothing is selected, the
  user cuts, and the transaction also rewrites `3. ` to `2. `, starting where the cut
  ends
- **THEN** the cut is classified and judged on its own, and the note reads
  `1. a` / `2. c`

#### Scenario: A change that rewrites more than a marker's number is the user's
- **WHEN** a transaction carries a change that alters an ordered marker's delimiter, or
  text past the marker's space
- **THEN** that change is not set aside, and the transaction is judged with it

## MODIFIED Requirements

### Requirement: Multi-range user edits receive verdicts
A user edit transaction with more than one change range SHALL NOT be excluded from
verdict computation by construction. Each change range SHALL be evaluated, and the
transaction SHALL receive a verdict derived from all of them. Where any range's shape
is not one the verdict layer models, the transaction SHALL pass unmodified,
preserving today's conservative default. The ranges evaluated are the user's own, as
"A transaction is judged on the user's own changes" separates them.

*(Added 2026-07-25, `fix-orphan-gap-on-node-deletion`: the verdict layer previously
declined any transaction with more than one change range unconditionally — a
deliberate conservative bias from `outline-edit-enforcement` D1 that left escalated
multi-range selections, reachable by ordinary multi-cursor gestures, unenforced.)*

#### Scenario: Deleting a multi-range selection of exact covers is enforced
- **WHEN** the user deletes a selection consisting of two ranges, each exactly
  covering a whole subtree
- **THEN** a verdict is computed and the result is a structural deletion of both
  subtrees

#### Scenario: An unmodelled multi-range edit still passes
- **WHEN** a multi-range edit contains a range whose shape the verdict layer does not
  model
- **THEN** the transaction passes unmodified, as it does today


### Requirement: Programmatic and remote transactions pass through untouched
Transactions carrying no `userEvent` annotation, carrying undo/redo history
signatures, or carrying the `set` annotation Obsidian uses when reconciling an
external file change into an open editor SHALL be classified `programmatic` and
passed through with changes and selection untouched. This SHALL hold for
full-document loads and sync/external-reload style replacements, preserving the
interop guarantee that other tools' edits are never fought or rewritten.

A transaction whose only `userEvent` is `input.renumber`, the one Obsidian's live list
renumbering appends, SHALL be read as carrying no `userEvent`: a dispatch with none of its
own is classified `programmatic` whether or not Obsidian renumbered around it.

*(Amended 2026-09-27, `judge-edit-without-obsidian-renumbering`: a combined transaction
answers `userEvent` from its first annotation, so an unannotated dispatch that Obsidian
renumbered around answered Obsidian's, and was classified by shape.)*

#### Scenario: External-style full-document replacement
- **WHEN** the document is replaced programmatically (a `setValue`-style dispatch with
  no user event, as an external reload or sync would produce)
- **THEN** the transaction is classified `programmatic` and applied byte-identically,
  including its selection

#### Scenario: Undo restores state without re-normalization
- **WHEN** the user invokes undo after any classified transaction
- **THEN** the history transaction passes through unmodified and restores the prior
  state exactly

#### Scenario: An unannotated dispatch stays programmatic when Obsidian renumbers around it
- **WHEN** a dispatch with no `userEvent` deletes the text `2. b` of `1. a` / `2. b` /
  `3. c`, and the transaction also carries Obsidian's renumbering under `input.renumber`
- **THEN** it is classified `programmatic` and applied as it came, Obsidian's numbers
  included

**Covered by**: `e2e-tests/specs/60-transaction-classification.e2e.ts` ("setValue-style and
external replacements…", "undo restores state exactly…" — which also records the
finding that on desktop Obsidian's undo bypasses the filter entirely, a stronger
guarantee; under mobile emulation the bypass is platform-dependent, see
docs/research/open-questions Q14), and `62-outline-edit-enforcement.e2e.ts` ("an
unannotated dispatch…")
