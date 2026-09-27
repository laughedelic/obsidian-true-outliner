# Design

## Context

Obsidian's renumbering filter runs before every plugin filter. It returns the user's transaction
with its renumbering appended, so the enforcement filter receives one transaction whose change
set holds both (`docs/research/obsidian-list-renumbering`, "Filter order").

The adapter (`transaction-filter.ts`) reads that change set twice: once as spans for
`classify`, and once as `EditFact`s for `computeVerdictForRanges`. Both reads use
`iterChangedRanges` without `individual`, which joins touching ranges. The same note's "The
ranges it appends to a user edit" has:
- the one shape the appended ranges take;
- that they can sit on the user's own line or touch the user's range;
- that on an empty item they can make a transaction `boundary-crossing-edit` by themselves.

## Goals / Non-Goals

**Goals:**
- The class and the verdict a user edit gets do not depend on whether Obsidian appended a
  renumbering.

**Non-Goals:**
- Recognising what other filters append. Only the measured renumbering shape is set aside.
- Changing `classify` or the verdict layer. Both receive the user's ranges and judge them as
  they already do.

## Decisions

**Separate the ranges in the adapter, before classification.** Both reads go through one pure
helper:
- It takes the change set's individual changes and the start document.
- It sets aside the appended renumberings.
- It joins the remaining changes that touch each other, as `iterChangedRanges` would.

Spans and facts are then built from its output.

Setting the ranges aside inside `computeVerdictForRanges` instead, which the first draft of this
design proposed, leaves the class computed with them. On an empty item that class is
`boundary-crossing-edit`, and the verdict for the user's lone in-line deletion then reads it as
covering the whole node. Doing it before classification keeps the two gates a matched pair, and
the verdict layer stays as it is.

**Read the changes individually, then rejoin.** Individual reading is what separates a linewise
cut from the renumbering that touches it. Rejoining the user's own touching changes keeps every
other transaction exactly as `iterChangedRanges` read it: when nothing is set aside, the helper
returns the same ranges the adapter reads today.

**The shape is the exact one measured, not "any change to a marker".** A change is set aside
when it:
- lies on one line;
- starts where that line's ordered number starts (past indentation and any `>` container
  prefix);
- ends just past the single space after the delimiter;
- replaces `N<d> ` with `M<d> `, where `M ≠ N` and the delimiter `<d>` is the same.

Nothing marks the ranges as Obsidian's. Its spec carries `userEvent: 'input.renumber'`, but a
combined transaction answers `annotation(userEvent)` and `isUserEvent` from the first annotation
only, which is the user's. No plugin filter can run before Obsidian's either.

A looser rule — any change that leaves the line an ordered item with the same text after the
marker — would also set aside a user's own Backspace inside `13.` made with a second cursor.
The strict shape cannot be a keystroke of the user's.

**Only when another change remains.** A transaction of marker rewrites alone is left whole.

**Alternatives considered.**
- *Tolerate the marker ranges inside the multi-range rule only*, as `open-questions` Q23 first
  proposed. That covers a block deletion but not Backspace ⌫ ⌫, which is a merge.
- *Set them aside in `computeVerdictForRanges`.* Rejected above.
- *Make `isExactSubtreeCoverDeletion` refuse replacements.* That closes the empty-item class flip
  but not the joined cut, and it changes a classifier rule the other gestures rely on.

## Risks / Trade-offs

- [Another plugin's filter appends a range of exactly this shape for its own reasons] → A
  `rewrite` drops it, as a rewrite already drops everything a transaction carried; a `pass`
  keeps it.
- [Obsidian changes the shape it appends] → The changes then stop matching and the transaction
  is read as today; the e2e tests for the gestures fail and say so.
- [A transaction that is not an edit of the user's, such as a plugin's own or a programmatic one,
  carries such a change] → Those classes are decided by annotation before any span is read, so
  the helper's output does not change them.
