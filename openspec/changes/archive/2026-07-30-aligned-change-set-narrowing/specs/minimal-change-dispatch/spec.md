## MODIFIED Requirements

### Requirement: Structural operations dispatch minimal character-level change sets
A structural operation's line-range edits SHALL be narrowed, before dispatch, into the
narrowest set of character-level `EditorChange` ranges that produce the same resulting
document as applying the edits wholesale — narrowest among the sets that also satisfy
"A relocation is dispatched as a relocation" below. Where the two pull apart, that
requirement wins and the change is widened: a change set describes what happened, and a
narrower description that misdescribes it is not the better one.

Narrowing SHALL begin by ALIGNING the edit's old lines against its new lines. Any line the
alignment MATCHES SHALL be excluded from the change set wherever it occurs — not only when it
sits at the edit's leading or trailing edge — and only the runs of lines that remain unmatched
SHALL be narrowed further. Within such a run, when the run has the same number of lines on
both sides, each line pair SHALL be diffed independently and its common character prefix and
suffix trimmed; when it does not, the run SHALL be emitted as one character-trimmed span.

Alignment SHALL match a line in one of two ways, and the rule differs because the risk does.
At a segment's leading and trailing EDGES it SHALL match lines that are equal at the same
relative position, whatever their content and however often they repeat: position forces the
pairing there, so the match claims only that nothing moved at that offset, which is the
weakest claim available and cannot be wrong. In a segment's INTERIOR, where the alignment is
choosing which occurrence to pair with which, it SHALL match a line only when its content is
unique on both sides, so that a repeated line — an identical list marker, an identical table
separator — never anchors a pairing it does not unambiguously determine. This is why the
exclusion above is stated over the lines the alignment matches rather than over every line the
edit keeps: a line that survives but repeats in the interior may have nothing to match
against, and will then be described as rewritten rather than left alone. Failing to match a
line that could have been matched costs minimality and the precision of the description, never
correctness — the resulting document is the same either way, and the guarantee that survives
unconditionally is the one stated under "A relocation is dispatched as a relocation": no
change may cut partway into a line the edit keeps, matched or not.

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

#### Scenario: A repeated line at an edit's edge is still excluded
- **WHEN** an edit's region begins with lines that are identical to each other and unchanged
  by the operation, so no line among them is unique
- **THEN** none of them appears in the change set — uniqueness is required only where the
  alignment chooses between occurrences, and at a region's edge the pairing is forced by
  position

#### Scenario: An unchanged line in the MIDDLE of an edit is excluded
- **WHEN** a structural operation's rewritten region contains a line whose text is
  identical before and after the operation, with changed lines on both sides of it
- **THEN** that line does not appear in the dispatched change set

## ADDED Requirements

### Requirement: A relocation is dispatched as a relocation
An operation that MOVES lines rather than rewriting them in place SHALL be dispatched as the
removal of those lines from their old position and their insertion at the new one, wherever the
narrowing can tell the rearranged blocks apart.

Two things follow, and they hold to different strengths. First, unconditionally: no dispatched
change SHALL begin or end partway into a line the operation leaves unchanged. A change MAY span
such a line whole, from one line boundary to another, but never cut into it. Second, wherever
the region's content lines are distinct enough for the narrowing to match the two blocks
against each other, no dispatched change SHALL overwrite a whole line that is still standing
somewhere in the resulting document: a change may destroy text freely, but only text the
operation actually destroys.

The second guarantee is conditional because it has to be. Matching blocks against each other
means recognising lines, and where a region REPEATS its lines there can be nothing left to
recognise them by. Two sibling tables sharing a header and a separator row — an ordinary
document — leave their body rows as each other's only candidates, and the change set then says
each row became the other, though both survive. Where that happens the description SHALL still
respect the first guarantee, spanning whole lines rather than cutting into them, and the
resulting document SHALL still be correct. It is a loss of precision in the description, not of
safety: measured against the host's live table widget, both tables come through intact, and the
host's change representation offers no encoding that would say it better — a replacement and a
deletion followed by an insertion delete exactly the same range, so no consumer can tell them
apart. What is NOT permitted is rewriting a line the narrowing could have left alone.

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

#### Scenario: Two tables sharing a header leave the narrowing nothing to anchor
- **WHEN** two sibling tables with the same header and separator rows are swapped, so that the
  only lines telling them apart are the body rows that traded places
- **THEN** the change set MAY describe each body row as having been replaced by the other, but
  each such change SHALL span whole rows rather than cut into them, the resulting document
  SHALL be correct, and both tables SHALL remain intact under the host's live table widget

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
