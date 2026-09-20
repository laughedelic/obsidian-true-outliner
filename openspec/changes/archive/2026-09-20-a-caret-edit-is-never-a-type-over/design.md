## Context

`classify` admits a change whose line span stays inside one node as `boundary-crossing-edit`
through four rules, each recognizing a shape a line span cannot see. One of them,
`isMultiBlockInsertion`, was written for a paste at a caret: an inserted text that parses as a
structural block sequence, landing on a node's own line. It tested that the change stayed on one
line and that the text parsed as more than one block, and nothing about what the change removed.

Obsidian's own Enter inside a quote produces a one-character replacement whose inserted text is
that character, a line break and `> `. Two blocks; one line; the rule fires; the deletion path
escalates the range to the quote and replaces it. The measurements are in
`docs/research/enter-inside-a-quote`, including every row of the issue's table driven through both
gates and the same reading reached by a paste over a selected word.

## Goals / Non-Goals

**Goals:**

- Enter inside any quote shape is byte-identical to stock, caret included.
- A structural paste at a caret, and a structural paste or type-over over a selection, keep the
  readings they have today.
- The verdict layer is untouched.

**Non-Goals:**

- Reopening the escalation of a partial in-node range to the whole node.
- Closing issue #115, which shares the fact but changes a different rule.

## Decisions

### D1 — The fact is the pre-edit selection's emptiness, supplied by the adapter

The transaction carries what separates a continuation from a type-over: whether the selection was
empty when the change was made. Obsidian's continuation runs from a caret; a type-over runs from a
range. The adapter already reads the pre-edit selection for `cursorBefore`, and now also supplies
`emptySelectionBefore`: true when EVERY range of `tr.startState.selection` is empty. Every range
rather than the main one, because a multi-caret continuation is synthesized at each caret while a
selection that mixes a caret with a range holds something the user did select — the type-over
reading stays with it, which is the conservative direction.

Optional, like every fact the chrome-transparency amendment added, so that no pre-existing call
site or test changes meaning. A caller that does not say keeps today's reading — the conservative
direction for the callers that exist, all of which are type-over tests.

### D2 — One rule reads it, and declines only a replacement

`isMultiBlockInsertion` declines when the change deleted something (`fromCh ≠ toCh` on the one
line it touches) AND the selection before it was empty. Everything else is as it was:

- a pure insertion at a caret is a paste, whatever the selection fact says;
- a replacement over a range is a type-over, and reaches the deletion path as before;
- a replacement whose line span crosses a boundary, or that exactly covers a subtree, is admitted
  by the rules ahead of this one, which read no selection fact.

The alternative of a pure-insertion gate — the rule's own comment describes it that way — was
rejected because it also turns a structural paste over a selected word into a native paste,
reversing the type-over reading `paste-lands-where-it-is-pointed` pinned. The alternative of
minimizing the change first, so `a` → `a\n> ` reads as the insertion it is, was rejected because a
type-over whose typed text begins with the selection's first character trims to a deletion and
loses the keystroke. Both are in the note.

### D3 — The verdict layer does not change

The keypress classifies `within-node-edit` and never receives a verdict. This is
`transaction-classification`'s default-permit doing what it is for: an edit the classifier does not
recognize with confidence falls to the less specific class. The deletion path's escalation of a
partial range is left as it is, so the shapes #122 decided keep their answers.

## Risks / Trade-offs

- A caret-originated replacement that SHOULD be structural would now pass natively. None is known:
  a paste or drop at a caret is a pure insertion, IME input is its own class, and every other
  synthesized replacement measured (Shift+Enter, typing, a fence) parses as one block either way.
  The failure direction is editable text rather than a relocated node.
