## Context

See proposal.md — Why. The evidence base is `docs/research/15-enter-and-shift-enter-catalogue.md`:
49 cursor positions run through `planKey` and `splitNode` themselves, with the resulting tree
re-parsed and printed, so every claim below is a measurement rather than a reading of the code.

Three constraints shape everything:

- **Enter's meaning is distributed across two layers.** `grammar.ts` decides which operation a
  key means; `ops.ts` decides what that operation does at a position. A rule about what a KEY
  means goes in the grammar; a rule about what a POSITION means goes in the operation.
- **Markdown has no empty paragraph and no empty heading title.** Every awkward case traces
  back to this. A list item and a heading DO have empty encodings (`- `, `## `), so the answer
  differs by destination kind, not by which key was pressed.
- **The plugin holds no editor state.** `caret-placement-policy` and `node-selection-extension`
  both rejected a `StateField` deliberately. That constraint decided D1 below, after the
  opposite design had already been chosen and had to be withdrawn.

## Goals / Non-Goals

**Goals:**

- One rule per position, not one per (kind × has-children × first-child-kind) combination.
- Every new placement expressed through existing machinery: `outdent` for the empty-item
  ladder, `encodingKindAtDestination` for what an empty position materializes as,
  `caret-policy.ts` for every caret.
- The file is left as the user would have written it: no debris from an unused keypress, no
  gap wider than something needs it to be.

**Non-Goals:**

- Changing the content-adjacent interior split.
- Introducing document-level or editor-level state. The one cache this change adds is
  transient and fail-safe (D6).

## Decisions

### D1 — Enter's provisional position is blank-separated; Shift+Enter's is adjacent

This is the load-bearing decision, and it was reached by withdrawing its opposite.

The obvious complaint about an end-of-node Enter is that it writes two blank lines the user
did not ask for, when a single blank line already separates the two paragraphs. A "minimal"
design — move the caret onto the existing separator, write nothing, and rewrite the typing
transaction later to insert the separation the new node needs — was chosen in review and then
found unbuildable. At the end of a top-level paragraph, both keys leave the caret at column 0
of the line below:

```
thought|                  thought                 thought
                    →     |          and    →     |
next                      next                    (a line Shift+Enter inserted)
                                                  next
```

Typing `x` must produce a NEW NODE in the first case and a CONTINUATION LINE in the second,
and the caret is in the same place in both. The only remaining difference is gap width, and
`node-edit-enforcement` forbids reading editing intent from gap width — the chrome-transparency
rule, which exists because that exact leak was the defect a previous change was written to fix.
For a list item the content column would separate the two cases; at a top-level paragraph the
content column is 0 and it collapses.

Disambiguating would require remembering which key ran: a `StateField` carrying the position
and its intent, invalidated by every other edit path, and interacting with undo. That is the
state this codebase has twice declined to introduce.

So the two blank lines are not a stylistic choice — they are the ENCODING of the distinction,
and the only one the parse can read on its own. The requirement is therefore written as a
property of the two positions (separated vs adjacent) rather than as a blank-line count, so it
states what is load-bearing rather than the arithmetic that happens to implement it.

What made the complaint legitimate is answered by D6 instead.

### D2 — Enter acts on the empty position adjacent to the cursor

One rule with two directions replaces four kind-specific behaviors:

| Cursor | Position | Scope |
|---|---|---|
| content END | below | child scope if the node has children, else sibling scope |
| content START | above | sibling scope |
| interior | — | ordinary split, unchanged |

What the position materializes as is decided by the DESTINATION SCOPE's kind — the existing
`encodingKindAtDestination` — not by the node's own kind. That single substitution answers
every case the catalogue found inconsistent:

- End of `# Head` → child scope → paragraph → no empty encoding → provisional position.
- End of `# Head` whose children are list items → child scope → list item → a real `- `.
- Start of `# Head` → SIBLING scope → heading → a real `## `/`# ` at the same level.
- End of `- item` whose first child is a paragraph → child scope → paragraph → provisional
  position between the item and that child, which is the E10 fix. It falls out of the rule
  rather than being a patch for that shape.

The caret goes to the empty position in both directions (chosen in review). For a childless
list item and for a top-level paragraph, the content-start case produces the same document it
produces today; only the caret and the with-children/heading cases change.

**Corroborated by Logseq**, cross-checked after the rule was chosen (2026-08-09): pressing
Enter at a block's start there shifts the block down and keeps the caret in the new empty
block above — the same answer this rule gives, arrived at independently. That is worth
recording precisely because the rule was chosen from an intuition rather than from a survey:
an established outliner landing in the same place is evidence the intuition tracks something
real about the gesture, not a personal preference this project would be alone in holding.
Where we deliberately differ from the reference outliners, the reasoning is written down (the
content-adjacent split, D2 above); where we agree, it is worth knowing we did not reinvent it.

### D3 — A heading may take a sibling, but only where nothing is being split

`structural-operations` forbids heading siblings on the grounds that a plain-text split has no
heading-sibling encoding. That reasoning is about SPLITTING: dividing `# Hello world` into two
headings would invent a level for the remainder and lose the sentence boundary. It does not
apply when nothing is divided — inserting `# ` above `# Hello`, or `## ` below `## Foo`, is
ordinary sibling insertion at a known level.

So the restriction is narrowed rather than dropped: interior splits still always produce a
child; the content-start insertion and Shift+Enter's sibling heading are exempt. Both go
through a dedicated operation (`insertSiblingHeading`) rather than relaxing `splitNode`'s
heading branch, so the split path cannot drift into producing siblings by accident.

The new heading is always ATX. A setext heading with an empty title has no encoding at all
(`\n====` re-parses as a thematic break or as an underline for whatever precedes it), so a
setext original cannot yield a setext sibling in the common case; one rule beats two that
differ by whether the author used underlines.

### D4 — The empty-item ladder is grammar-level routing over existing operations

Enter on `- ` means "leave this list", which is a statement about the KEY. `splitNode` called
at that position still splits; nothing else calls it there, since split has no palette entry.

Routing: attempt `outdent`; on ANY rejection attempt `unwrapListItem`; surface the second
rejection's cue if that fails too. A fall-through rather than a restatement of when outdent is
possible — those rules (top level, heading parent, grandparent expressibility) already exist in
one place with their own tests, and a copy in the grammar would drift.

Test order inside the `split` case is fixed and load-bearing: existing declines, then the
empty-item ladder, then content start, then ordinary split. An empty item's content start IS
its end, so the ladder and the content-start rule overlap on exactly that shape; the ladder
first makes the overlap harmless.

An item whose only content is an unchecked task marker counts as empty. That is a carve-out,
and it is justified by D5: we wrote that marker, so requiring the user to delete it before the
ladder works would punish them for our own continuation rule.

### D5 — Task continuation is a marker rule, not a model change

`- [x] done` splitting into `- [x] done` + `- [ ] ` needs one addition to the marker-prefix
computation `splitNode` already does for bullets and ordered numbers. It does NOT require
deciding that `[ ]` is chrome — the caret still reaches it, Home still lands before it,
decorations are untouched. That larger question stays out of scope, and this change must not
smuggle it in by making any other behavior depend on task-ness.

### D6 — Abandonment REMOVES the place; undo was tried first and withdrawn

An unused keypress leaves debris, and the fix is to remove the place it made as its own
undoable edit.

Undo was the first answer, and it was wrong for a reason only implementation exposed: it
reverts everything the keypress did, and a keypress can do more than open a place. Enter
over a block selection removes the selection AND opens one, so abandoning brought the
deleted text back. A targeted removal keeps the rest of the keypress standing.

The three objections that originally argued against "just delete it" were objections to
COMPUTING a deletion, not to deleting: a recorded span needs no decision about what counts
as removable content (whether a `#` is content and a bullet is chrome), and no guess at a
gap's minimal width. The extra history entry, which the undo design treated as a cost, is
what makes ONE undo return to the empty place — the behaviour a user who changes their mind
twice expects.

**What gets removed** is one rule: the place's own line, plus however many lines the
keypress added beyond it. That covers the two-line gap widen, a materialized `- ` or `## `,
and the single line an unwrap leaves — replacing per-operation special cases that had been
growing once per parent shape. A place on the last line takes the PRECEDING line break,
since it has no following one and the removal would otherwise be a silent no-op.

**What counts as creating a place** is decided by where the caret lands, not by which
operation ran — and that is the subtlest thing this change learned. A dispatch of ours that
leaves the caret on a GAP LINE necessarily created that position, because a gap line is a
place and not a node: there was nothing there to land on. An EMPTY NODE can pre-exist the
keypress, so only the dispatches that materialize one qualify.

Keying on the operation was tried and failed in real use, because WHICH operation dissolves
an empty item into a blank line depends on the item's PARENT. At the top of a list, or under
a heading, Enter unwraps it. Under a paragraph the same press OUTDENTS it — the item becomes
a sibling of the paragraph, the reparent rule encodes it as a paragraph, and an empty
paragraph has no encoding. Identical place, different event, and the whitelist missed one.

**The history-join property** the undo design rested on — a structural `userEvent` is never
joined into the entry before it — is no longer safety-critical, since nothing pops history.
Its test stays: the removal's own event must also stay outside those families, or one undo
would rewind past the keypress instead of returning to the place.

**Two shapes remain uncovered**, both specified as known limitations rather than glossed: a
place opened over a block selection (the plan's changes are a minimal diff in which the
deletion and the insertion are not separable — the fix is for the planner to carry the exact
removal edit, computed where the intermediate state is known), and a place restored by redo
(the recorder re-arms only for our own dispatches, and two ways to recognise a redo both
failed to fire).

### D7 — Selection handling is one composed rule

"Remove the selection as Backspace would, then apply Enter at the resulting caret" makes the
text-range case and the block case the same rule, and both reuse machinery that already exists
(the enforcement layer's structural deletion, and the caret the deletion convention produces).
Multi-cursor declines: planning `selection.main` while dispatching a single cursor discards
every other range with no document change to undo, which is the failure `soleCursor` guards
the motion handlers against.

### D8 — Separation is minimal everywhere except one convention

Every gap stays at the width something needs, with one exception: a heading and its first
paragraph child get a blank line. The list-item version of that rule is required by the parse
(without it the indented text is a continuation line); the heading version is required only by
convention, and is adopted because every operation that omits it produces markdown a reader
would call malformed. Naming it as the single exception is what keeps "a blank line is here
because something needs it" true of the encoding as a whole.

### D9 — One indentation rule, shared with paste

`destinationIndent`'s sibling lookup widens from "the first list-item sibling" to "the first
sibling, whatever its kind". Siblings share an indentation level by construction, so their own
whitespace is better evidence than an inferred unit — and the inferred unit produced the
measured tree-shape bug where a new 2-space child adopted a tab-indented existing sibling as
its own child. `insertSubtrees` and `reencodeBlocksForDestination` call the same function, so
the paste suites are the regression surface. Keeping one function is the point.

### D10 — No change to `caret-placement-policy`

Every new placement fits an existing case: the content-start insertion, the unwrap and the
sibling heading are `exact` (the operation states a position mapping cannot recover), and the
empty-item outdent is `derived` (D4 — the same case Tab's outdent uses, so the two entry points
to one operation cannot place the caret differently).

## Risks / Trade-offs

- **Existing split expectations encode the old whitespace behavior** → `tests/split.test.ts`'s
  paragraph cases split AFTER a space, so they pass either way by accident. Every existing
  expectation is re-read rather than assumed unaffected, and a deliberate before-the-space case
  is added.
- **The content-start caret moves where the caret used to follow the text** → for a childless
  item and a top-level paragraph the DOCUMENT is unchanged and only the caret differs, so the
  regression surface is caret assertions, not document assertions. Both are pinned explicitly.
- **Undo-on-abandon is a document change triggered by a caret move** → scoped by three
  independent guards: only when the caret was on a place the keypress created, only when
  nothing was typed there, and only when that keypress is still the top of the history.
  Failing any guard means doing nothing.
- **The cleanup rests on a `userEvent` naming convention** → pinned by a test with a negative
  control (rename the event in the test's fixture and the swallow-preceding-typing scenario
  must fail).
- **Widening `destinationIndent` changes paste** → strictly more informed, but shared; the
  paste and closure suites run before and after.
- **Six capabilities change at once** → three of them (`content-space-caret`,
  `node-edit-enforcement`, `document-tree-mapping`) are corrections to statements that were
  already false or already absent before this change, carried here because this change is what
  makes them load-bearing. They add no behavior of their own, which keeps the implementation
  surface at the two capabilities the proposal started with.

## Sequencing

`paste-heading-section-reencoding` is in flight and also modifies `structural-operations`, but
a different requirement (context-determined encoding on reparent) than the ones this change
touches. The deltas do not overlap textually. They meet in code — both live near
`reencodeBlocksForDestination`/`destinationIndent` — so whichever lands second re-runs the
other's suites rather than assuming independence.

## Open Questions

- Whether the empty-item ladder should extend to an empty PARAGRAPH position — Enter on a
  provisional line currently declines to stock. No measured case asks for it, and a paragraph
  has no depth of its own to outdent from except through its parent's.
