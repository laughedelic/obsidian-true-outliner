## MODIFIED Requirements

### Requirement: Redo restores a structural operation's own cursor at any depth

When a structural operation is undone and REDONE, the cursor SHALL be restored to the
position that operation itself produced — the same position the operation left the
cursor at when first performed — and SHALL do so at any undo/redo depth, not only the
first redo.

One exception, stated here rather than only in "Known limitation" below so this
requirement is not read as unconditional: when indent or outdent falls back to the
operation's own cursor because the mapped position would not be caret-addressable, that
fallback is not what redo recomputes, and the caret returns to the non-addressable
position. Nothing in this capability restores it.

This applies to every structural operation regardless of which dispatch site produced
it: the outline keyboard grammar (indent, outdent, move up, move down, split) and the
edit-enforcement rewrite path (boundary deletions and merges, structural paste,
type-over). It is met by two different mechanisms, and which one applies is decided by
whether the operation's cursor is a FUNCTION of the pre-operation caret or a CHOICE:

- **Indent and outdent** derive their cursor by mapping (`minimal-change-dispatch`),
  which is what the history recomputes on redo, so the two agree by construction. The
  keyboard path records nothing; the command-palette path records as a side effect of
  keeping consecutive commands in separate undo steps, but records the same value mapping
  would give, so the two paths behave identically (see `editor-structural-commands`).
- **Every other structural operation** chooses its cursor, which no mapping can
  reproduce, so it is recorded — see "An operation that chooses its own cursor has it
  recorded in history" below.

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

#### Scenario: No intervening selection is required
- **WHEN** a structural operation is followed immediately by undo and redo, with no
  cursor movement, click, or any other selection-changing event in between
- **THEN** the cursor is still restored correctly — correctness SHALL NOT depend on a
  stray selection change happening to occur between the operation and the undo

#### Scenario: Cursor correctness survives repeated undo/redo cycles
- **WHEN** INDENT or OUTDENT is followed by undo, redo, undo, redo — repeated any number
  of times, with no intervening cursor movement, and the cursor was not at or inside a
  span the operation deletes
- **THEN** the cursor is correct after every step, in BOTH directions — these are the
  mapping-derived operations, which record nothing and so carry neither of the
  second-undo costs in "Known limitation" below

### Requirement: An operation that chooses its own cursor has it recorded in history
A structural operation whose resulting cursor is a CHOICE rather than a function of the
pre-operation caret — a merge's join point, a split point, a moved node's new location,
the survivor after a deletion — SHALL make that cursor known to the editor's undo
history, by re-asserting it in a following selection-only transaction. Recording SHALL
happen before any subsequent user input can be processed, so an undo issued immediately
after the operation still finds it recorded.

Indent and outdent SHALL NOT be recorded. Their cursor is derived by mapping the
pre-operation caret forward (`minimal-change-dispatch`), which is what the history
recomputes on redo, so the two already agree at any depth; recording them would only
subject them to the limitation below.

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
- **WHEN** Tab indents a node and the user undoes and redoes any number of times
- **THEN** the cursor is correct at every depth, from mapping alone

### Requirement: Known limitation — a second undo does not restore the pre-operation cursor

REDO is exact at any depth (above). A second UNDO — undo, redo, undo — is not, in two
distinct cases, and both SHALL be documented rather than worked around. Neither is
reachable by any selection this plugin can dispatch: the event a second undo reads its
position from is created on CodeMirror history's *undone* branch, and the only channel
for recording a selection writes to the *done* branch.

**Recorded operations** (move, split, merge, paste, structural delete — those that
choose their cursor). The second undo restores the RECORDED cursor, i.e. where the
operation left the caret, rather than where the caret was before the operation. This is
the accepted cost of recording, taken deliberately: without it, redo lands on the wrong
node every single time for a reordering, which is the worse of the two failures.

**Mapping-derived operations when the caret started somewhere non-addressable.** Indent
and outdent fall back to the operation's own cursor when the mapped position would not be
caret-addressable (`minimal-change-dispatch`) — reachable by invoking them with a whole-
block cover selected, whose head sits on the trailing gap line the cover owns. That
fallback is not recorded, so a redo recomputes the mapped position and puts the caret back
on the gap line. Measured; both dispatch paths behave the same way.

The rule that would close it — record whenever the dispatched cursor is not what mapping
would produce, rather than keying on which operation ran — generalises the
recorded-vs-derived split this capability states, and is owned by the
`caret-placement-policy` change rather than patched here.

**Mapping-derived operations** (indent, outdent) when the pre-operation cursor sat at or
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
- **THEN** the cursor is always exactly correct — indent's change set only inserts
  characters, so no cursor position is ever collapsed

#### Scenario: The limitation is recorded, not silently shipped
- **WHEN** this capability is implemented
- **THEN** the limitation is pinned as an executable test (not only described here), so
  a future report of "the cursor is one character off after two undos" is recognized as
  this known gap rather than investigated as a new bug

## REMOVED Requirements

### Requirement: A structural operation's resulting cursor is recorded in history
**Reason**: Narrowed, not removed. Recording is still required — it is the only channel
CodeMirror offers for a cursor redo cannot recompute — but only for the operations that
CHOOSE a cursor. Indent and outdent no longer need it: they derive their cursor by
mapping (`minimal-change-dispatch`), which is exactly what history recomputes, so the two
agree at any depth. The narrowed requirement is "An operation that chooses its own cursor
has it recorded in history" above.
**Migration**: None. The mechanism is unchanged for the operations still covered; it
simply no longer applies to indent and outdent.

### Requirement: The cursor re-assertion is treated as plugin-own
**Reason**: The re-assertion still exists, for the operations that choose their cursor,
but it is no longer CLASSIFIED: it dispatches with `filter: false`, so the enforcement
funnel never observes it. That achieves what the plugin-own entry existed to achieve —
the funnel cannot move the very cursor being recorded — without a `userEvent` in the
taxonomy, so `select.structural` is retired.
**Migration**: None.

### Requirement: Structural dispatch sites share one recording mechanism
**Reason**: Superseded by the narrowed requirement above, which states the sharing in
terms of WHICH operations are recorded rather than which dispatch sites produced them —
the recorder keys off a `userEvent` set derived from the classifier's own plugin-own
list, so it covers every dispatch site by construction and the two lists cannot drift.
Recording no longer applies to every structural dispatch, which is what this
requirement's wording asserted.
**Migration**: None.
