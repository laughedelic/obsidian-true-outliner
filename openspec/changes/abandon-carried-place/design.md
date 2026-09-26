# Design

## Context

`provisional-cleanup` keeps two records per view: the PLACE record (which line holds an open place)
and the REMOVAL record (the edit that removes it, stated by the plan that made it). Both are
dropped on every document change, and both are re-established from the dispatch that caused it by
one function, `recordDispatch`. The CodeMirror listener calls it for a keypress, and `runOp` calls
it for a command, which dispatches through Obsidian's `Editor` and so cannot be recognised by the
listener. What each structural key's dispatch states about itself — its `userEvent` and the form of
its removal edit — is one table in `grammar.ts`, `STRUCTURAL_DISPATCH`, read by both paths.

The place record already survives a carry. The removal record does not, because a carry is neither
a creating event nor, for indent, a plan that states any removal. What that does in each shape,
and why the old removal cannot be mapped through the carry, is in
`docs/research/carried-place-removal`.

## Goals / Non-Goals

**Goals:**
- One rule for every carrying dispatch — keyboard, command, the ladder's outdent — through the
  paths that already share `recordDispatch` and `STRUCTURAL_DISPATCH`.
- No new cost on a Tab that carries nothing, since Tab is held down in runs.

**Non-Goals:**
- Changing which dispatches CREATE a place, or the removal a creating dispatch states.
- Moves.

## Decisions

### D1. The carrying plan states the removal again; nothing is mapped

The carrying operation knows where the place is in its own result — its caret is on it — so it
states the removal against that result, the same way a creating plan does. Mapping the removal the
place was opened with through the carry was measured to leave the carry's new indentation behind
as trailing spaces (`docs/research/carried-place-removal`, last section of "Why").

Alternative considered: compose the carry's REVERSAL with the original removal. That removes the
place exactly, but it also undoes what the carry did to the item, which the specified behaviour
says stands.

### D2. A removal form that removes whatever place the caret is on

A new `AbandonForm`, `drop-place`, read over the operation's RESULT at the caret's line:

- a provisional position — the line is not one of a node's own lines — is removed as a line, which
  is what `drop-line` states today;
- an empty list item or empty heading with no children is removed with `deleteSubtreeGroups` over
  the result's parse. That is the operation every structural deletion already uses, and it
  renumbers the run the node leaves. Measured on every node shape in the note, it gives back the
  document before the opening key (`docs/research/carried-place-removal`, "Removing a carried
  empty node");
- anything else states no removal.

Alternative considered: `drop-line` for nodes too. It removes the right line but not the
renumbering. After Shift+Tab moves an empty ordered item ahead of `3. q`, `q` would keep a number
that counts an item no longer there.

### D3. Who states `drop-place`

- **Outdent** states it in place of `drop-line`. Over a gap line the two forms are the same edit,
  so the creating path — the empty-item ladder dissolving an item, Shift+Tab over a fresh place —
  is unchanged. Over an empty NODE the new form is what a carried record needs. `recordablePlace`
  still excludes outdent from the node-creating events, so the form alone never creates a record.
- **Indent** states it only when the plan was handed a place line, which is exactly when it can be
  carrying one. A Tab with no place states nothing, so the keymap still builds no second document
  for a held run.

`STRUCTURAL_DISPATCH` carries this as the entry's form plus whether it applies always or only when
carrying. Both paths read the table, so the command path's `abandonEdit` call follows without
further change.

### D4. The recorder keeps a removal record across a carry

`recordDispatch`'s facts gain `carried`: the removal record that was live on the place the dispatch
BEGAN on, with its `startedAt` mapped forward through the dispatch's changes. It is absent when no
live record was on that line. After the existing creating branch, a new branch writes a removal
record when all of these hold:
- nothing was created;
- `carried` is present;
- the event is a carrying event;
- the plan stated a removal;
- `placeLineAfter` found the caret on an empty place.

The record takes the post-carry undo depth, the new line, the stated edit and the mapped
`startedAt`.

The listener reads `carried` from its own record before it drops it. `runOp` reads it before
`editor.transaction`, through an export that answers what `liveRecord` answers. Its `startedAt`
is mapped through the same change set `runOp` already builds for its own `startedAt`.

`startedAt` is mapped rather than dropped: it is a position, not a deletion, and the carry's
change set is its minimal diff, so the opening key's start lands where it now is. Dropping it would
send ⌫ to the derived fallback, "the node above the place". That coincides for every measured shape
but is the rule the spec says not to rely on.

### D5. Undo depth

A carry is its own history entry, so the carried record takes the depth AFTER the carry. The
existing guard, which drops a record whose depth has moved, then works unchanged. An undo of the
carry changes the document, which drops the record anyway.

## Risks / Trade-offs

- [A removal record outliving what it describes] → It is written only over a record that was live
  on the very line the dispatch began on, only for a carrying event, and only where the caret
  landed on an empty place. Each of those is a condition the current code already tests, so
  nothing here loosens one.
- [An empty node that has children] → No removal is stated, so the record is not kept and the
  node stays. The same holds wherever `drop-place` finds no place it can remove.
- [`keymap.ts`'s note on the selection handlers says a carry leaves the place record without a
  removal record] → After this change the removal record is back after a carry, so a selection
  that leaves the place abandons it, as for a fresh place. The note is rewritten, and the handlers
  need no change.
