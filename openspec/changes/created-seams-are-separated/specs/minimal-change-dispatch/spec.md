## MODIFIED Requirements

### Requirement: A relocation is dispatched as a relocation
An operation that MOVES lines rather than rewriting them in place SHALL be dispatched as the
removal of those lines from their old position and their insertion at the new one, wherever the
narrowing can tell the rearranged blocks apart. A blank line a created seam gains
(`structural-operations`' `A seam an operation creates is separated`) SHALL be dispatched as an insertion of its own. It does not make the move a
rewrite: the moved lines are still the lines the move removed.

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

#### Scenario: A move that gains a blank line is still a move
- **WHEN** a paragraph written directly under a table is moved above it, so the seam between the
  paragraph and the table is created and gains a blank line
- **THEN** the dispatched changes remove the paragraph's lines from below the table and insert them
  above it, with the blank line as an insertion of its own, and no line of the table is rewritten
