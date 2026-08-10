## Context

See proposal.md — Why. The mechanism as it stands on this change's base, in one function:

```ts
function reverseFor(tr: Transaction, line: number) {
  const added = tr.state.doc.lines - tr.startState.doc.lines;
  const count = Math.max(1, added);
  const first = tr.state.doc.line(line + 1);
  const last = tr.state.doc.line(Math.min(line + count, tr.state.doc.lines));
  const to = Math.min(last.to + 1, tr.state.doc.length);
  if (to <= first.from) return { from: Math.max(0, first.from - 1), to: tr.state.doc.length, insert: '' };
  return { from: first.from, to, insert: '' };
}
```

Three assumptions live in those lines, and each is a guess about a keypress the module never
saw:

1. **The place is as many lines as the transaction grew by.** True only when the keypress did
   nothing else. Over a block selection the removal cancels part of the growth: a provisional
   position is two lines, the delta reports one, and `max(1, …)` floors it there.
2. **Deleting lines is enough.** True only for an operation that added nothing but the place.
   An Enter into an ordered run renumbers the items below it; deleting the empty item leaves
   the renumbering standing, and the list reads `1.` `3.` `4.`.
3. **The span runs forward from the caret's line to a following line break.** At the end of a
   file there is no node below to separate from, so the layout is `[separator][position]` and
   the caret sits on the SECOND of the two lines. The guard on the last line is the base's
   correction for the sub-case where this makes the range EMPTY — it turns "removes nothing"
   into "removes one line", where two are needed. Measured: all three end-of-document rows in
   proposal.md still leave a blank line.

That last one matters for how the fix is judged. The guard is a correct rule about line
breaks bolted onto an incorrect extent, so the shape is right and the number is still wrong.
A fix that only widened the extent would need the guard to stay and to be right for the wider
span too; a fix that states the edit needs neither.

The narrowing that makes assumption 1 unrecoverable is deliberate and worth keeping.
`planOverSelection` composes "remove the selection" and "apply the key" in TEXT space and
diffs the result, so the change set that reaches the editor is one minimal replacement rather
than a concatenation with mapped coordinates. That is the right shape for a dispatch; it is
simply not a shape from which the two steps can be recovered afterwards.

Two constraints shape the fix:

- **The removal is not an inversion of the keypress.** `structural-history-integration`
  already decided that leaving a list from an empty item is a deliberate act whose blank line
  is abandonable while the item itself is not. Any single "reverse what happened" rule
  contradicts that. Measured: the residue family — unwrap, and the outdent that dissolves — is
  correct on the base in every case, so this change must preserve behavior there, not improve
  it.
- **The recogniser is not in question.** Which dispatches may create a place, and whether the
  caret has landed on one, are answered by where the caret lands plus this plugin's own
  `userEvent` markers. The spec states why that is keyed on the caret rather than on the
  operation, and the reason is untouched here. Only the removal EDIT moves.

## Goals / Non-Goals

**Goals:**

- The removal edit is exact for every place the grammar can make, including one opened over a
  removed selection, one that renumbered a run on the way in, and one at the very end of a
  file.
- The rule that makes it exact is stated once and reads the same for every operation, rather
  than as a per-shape special case that grows with each new parent.
- `provisional-cleanup.ts` performs no arithmetic on document coordinates it did not receive.

**Non-Goals:**

- Re-founding how a place is RECOGNISED (see D5).
- Reaching a place re-created by redo — proposal.md, Out of scope.
- Any change to what a keypress does. This change alters only what abandoning it removes;
  every plan's `changes` and `selection` stay byte-identical.

## Decisions

### D1 — The plan carries the removal edit; nothing downstream derives one

The plan is the only place where both states exist at once: the document the operation acted
on, and the document it produced. Everywhere downstream sees a single fused change set.

`TxPlan` gains an optional removal change set, expressed in the coordinates of the document
the plan produces — the same coordinate space the plan's `selection` already uses, so the
consumer needs no mapping. The keymap converts it to offsets exactly as it converts
`plan.changes`, and attaches it to the dispatched transaction; `provisional-cleanup.ts` stores
what it was given and applies it verbatim.

*Alternative considered — carry the extent as a line count* and keep the arithmetic. It fixes
assumption 1 and neither 2 nor 3: the module would still have to place the span itself, still
have to keep the last-line guard and make it right for a two-line span, and still express the
removal as a deletion, which cannot restore a renumbering. The whole failure class is
coordinate arithmetic performed by a module that was not there; a third of it is not a fix.

*Alternative considered — dispatch the removal and the key as two transactions* so the removal
can undo the second. Two history entries for one keypress, two verdict passes through
enforcement, and it discards the minimal-change-dispatch property the composition was built
for.

### D2 — Two forms, chosen by what the operation meant

- **Opened**: the operation's purpose WAS the place — `splitNode`'s gap-widening and node
  materialization, `insertSiblingHeading`, Shift+Enter's continuation. Its removal is its own
  reversal: the diff from its result back to the text it acted on. Assumption 2 dissolves —
  renumbering, indentation, and anything else the operation wrote come back with it, because
  the reversal is stated in bytes rather than reasoned about in categories.
- **Residue**: the operation dissolved a node into a blank line — the empty-item ladder's
  `unwrapListItem`, and the `outdent` that dissolves rather than moves. Its removal is the
  deletion of that line. Reversing it would restore the `- ` the user pressed Enter to escape.

This is not a new distinction. It is exactly the one the module's two event lists already
draw, given the meaning it was missing: the list that may claim an empty NODE is the opened
family, and the two events in the gap list beyond it are the residue family.

*Alternative considered — one rule, "reverse the operation".* It is wrong for the residue
family by an existing decision, and making it right would mean asking whether a `- ` is
chrome or content — the question this cleanup was designed never to ask.

*Alternative considered — one rule, "delete the place's lines".* That is today's rule, and it
is what leaves the ordered run misnumbered.

### D3 — A composed plan inherits its inner plan's removal edit unchanged

`planOverSelection` produces its final text by applying the inner plan's changes to the
post-removal text. The outer plan's `changes` are a fresh diff against the ORIGINAL text, but
the document both describe is the same one — so the inner plan's removal edit is already
expressed in the outer plan's coordinate space and is passed through verbatim, with no
re-derivation and no offset shifting.

That is the whole of the block-selection fix, and it is a pass-through rather than a
computation because the intermediate document is where the removal was always defined.

The same holds for the non-cover branch, where the selection is a character range inside one
node: the removal returns to the text with the range deleted, so abandoning an Enter that
replaced a word leaves the word deleted. That follows from the same rule rather than being a
second case.

### D4 — The removal is built with `editsToChanges`, not with line offsets

Both forms are naturally line-level: a reversal is `diffLines(result, source)`, a residue
deletion is a one-line splice. Converting either to editor changes is exactly what
`editsToChanges` does for every structural dispatch, including at a document's end and in a
file with no trailing line break — which is assumption 3, fixed by reuse rather than by a
second implementation of the same arithmetic. Verified by measurement before proposing: the
converter produces the wanted document in all fourteen cases, the seven the base gets wrong
included.

The base's last-line guard is therefore deleted rather than extended. Keeping it would leave
two rules about line breaks in two modules, one of them unreachable.

### D5 — Recognition stays where it is

Whether a transaction may have created a place, and whether the caret is on one, are decided
as they are today: where the caret lands, plus the plugin's own `userEvent` markers. The
presence of a removal edit does NOT become the recogniser, for a measured reason — Shift+Tab
and the ladder's outdent both dispatch `input.structure.outdent`, and only the one that
dissolves an item into a blank line has an abandonable place. Outdenting a nested empty `- `
produces an empty NODE the operation merely moved, which the node-list already excludes;
making "carries a removal edit" the test would admit it and delete the user's item when the
caret moved away.

So the plan states a removal edit for the operations that can leave a place, the module
decides whether one was left, and the two answers are independent by construction. Where they
disagree the result is no cleanup, which is the safe direction. The spec states this
independence, so it is a contract rather than an implementation coincidence.

### D6 — The removal is a change SET, and its caret is mapped through it

A reversal may restore text as well as delete it, so the record can no longer hold one
`{from, to, insert}`, and `cancel`'s `shift = insert.length - (to - from)` no longer describes
the displacement. The record holds a change set; the target caret is mapped through it with
the editor's own change mapping.

Everything else about the dispatch is unchanged: it still carries `input.structure.abandon`,
still short-circuits the verdict layer, still forms its own history entry because that event
is outside the joinable families, and the guard that refuses to act when the document has
moved under the record still runs first.

## Risks / Trade-offs

- **A reversal can now restore text, and `input.structure.abandon` short-circuits enforcement**
  → The restored bytes are ones this plugin wrote moments earlier, from a document that had
  already passed enforcement. The short-circuit is what the event exists for and is unchanged;
  a task re-checks the classification with a restoring removal rather than assuming it.
- **The plan gains a field every branch must fill** → Absent means "no place to abandon", and a
  branch that forgets it degrades to the pre-feature behavior (the place stays). The failure
  direction is the same one every guard in this module already chooses. A test asserts the
  field's presence per branch so an omission is caught as a fact, not as a missing cleanup.
- **The residue family is already correct and must stay that way** → Measured on the base
  across six shapes, including at a document's end. Those become negative controls rather than
  targets: a change that "improves" them has changed behavior nobody asked to change.
- **Overlap with `fix-ordered-renumbering-on-removal` (#44) in subject but not mechanism** →
  #44 fixes what a removal renumbers TO; this fixes a removal that never renumbered at all.
  Neither depends on the other, and a task pins the ordered case at both layers so a later
  change to one does not quietly cover for the other.

## Migration Plan

None. No stored data, no settings, no file format. The behavior change is confined to a
gesture that today leaves debris.
