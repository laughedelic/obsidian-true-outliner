## Context

See proposal.md for motivation. What shapes the approach is what the measurement pass found
(docs/research/node-drag-and-drop.md) and what is already built:

- A node's mark already answers a press. `zoom-click.ts` owns it, in the capture phase, on the
  editor root — one listener for three mark sources, for the reasons its module comment gives.
- The marker gutter is full. Section 1 of the note measures 0.83px of unclaimed run between the
  parent guide's press band and Obsidian's fold indicator.
- The operand of a structural operation is already defined over the selection alone
  (`selection-structural-ops`), and the machinery a drop needs — removal with gap repair,
  insertion with gap ownership and renumbering, re-encoding for a destination — already exists in
  `ops.ts` for the paste path.
- A preview that follows the grid already has a shape to copy: `guide-hover.ts` carries pointer
  state as editor state and lets the decoration pass draw it.

## Goals / Non-Goals

**Goals:**

- One gesture that moves one node or a whole block selection, reaching any destination the
  document can express, with the landing place unambiguous before the release.
- A drop that is indistinguishable, downstream, from any other structural operation: one
  transaction, one undo step, caret and fold state carried.
- A preview that cannot promise a result the release will not deliver.
- A desktop path the e2e harness can drive end to end with a real pointer.

**Non-Goals** (design-level, beyond proposal.md's):

- Re-implementing move up / move down in terms of the new operation. They are a settled special
  case with their own spec and tests; folding them in is a refactor with no behaviour attached.
- A drag model that survives the document changing underneath it. A drag holds no document
  changes; if the document moves under it (an external write, a sync), the drag ends.

## Decisions

### D1. The drag attaches to the mark, not to a handle of its own

The affordance-budget question (docs/research/decoration-follow-ups, "four gestures, one 14px
gutter") asked whether node-level gestures belong outside the notation. Section 1 of
docs/research/node-drag-and-drop answers it with figures: there is no room for a fourth target
between the parent guide's press band and the fold indicator, and the indicator already overlaps
the mark's own box.

So the mark carries the drag, as it does in every outliner the prior-art table surveys. This costs
no column, needs no hover state that was not already there, and — because section 4 measured the
task checkbox's claim to be on the click rather than the press — reaches every node kind,
including the one kind click-to-zoom had to decline.

*Alternatives.* A hover-revealed handle in its own column: measured out by section 1, unless the
grid widens for every row to buy a column most rows would leave empty. A modifier-held drag:
undiscoverable, and the modifier space is Obsidian's. The hanging-indent strip between a list
marker and its text: its width varies with the marker, and a drag starting where every other press
places a caret is the wrong kind of surprise.

### D2. A press on a mark resolves at release

Section 3 measured the zoom firing at `pointerdown`, before a drag could have declared itself. A
press cannot mean both, so it means neither until it ends: moved past the threshold, it is a drag;
released in place, it is the zoom it has always been.

The press is still consumed from `pointerdown`, exactly as today — the mousedown, mouseup and
click behind it are still swallowed, so nothing else acts on the press while its meaning is
undecided. What moves is only the moment the zoom's effect is dispatched.

*Cost.* A shipped gesture's timing changes. The zoom's effect does not, and the existing
mark-click scenarios in `outline-zoom` cover the outcome rather than the moment, so they keep
passing through the new path.

### D3. Pointer events, never HTML5 drag-and-drop

Three reasons, in order of how much they cost:

- It would be unverifiable. No W3C Actions primitive fires `DragEvent`s — recorded twice in
  docs/research/open-questions (Q15's retry) and unchanged. Section 2 of the drag note measures the
  opposite for a pointer drag: a real WebDriver pointer reaches a mark and its moves keep arriving.
- There is no HTML5 drag on touch at all, so the gesture would not exist on a phone.
- The drag image, the drop effect and the cursor would be the browser's. The preview D7 and D8 ask
  for is the whole point of this change, and native DnD does not let us draw it.

### D4. The pointer is captured on the editor root for the drag's duration

Section 5 measured a held drag's moves stopping at the editor root the moment the pointer leaves
its box — 2 of 6. Section 6 measured marks surviving a decoration rebuild, so capture on the mark
would be safe against that, but not against the other thing a drag does: autoscrolling takes the
source line out of the viewport, where CodeMirror recycles it, and nothing measured says the mark
survives that.

The editor root is stable by construction, already the listener's element, and gives
`lostpointercapture` as the one place a cancelled drag has to clean up from — a window listener
pair would have to be added and removed by hand around every exit path.

### D5. What is dragged is the selection's covered subtrees

The operand rule `selection-structural-ops` states, unchanged and unextended: when the pressed
node lies inside the current selection's cover, the operand is that whole cover, grouped into
contiguous sibling runs; otherwise it is the pressed node's own subtree.

Pressing a mark outside the cover first collapses the selection to that node's own cover, so what
is in flight is always what is drawn as selected — the reader never has to hold in mind that the
selection and the dragged thing differ.

*Alternative.* Always drag exactly the pressed node. Simpler, and it makes a multi-node drag a
second gesture with a second rule — which is what the operand rule was written to avoid.

### D6. A destination is a seam and a depth, and only the legal ones are offered

The model is stated in section 7 of docs/research/node-drag-and-drop and drawn in
docs/research/prototypes/drop-indicator.html: the pointer's vertical position picks the seam
between two rendered rows, and its horizontal position picks a depth from the interval those two
rows bound — from the depth of the row below, to one level inside the deepest trailing branch
above. In the mockup's ordinary fixture that is six destinations on one seam.

Two filters narrow the interval, and both come from rules that already exist:

- **Hidden depths are not offered.** A fold's subtree is not on screen, so its levels are not
  candidates; the deep bound is the deepest *visible* trailing descendant. A drop into a folded
  node opens the fold, which is `outline-folding`'s rule for any change to hidden content.
- **A depth the operation would reject is not offered.** `insertSubtrees` already declines a
  heading payload under a non-heading parent and an atom under a paragraph. Asking it, rather than
  re-deriving its conditions, is what keeps the candidate set honest as that rule grows.

Snapping uses the guide gesture's own tolerance rather than a new one, so the columns a drag snaps
to are the columns a press already resolves against.

*Alternatives.* Vertical position only, with the run always landing as a sibling of the row above:
one rule, no ambiguity, and no way to reparent — which is most of what a drag is for. Modifier
keys to change depth after choosing a seam: discoverable only from documentation. A drop *onto* a
row meaning "become its child" and *between* rows meaning "sibling": two rules with a band between
them where the reader cannot tell which they are in.

### D7. The preview is the release, run early

One resolution function, from the document, the operand and the pointer position to a destination,
is called by both the preview and the release. The preview renders its result; the release applies
it. They cannot disagree about where the run lands, what it lands beside, or what it becomes,
because there is no second derivation to drift.

This is what makes the cross-regime case honest. A heading section dropped into a list is
re-encoded as list items, so the preview draws a bullet — not the heading glyph the run has while
it is in flight. The kind comes from the same re-encoding the release performs
(`reencodeBlocksForDestination`, and whatever `paste-heading-section-reencoding` settles for the
cross-regime rule), never from the run's current kind.

### D8. The preview draws the column, the mark, and the parent

The mockup compares five treatments at one destination. Carried:

- an indicator at the seam whose left end sits on the destination column — the column the run's
  first mark will occupy, taken from `chrome-line.ts`'s own column expression rather than measured
  off any mark's box, since section 1 found a list bullet's span begins at its column where every
  other mark is centred on it;
- the mark the run will have, drawn at that column, per D7;
- the destination parent accented, using the accent the caret trail already owns, so the parent is
  named rather than counted out of columns.

Dropped: a full-width rule, which draws identically for all six destinations on a seam; and a
parted slot, which re-lays out the document below the seam on every pointer move and has to put it
all back when the drag is cancelled.

### D9. The drop is one operation in the algebra

`moveSubtreesTo(doc, operandGroups, destination)` joins indent, outdent and reorder in `ops.ts`,
returning the same `OpResult<OpOutput>` they do. It is not a `deleteSubtreeGroups` followed by an
`insertSubtrees` at the call site: both sides carry gap arithmetic and ordered-run renumbering, the
destination's anchor shifts when the run is removed from above it, and a second ad hoc call site
that half-remembers the rules is exactly the failure `paste-heading-section-reencoding`'s D16
records.

One operation also means the drop inherits everything downstream for free — `dispatch.ts`'s single
transaction and undo grouping, the caret policy, the fold carry, and the rejection cue.

### D10. The preview is editor state, not a DOM overlay

A `StateEffect` carrying the resolved destination into a `StateField` the decoration pass reads —
the shape `guide-hover.ts` already uses for pointer state. The preview then sits on the same grid
every other piece of chrome is positioned by, scrolls with the document, and survives a rebuild
without being re-measured.

`trackGuide`'s standing objection — that dispatching while a button is held lands in the middle of
CodeMirror's own mouse selection and breaks it — does not apply here. That selection never starts:
the press was consumed at `pointerdown`, which is the same reason a drag from a mark does not draw
a text selection today.

Dispatch only when the resolved destination changes, not on every move. The guide hover already
takes that position for the same reason.

### D11. Fold, zoom and the nested editor

The drag is bounded by the same three rules every gesture here is. Inside a nested per-cell editor
it declines. Outside outline mode it declines. Inside a zoom, only seams within the scope exist, so
a destination outside it is never offered — the drag cannot produce the rejection
`outline-zoom` would otherwise have to issue on release.

### D12. Touch starts on a long press

A touch drag and a scroll are the same gesture until something separates them; a long press is
what every touch outliner uses. The gesture is written against pointer events throughout, so the
only touch-specific piece is the delay before the press becomes a drag.

Its verification is a manual pass, not a spec run: section 2's harness note records that the mobile
emulation cannot drive a coordinate-aimed press at a mark, which is why `80-outline-zoom.e2e.ts`
drives its presses in the page. A press driven in the page proves the handler, not the hit-testing
— so the mobile e2e asserts what it can and the pass records the rest, as `content-space-caret`'s
did.

### D13. Autoscroll is the scroller's, driven by the pointer's distance past its edge

While the pointer is held within a band of the scroller's top or bottom edge, the scroller scrolls,
at a rate taken from how far past the edge the pointer is. Nothing else moves: the document is
unchanged until the release, so scrolling during a drag is scrolling.

## Risks / Trade-offs

- **A shipped gesture's timing changes (D2).** → The zoom's effect is identical and the existing
  `outline-zoom` mark-click scenarios run unchanged through the new path; a scenario is added for
  the case that distinguishes them — a press that moves and then returns to the mark before
  release is a drag, not a zoom.
- **Composing removal and insertion gets the gaps or the numbering wrong (D9).** → Unit tests per
  shape, closure tests that the result re-parses, and a round-trip property: a run dragged to a
  destination in the same scope and dragged back yields the original document.
- **A preview per pointer move costs more than the budget allows.** → D10 dispatches only on a
  change of destination, and the drag writes no document changes, so the enforcement funnel sees
  nothing on the hot path. Timed against the existing budget during implementation rather than
  assumed; the drag note records that it was not timed in the gate pass.
- **A destination the preview offered is rejected on release anyway.** → D6 filters candidates
  through the operation itself and D7 shares one resolution, so this can only happen if the
  document changes mid-drag. It ends the drag (Non-Goals) rather than applying a stale
  destination.
- **A drag that starts but never ends** — the pointer released over another window, the view torn
  down mid-gesture. → Capture gives `lostpointercapture` as one exit, and the field clears on view
  destruction; a drag with no live capture resolves to a cancel, never to a drop.
- **Discoverability.** Nothing on the mark says it can be dragged until the pointer is over it. →
  The cursor over a mark states it, which is the same affordance the guide press already relies on.

## Open Questions

- Whether a multi-root run should show how many roots are in flight, beyond the lifted rows
  themselves. Deferrable: it adds to the preview without changing what a drop does.
- Whether a dwell over a folded node should open it mid-drag. Named as a non-goal in the proposal,
  and reachable later without revisiting anything here, since the drop-into-a-fold rule already
  opens it.
- Whether the gesture should offer a copy variant under a modifier. Deferrable for the same
  reason — a different write at the same destination, with the same resolution behind it.
