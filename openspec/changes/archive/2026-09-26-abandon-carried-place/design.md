# Design

## Context

`provisional-cleanup` keeps two records per view.
- The PLACE record says which line holds an open place.
- The REMOVAL record holds the edit that removes the place, stated by the plan that made it.

Every document change drops both. One function, `recordDispatch`, re-establishes both from the
dispatch that caused the change. The CodeMirror listener calls it for a keypress, and `runOp` calls
it for a command, which dispatches through Obsidian's `Editor` where the listener cannot recognise
it.

`STRUCTURAL_DISPATCH` in `grammar.ts` is one table saying what each structural key's dispatch
states about itself: its `userEvent` and the form of its removal edit. Both paths read it.

The place record already survives a carry. The removal record does not. A carry is not a creating
event, and indent's plan states no removal at all. `docs/research/carried-place-removal` records:
- what that does in each shape;
- why the opening removal cannot simply be mapped through the carry;
- which ways of removing a carried node were probed, and which one gives back the original.

## Goals / Non-Goals

**Goals:**
- One rule for every carrying dispatch: keyboard, command, and the ladder's outdent. It goes
  through the paths that already share `recordDispatch` and `STRUCTURAL_DISPATCH`.
- A Tab that carries nothing costs nothing new, because Tab is held down in runs.

**Non-Goals:**
- Changing which dispatches CREATE a place, or the removal a creating dispatch states.
- Moves.

## Decisions

### D1. Two removals, chosen by what the place was when it was opened

A carried place was opened either as a provisional position (a GAP) or as an empty NODE. The two
need different removals, because the carrying keys acted on different things.

- **Opened as a gap:** the carry moved the node the position belongs to. What it did to that node
  stands, so the removal is the position's LINE, stated against the carry's result. Outdent already
  states exactly this (`drop-line`); indent now states it too, when it carries.
- **Opened as a node:** the carries moved nothing but the empty node, and whatever that dragged
  along — siblings an outdent re-parents under it, runs it renumbers, the list's trailing gap the
  Enter handed it. So the removal takes all of that back. It is the carry's own REVERSAL, stated by
  the carrying plan in the `reverse` form against its result, composed with the removal the place
  held before the carry. Chained over several carries, it returns the document before the opening
  key.

The selector is the kind the record was OPENED with, which the record now keeps and every carry
passes on. The kind after the carry is the wrong selector. Under a paragraph, the ladder's outdent
dissolves an opened node into a blank line, and choosing by the result would state `drop-line` and
leave the sibling the outdent moved where it was. The review measured the composition restoring
that shape exactly. No carry was found that turns a gap into a node.

Alternatives considered, each measured (`docs/research/carried-place-removal`):
- **Map the opening removal through the carry.** It leaves the carry's new indentation as trailing
  spaces on the item's line.
- **Delete the empty node from the carried document** (`deleteSubtreeGroups`). It deletes the blank
  line after a list with the node, and it deletes or mis-numbers siblings an outdent adopted.
- **Drop only the node's line.** The blank line survives, but numbering the carry changed does not
  come back.

### D2. What the plans state, and when

`TxPlan` gains `carryReversal`: the `reverse` form of the operation's own change, in the coordinates
of its result. It is stated only by an operation handed a place line, the only time it can be
carrying one. For the same reason, indent states `drop-line` as its `abandon` only when handed a
place line; outdent keeps stating it always.

Four operations state `carryReversal`: indent, outdent, and the empty-item ladder's outdent and
unwrap. What decides it is a `carrying` flag on `planFromOp`, true exactly when the operation was
handed a place line. The ladder plans both of its operations without the place line `planKey`
receives, and it keeps doing so. The place line also steers how the RESULT is read for the caret,
and the ladder's caret placement is not what this change is about. So the ladder passes only the
flag. `STRUCTURAL_DISPATCH` records indent's "only when carrying" (`dispatchAbandon`). A Tab with
no place states nothing new, so the keymap still builds no second document for a held run.

The keymap dispatches `carryReversal` as an annotation beside `abandonEdit`. `runOp` computes the
same reversal from the funnel's result with `abandonEdit('reverse', …)` when it read a place line.

### D3. Reading the record a carry began on

A new exported pure function, `carriedRecord(record, startState, startedOn)`, answers whether a
removal record was live on the place the dispatch began on. It checks that the record's line is
`startedOn` and that its depth equals `undoDepth(startState)`.

It checks against the START state, and deliberately so. By the time the listener runs, the carry's
own history entry has raised the depth, so `liveRecord(view)` would always refuse. The listener
passes `update.startState` and its own record. The tests call the same function rather than
restating it.

The command path cannot reach the record, which is private to the module. So a second export,
`carriedRecordOf(view, startedOn)`, applies `carriedRecord` to the view's record and `view.state`.
`runOp` calls it before `editor.transaction`, while `view.state` is still the start state, with
the `placeLine` it already reads. It is the only way the record leaves the module, and it hands
back the record, including its removal edit and opening kind, only when the gate passes.

### D4. The recorder

`CreatedPlace` gains `opened: 'gap' | 'node'`: the kind the place had when it was created, passed
on unchanged by every carry. `recordDispatch`'s facts gain two things:
- `carried`: the record `carriedRecord` returned, with its `startedAt` mapped forward through the
  dispatch's changes;
- `reversal`: the change set the plan stated as `carryReversal`.

The branches run in this order:

1. **Carrying.** Runs when `carried` is present, the event is indent, outdent or unwrap, and
   `placeLineAfter` found the caret on an empty place. The removal is:
   - the stated `drop-line`, when `carried.opened` is a gap;
   - `reversal.compose(carried.abandon)`, when it is a node.

   Nothing is written if the removal it needs was not stated. Otherwise the record takes:
   - the post-carry undo depth;
   - the new line;
   - `carried.opened`;
   - `carried.startedAt`, mapped.
2. **Creating** (as today). A dispatch that did not begin on a recorded place, or whose event does
   not act on that place, creates its own. Shift+Enter on an empty item is one: it opens a second
   place, whose opening key is itself. The new record keeps its own start and its own kind.

Taking the carrying branch first is what keeps outdent over an opened gap from being handled as a
creation. Its creating record would carry the outdent's own start, and measured, ⌫ then lands in
the node below. Restricting the branch to the events that act on the place is what keeps a second
place from inheriting the first one's origin, which would send ⌫ past an empty item left standing.

`startedAt` is mapped through the dispatch's change set rather than dropped. It is a position, not
a deletion, and the carries' per-line changes never touch the opening line's end: the review
measured assoc −1 and +1 agreeing in every shape. Dropping it would fall back to "the node above the
place", the derivation the spec says not to rely on.

### D5. Undo depth

A carry is its own history entry, so the carried record takes the depth AFTER the carry. The
existing guard, which drops a record whose depth has moved, then works unchanged. An undo of the
carry changes the document, which drops the record. The place the undo restores has none, the
undo-side twin of the redone place the spec already names.

## Risks / Trade-offs

- [A removal record outliving what it describes] → It is written only when four conditions hold:
  a record was live on the very line the dispatch began on, measured at the dispatch's start
  state; the event is a carrying one; the caret landed on an empty place; and the plan stated the
  removal it needs. Each is a condition the current code already has in some form. None is
  loosened.
- [The reversal composes over the wrong base] → Composition needs the carry's start document to be
  the document the carried removal was stated against. Any other document change drops the record,
  and `cancel` still refuses a removal whose length does not match the live document. A mismatch
  therefore leaves the place standing, which is the safe direction.
- [New gestures now remove a carried place] → Enter on the place (`advanceFromEmptyPlace`), and
  the bullet drag's pick-up where its selection leaves the place, already remove a fresh one. They
  now remove a carried one too. The drag is otherwise out of scope: what a pick-up over an open
  place should do is #254. Until then, a drag right after a carry behaves as it does right after a
  plain Shift+Enter.
- [`keymap.ts`'s note on the selection handlers says a carry leaves the place record without a
  removal record] → That is no longer true. After this change a selection that leaves a carried
  place abandons it, as it does a fresh one. The note is rewritten; the handlers need no change.
