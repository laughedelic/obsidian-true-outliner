## Context

See proposal.md — Why. The mechanism as it stands, in one function:

```ts
function reverseFor(tr: Transaction, line: number) {
  const added = tr.state.doc.lines - tr.startState.doc.lines;
  const count = Math.max(1, added);
  const first = tr.state.doc.line(line + 1);
  const last = tr.state.doc.line(Math.min(line + count, tr.state.doc.lines));
  return { from: first.from, to: Math.min(last.to + 1, tr.state.doc.length), insert: '' };
}
```

Three assumptions are baked into those five lines, and each is a guess about a keypress the
module never saw:

1. **The place is as many lines as the transaction grew by.** True only when the keypress did
   nothing else. Over a block selection the removal cancels part of the growth: a provisional
   position is two lines, the delta reports one, and `max(1, …)` floors it there.
2. **The place starts on the caret's line and runs forward.** True in mid-document, where the
   layout is `[position][separator]`. At the end of a file there is no node below to separate
   from, so the layout is `[separator][position]` and the caret sits on the SECOND of the two
   lines — measured on `alpha`/`beta` with no trailing newline.
3. **Removing lines is enough.** True only for a place whose creation added nothing else. An
   Enter into an ordered run renumbers the items below it; deleting the empty item leaves the
   renumbering behind, and the list reads `1.` `3.` `4.`.

The narrowing that makes assumption 1 unrecoverable is deliberate and worth keeping.
`planOverSelection` composes "remove the selection" and "apply the key" in TEXT space and
diffs the result, so the change set that reaches the editor is one minimal replacement rather
than a concatenation with mapped coordinates. That is the right shape for a dispatch; it is
simply not a shape from which the two steps can be recovered afterwards.

Two constraints shape the fix:

- **The abandon is not an inversion of the keypress.** `structural-history-integration`
  already decided that leaving a list from an empty item is a deliberate act whose blank line
  is abandonable while the item itself is not. Any single "reverse what happened" rule
  contradicts that.
- **The recogniser is not in question.** Which dispatches may create a place, and whether the
  caret has landed on one, are answered today by this plugin's own `userEvent` markers plus a
  parse of the result. Those answers are correct and stay; only the removal EDIT moves.

## Goals / Non-Goals

**Goals:**

- The abandon edit is exact for every place the grammar can open, including one opened over a
  removed selection and one at the very end of a file.
- The rule that makes it exact is stated once and reads the same for every operation, rather
  than as a per-shape special case that grows with each new parent.
- `provisional-cleanup.ts` performs no arithmetic on document coordinates it did not receive.

**Non-Goals:**

- Re-founding how a place is RECOGNISED (see D5).
- Reaching a place re-created by redo — proposal.md, Out of scope.
- Any change to what a keypress does. This change alters only what abandoning it undoes; every
  plan's `changes` and `selection` stay byte-identical.

## Decisions

### D1 — The plan carries the abandon edit; nothing downstream derives one

The plan is the only place where both states exist at once: the document the operation acted
on, and the document it produced. Everywhere downstream sees a single fused change set.

`TxPlan` gains an optional abandon change set, expressed in the coordinates of the document
the plan produces — the same coordinate space the plan's `selection` already uses, so the
consumer needs no mapping. The keymap converts it to offsets exactly as it converts
`plan.changes`, and attaches it to the dispatched transaction; `provisional-cleanup.ts` stores
what it was given and applies it verbatim.

*Alternative considered — carry the extent as a line count* and keep the arithmetic. It fixes
assumption 1 and neither 2 nor 3: the module would still have to place the span itself and
still have to express the removal as a deletion. The whole failure class is coordinate
arithmetic performed by a module that was not there; halving it is not a fix.

*Alternative considered — dispatch the removal and the key as two transactions* so the abandon
can undo the second. Two history entries for one keypress, two verdict passes through
enforcement, and it discards the minimal-change-dispatch property the composition was built
for.

### D2 — Two forms, chosen by what the operation meant

- **Opened**: the operation's purpose WAS the place — `splitNode`'s gap-widening and node
  materialization, `insertSiblingHeading`, Shift+Enter's continuation. Its abandon is its own
  reversal: the diff from its result back to the text it acted on. Assumption 3 dissolves —
  renumbering, indentation, and anything else the operation wrote come back with it, because
  the reversal is stated in bytes rather than reasoned about in categories.
- **Residue**: the operation dissolved a node into a blank line — the empty-item ladder's
  `unwrapListItem`, and the `outdent` that dissolves rather than moves. Its abandon is the
  removal of that line. Reversing it would restore the `- ` the user pressed Enter to escape.

This is not a new distinction. It is exactly the one the module's two event lists already
draw, given the meaning it was missing: the list that may claim an empty NODE is the opened
family, and the two events in the gap list beyond it are the residue family.

*Alternative considered — one rule, "reverse the operation".* It is wrong for the residue
family by an existing decision, and making it right would mean asking whether a `- ` is
chrome or content — the question undo-on-abandon was designed never to ask.

*Alternative considered — one rule, "delete the place's lines".* That is today's rule, and it
is what leaves the ordered run misnumbered.

### D3 — A composed plan inherits its inner plan's abandon unchanged

`planOverSelection` produces its final text by applying the inner plan's changes to the
post-removal text. The outer plan's `changes` are a fresh diff against the ORIGINAL text, but
the document both describe is the same one — so the inner plan's abandon edit is already
expressed in the outer plan's coordinate space and is passed through verbatim, with no
re-derivation and no offset shifting.

That is the whole of the block-selection fix, and it is a pass-through rather than a
computation because the intermediate document is where the abandon was always defined.

The same holds for the non-cover branch, where the selection is a character range inside one
node: the abandon returns to the text with the range removed, so abandoning an Enter that
replaced a word leaves the word deleted. That follows from the same rule rather than being a
second case.

### D4 — The abandon is built with `editsToChanges`, not with line offsets

Both forms are naturally line-level: a reversal is `diffLines(result, source)`, a residue
removal is a one-line splice. Converting either to editor changes is exactly what
`editsToChanges` does for every structural dispatch, including at a document's end and in a
file with no trailing newline — which is assumption 2, fixed by reuse rather than by a second
implementation of the same arithmetic.

*Alternative considered — teach `reverseFor` the end-of-document rule* ("take the preceding
newline when the span ends on the last line"). It is a correct rule and a third place in the
codebase that would know it.

### D5 — Recognition stays where it is

Whether a transaction may have created a place, and whether the caret is on one, are decided
as they are today: the plugin's own `userEvent` markers, plus `emptyPlaceAt` on the resulting
document. The presence of an abandon edit does NOT become the recogniser, for a measured
reason — Shift+Tab and the ladder's outdent both dispatch `input.structure.outdent`, and only
the one that dissolves an item into a blank line has an abandonable place. Outdenting a nested
empty `- ` produces an empty NODE the operation merely moved, which the node-list already
excludes; making "carries an abandon edit" the test would admit it and delete the user's item
when the caret moved away.

So the plan states an abandon edit for the operations that can leave a place, the module
decides whether one was left, and the two answers are independent by construction. Where they
disagree the result is no cleanup, which is the safe direction.

### D6 — The abandon is a change SET, and its caret is mapped through it

A reversal may restore text as well as remove it, so the record can no longer hold one
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
  a task re-checks the classification with a restoring abandon rather than assuming it.
- **The plan gains a field every branch must fill** → Absent means "no place to abandon", and a
  branch that forgets it degrades to the pre-feature behavior (the place stays). The failure
  direction is the same one every guard in this module already chooses. A test asserts the
  field's presence per branch so an omission is caught as a fact, not as a missing cleanup.
- **The delta is stated against a requirement that lives on an unarchived base branch** →
  `enter-and-shift-enter-grammar` (#43) introduces the requirement this change renames and
  restates. If that change's own text moves before it archives, the MODIFIED block must be
  re-copied from it. A task re-reads the base delta immediately before implementation.
- **Fixing the ordered-run case here overlaps `fix-ordered-renumbering-on-removal` (#44) in
  subject but not in mechanism** → #44 fixes what `deleteSubtrees` renumbers TO; this fixes an
  abandon that never renumbered at all. Neither depends on the other, and a task pins the
  ordered case at both layers so a later change to one does not quietly cover for the other.

## Migration Plan

None. No stored data, no settings, no file format. The behavior change is confined to a
gesture that today leaves debris.
