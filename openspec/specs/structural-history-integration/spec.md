# structural-history-integration Specification

## Purpose
Defines how structural operations integrate with CodeMirror's undo history so that redo
restores the cursor the operation itself produced — the merge join point, the split point,
a moved node's new location, the column an indent preserved — rather than a mechanical
mapping that lands somewhere else.

Two mechanisms cover it, and which applies depends on whether an operation's cursor is a
FUNCTION of the pre-operation caret or a CHOICE:

- **Indent and outdent** derive their cursor by mapping (`minimal-change-dispatch`), which
  is exactly what history recomputes on redo, so the two agree by construction and nothing
  is recorded. Minimal change sets are what make that mapping meaningful.
- **Every other structural operation** chooses a cursor no mapping can reproduce — redo
  replays a `ChangeSet`, not the operation, and a text splice carries no notion of which
  content is which — so its cursor is recorded into history by a following selection-only
  transaction. That is the only channel CodeMirror offers.

Also covers what neither mechanism can fix: a second undo does not restore the
pre-operation cursor, for two distinct reasons documented below. Related and worth knowing
beyond this capability: CodeMirror dispatches history transactions with transaction
filtering disabled, so the enforcement funnel provably never observes an undo or a redo.

Architecture and rationale: the `fix-redo-cursor-after-structural-ops` and
`minimal-changesets-for-structural-ops` design.md files; evidence and findings:
`docs/research/04-open-questions.md` Q18–Q21 and Q29. Where the caret should go in the
first place — as opposed to how it survives history — is being consolidated by the
`caret-placement-policy` change.
## Requirements
### Requirement: Redo restores a structural operation's own cursor at any depth

When a structural operation is undone and REDONE, the cursor SHALL be restored to the
position that operation itself produced — the same position the operation left the
cursor at when first performed — and SHALL do so at any undo/redo depth, not only the
first redo.

This is now unconditional. The former exception — indent and outdent falling back to the
operation's own cursor when the mapped position would not be caret-addressable, with the
fallback going unrecorded — is closed by deciding recording per DISPATCH rather than per
operation (`caret-placement-policy`): a fallback dispatch differs from the mapping, so it
is recorded like any other chosen cursor.

This applies to every structural operation regardless of which dispatch site produced
it: the outline keyboard grammar (indent, outdent, move up, move down, split) and the
edit-enforcement rewrite path (boundary deletions and merges, structural paste,
type-over). It is met by two different mechanisms, and which one applies is decided by
whether the DISPATCHED cursor is what mapping would produce:

- **A dispatch whose cursor IS the mapped position** — an ordinary indent or outdent —
  agrees with what the history recomputes on redo, by construction. Nothing is recorded.
  The command-palette path records as a side effect of keeping consecutive commands in
  separate undo steps, but records the same value mapping would give, so the two paths
  behave identically (see `editor-structural-commands`).
- **A dispatch whose cursor mapping cannot reproduce** is recorded — see "An operation that
  chooses its own cursor has it recorded in history" below, whose rule is now stated per
  dispatch rather than per operation. Which operations that covers is not fixed in advance:
  a split, merge or deletion whose position happens to coincide with the mapped one needs
  no recording and gets none.

UNDO is guaranteed only for the FIRST undo following an operation. Both mechanisms have
a documented cost at greater depth, stated in "Known limitation" below; neither is
avoidable from within this plugin.

#### Scenario: Redo after a merge that re-parents children
- **WHEN** a merge whose rewritten region spans the node's re-parented children is
  undone and redone with no intervening cursor movement
- **THEN** the cursor is at the merge join point, and not at the start of the node
  following the rewritten subtree

#### Scenario: Redo after indenting a node with children
- **WHEN** Tab indents a node that has children, with the caret partway through its
  text, and the user then undoes and redoes with no intervening cursor movement
- **THEN** the caret is back at the same relative column within that node's text — the
  position the indent itself produced — and not at the start of the node following the
  rewritten subtree, nor reset to the node's content start

#### Scenario: Redo after an indent that fell back
- **WHEN** Tab acts with a whole-block cover selected, so the mapped position would not be
  addressable and the operation's own cursor is dispatched, and the user then undoes and
  redoes
- **THEN** the caret returns to that fallback position, not to the non-addressable mapped
  one

#### Scenario: No intervening selection is required
- **WHEN** a structural operation is followed immediately by undo and redo, with no
  cursor movement, click, or any other selection-changing event in between
- **THEN** the cursor is still restored correctly — correctness SHALL NOT depend on a
  stray selection change happening to occur between the operation and the undo

#### Scenario: Cursor correctness survives repeated undo/redo cycles
- **WHEN** INDENT or OUTDENT is followed by undo, redo, undo, redo — repeated any number
  of times, with no intervening cursor movement, the cursor was not at or inside a span the
  operation deletes, AND the dispatch actually used the mapped position rather than falling
  back to the operation's own cursor
- **THEN** the cursor is correct after every step, in BOTH directions — these are the
  mapping-derived dispatches, which record nothing and so carry neither of the
  second-undo costs in "Known limitation" below
- **AND** an indent or outdent whose addressability fallback DID fire is excluded: it is a
  recorded dispatch and carries the recorded-dispatch cost below, despite being the same
  operation

### Requirement: An operation that chooses its own cursor has it recorded in history
A structural DISPATCH whose cursor is not the position mapping would produce SHALL make
that cursor known to the editor's undo history, by re-asserting it in a following
selection-only transaction. Recording SHALL happen before any subsequent user input can be
processed, so an undo issued immediately after the operation still finds it recorded.

The decision SHALL be derived from the transaction itself — comparing the dispatched
selection against the pre-operation selection mapped forward through the change set, at
the same association CodeMirror's own redo restore uses — and SHALL NOT be read from a
list of operation names. A per-operation list is insufficient in a measurable way: one
operation can dispatch a derived cursor most of the time and a chosen one when its
addressability fallback fires, and a list leaves the second case unrecorded.

The derived rule SHALL preserve the previous set's BEHAVIOUR rather than its membership.
Every dispatch mapping cannot reproduce is recorded, so redo stays exact wherever the list
made it exact. It may record fewer transactions: a merge join point, a moved node's new
location and the seam after a deletion are not what mapping produces and are recorded as
before, but a split point CAN coincide with the mapped position (a mid-item split inserts
its marker at the caret, which assoc=1 maps onto the new item's content start), and such a
dispatch is correctly left unrecorded — redo already reproduces it.

Recording is required because no rule applied AFTER the fact can recover the position, and
because whether mapping happens to recover it is not a property the operation controls. A
swap has two equally true descriptions — this node moved down, that node moved up — and the
line alignment in `minimal-change-dispatch` selects one of them from the line content alone,
not from which node the user acted on. When it selects the user's node as the one that MOVED,
the caret rides the relocated run and mapping lands correctly by coincidence; when it selects
the other way, the caret is in text the change rewrites and mapping puts it on whatever now
occupies those lines — a position that is perfectly legal, and therefore invisible to any
check that only asks whether the caret may be there. Both outcomes are reachable from the
same operation in opposite directions. Recording is what makes the answer the same either
way, because the information identifying the moved node is not present in what the history
retains. Nor can the narrowing be asked to supply it: which node "moved" is a fact about the
gesture, and the change set is derived from the text.

#### Scenario: Redo after moving a node
- **WHEN** a node is moved up or down, then undone and redone
- **THEN** the cursor is on the moved node, not on the sibling that took its former
  place

#### Scenario: Repeated redo keeps the moved node's cursor
- **WHEN** a move is followed by repeated undo/redo cycles
- **THEN** every redo puts the cursor back on the moved node

#### Scenario: Recording covers the direction mapping cannot
- **WHEN** the move direction is the one whose change set rewrites the lines the caret was
  in, rather than relocating them, and the operation is undone and redone
- **THEN** the cursor is on the moved node, where without recording it would have landed on
  the sibling that took its former place

#### Scenario: Indent is not recorded and stays correct anyway
- **WHEN** Tab indents a node with a plain caret, so the dispatch uses the mapped position,
  and the user undoes and redoes any number of times
- **THEN** the cursor is correct at every depth, from mapping alone, and nothing was
  recorded

#### Scenario: The same operation records only when it chooses
- **WHEN** indent is invoked twice — once with a plain caret, once with a whole-block
  cover whose mapped position would not be addressable
- **THEN** the first dispatch is not recorded and the second is, from the same operation

### Requirement: Known limitation — a second undo does not restore the pre-operation cursor

REDO is exact at any depth (above). A second UNDO — undo, redo, undo — is not, in two
distinct cases, and both SHALL be documented rather than worked around. Neither is
reachable by any selection this plugin can dispatch: the event a second undo reads its
position from is created on CodeMirror history's *undone* branch, and the only channel
for recording a selection writes to the *done* branch.

**Recorded dispatches** — those whose dispatched selection differs from the mapped one,
which in practice covers moves, most merges, pastes and structural deletes, an indent or
outdent whose addressability fallback fired, and those splits whose point does not coincide
with mapping. The second undo restores the RECORDED
cursor, i.e. where the operation left the caret, rather than where the caret was before
the operation. This is the accepted cost of recording, taken deliberately: without it,
redo lands on the wrong node every single time for a reordering, which is the worse of
the two failures. The fallback case newly joins this list, trading a redo that returned
the caret to a non-addressable position for a second undo that is one step less precise.

**Mapping-derived dispatches** (indent, outdent) when the pre-operation cursor sat at or
inside a character span the change set DELETES. The second undo can land one position off
from where it actually started — still on the same line, unlike the prior
whole-document-scale gap this replaces, but not exact.

This is a narrower version of the SAME structural limit the prior mechanism documented,
now scoped to the one case minimal change sets cannot resolve rather than to every
structural operation: CodeMirror collapses any position at or inside a deleted span to
that span's start when computing the live result, which discards the distinction
between "was exactly at the boundary" and "was one character further in." A later
undo-of-a-redo can only reconstruct from that already-collapsed value, and
CodeMirror's own hardcoded restore formula for a branch-switched history event lands one
character off from the true original position — independent of what selection this
plugin dispatches, since that restore path does not consult it. No mapping choice or
recording mechanism this plugin could dispatch is able to change this; it SHALL be
documented rather than worked around.

In practice this affects only outdent, and only when the cursor sits at or before the
whitespace/marker outdent removes — never within the node's actual content. Outdent is
not the only operation whose change set deletes characters — a merge deletes a
line-break span, a subtree deletion removes whole lines — but it is the only one whose
cursor is DERIVED BY MAPPING that pre-operation caret. The others choose their cursor
and have it recorded (see above), so history restores the recorded value and never
consults the collapsed position at all.
The now-landed, independent `content-space-caret` change closes the common path to
that cursor position for user gestures; its own scope still passes through
`plugin-own`/`composition`-placed cursors, so a narrow window remains.

#### Scenario: Second undo after moving a node
- **WHEN** a node is moved, then undone, redone, and undone again
- **THEN** the cursor is on the moved node — where the move left it — rather than where
  it was before the move, and this is the accepted cost of making every redo correct

#### Scenario: Every redo stays exact regardless
- **WHEN** any structural operation is followed by repeated undo/redo cycles
- **THEN** each redo restores the operation's own cursor, at every depth

#### Scenario: Second undo after outdenting with the cursor in the removed marker
- **WHEN** the cursor sits at or before the leading whitespace outdent removes, and the
  operation is followed by undo, redo, and undo again
- **THEN** the cursor is not guaranteed to be at the exact pre-operation position — it
  may land one character into the node's content instead — and this is a known,
  documented gap, not a regression

#### Scenario: Indent is never affected
- **WHEN** indent is undone and redone any number of times, regardless of where the
  cursor sat
- **THEN** no cursor position is ever collapsed, because indent's change set only inserts
  characters — so THIS cause never applies to it
- **AND** that is specific to the collapsed-span cause: an indent whose addressability
  fallback fired is still subject to the RECORDED-dispatch cause above, the two being
  independent

#### Scenario: The limitation is recorded, not silently shipped
- **WHEN** this capability is implemented
- **THEN** the limitation is pinned as an executable test (not only described here), so
  a future report of "the cursor is one character off after two undos" is recognized as
  this known gap rather than investigated as a new bug

### Requirement: Undo behavior and undo granularity are unchanged

Recording the resulting cursor SHALL NOT change what undo does. One structural
operation SHALL remain exactly one undo step, and undo SHALL continue to restore both
the pre-operation document and the pre-operation cursor.

#### Scenario: One undo step per structural operation
- **WHEN** a structural operation is performed and undo is pressed once
- **THEN** the document is restored to its exact pre-operation state, with no second
  undo press required

#### Scenario: Undo restores the pre-operation cursor
- **WHEN** a structural operation is undone
- **THEN** the cursor is restored to where it was before the operation was performed

### Requirement: An unused structural keypress has its place removed
A structural keypress that creates an EMPTY PLACE — a provisional position, an empty list
item, an empty heading — and is then declined SHALL have that place removed by a NEW,
undoable edit that deletes it, leaving everything else the keypress did in place.

Two gestures count as declining, and both resolve the same way:

- MOVING THE CARET away from it without typing there. The caret then goes where the gesture
  was headed.
- DELETING it — Backspace or Delete with the caret on it. A provisional position is treated
  as the empty node it stands for, so a deletion gesture removes the WHOLE place rather than
  narrowing the gap around it. After Backspace the caret goes where the cancelled keypress
  STARTED; after Delete it goes to the content start of the node below. Without this, Delete
  would shrink the separation that makes the position typeable and leave a caret on a blank
  line that silently joins its neighbour.

  Where the keypress started is a fact about the KEYPRESS, not about the resulting document,
  and SHALL be treated as one. It is the content end of the node above the place for the
  common shapes, and that coincidence SHALL NOT be relied on: a drafted sibling heading is
  written after the original heading's whole section, so the node above the place is that
  section's last node while the keypress started at the heading. Where the keypress had NO
  caret to start from — it replaced a non-empty selection — there is nothing to return to,
  and the caret SHALL go to the content end of the node above the place instead.

A REMOVAL, not an undo of the keypress. Undoing was specified first and withdrawn: it
reverts everything the keypress did, and a keypress can do more than open a place — Enter
over a block selection removes the selection AND opens one, so undoing it brought the
deleted text back. Removal also leaves a real history entry, so ONE undo returns to the
empty place, which is what a user who changes their mind twice expects.

THE REMOVAL EDIT IS STATED BY THE OPERATION THAT MADE THE PLACE, from the document as that
operation found it, and carried to the point of removal. It SHALL NOT be derived from the
resulting document — not from how many lines the transaction grew by, not from where the
caret came to rest, not from the shape of the change set.

Deriving it is not merely fragile, it is impossible in the general case. A keypress may do
more than open a place, and what reaches the editor is a MINIMAL DIFF of the whole
transformation, in which a removal and an insertion touching the same lines are one
replacement. The two steps cannot be recovered from it afterwards; they exist separately
only while the operation is being composed.

Two forms, chosen by what the operation MEANT and not by which key ran:

- An operation whose PURPOSE was to open the place SHALL state its own REVERSAL — the edit
  returning the document to the text that operation acted on. Everything that operation did
  goes, INCLUDING any renumbering or re-indentation it performed on its way in; everything
  the same keypress did BEFORE it stands. Stating it in bytes is what makes this exact
  without anything having to decide which of those effects counts as part of the place.
- An operation that DISSOLVED A NODE into a blank line, leaving the place as its residue,
  SHALL state the REMOVAL OF THAT LINE instead. Reversing such an operation would restore
  the node the user deliberately dissolved — the item they pressed Enter to leave — which is
  the opposite of abandoning the blank it left behind.

Where a keypress removed a non-empty selection before acting, abandoning SHALL return the
document to the state THE REMOVAL produced, not to the state before the keypress. The
selection stays deleted; only the place opened over it goes.

The removal SHALL be exact wherever the place sits, including on the document's last line
and in a file that does not end with a line break. Neither is a special case to be handled
by its own arithmetic: a stated edit already describes the bytes it removes.

WHICH DISPATCHES CREATE A PLACE is decided by where the caret lands, not by which key ran.
A dispatch of this plugin's that leaves the caret on a GAP LINE necessarily created that
position — a gap line is a place and not a node, so there was nothing there to land on. An
EMPTY NODE is different: it can pre-exist the keypress, so only the dispatches that
materialize one qualify, or an outdent that merely moved an already-empty item would be
recorded and then removed out from under the user.

This test SHALL remain independent of whether an operation stated a removal edit. The two
answer different questions — one whether a place was left, the other how to remove it — and
where they disagree the result SHALL be no cleanup, which is the safe direction.

Keying on the operation instead was tried and is wrong, for a reason worth stating: which
operation dissolves an empty item into a blank line depends on the item's PARENT, not on
the gesture. At the top of a list, or under a heading, Enter unwraps it. Under a PARAGRAPH
the same press outdents it — the item becomes a sibling of the paragraph, the reparent rule
encodes it as a paragraph, and an empty paragraph has no encoding. Same place, different
operation.

Where the plugin cannot establish that the place is still the one it recorded — anything
else changed the document in between, or the record was lost — it SHALL do nothing. Leaving
the empty place is the pre-existing behavior and is always safe.

This cleanup SHALL apply only in outline mode, evaluated per editor and per update rather
than once when the editor is set up. Stating it is not redundant with the mode gating every
other capability has: the mechanism watches ordinary editing to notice what created a place,
and the editor's own newline carries the same line-break shape that Shift+Enter's
continuation does. Ungated, the cleanup would recognise a plain newline in a note that never
opted in and remove it when the caret moved away.

The removal SHALL carry a plugin-own `userEvent`, so the verdict layer short-circuits it —
deleting lines would otherwise read as a boundary-crossing edit — and one outside the
editor's joinable history families, so it forms its own entry and a single undo returns to
the empty place rather than past the keypress. This holds for a removal that RESTORES bytes
as well as one that only deletes them.

#### Scenario: An unused blank position is removed on leaving
- **WHEN** Enter at the end of a paragraph widens the gap, and the caret is then moved
  elsewhere with nothing typed
- **THEN** the document is byte-identical to what it was before the Enter, and the caret is
  where the gesture sent it

#### Scenario: One undo returns to the empty place
- **WHEN** a place is removed on abandonment and undo is pressed once
- **THEN** the place is back — the removal is a real edit, not a silent rewind past the
  keypress that made it

#### Scenario: An unused empty item is removed on leaving
- **WHEN** Enter at the end of a list item creates an empty `- `, and the caret is then
  moved elsewhere with nothing typed
- **THEN** the empty item is gone

#### Scenario: A place opened over a block selection leaves the removal standing
- **WHEN** whole subtrees are block-selected, Enter replaces them with one empty position,
  and the caret is then moved away with nothing typed
- **THEN** the selected subtrees are still gone, the position is gone with no blank line left
  where it was, and the document is exactly what the removal alone would have produced

#### Scenario: Removal restores an ordered run's numbering
- **WHEN** Enter at the end of `1. a` in a `1.` `2.` `3.` list creates an empty item, which
  renumbers the items below it, and the position is then abandoned
- **THEN** the list reads `1.` `2.` `3.` again, not `1.` `3.` `4.` — the renumbering the
  keypress performed is part of what the removal reverses

#### Scenario: A place at the document's end is removed too
- **WHEN** the place occupies the document's last lines, whether or not the file ends with a
  line break, and it is abandoned
- **THEN** the file is byte-identical to what it was before the keypress — the removal is
  never a no-op and never leaves a blank line behind

#### Scenario: Leaving a list leaves no blank line, whatever the list's parent
- **WHEN** a run of Enters walks an item out of a list and past it, for a list at the top
  level, under a heading, and under a paragraph
- **THEN** no blank line remains in any of the three, even though the operation that
  dissolves the item differs between them

#### Scenario: Leaving a list is not undone by abandoning its residue
- **WHEN** Enter on an empty list item leaves the list, dissolving the item into a blank
  line, and the caret is then moved away
- **THEN** the blank line is gone and the list item is NOT restored — the departure was
  deliberate, and only its residue is abandonable

#### Scenario: Backspace cancels the position it is on
- **WHEN** Enter at the end of a paragraph widens the gap and Backspace is pressed with the
  caret still on the resulting blank line
- **THEN** the document is byte-identical to what it was before the Enter and the caret is at
  the content end of the paragraph above — the gap is not narrowed by one line, and the two
  paragraphs around it are not merged

#### Scenario: Backspace after drafting a sibling heading returns to the heading
- **WHEN** Shift+Enter at the end of a heading that HAS a section drafts the next heading
  after that section, and Backspace is pressed on the empty heading it made
- **THEN** the caret is at the content end of the ORIGINAL heading, where the keypress
  started — not at the end of the section's last node, which is the node above the place

#### Scenario: Backspace cancels an empty node the same way
- **WHEN** Enter at the end of a list item creates an empty `- ` and Backspace is pressed at
  its content start
- **THEN** the empty item is gone and the caret is at the end of the item above, which is
  also what the merge rule would produce — the two readings agree

#### Scenario: A used position is left alone
- **WHEN** text is typed on the created position before the caret moves away
- **THEN** nothing is removed, and both the keypress and the typing remain in the history as
  the separate steps they are

#### Scenario: A note without outline mode is never touched
- **WHEN** the editor's own Enter inserts a newline in a note with outline mode off, and the
  caret is then moved away
- **THEN** the newline remains — no place was recorded, and nothing is removed

#### Scenario: An intervening change disables the cleanup
- **WHEN** anything else changes the document between the keypress and the caret moving
  away
- **THEN** no cleanup happens and the empty place remains, exactly as it does today

#### Scenario: Undo remains one step per structural operation
- **WHEN** a structural operation is used normally — its position typed into — and undo is
  pressed once
- **THEN** the behavior is unchanged from before this requirement: one undo step, restoring
  the pre-operation document and cursor

### Requirement: Known limitation — a redone place cannot be declined again
One shape is NOT covered, found by real-vault use. It is recorded rather than specified
away: knowing which shapes the guarantee holds for is worth more than a requirement that
quietly overstates it. It SHALL NOT be read as permitted behaviour — it is a defect with a
known cause, and the requirement above continues to state what the removal is FOR.

A place restored by REDO cannot be declined a second time. Abandoning it once removes it;
redoing brings it back with the caret in it, and abandoning again does nothing, leaving a gap
that ordinary caret motion skips over. The recorder re-arms only for this plugin's own
dispatches, and a redo is not one — it replays the changes without the removal edit the
original dispatch carried. Two ways to recognise it were tried — the editor's own `redo`
user event, and a history-depth test — and neither fired, which suggests the host's redo does
not run through the editor library's history command at all.

#### Scenario: A redone place cannot be declined again
- **WHEN** an abandoned place is restored by redo and abandoned a second time
- **THEN** nothing happens, and removing it requires an explicit undo

