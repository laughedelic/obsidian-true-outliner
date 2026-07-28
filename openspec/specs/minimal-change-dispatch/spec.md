# minimal-change-dispatch Specification

## Purpose
Defines how a structural operation's line-range edits become the narrowest character-level
change set that produces the same document, and the cursor guarantees that follow from it.
Covers the shared narrowing choke point every structural dispatch site goes through (the
keyboard grammar, the edit-enforcement rewrites, and the command-palette commands), the
byte-identical-document property that bounds it, and how indent and outdent derive their
resulting cursor by mapping rather than from the operation's own semantic choice — which
is what lets repeated undo/redo stay correct without recording anything into history.
Architecture and rationale: the `minimal-changesets-for-structural-ops` change's design.md;
evidence and findings: `docs/research/04-open-questions.md` Q21 and Q29.

## Requirements

### Requirement: Structural operations dispatch minimal character-level change sets
A structural operation's line-range edits SHALL be narrowed, before dispatch, into the
narrowest set of character-level `EditorChange` ranges that produce the same resulting
document as applying the edits wholesale. Unchanged leading and trailing lines within an
edit's line range SHALL be excluded, and within a changed line the common character
prefix and suffix SHALL be trimmed so only the differing middle span is included.

This narrowing SHALL happen at the single choke point shared by every structural
dispatch site — the outline keyboard grammar, the edit-enforcement rewrite path, and the
command-palette structural commands — so no dispatch site can produce whole-region
change sets by omission.

#### Scenario: Indent emits per-line minimal insertions
- **WHEN** Tab indents a node that has one child, adding one leading tab character to
  each of the node's own lines
- **THEN** the dispatched change set contains one single-character insertion per changed
  line, at that line's own indentation boundary, and no unchanged line appears in the
  change set

#### Scenario: Outdent emits per-line minimal deletions
- **WHEN** Shift+Tab outdents a node, removing one leading tab character from each of
  its lines
- **THEN** the dispatched change set contains one single-character deletion per changed
  line, and no unchanged line appears in the change set

#### Scenario: Merging two paragraphs emits a single minimal deletion
- **WHEN** Backspace at a node's content start merges it into the preceding node,
  removing the line break and any indentation between them
- **THEN** the dispatched change set contains a single change spanning only the removed
  line-break span, not the two paragraphs' full text

#### Scenario: A gap line that doesn't change is excluded
- **WHEN** a structural operation's rewritten region includes a blank gap line whose
  text is identical before and after the operation
- **THEN** that gap line does not appear in the dispatched change set

### Requirement: The resulting document is byte-identical to whole-region dispatch
For any structural operation on any document, applying the minimal change set SHALL
produce a document byte-identical to applying that operation's edits as whole-region
line replacements, and byte-identical to the operation's own computed result document
(`parse(encode(surgery))`).

#### Scenario: Minimal and whole-region dispatch agree
- **WHEN** any structural operation's edits are turned into a change set, by either the
  minimal per-change narrowing or the prior whole-region replacement
- **THEN** applying either change set to the pre-operation buffer produces the exact
  same resulting text

### Requirement: Minimal change sets preserve document order and non-overlap
When one edit expands into multiple character-level changes, those changes SHALL be
ordered by ascending document position and SHALL NOT overlap, so they form a single
valid CodeMirror change set.

#### Scenario: Multiple changes from one edit stay ordered
- **WHEN** an edit narrows into more than one change (for example, per-line indent
  insertions across several lines)
- **THEN** the emitted changes appear in ascending position order with no overlapping
  ranges

### Requirement: Indent and outdent state a cursor computed by mapping, not the op's own semantic choice
Indent and outdent SHALL dispatch their transaction with the resulting selection computed
by mapping the pre-operation cursor forward through the minimal change set (assoc
favoring the position after any inserted text at an exact boundary), rather than using
the operation's own semantically-chosen cursor. This mapping SHALL be computed explicitly
and stated in the transaction, not left to the editor's implicit default mapping: the
editor's own default and the mapping CodeMirror's undo history later uses to restore a
redo are two different functions that disagree at an exact change boundary, and stating
the explicit mapping ourselves is what keeps a live dispatch and its eventual redo in
agreement.

The mapped position SHALL be used only when it is caret-addressable per
`content-space-caret`; otherwise the operation's own resulting cursor SHALL be used. The
position available to map is the editor's main selection HEAD, which is a caret only when
the selection is empty — with a block selection it is the cover's end, and a subtree cover
ends on the trailing gap line it owns, so mapping it forward yields a non-addressable
position. Testing the RESULT rather than the emptiness of the input also covers a caret
already parked somewhere non-addressable by a programmatic placement.

This is sound for insertions unconditionally: the user's cursor sits either outside every
changed range or at a definite side of one, so the mapping lands on the same content
column the user was at, not merely inside it. For deletions (outdent), it is sound
whenever the cursor sits outside the deleted span; a cursor sitting at or inside the
deleted span itself is a separate, narrower case covered by
`structural-history-integration`'s residual-limitation requirement, not by this one.

Other structural operations (move up/down, split, merge, paste, and the
edit-enforcement rewrite path) continue to state the operation's own explicit resulting
cursor, because their resulting position is a deliberate choice — a join point, a split
point, a moved node's new location — not something recoverable by mapping the old
position through the change set.

#### Scenario: Tab preserves the user's column, not just the node's content start
- **WHEN** Tab indents a node while the cursor is partway through the node's text (not
  at its content start)
- **THEN** the cursor lands at the same relative column within the indented text, not
  at the node's content start

#### Scenario: Shift+Tab preserves the user's column
- **WHEN** Shift+Tab outdents a node while the cursor is partway through the node's
  text
- **THEN** the cursor lands at the same relative column within the outdented text

#### Scenario: Tab at a line's very start still preserves the column
- **WHEN** Tab indents a node while the cursor sits exactly at the line's start, where
  the new marker text is inserted
- **THEN** the cursor lands immediately before the node's original text, not before the
  newly inserted marker

#### Scenario: A mapped cursor that would not be addressable is not used
- **WHEN** Tab or Shift+Tab acts while a whole-block selection is active, so the position
  being mapped is the selection's own end rather than a caret — a subtree cover ends on the
  trailing gap line it owns, and mapping that forward yields another gap position
- **THEN** the operation's own resulting cursor is used instead, so the dispatched caret is
  never left on a position the caret may not occupy

#### Scenario: Move still states an explicit cursor
- **WHEN** a node is moved up or down
- **THEN** the transaction states the moved node's own resulting cursor explicitly,
  rather than relying on mapping
