## Why

With outline mode on, Enter with the caret past a quote's or a callout's content start replaces
the whole node with the character before the caret and a line holding the node's prefix
(issue #155). Undo recovers it, but the destroyed range is the node, on the most ordinary keypress
there is, in a shape nobody treats as dangerous.

The grammar is not involved: it declines Enter on an atom, as `outline-keyboard-grammar` requires,
and stock behaviour runs. Measured in `docs/research/enter-inside-a-quote`, that stock behaviour is
not an insertion. Obsidian's continuation REPLACES the character before the caret with that
character, a line break and `> ` — one change of one character, whose inserted text parses as two
blocks. `classify`'s multi-block rule, written for a paste at a caret, checked only that the change
stayed on one line and never that nothing was deleted, so it read the continuation as a structural
paste. From there the verdict layer's deletion path escalated the one-character range to the whole
quote and replaced it with the two parsed blocks: the character, and an empty quote line. That is
the reported document exactly.

The same rule is reached by a structural payload pasted over a selected word inside one node, and
there `paste-lands-where-it-is-pointed` pins the type-over reading (`tests/enforce.test.ts`, "the
insertion path does not change the answer"). What separates #155 from that shape is that no
selection was ever made — and the transaction says so.

## What Changes

- **A new classification fact: whether the pre-edit selection was empty.** The adapter already
  supplies the pre-edit cursor for the chrome-boundary shapes; it now also supplies
  `tr.startState.selection.main.empty`. Design D1.
- **The multi-block rule declines a replacement made from a caret.** A change on one line that
  deletes something, made while the selection was empty, is the editor rewriting text around the
  caret, and the block sequence its inserted text parses to was never pasted or typed over
  anything. A pure insertion at a caret is still a paste; a replacement over a range is still a
  type-over; a caller that does not supply the fact keeps today's reading. Design D2.
- **Nothing in the verdict layer changes.** The keypress now classifies `within-node-edit` and
  never receives a verdict, per `transaction-classification`'s default-permit. Design D3.

## Capabilities

### Modified Capabilities

- `transaction-classification`: gains "A replacement synthesized around a caret is not a paste" —
  the multi-block reading applies to a pure insertion, and to a replacement only when the user had
  a selection to replace.

`outline-keyboard-grammar` needs no edit: "On an atom, Enter SHALL decline the key, because stock
behavior is already the next line of its own kind" is the promise, and this change is what makes
the funnel keep it. `node-edit-enforcement` needs no edit either: its structural-paste requirement
is stated over "a paste or text drop", and a keypress that never reaches the verdict layer is
outside it.

## Impact

- `src/classify.ts`: `TransactionFacts.emptySelectionBefore`; `isMultiBlockInsertion` reads it.
- `src/plugin/transaction-filter.ts`: the adapter supplies the fact.
- `tests/classify.test.ts`, `tests/enforce.test.ts`: the caret shape, the selection control, the
  pure-insertion control.
- `e2e/specs/62-outline-edit-enforcement.e2e.ts`: Enter inside a quote, mid-line, in a callout and
  in a list inside a quote is byte-identical to stock, caret included, with no rewrite recorded.
- `docs/research/enter-inside-a-quote.md`: the measurements above.

## Non-goals

- **Requiring a pure insertion for the multi-block rule**, as the rule's own comment describes.
  It closes #155 and reverses the type-over reading #122 pinned two days ago for a structural
  paste over a word; the selection fact keeps that decision where it is
  (`docs/research/enter-inside-a-quote`, "Two fixes rejected").
- **Minimizing a change before classifying it** — trimming the prefix the deleted and inserted
  texts share. Measured unsafe for a real type-over whose typed text begins with the selection's
  first character: the typed character is trimmed away and deleted with the covered nodes.
- **The escalation of a partial in-node range to the whole node** in `computeDeletionVerdict`.
  A one-character SELECTION typed over with structural text still replaces the node it sits in.
- **Issue #115**, a caret-derived "delete to line start" whose range exactly covers a paragraph.
  It names this same fact as a candidate discriminator; the fact is now available to that rule,
  and wiring it there changes what an exact cover means, which is that issue's own change.
