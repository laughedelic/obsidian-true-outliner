## Context

See proposal.md, "Why". The readings, their thresholds and the census of what the monitors reported
are in [`docs/research/ambient-e2e-monitors`](../../../../docs/research/ambient-e2e-monitors.md); the
measurements behind each correction below are in its "Precision corrections (#315)" section. What a
monitor can read at all is in
[`docs/research/rendered-ui-observability`](../../../../docs/research/rendered-ui-observability.md).

## Goals / Non-Goals

**Goals:**

- A rule that reports something is reporting something the plugin does, so that a rule reading
  clean over the suite is a candidate to fail a case (#316).
- Every correction is checked in both directions: the stock shape reads clean, and the same rule
  still reports the defect it exists for.

**Non-Goals:**

- Promoting a rule, and the readings that did not reproduce (proposal.md, "Non-goals").

## Decisions

**A quote's marker anchors the line, and its text is judged among itself.** The rule collects the
first ink of each visual row from the text nodes, skipping the list marker as chrome. A quote's
marker is a text node too, in `.cm-formatting-quote` (the `>` is transparent while outline mode
paints an icon, and still has a box), so it is the first ink of the first row. Its text starts one
marker advance to the right, and the wrapped rows hang at the padding that advance is approximated
by, with outline mode off as well. Alternatives:

- *Treat the marker as chrome, as the issue words it.* The rows then start at +18 on every row,
  which still reports `grid-off-column` for every quote, and skipping the check would leave a quote
  drawn off its column unread. Instead the marker is measured as the column anchor
  (`grid-left-of-column` and `grid-off-column` read it) and the text rows are compared with each
  other only (`grid-wrap-hang`), with a pixel of tolerance for the first row, since the advance of
  `> ` is not a whole pixel.
- *Exempt quotes from the grid.* Quotes are the shape a note holds most of after lists.

**A line that draws nothing ahead of a widget is not round-tripped.** The line a table's widget
replaces keeps a `.cm-line` with no text, immediately before the widget's element, while the
document line has text. A properties block and an inline embed leave no such line (the note has
their round trips). Nothing in the page names the replaced range (the decoration sets are
CodeMirror's), so the rule keys on the element: no text, and a widget as the next sibling. A line
hidden by a fold has no element and is not visited. Alternatives: keying on `HyperMD-table-row`, which
is Obsidian's class for one widget; skipping every empty element, which would silence a line the
plugin blanks.

**The caret is read against both sides of its head.** `coordsAtPos(head)` defaults to the side after
the head; beside a widget that is the widget's edge (in `92`). The painted caret stands on the
text, where `coordsAtPos(head, -1)` returns it. The rule computes the other side only when the
default disagrees, and reports only when neither side accounts for the caret, on its top and height
as well as its column. Alternatives:

- *Skip a position that touches a replaced range, as the issue words it.* Deciding that needs the
  replaced ranges, which the page cannot read, and it would drop the comparison at every line's
  start, where the fold toggle widget stands. Reading both sides keeps the check where the caret is
  next to a widget and costs one call when they disagree.

**A change that leaves the text as it was is not an edit.** `editor.setValue` with the text the
note already holds fires `editor-change` with a document identical to the last, which the diff read
as an edit of the last line; the shifts that follow it, from the re-render, were then judged against
that line. That is what `67`'s `outlineNote` does (create the note, turn the mode on, set the
buffer), and the correction alone clears `67` (the note has the run). Alternatives:

- *Move `67`'s set-up into `beforeEach`, as the issue prefers.* Each of its cases sets different
  content, so a `beforeEach` can hold the note and the mode but not the buffer, whose re-render
  is the shift.
- *Judge a shift only against the edits made before it.* It was tried alongside, and clears nothing
  the correction above does not. It also rests on comparing a shift's frame time with the time of
  the edit that caused it. A frame's timestamp is taken when the frame begins, which can precede an
  input handler running in the same frame, so a real shift could read as coming first. That follows
  from how the Layout Instability API stamps a shift and was not measured here.
- *Read only shifts after the case's first key,* the issue's fallback. A case driven by commands or
  by `dispatch` presses no key and would lose the reading altogether.

**`62`'s vetoed edit waits for the refusal.** `waitForNotice`, as `20-structural-commands` does. It
also makes the case fail if the veto stops raising it, which the case did not check before.

## Risks / Trade-offs

- The corrections can hide a defect the old rule reported by accident: a quote whose text hangs at
  the wrong column but consistently; a caret painted at a widget's near edge, and, at a soft wrap,
  the end of the row above (CodeMirror places a position at a wrap on either row, and either is
  accepted); a line the plugin blanks beside a widget. The rows keep the controls on the defect
  side of each threshold for the quote and the caret. The sweep is read for a rule that goes to zero
  without a stated reason.
- A quote in a list item is read for a column left of its own and for nothing else, as before this
  change: its source begins with the item's indent, which the grid reading treats as standing
  whitespace. The self-test holds no row for it.
- Set-up in the body followed by a real edit is still judged as one span, so a shift the set-up
  causes after that edit is read as the case's own. The sweep decides whether any case does this.
- The mobile-emulation readings are not re-measured: the driver runs the desktop app. The sweep in
  CI is what measures them, and the note records the result.
