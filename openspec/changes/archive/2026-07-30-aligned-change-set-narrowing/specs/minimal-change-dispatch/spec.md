## MODIFIED Requirements

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
SHALL be adopted only where it explains the edit more economically than describing the same
region in place. The two readings SHALL be compared by how many characters each must claim
to get from one side to the other, measured BEFORE any widening the relocation requirement
imposes — that widening is a decision about how conservatively to emit a reading, not
evidence about which reading is true — and the in-place reading SHALL be preferred when it
claims strictly fewer.

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

## ADDED Requirements

### Requirement: A relocation is dispatched as a relocation
An operation that MOVES lines rather than rewriting them in place SHALL be dispatched as the
removal of those lines from their old position and their insertion at the new one. It SHALL
NOT be dispatched as an in-place rewrite of the lines it passes over.

Specifically, no dispatched change SHALL begin or end partway into a line the operation
leaves unchanged. A change MAY span such a line whole, from one line boundary to another,
when the operation genuinely relocates it.

This is not a preference between two equally minimal forms. A change set is a description of
what happened, and consumers act on that description rather than on the resulting text alone
— Obsidian's live table widget re-derives its own document from it, and an in-place rewrite
of a table row the widget still owns made it split the table, severing the header row from
the body. The guarantee therefore belongs at the narrowing choke point, stated for every node
kind at any nesting depth, rather than as a special case at any dispatch site.

#### Scenario: A sibling moving past a table leaves the table's characters untouched
- **WHEN** a paragraph or list item is moved up or down past a sibling table, in a document
  where the table is rendered by the host's live table widget
- **THEN** the dispatched change set contains one deletion of the moved node's lines and one
  insertion of them on the other side, no change range covers or enters any of the table's
  lines, and the table's header, separator, and body rows remain contiguous in the resulting
  document

#### Scenario: The passed-over node's own kind does not matter
- **WHEN** a node is moved past a sibling whose subtree CONTAINS a table, rather than past a
  table itself
- **THEN** the table's lines are still outside every dispatched change range

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
  character it was on, as it does when the same shape is spelled with distinct text; the
  alignment is not adopted, because pairing those lines across the shift claims more of the
  document than editing them where they are
