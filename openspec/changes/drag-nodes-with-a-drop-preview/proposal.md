## Why

Every reference outliner moves a node by dragging its bullet. We move one by command or hotkey
only, one sibling step at a time — reaching a node three levels away and four screens down means a
cut, a scroll, a click and a structural paste, and the reader has to be right about the depth
before the paste happens rather than while it is being aimed. The gesture the whole category is
built on is missing.

Two facts settled by measurement make it buildable now rather than later
(docs/research/node-drag-and-drop.md). The gutter has no unclaimed run left in it, so the drag
attaches to the mark that is already there instead of asking for a column that does not exist.
And a task's checkbox — the one mark `outline-zoom` had to decline, because its click toggles the
task — turns out to claim only the click and not the press, so a task is draggable by its own mark
like every other kind.

The half that matters most is the one a drag is usually worst at. A seam between two rows stands
for as many destinations as there are levels flanking it — six, in the ordinary fixture the
companion mockup draws (docs/research/prototypes/drop-indicator.html) — and an indicator that only
says which two rows the run goes between leaves the reader to guess the rest from a few pixels of
horizontal offset. A drop whose landing place was not obvious before the release is a drop that
has to be undone.

## What Changes

- **A node is picked up by pressing its mark and moving.** The same press `outline-zoom` already
  owns: the threshold tells the two gestures apart. A press that does not move still zooms, and a
  modified press is still left alone.
- **BREAKING (gesture timing): a mark's click zooms on RELEASE, not on press.** Measured: the zoom
  fires at `pointerdown` today, which is before a drag could have declared itself. The zoom's
  effect is unchanged; only the moment it happens moves.
- **A block selection drags as a unit.** What the gesture picks up is the operand rule
  `selection-structural-ops` already states — the selection's covered subtrees when the pressed
  node is inside the cover, that one node's subtree otherwise — so dragging several nodes is the
  same gesture and not a second one.
- **A drop is one structural operation**, with the operand's subtrees removed and re-inserted at
  the destination, re-encoded for it: one transaction, one undo step, the caret and the fold state
  carried, exactly as `editor-structural-commands` requires of every other structural operation.
- **The destination is a seam and a depth**, and the pointer names both: its vertical position
  picks the seam, its horizontal position picks a depth among the ones that seam can legally
  offer. Depths the operation would reject are not offered at all.
- **A drop preview says where the run will land, and what it will become**: an indicator at the
  seam whose left end sits on the column the run's first mark will occupy, the mark it will have
  *after* re-encoding drawn at that column, and the destination parent accented so it is named
  rather than counted. The preview is computed by the same resolution the release performs, so the
  two cannot disagree.
- **The picked-up run renders as lifted** while the drag is in flight, and the document does not
  move until the release. Escape, or a release outside any legal destination, cancels with nothing
  written.
- **A touch drag starts on a long press**, which is what separates it from a scroll.
- The drag is confined to the zoom scope and declines inside nested editors, on the same terms
  every other gesture in this plugin does.

## Capabilities

### New Capabilities

- `node-dragging`: the pointer gesture that moves a node or a block selection — what a press on a
  mark means, what it picks up, which destinations a pointer position can name, what the preview
  promises, and what the release writes.

### Modified Capabilities

- `outline-zoom`: the mark-click requirement gains the moment the click resolves, and states that
  a press which moves is a different gesture rather than a zoom.
- `structural-operations`: a move to a named destination joins indent, outdent and reorder as an
  operation of the algebra, so the drop is not a bespoke composition of a delete and an insert.
- `outline-decorations`: the lifted treatment for a run in flight, and the drop preview's own
  chrome — which column its indicator anchors to, and how the ghost mark is drawn.

## Impact

- `src/ops.ts`: a move-to-destination operation over the existing `deleteSubtreeGroups` /
  `insertSubtrees` / `reencodeBlocksForDestination` machinery.
- `src/plugin/zoom-click.ts`: the press resolves at release, and grows the drag it can become.
  One listener, not a second one racing it — the module comment already says why.
- New: the drag's own state field and its destination arithmetic, and the preview's decorations in
  `src/plugin/decorations.ts`.
- `styles/`: a new part for the preview and the lifted treatment, per the one-part-per-feature
  rule.
- `tests/ops.test.ts` and `tests/closure.test.ts` for the operation; a new e2e spec with its
  helpers beside it, driven by a real pointer — which the measurement pass confirms reaches a mark
  on desktop.
- Interacts with `paste-heading-section-reencoding`, which decides what a cross-regime payload
  becomes. This change consumes that rule wherever it lands and does not decide it.

## Non-goals

- **Dragging text.** A character-level drag, and the native text drop that follows it, keep the
  behaviour `node-edit-enforcement` already gives them.
- **Dragging out of the editor** — to another pane, another note, another window, or another app.
- **Zooming a task by pointer.** The measured finding frees the checkbox's press, not its click;
  the affordance-budget entry's question about the task's zoom stays open in
  docs/research/decoration-follow-ups.
- **Hovering a folded node to open it.** A drop into a folded node opens the fold, which is
  `outline-folding`'s existing rule; a dwell that expands mid-drag is a separate affordance.
- **A menu on the mark.** The third gesture the affordance budget names is untouched here.
- **A setting to turn the gesture off.** One default behaviour, stated so that a setting can be
  added later without changing what the gesture means — the same position `outline-folding` took
  for the guide press.
- **Reordering by dragging a guide**, or any drag source other than a node's own mark.
