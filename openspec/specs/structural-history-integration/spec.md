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

Recording is required because no rule applied AFTER the fact can recover the position. A
reordering maps a caret that was inside the moved node into whatever now occupies its old
lines — a position that is perfectly legal, and therefore invisible to any check that
only asks whether the caret may be there. The information identifying the moved node is
not present in what the history retains.

#### Scenario: Redo after moving a node
- **WHEN** a node is moved up or down, then undone and redone
- **THEN** the cursor is on the moved node, not on the sibling that took its former
  place

#### Scenario: Repeated redo keeps the moved node's cursor
- **WHEN** a move is followed by repeated undo/redo cycles
- **THEN** every redo puts the cursor back on the moved node

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

