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

### D6 — Abandonment is undone, not deleted

The complaint D1 could not answer — an unused keypress leaves debris — is answered here, and
the mechanism came out of review: rather than dispatching a change that deletes what the
keypress made, UNDO the keypress.

Every objection to a deletion evaporates. A deletion adds an undo step the user did not ask
for (or is unundoable if it suppresses one); it has to decide what counts as removable
content, which drags in whether `#` is content and a bullet is chrome — a question with a real
answer that has nothing to do with abandonment; and it can only narrow a gap to what the rule
believes is minimal, where an undo restores the original bytes.

The mechanism rests on a property that had to be checked rather than assumed:
`@codemirror/commands` joins a change into the previous history entry only when the
`userEvent` matches `/^(input\.type|delete)($|\.)/` (`joinableUserEvent`, dist/index.js:471).
`input.structure.split` cannot match, so a structural keypress is ALWAYS its own history
entry and undoing it can never swallow the typing that preceded it. That is a dependency on
our own naming, so it is pinned by a test — renaming a structural event into the `input.type`
family would silently turn this cleanup into data loss.

The one piece of state is a per-view transient record of the undo depth at which a provisional
position was created, used to confirm the keypress is still the top of the history. It holds
no document data, and losing it degrades to today's behavior (leave the empty place), so it is
fail-safe by construction rather than by careful invalidation. After the undo the caret target
is mapped through the inverted change, since the lines the gesture was aimed past may be the
ones removed.

Known consequence, recorded rather than mitigated: Redo immediately after a cleanup re-applies
the keypress. Any other edit clears the redo branch first.

**Deleting the place is the same gesture as leaving it.** A provisional position stands for an
empty node, so Backspace and Delete on it act on that node, not on the gap around it: they
cancel the keypress through the same undo path, differing only in where the caret lands
afterward (the node above's content end for Backspace, the node below's content start for
Delete). Narrowing the gap by one line instead — the native reading — leaves a caret on a
blank line that silently joins a neighbour, which is a broken state reachable by one keystroke.

For a REAL empty node the two readings already agree: Backspace at the content start of an
empty `- ` merges it into the previous item, which produces exactly the document and caret the
cancel produces. That agreement is worth a test rather than a comment, because it is what
makes the rule safe to state uniformly.

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
