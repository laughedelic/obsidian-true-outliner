# minimal-change-dispatch Specification

## Purpose
Defines how a structural operation's line-range edits become the narrowest character-level
change set that produces the same document, and the cursor guarantees that follow from it.
Covers the shared narrowing choke point every structural dispatch site goes through (the
keyboard grammar, the edit-enforcement rewrites, and the command-palette commands), the
line alignment that lets a change set describe a RELOCATION rather than an in-place rewrite
of everything it passes over, the byte-identical-document property that bounds it, and how
indent and outdent derive their resulting cursor by mapping rather than from the operation's
own semantic choice — which is what lets repeated undo/redo stay correct without recording
anything into history.

Minimality is not the goal in itself. A change set is a description of what happened, and
consumers act on that description: cursor mapping, the undo history, and the host's own
extensions all read it. A narrow but untrue description is a defect, which is how a sibling
moving past a table came to split the table.

Architecture and rationale: the `minimal-changesets-for-structural-ops` and
`aligned-change-set-narrowing` changes' design.md; evidence and findings:
`docs/research/04-open-questions.md` Q21 and Q29.

## Requirements
### Requirement: Structural operations dispatch minimal character-level change sets
A structural operation's line-range edits SHALL be narrowed, before dispatch, into the
narrowest set of character-level `EditorChange` ranges that produce the same resulting
document as applying the edits wholesale — narrowest among the sets that also satisfy
"A relocation is dispatched as a relocation" below. Where the two pull apart, that
requirement wins and the change is widened: a change set describes what happened, and a
narrower description that misdescribes it is not the better one.

Narrowing SHALL begin by ALIGNING the edit's old lines against its new lines. Any line the
edit keeps SHALL be excluded from the change set wherever it occurs — not only when it sits
at the edit's leading or trailing edge — and only the runs of lines that remain unmatched
SHALL be narrowed further. Within such a run, when the run has the same number of lines on
both sides, each line pair SHALL be diffed independently and its common character prefix and
suffix trimmed; when it does not, the run SHALL be emitted as one character-trimmed span.

Alignment SHALL match a line only when its content is unique on both sides, so that a
repeated line — a blank gap line, an identical list marker, an identical table separator —
never anchors an alignment it does not unambiguously determine. Failing to match a line that
could have been matched costs minimality only, never correctness.

Uniqueness on both sides is evidence that a line survived, not proof of it, so an alignment
SHALL be adopted on the same evidence a relocation is recognised by elsewhere in this
capability: a relocation PUTS BACK WHAT IT TAKES, so the lines the alignment removes are the
lines it inserts — all of them, in some order, since moving a block changes no line. Where
its runs show that, the alignment SHALL be adopted, and the relocation requirement below is
thereby satisfied by construction rather than by inspection. A partial correspondence SHALL
NOT count: text that repeats down a shifted chain puts SOME line back without anything having
moved, which is the same coincidence this capability rejects at line granularity.

Where the correspondence fails — something was destroyed or created, so nothing merely
moved — the alignment is one reading of
an in-place edit among others, and SHALL be adopted only where it claims fewer characters
than describing the same region in place. That comparison SHALL be made BEFORE any widening
the relocation requirement imposes, since the widening is a decision about how conservatively
to emit a reading, not evidence about which reading is true.

This narrowing SHALL happen at the single choke point shared by every structural
dispatch site — the outline keyboard grammar, the edit-enforcement rewrite path, and the
command-palette structural commands — so no dispatch site can produce whole-region
change sets by omission. No dispatch site SHALL vary the narrowing by which operation, node
kind, or direction it is dispatching.

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

#### Scenario: An unchanged line in the MIDDLE of an edit is excluded
- **WHEN** a structural operation's rewritten region contains a line whose text is
  identical before and after the operation, with changed lines on both sides of it
- **THEN** that line does not appear in the dispatched change set

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

This mapping is a FACT this capability supplies; the decision to use it belongs to
`caret-placement-policy`, which owns the fallback below and every other placement rule.
This requirement therefore states what the mapping is and when it is sound, not which
dispatch sites apply it.

The equality this capability asserts — that the mapping computed here is the same function
CodeMirror's history redo restore applies — SHALL be verified executably over generated
documents and operations, not asserted in prose. `caret-placement-policy`'s recording
decision is derived from that equality, so a divergence would silently change which
operations are recorded.

The mapped position SHALL be used only when it is caret-addressable per
`content-space-caret`; otherwise the operation's own subject placement SHALL be used. The
position available to map is the editor's main selection HEAD, which is a caret only when
the selection is empty — with a block selection it is the cover's end, and a subtree cover
ends on the trailing gap line it owns, so mapping it forward yields a non-addressable
position. Testing the RESULT rather than the emptiness of the input also covers a caret
already parked somewhere non-addressable by a programmatic placement.

When that fallback fires, the dispatched caret is no longer what mapping produces, and it
SHALL be recorded in history on that basis — see `caret-placement-policy` and
`structural-history-integration`. This closes the gap those capabilities previously
documented, in which a redo recomputed the mapped position and returned the caret to a
non-addressable one.

This is sound for insertions unconditionally: the user's cursor sits either outside every
changed range or at a definite side of one, so the mapping lands on the same content
column the user was at, not merely inside it. For deletions (outdent), it is sound
whenever the cursor sits outside the deleted span; a cursor sitting at or inside the
deleted span itself is a separate, narrower case covered by
`structural-history-integration`'s residual-limitation requirement, not by this one.

Other structural operations (move up/down, split, merge, paste, and the
edit-enforcement rewrite path) do not map: their resulting position is a deliberate choice
— a join point, a split point, a moved node's new location, the seam after a deletion —
not something recoverable by mapping the old position through the change set.

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
- **THEN** the operation's own subject placement is used instead, so the dispatched caret
  is never left on a position the caret may not occupy

#### Scenario: The fallback survives redo
- **WHEN** that fallback fires and the operation is undone and redone
- **THEN** the caret returns to the fallback position, not to the non-addressable mapped
  one, because a dispatch that differs from the mapping is recorded

#### Scenario: The mapping matches the history's own
- **WHEN** the mapping computed here is compared against CodeMirror's own forward mapping
  at the association its redo restore uses, over generated documents and operations
- **THEN** the two agree in every case, so no ordinary indent or outdent is recorded

#### Scenario: Move still states an explicit cursor
- **WHEN** a node is moved up or down
- **THEN** the transaction states the moved node's own resulting cursor explicitly,
  rather than relying on mapping

### Requirement: A relocation is dispatched as a relocation
An operation that MOVES lines rather than rewriting them in place SHALL be dispatched as the
removal of those lines from their old position and their insertion at the new one. It SHALL
NOT be dispatched as an in-place rewrite of any line it rearranges.

Two things follow, and both are required. First, no dispatched change SHALL begin or end
partway into a line the operation leaves unchanged; a change MAY span such a line whole, from
one line boundary to another, when the operation genuinely relocates it. Second, no dispatched
change SHALL overwrite a whole line that is still standing somewhere in the resulting
document. A change may destroy text freely — only text that the operation actually destroys.

A relocation rearranges TWO blocks: the one the gesture moved and the one it passed. The
change set describes exactly one of them as having moved, and WHICH one is a minimality
decision, not a safety one — the narrowing anchors whichever block it can match the furthest,
so a mover with more lines than the block it passes will be the one left standing. This
requirement SHALL NOT be read as naming the passed-over block: a change set cannot know which
sibling a user gestured at, and does not need to. Whichever block the description says moved
is removed and re-inserted whole, and that is what protects it.

This is not a preference between two equally minimal forms. A change set is a description of
what happened, and consumers act on that description rather than on the resulting text alone
— Obsidian's live table widget re-derives its own document from it, and an in-place rewrite
of a table row the widget still owns made it split the table, severing the header row from
the body. The guarantee therefore belongs at the narrowing choke point, stated for every node
kind at any nesting depth, rather than as a special case at any dispatch site.

#### Scenario: A sibling moving past a table leaves the table's characters untouched
- **WHEN** a paragraph or list item shorter than the table is moved up or down past it, in a
  document where the table is rendered by the host's live table widget
- **THEN** the dispatched change set contains one deletion of the moved node's lines and one
  insertion of them on the other side, no change range covers or enters any of the table's
  lines, and the table's header, separator, and body rows remain contiguous in the resulting
  document

#### Scenario: A mover longer than the table makes the table the block that moves
- **WHEN** the moved node has MORE lines than the table it passes, so the narrowing anchors
  the mover and describes the table as the block that relocated
- **THEN** the table's rows are removed and re-inserted whole, in one piece, no line of either
  block is overwritten while still standing elsewhere, and the live widget leaves the document
  intact — the guarantee holds from this side too, without the change set being told which
  sibling the gesture moved

#### Scenario: The passed-over node's own kind does not matter
- **WHEN** a node is moved past a sibling whose subtree CONTAINS a table, rather than past a
  table itself
- **THEN** the table's lines are still never rewritten in place — whole, contiguous, and
  either outside every change range or relocated in one piece

#### Scenario: Moving the atom itself is still a relocation
- **WHEN** a table is the node being moved, past an ordinary sibling
- **THEN** the change set relocates whole lines and no change begins or ends partway into a
  line either node leaves unchanged

#### Scenario: A region whose lines repeat degrades in minimality, not in the guarantee
- **WHEN** the lines of the region an operation touches repeat, so that a relocated block
  cannot be matched to its new position
- **THEN** the affected lines are described with whole-line bounds rather than trimmed to the
  characters that differ, because a line that both survives the operation and stands where
  another of its lines used to stand was relocated rather than rewritten, and a change must
  not cut into it

#### Scenario: A line that merely reads like another is still edited in place
- **WHEN** an operation rewrites lines in place and the new text of an edited line happens to
  match some other line of the document — indenting a node whose children already carry the
  indented form of its own text, for example
- **THEN** the change set stays trimmed to the characters that actually differ, and the caret
  keeps its column, because a coincidence of text in one direction is not evidence that
  anything moved

#### Scenario: A shifted chain of repeated lines is still edited in place
- **WHEN** an operation shifts a run of lines so that each line's NEW text equals the next
  line's OLD text — indenting a node whose nested descendants all repeat its text, so that
  the middle lines of the edit come out unique on BOTH sides
- **THEN** every dispatched change stays on the line it belongs to, and the caret keeps the
  character it was on, as it does when the same shape is spelled with distinct text — the
  alignment is not adopted, because it does not put back what it takes: the lines it removes
  are not the lines it inserts, so something was rewritten rather than moved — not even when
  the shift makes one of those lines coincide on both sides

