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

### D1. Two removals, chosen by the kind of place

A carried place is either a provisional position (a GAP) or an empty NODE. The two need different
removals, because the carrying key acted on different things.

- **Gap:** the carry moved the node the position belongs to. What it did to that node stands, so
  the removal is the position's LINE, stated against the carry's result. Outdent already states
  exactly this (`drop-line`). Indent now states it too, when it carries.
- **Node:** the carry moved nothing but the empty node, together with whatever that dragged along:
  siblings outdent re-parents under it, runs it renumbers, the list's trailing gap the Enter handed
  it. So the removal takes all of that back. It is the carry's own REVERSAL, stated by the carrying
  plan in the `reverse` form against its result, composed with the removal the place held before
  the carry. Chained over several carries, it returns the document before the opening key.

The recorder picks between the two by the kind `emptyPlaceAt` reports for the caret's place after
the carry.

Alternatives considered, each measured (`docs/research/carried-place-removal`):
- **Map the opening removal through the carry.** It leaves the carry's new indentation as trailing
  spaces on the item's line.
- **Delete the empty node from the carried document** (`deleteSubtreeGroups`). It deletes the blank
  line after a list along with the node, and it deletes or mis-numbers siblings an outdent adopted.
- **Drop only the node's line.** The blank line survives, but numbering that the carry changed does
  not come back.

### D2. What the plans state, and when

`TxPlan` gains `carryReversal`: the `reverse` form of the operation's own change, in the coordinates
of its result. Indent and outdent state it only when they were handed a place line, which is the
only time they can be carrying one. For the same reason, indent states `drop-line` as its `abandon`
only when handed a place line. Outdent states `drop-line` always, as it does today.
`STRUCTURAL_DISPATCH` carries both facts: for indent, "only when carrying". A Tab with no place
therefore states nothing new, and the keymap still builds no second document for a held run.

The keymap dispatches `carryReversal` as an annotation beside `abandonEdit`. `runOp` computes the
same reversal from the funnel's result with `abandonEdit('reverse', …)`, when it read a place line.

### D3. Reading the record a carry began on

A new exported pure function, `carriedRecord(record, startState, startedOn)`, answers whether a
removal record was live on the place the dispatch began on. It checks two things: the record's line
is `startedOn`, and its depth equals `undoDepth(startState)`.

It checks the START state, and that is the point. By the time the listener runs, the carry's own
history entry has already raised the depth, so `liveRecord(view)` would always refuse. The listener
passes `update.startState`. `runOp` reads the record before `editor.transaction`, while the state
is still the start state. The tests call the same function rather than restating it.

### D4. The recorder

`recordDispatch`'s facts gain two things:
- `carried`: the record `carriedRecord` returned, with its `startedAt` mapped forward through the
  dispatch's changes;
- `reversal`: the change set the plan stated as `carryReversal`.

Two branches write a record.

- **Creating** (as today). If `carried` is present, the record takes `carried.startedAt` instead of
  the creating key's own start. Backspace then returns to where the key that OPENED the place
  started. Measured, a Shift+Tab over a fresh position otherwise sends ⌫ into the node below.
- **Carrying** (new). It writes a record when all of these hold:
  - nothing was created;
  - `carried` is present;
  - the event is a carrying event;
  - `placeLineAfter` found the caret on an empty place.

  The removal is the stated `drop-line` for a gap, or `reversal.compose(carried.abandon)` for a
  node. If the one it needs was not stated, nothing is written. The record takes the post-carry
  undo depth, the new line and the mapped `startedAt`.

`startedAt` is mapped with the dispatch's change set, not dropped. It is a position, not a
deletion, and the carry's per-line changes never touch the opening line's end: the review measured
assoc −1 and +1 agreeing in every shape. Dropping it would fall back to "the node above the place",
the derivation the spec says not to rely on.

### D5. Undo depth

A carry is its own history entry, so the carried record takes the depth AFTER the carry. The
existing guard, which drops a record whose depth has moved, then works unchanged. An undo of the
carry changes the document, which drops the record anyway.

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
- [New gestures now remove a carried place] → Enter on the place (`advanceFromEmptyPlace`), and the
  bullet drag pick-up whose selection collapse leaves the place, already remove a fresh one. They
  now remove a carried one too, which the spec states. The drag pick-up's doc-change guard then
  cancels the drag, exactly as it does over a fresh place.
- [`keymap.ts`'s note on the selection handlers says a carry leaves the place record without a
  removal record] → That is no longer true. After this change a selection that leaves a carried
  place abandons it, as it does a fresh one. The note is rewritten; the handlers need no change.
