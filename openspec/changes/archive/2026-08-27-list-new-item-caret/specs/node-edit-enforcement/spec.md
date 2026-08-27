## MODIFIED Requirements

### Requirement: Content-adjacent deletions become merges or vetoes
A deletion expressing "join this node with its content-space neighbor" SHALL be
rewritten to the structural merge of the two nodes when the merge is expressible
under the per-kind algebra, and SHALL be vetoed with the rejection cue when it is
not. The recognized shapes, all cursor-derived and input-agnostic (any gesture
producing the same edit from the same cursor position is enforced identically):

- Backspace with the cursor at a node's first content character — deleting backward
  into chrome (the separator newline, a gap line's newline, or a list marker's
  trailing space) — merges that node into its content-space predecessor (the node
  whose content ends nearest above; possibly its parent or a previous sibling's
  deepest descendant). A TASK item has TWO such positions, and BOTH SHALL be
  recognized: after its list marker, where Home lands, and after its task marker,
  where the item's own text begins. A position INSIDE the task marker SHALL NOT be —
  those characters are the marker's own, and deleting one is ordinary editing.
- Delete with the cursor at a node's last content character — deleting forward into
  chrome — merges the node's content-space successor into it. When no successor
  exists, the edit passes natively (trailing whitespace editing, nothing structural
  below).
- A node with no content-space predecessor (the document's first node) vetoes its
  Backspace-merge with the cue rather than passing a chrome-corrupting deletion.

An accepted merge SHALL append the absorbed node's content directly to the end of
the surviving node's content (no continuation-line remnant standing in for the old
gap), consume the intervening gap entirely, re-parent the absorbed node's children
per the algebra, and form one undo step. The resulting cursor SHALL land at the
JOIN point — immediately after the surviving node's own original last line of
content, before the absorbed content now appended there — not at the merged node's
start, so that a follow-up keystroke continues naturally from where the user was
editing.

#### Scenario: Cursor lands at the join point, not the merged node's start
- **WHEN** a merge succeeds (any of the scenarios below)
- **THEN** the cursor sits exactly between the surviving node's original last
  character and the first character of the absorbed content — a follow-up
  keystroke inserts there, not at the merged node's first line

#### Scenario: Paragraph joins across a gap in one keystroke
- **WHEN** the cursor is at the first character of a paragraph separated from the
  previous paragraph by a blank line and the user presses Backspace
- **THEN** the two paragraphs merge into one node with the second's text appended
  directly after the first's, the gap gone, as a single structural edit

#### Scenario: List item merges into its parent paragraph
- **WHEN** the cursor is at the content start of the first list item under a
  paragraph (after the `- ` marker) and the user presses Backspace
- **THEN** the item's text is appended to the paragraph's text, the item's children
  re-parent under the merged node, and no marker fragment is left behind

#### Scenario: Structure-corrupting merge is vetoed
- **WHEN** the user presses Backspace at the first character of a heading (a merge
  that would absorb the heading and destroy its section's anchor)
- **THEN** the document is unchanged and the rejection cue is shown

#### Scenario: Backspace where a task item's text begins merges it
- **WHEN** the cursor sits immediately after `- [ ] ` on `- [ ] bar`, below `- [x] foo`, and
  Backspace is pressed
- **THEN** the two items become `- [x] foobar` in one undo step, with the cursor at the join
  point — not a character deletion leaving a broken `- [ ]bar` and two nodes

#### Scenario: Both of a task item's content-start positions behave alike
- **WHEN** Backspace is pressed at either the position after `- ` or the position after
  `- [ ] ` on the same task item
- **THEN** both are recognized as the same merge intent and produce the same result
