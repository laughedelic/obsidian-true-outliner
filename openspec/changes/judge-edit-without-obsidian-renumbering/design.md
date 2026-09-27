# Design

## Context

Obsidian's renumbering filter runs before every plugin filter and returns the user's
transaction with its renumbering appended, so the enforcement filter receives one transaction
whose change set holds both (`docs/research/obsidian-list-renumbering`, "Filter order"). The
appended ranges have one shape in every list measured, and they never change the class a
transaction gets ("The ranges it appends to a user edit" in the same note).
`computeVerdictForRanges` delegates one range to `computeVerdict` and several to the
all-exact-cover multi-range rule, which passes as soon as one range is not a pure deletion.

## Goals / Non-Goals

**Goals:**
- The verdict a user edit gets does not depend on whether Obsidian appended a renumbering.

**Non-Goals:**
- Recognising what other filters append. Only the measured renumbering shape is set aside.
- Changing classification. The appended ranges already give no class of their own.

## Decisions

**Recognise the appended ranges by shape, in the pure verdict layer.** Nothing marks them as
Obsidian's: its spec carries `userEvent: 'input.renumber'`, but a combined transaction answers
`annotation(userEvent)` and `isUserEvent` from the first annotation only, which is the user's.
No plugin filter can run before Obsidian's to snapshot the user's own changes either. The shape
is what is left, and `computeVerdictForRanges` already receives every range with the start
document, so the decision stays pure and unit-testable. The CM6 adapter does not change: a
`rewrite` already replaces the transaction wholesale (`buildRewriteSpec`), which drops
Obsidian's numbers, and a `pass` already returns the transaction as it came.

**The shape is the exact one measured, not "any change to a marker".** A range is set aside when
it lies on one line, starts where that line's ordered number starts (past indentation and any
`>` container prefix), ends just past the single space after the delimiter, and replaces
`N<d> ` with `M<d> ` where `M ≠ N` and the delimiter `<d>` is the same. A looser rule — any
range that leaves the line an ordered item with the same text after the marker — would also set
aside a user's own Backspace inside `13.` made with a second cursor, and a `rewrite` would then
silently drop it. The strict shape cannot be a keystroke of the user's.

**Only when another range remains.** A transaction made of marker rewrites alone is judged as
it is today. Such a transaction does not reach the verdict layer at all today, because a marker
rewrite is a `within-node-edit`; the guard keeps it that way if classification ever changes.

**The remaining ranges go through the existing paths.** One range goes to `computeVerdict`, so a
merge, a single-range deletion or a type-over is judged exactly as it is without Obsidian; several
go to the multi-range deletion rule. No new verdict path.

**Alternatives considered.**
- *Tolerate the marker ranges inside the multi-range rule only*, as `open-questions` Q23 first
  proposed: that covers a block deletion but not Backspace ⌫ ⌫, which is a merge and never
  reaches the multi-range rule. Setting the ranges aside first covers both with one rule.
- *Re-run the edit without the appended ranges by reconstructing the user's change set* in the
  adapter: the same decision in the impure layer, with no gain.

## Risks / Trade-offs

- [Another plugin's filter appends a range of exactly this shape for its own reasons] → A
  `rewrite` drops it, as a rewrite already drops everything a transaction carried; a `pass`
  keeps it. The structural operation renumbers every run it changes, so a rewritten note's
  numbers are consistent either way.
- [Obsidian changes the shape it appends] → The ranges then stop matching and the transaction
  passes as it does today; the e2e tests for both gestures fail and say so.
- [A `pass` still keeps Obsidian's numbering of a list the edit never touched] → Only for edits
  the layer passes anyway, which are native edits; the typing case is #263.
