## MODIFIED Requirements

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
