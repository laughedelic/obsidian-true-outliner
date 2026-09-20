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
- This change is stacked on `paste-lands-where-it-is-pointed` (#122), which rewrites what an
  insertion at a destination does: a heading payload converts where it used to be refused, the
  expressibility guard moved into the shared re-encode step and that step now returns a typed
  result, and a dropped heading's absorption of the following siblings is stated behaviour.
  docs/research/node-drag-and-drop section 7a records what that means here; the decisions below
  consume it rather than restating it.

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

"Released" means `pointerup`, not `click`. A gesture that leaves the mark before releasing fires
no `click` on it at all, so a rule written on `click` would decline exactly the case the threshold
has to judge; `pointerup` is also the event the same gesture's drag half ends on, so both outcomes
resolve at one moment.

*Cost, and it is larger than "the timing changes".* The existing mark-click scenarios do NOT keep
passing: `clickMark` in `e2e/specs/80-outline-zoom.e2e.ts` dispatches `pointerdown`, `mousedown`,
`mouseup` and `click` — and no `pointerup` — so under this rule none of them zooms. The helper
gains a `pointerup`; the scenarios themselves are unchanged, since they assert the outcome. This
is not optional work discovered later, and it reaches the mobile suite too, which depends on that
same helper because a coordinate-aimed press cannot be driven there at all.

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

The operand rule `selection-structural-ops` states, with one refinement: when the pressed node is
one of the current selection's covered ROOTS, the operand is that whole cover, grouped into
contiguous sibling runs; otherwise it is the pressed node's own subtree.

Pressing a mark outside the cover first collapses the selection to that node's own cover, so what
is in flight is always what is drawn as selected — the reader never has to hold in mind that the
selection and the dragged thing differ.

The refinement is where a press differs from a keystroke. A keyboard command names only the
selection, so "inside the cover" is the only test it can make; a press names a node. The first
manual pass had a section selected, from an earlier drop, and a press on a list item inside it
carried the whole section off — the reader had pointed at one item and moved a page. A press on a
descendant of a covered root now takes that node and collapses the selection to it, the same as a
press outside the cover; only a press on a root itself carries the cover. The keyboard rule is
unchanged, since it has no node to read.

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
- **A depth the operation would reject is not offered.** The candidate set is filtered by calling
  the shared re-encode step per candidate and keeping the ones it accepts — one typed call, not a
  predicate maintained beside it. The layer below makes that distinction concrete rather than
  tidy: after it, one of the two surviving refusals (`at-h6-bound`) depends on the destination's
  own heading DEPTH, so a heading payload can be legal at a seam's shallower columns and refused
  at its deeper ones. A filter written from the old kind-based conditions would offer those
  columns and fail on release, on the one axis this gesture exists to give the pointer.

  That call is necessary and NOT sufficient today, which is measured rather than suspected: it
  accepts a payload under a `code`, `table` or `quote` parent, because its expressibility arm
  tests the payload for atoms and the parent only for `paragraph`. An atom is a leaf. So this
  change closes the gap where the layer below closed the others — in the shared re-encode step,
  beside the guard it belongs with — rather than keeping a second condition in the candidate rule.
  The deep bound's "that can hold children" above is the belt to that brace, and the two are
  deliberately not one: a bound the resolver can state cheaply should not wait on an oracle.

**The run is taken out before the seams are read.** The two boundaries around the run are one
seam, at its top, and the depths it offers are those the nodes on either side of the run bound
once the run is gone — the same reading the release makes, since the algebra removes the run
before it reads the destination's context. The run's own place is among them, as the way out of a
drag the reader thinks better of — set the run down where it was, or move it sideways on the same
seam — and it is named by the run's own index, which the algebra reads as the no-op it is. The
run's own bottom stays in the seam list with nothing to offer, so a pointer over it resolves to
nothing and a release there cancels. Dropping that seam instead let the pointer snap to the
neighbouring seam, and a run set down where it was moved one place; the e2e case that asserts a
no-op drop caught it.

**A heading run is offered the levels shallower than the seam's shallow bound.** A section
dropped between `## Materials` and its first child at the `##` column stands beside Materials and
takes its children; dropped at its own seam on the `#` column it is outdented in place. Neither is
a seam-and-depth in the interval above — the shallow bound is the node below's depth — so they are
added to every seam a heading run is offered, one per level from the shallow bound up to the top
(the zoom root's child depth, under a zoom), each written at the seam's own position and carrying
the LEVEL the column names. The algebra takes that level with the destination (D9): the parent
would imply one level deeper, and the preview and the written heading have to agree.

The horizontal rule is a PARTITION of the axis over the seam's legal columns, clamped at both
ends: every x resolves to exactly one candidate, the nearest, with everything left of the first
resolving to the first and everything right of the last to the last. It deliberately does NOT
borrow `guideHit`'s tolerance, which an earlier draft of this design proposed. That function is a
hit test, not a partition: its band is `unit/2 − 2` left and `unit/3` right, which leaves 7.33px
between every pair of columns resolving to nothing at the default unit; it returns nothing at all
right of the line's own text start, which during a drag is most of the screen; and it reads
painted guide positions, so it cannot name the deepest candidate, whose level has no guide drawn
on the row above's own line. Its asymmetry exists to keep a press clear of marks and chevrons — a
drag has no press to keep clear of. With the cancel-on-no-destination rule, borrowing it would
have thrown a drag away on a release into a dead band.

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

This is what makes the cross-regime case honest, and the layer below makes that case the common
one rather than the refused one. A heading section dropped into a list is re-encoded as a list
item carrying its own `#` run as text, so the preview draws a bullet — not the heading glyph the
run has while it is in flight. Dropped among headings instead, the same run re-levels to the
destination's depth and stays a heading. Both answers come from the one call the release makes
(`reencodeBlocksForDestination`), never from the run's current kind and never from a reading of
the destination taken here.

### D8. The preview draws the column, the mark, and the parent

The mockup compares five treatments at one destination. Carried:

- an indicator at the seam whose left end sits on the destination column — the column the run's
  first mark will occupy, taken from `chrome-line.ts`'s own column expression rather than measured
  off any mark's box, since section 1 found a list bullet's span begins at its column where every
  other mark is centred on it;
- the mark the run will have, drawn at that column, per D7;
- the destination parent accented, using the accent the caret trail already owns, so the parent is
  named rather than counted out of columns;
- and the region the drop will ABSORB, marked where there is one. A heading dropped among siblings
  opens a section that takes the anchor's following siblings into it — the layer below states this
  as the encoding's own meaning, bounded by the destination scope's end. Those rows change parent
  without moving, so nothing at the seam says they were involved; a preview that draws only the
  landing place is accurate and still leaves the reader surprised by half the result.

Dropped: a full-width rule, which draws identically for all six destinations on a seam; and a
parted slot, which re-lays out the document below the seam on every pointer move and has to put it
all back when the drag is cancelled.

How much of the absorbed region to mark was carried as an open question until the mockup drew it
five ways (panel 4). Settled: the absorbed rows are drawn one level in, under the ghost, with the
guide that will connect them, and no tint — the result shown as the result. A tint over the whole
span is half a page of colour on a long section, and the move already says it. It is the one part
of the preview that moves rows before the release, sideways and only those, so a wrapped row can
change height; what to accent on those rows, if anything, is left to adjust once it is in hand.

The parent's accent is the trail's colour at the GUIDE's weight, not the trail's: the parent's
marker takes the ancestor class, and its own guide — the column the run will hang from — takes the
accent on every row between the parent and the seam. The trail's width is its own vocabulary, and
a thicker line there would read as the caret's route. Where the caret's trail already accents that
column, the trail's segment stands. A parent at the root has no row, and nothing is accented.

The rows in flight are lifted by opacity alone, composed with the block-selection chrome the cover
already wears: the cover's tint and edge stay and say how many roots are travelling, and the fade
says they are picked up and not yet put down. No transform, margin or size, because nothing about a
drag may move a row before the release, and the seam geometry is read from these very rows. The
lift is a second piece of editor state beside the preview, raised at the threshold and lowered on
every end, since it has to hold over a dead band where the preview is null.

### D9. The drop is one operation in the algebra

`moveSubtreesTo(doc, operandGroups, destination)` joins indent, outdent and reorder in `ops.ts`,
returning the same `OpResult<OpOutput>` they do. It is not a `deleteSubtreeGroups` followed by an
`insertSubtrees` at the call site: both sides carry gap arithmetic and ordered-run renumbering, the
destination's anchor shifts when the run is removed from above it, and a second ad hoc call site
that half-remembers the rules is exactly the failure the layer below has now hit twice — first as
a re-indent that one path skipped, then as the expressibility guard a second path never ran.

One operation also means the drop inherits what `editor-structural-commands` already guarantees
every operation — the single transaction and its undo grouping, the caret policy, the fold carry,
the rejection cue — rather than re-deriving them. Those live in the command funnel around
`runOp` in `main.ts`, not in `dispatch.ts`, which is a pure edits-to-changes module; the drop has
to ENTER that funnel, and it enters from a different place than the other two entry points, since
it holds a CodeMirror view rather than Obsidian's `Editor`. That is work, not inheritance, and it
has a task.

`insertSubtrees` is not enough to build the move on by itself: it splices relative to an anchor
SIBLING, and "the first child of a row that has none" — the deep bound of every seam in D6 —
has no anchor to splice against. `enforce.ts` already carries a private `insertAsOnlyChildren` for
exactly that case. The shared re-encode step already takes a parent and its two sibling lists and
handles the empty one, so what is missing is a splice that takes a parent and an index. Adding it
is what makes "one place the move is expressed" true rather than aspirational.

The layer below has since reached the same gap from the other side. Its own D8 wants the boundary
after an anchor's own lines, which for a node WITH children it names as that first child's
`before` — the missing destination form expressed through the anchor it does have. Where the node
has none, that route is unavailable and the private variant is what answers. Two call sites now
work around one absent destination, which is the argument for adding it rather than a third.

One case is NOT the composition, and finding it is what the first implementation round cost: a
move that begins and ends in the same scope. The composition reads the destination's context from
the tree the removal left, and where the destination IS the scope the run came from, the run was
part of that context. Measured over the generated corpus, three distinct rewrites followed from
that — a bullet among paragraphs came back a paragraph, because the regime rule read the siblings
the run was the counter-evidence to; a run returning to the top of a tight list came back loosened,
because the boundary it had occupied was gone by then; and the file's terminating newline travelled
into the middle of the document behind the run that used to end it. A same-scope move is a REORDER,
which this algebra already has, and `moveSurgery` already states its rule: the gaps go with the
slots. Taking that branch took the corpus from 1550 rewritten round trips in 23016 same-scope moves
to none in 28579 (docs/research/node-drag-and-drop section 7b).

A destination may name a heading LEVEL along with its parent and index (D6's shallower columns).
The shared re-encode step takes it in place of the level the destination's parent implies, and a
named level takes the general path even inside one scope: the same-scope shortcut is a reorder,
and a heading changing level without moving is a rewrite, not a reorder.

### D9a. The operand's selection is set at the threshold, not at the press

D5 collapses the selection to the pressed node's cover when the press lands outside the current
one. That is not a neutral act: by `escalated-selection-decoration`, a selection that is an exact
cover IS the block-selection interaction mode — the editor blurs, the covered lines render Live
Preview rather than raw, the native highlight is suppressed, and block chrome appears.

So the collapse happens when the press becomes a DRAG, at the threshold, and not when the press
arrives. A sub-threshold press is a zoom, which moves the caret on its own terms and has no
business entering block selection on the way. And "the selection as it was when the drag began",
which the cancel rule restores, is the selection before that collapse.

Two consequences the mode brings with it, both of which the implementation owes an answer:
a row's rendered height can change when it stops rendering raw, and the seam resolution reads
rendered positions — so the resolution is taken after the mode has settled, not across it. And
with the content DOM blurred, the Escape that cancels has to be heard somewhere that is still
listening; the drag's own capture is that place.

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
  shape, and a closure property asserting that every node the run carried is still a node
  afterwards — the form the layer below arrived at after finding that its first closure assertion
  could not fail, because it re-checked the encode/parse round trip rather than the surgery.
  A move-and-move-back round trip is NOT the mitigation: measured on this branch, moving a heading
  absorbs the anchor's following siblings, so the return trip's anchor is inside the run it would
  move and the property is false by construction for exactly the case this change adds. It holds
  only for operands that absorb nothing, and the absorbing case gets a test asserting the
  asymmetry instead.
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
- **Almost everything the preview promises exists only while the button is down, and WebDriver
  releases a held button when its call ends.** Measured: a press in one `performActions` call is
  auto-released before the next call runs, so no assertion can be taken by stopping mid-drag. →
  The suite records instead of stopping: a recorder installed in the page before the gesture
  samples the resolved destination and the preview's state on each `pointermove`, the whole drag
  runs in one call, and the assertions read the recording. Escape mid-drag is driven the same way,
  as a key source and a pointer source ticking together in that one call.
- **The layer below moves while this one is planned.** Six of its tasks need a real Obsidian
  instance and one of them — whether Obsidian's metadata cache indexes a heading inside a list
  item — could still change what a converted heading looks like. → Nothing here reads that answer:
  the preview draws whatever the shared re-encode returns, so a change to the conversion changes
  what the preview shows without changing a rule stated in this change. The restack cost is
  correspondingly small, which is the argument for stacking rather than duplicating the rule.

## Open Questions

- How much of an absorbed region the preview marks: the whole span, its first row, or a count.
  Deferrable because the requirement is that it be stated, not how — the mockup can settle the
  treatment during implementation, the way it settled the indicator's.
- Whether a multi-root run should show how many roots are in flight, beyond the lifted rows
  themselves. Deferrable: it adds to the preview without changing what a drop does.
- Whether a dwell over a folded node should open it mid-drag. Named as a non-goal in the proposal,
  and reachable later without revisiting anything here, since the drop-into-a-fold rule already
  opens it.
- Whether the gesture should offer a copy variant under a modifier. Deferrable for the same
  reason — a different write at the same destination, with the same resolution behind it.
