# Dragging a node by its mark

`drag-nodes-with-a-drop-preview`'s gate. The affordance-budget question
([decoration-follow-ups.md](decoration-follow-ups.md), "four gestures, one 14px gutter") asked
whether node-level gestures belong in their own space, outside the notation, and said the answer
wanted measuring rather than arguing. This pass measures it, along with the four other things a
drag gesture has to know before a design can rest on them: whether a real pointer reaches a mark,
what the mark's press already does, whether a task's checkbox can carry a drag without losing its
toggle, and where the pointer's events go once the drag leaves the editor.

Every figure below comes from **one pass, one environment**, per the commensurability rule
`outline-decorations` states for the gutter: Obsidian 1.13.7 (installer 1.5.8) on Linux under
Xvfb, Chromium 120, default theme, default appearance settings, the `roomy` unit default, driven
through the e2e harness by a probe that was run and then removed. Nothing here is combined with a
figure from an earlier investigation; where an earlier note recorded the same quantity, this pass
re-measured it rather than importing it.

The fixture is one note holding a heading, a paragraph under it, a bulleted item with a nested
child, a task with a nested child, and an ordered item — every mark class the gutter has to hold.

## 1. The gutter has no unclaimed run left

Measured on a depth-2 list row while the pointer rests on it, which is the state in which the
fold affordance is actually offered. All figures are viewport px in one frame; the row's own
column is 439.5 and its text begins at 454.

| Claim on the run | Spans | Width |
| --- | --- | --- |
| grandparent guide's press band | 361.5 – 386.17 | 24.67 |
| parent guide's press band | 393.5 – 418.17 | 24.67 |
| Obsidian's `.collapse-indicator`, hovered | 419 – 449.8 | 30.8 |
| the mark itself (`.list-bullet` span) | 440 – 448.91 | 8.91 |

The guide bands are `guideHit`'s own arithmetic — a half unit less 2px to the left of a column, a
third of a unit to the right — evaluated against the columns the gradient actually painted. The
fold indicator's box is Obsidian's, read from the element.

**Between the parent guide's band and the fold indicator there are 0.83px.** Nothing else is
free: the indicator's box runs from just past the guide band to just past the mark's own right
edge, and the row's text begins 5.09px right of that mark's right edge. The gutter is not nearly
full, it is full.

That settles the affordance-budget question against a handle of its own. A fourth target in this
run would have to take the fold indicator's place, take the guide band's, or widen the grid for
every row in the document to buy one column that is empty on most of them. Attaching the drag to
the mark — which every reference outliner does, and which
[decoration-follow-ups.md](decoration-follow-ups.md) records none of them splitting — costs no
column at all.

Two subsidiary figures from the same frame, both of which a preview has to respect:

- The unit is 32px and the marker gutter 14px, so a depth's column is 32px from its parent's and
  its text begins 14px right of its own column. The painted guide positions read 375.5 / 407.5 /
  439.5 rather than 376 / 408 / 440: a background gradient's position is inset by half the guide's
  own width, which `guideHit` undoes by rounding against the unit. The columns are the round
  numbers; the half-pixels are what the paint reports.
- A mark's box is centred on its column (the marker icon at 401.22–414.81 on column 407.5; a
  task's checkbox at 432–448 on column 439.5), **except** a list bullet's, whose span begins at
  the column and runs right. A preview that wants to sit where a mark will sit should take the
  column from `chrome-line.ts`'s own column expression rather than from any mark's box.
- Every kind's text begins on one column — 454 for both the bulleted row and the task row —
  which is the gutter requirement holding, and is why a preview drawn at a column means the same
  thing whatever kind lands there.

## 2. A real pointer reaches a mark, and its moves reach the editor root

Driven with WebDriver's own pointer (`browser.action('pointer')`) aimed at a bullet's centre,
against capture-phase counters on the editor's root element — the same element and phase
`zoom-click.ts` listens on:

| Event | Count | Target |
| --- | --- | --- |
| `pointerdown` | 1 | `.list-bullet` |
| `pointermove` | 7 | the bullet, then `.cm-content` once the pointer leaves it |
| | | (one move to position, then six steps — section 3 drives five and counts six) |
| `pointerup` | 1 | — |
| `mousedown` / `click` | 0 | — |

So the press lands on the mark rather than on the line behind it, and the moves of a held drag
keep arriving at the root as the pointer travels. This is narrower than it looks: it says the
*desktop* harness can drive the whole gesture end to end with a real pointer. The mobile-emulation
finding `decoration-follow-ups.md` records — a press aimed at a marker's centre in viewport
coordinates landing on the line behind it — was not retested here and still governs the mobile
run, which is why `80-outline-zoom.e2e.ts` drives its own presses in the page.

The absent `mousedown` and `click` are finding 3, not a quirk of the instrument.

## 3. The mark's press is already spoken for, at `pointerdown`

A second drag over the same fixture — five steps rather than section 2's six — counting the
rendered line elements at each event:

```
pointermove:11  pointerdown:6  pointermove:6 ×5  pointerup:6
```

The document has 11 rendered lines before the press and 6 after it: **the press zoomed into the
bullet, synchronously, before the pointer had moved at all.** The probe's counter runs after the
plugin's own handler on the same element, so what it read at `pointerdown` is the state that
handler had already produced. The trail was present when the gesture ended and the caret had moved
to the zoom root's content start.

This is `zoom-click.ts` behaving exactly as written — it consumes the press, dispatches the zoom,
and swallows the trailing mouse events, which is why none were counted. It also means a drag
gesture cannot simply be added beside it. A press on a mark can mean zoom or it can mean pick up,
and which one it means is not known until the pointer either moves or does not, so the zoom has to
resolve at release. The cost is that a zoom happens on the way up instead of on the way down; the
alternative is a second target, which section 1 rules out.

## 4. A task's checkbox can carry a drag without losing its toggle

The one kind `outline-zoom` could not reach with the pointer, because its mark is Obsidian's
checkbox and the click already toggles the task. Measured both ways against the same fixture:

| Gesture on the checkbox | Result |
| --- | --- |
| press, move ~90px away, release | `- [ ] a task` — unchanged |
| press and release in place | `- [x] a task` — toggled |

**The checkbox's claim is on the click, not on the press.** A gesture that leaves the box before
releasing produces no click on it, so the browser never runs the input's activation behaviour and
nothing has to be suppressed for a drag to start there. A task is therefore draggable by its own
mark like every other kind, with no modifier, no restored plugin marker, and no contest over the
toggle — which is more than the affordance-budget entry hoped for from any of its options, and it
arrives without deciding the zoom half of that question, which stays open.

## 5. A drag that leaves the editor loses its moves

The same drag, driven out of the editor's box and across the app chrome to x=12, counted at two
listeners at once:

| Listener | Moves seen |
| --- | --- |
| the editor's root element, capture | 2 |
| `window`, capture | 6 |

Pointer events follow the element under the pointer, so a listener on the editor root stops
hearing a drag the moment it leaves. A drag that wants to keep tracking — to autoscroll, to hold
its preview while the pointer wanders into the sidebar, to notice the release wherever it
happens — needs the pointer captured, or listeners above the editor for the gesture's duration.

## 5a. A held button does not survive a separate WebDriver call

The e2e question the rest of the design leans on, since almost everything a drag promises is a
state that exists only WHILE the button is down. Driven three ways against the same bullet, with
counters on `window` recording each event's `buttons`:

| driving | what arrived |
| --- | --- |
| press in call 1, move in call 2, release in call 3 | `pointerdown:1`, **`pointerup:0`** — both inside call 1; the move then arrives at `buttons=0` |
| press in call 1, Escape in call 2 | the same auto-release, so the key lands after the gesture already ended |
| press, move and release in ONE call | `pointerdown:1` → `pointermove:1` → `pointerup:0`, as a real drag |

**WebDriver releases a held button when its `performActions` call ends.** The button state exists
only within one call, which is the same limitation `e2e/helpers.ts` already records for a held
modifier across calls, reaching a second input this time.

What follows for the suite is not that mid-drag state is unverifiable, but that it cannot be read
by stopping mid-drag. A recorder installed in the page before the gesture — sampling the resolved
destination and the preview's own state on each `pointermove` — turns every mid-drag assertion
into a reading taken after a single uninterrupted `perform()`. Escape mid-drag is drivable the
same way, as a key source and a pointer source ticking together inside one call, with the
recording again standing in for the assertion that cannot be made in between.

**The auto-release is not inert either.** Driving a gesture that ends without an explicit release —
the shape an Escape-mid-drag case needs, since the key and the pointer have to tick together in one
call — toggles a task whose CHECKBOX the gesture started on, where the same gesture given an
explicit release far from the box leaves it alone (section 4). Observed rather than explained: what
the auto-release does with the click target was not measured. A case about what a press leaves the
checkbox alone to do therefore releases explicitly.

## 6. A mark survives a decoration rebuild

Whether the element a gesture started on is still there after the view re-renders decides whether
pointer capture can be taken on the mark itself, and whether a preview may be drawn as a
decoration at all. Measured across a selection-only transaction and then a document change, both
dispatched while holding a reference to the mark:

| | same node | still connected |
| --- | --- | --- |
| `.list-bullet` | yes | yes |
| `.to-decor-marker-icon` | yes | yes |

So a decoration pass does not replace the marks under it, and a preview that redraws on every
pointer move does not destroy the element the gesture is anchored to.

**Not measured, and the reason capture should go on the editor root rather than the mark:**
CodeMirror recycles line elements that scroll out of the viewport. A drag that autoscrolls will
take its own source line off screen, and nothing here says the mark survives that. The editor root
is stable by construction and answers the same question section 5 raises, so it is the cheaper
place for the capture either way.

## 6a. A depth's column is the content box plus depth times the unit

Measured because the resolution needs a pointer x in the same space as a column, and every other
surface in this plugin positions itself in CSS instead — nothing had ever needed the number.

Fixture: a heading with four nested list items under it, default appearance.

| read | value |
| --- | --- |
| `--to-decor-unit` on the content DOM | `2rem`, unresolved |
| a probe element's width at `width: var(--to-decor-unit)` | **32px** |
| the guide overlay's `background-size` | `32px 100%` |
| content DOM's own left, padding included | **376** |
| `.list-bullet` lefts, depths 1 to 4 | 408, 440, 472, 504 |

So `column(depth) = contentLeft + depth × unit`, exactly: 408 = 376 + 32, 440 = 376 + 64, and so
on. A bullet's own box STARTS on its column — its centre is 4.45px right of it — which is the
asymmetry section 1 recorded from the other side.

Two things this settles. The unit resolves through a probe element and not through
`getComputedStyle`, which hands back the unresolved `2rem` for a custom property. And the origin is
the CONTENT box, not the line box: a line at depth 1 reports `left: 408` and `margin-left: 32`, so
reading a line's own rect would fold the depth in twice. The overlay's `background-size` agrees
with the probe, but reading it would tie the drag to guides being painted, which a display setting
can switch off.

## 6c. A seam's y is a document coordinate, and the pointer's is not

The column arithmetic above is in viewport coordinates throughout, because every number it rests
on comes from `getBoundingClientRect`. The vertical axis is not: CodeMirror's `lineBlockAt` reports
`top` and `bottom` measured from the document's own first line, so on a note that does not start at
the top of the window the two axes were in different spaces and only one of them matched the
pointer.

Measured on the drag fixture, in a default desktop window:

| read | value |
| --- | --- |
| content DOM's own top | 154.05 |
| line 0's block, `top`–`bottom` | 0 – 47.06 |
| line 5's block top | 150.19 |
| line 5's first character, `coordsAtPos().top` | 307.92 |
| the document's bottom, `lineBlockAt(doc.length).bottom` | 248.06 |

A pointer aimed at line 5's own top edge arrives as `clientY: 308`, and against the block numbers
the nearest seam is the document's last one, 248 — so a run dropped a third of the way down the
file landed at the end of it. `view.documentTop` is the offset between the two spaces and already
carries the scroll, so a seam's y is `documentTop + block.top`.

What let this stand through the whole preview layer is that it is a CONSTANT: the preview is drawn
from the same resolution the release applies, so it agreed with itself and with every assertion
about its stability. The first thing to disagree was the buffer after a real drop.

## 6b. The collapse's own layout shift could not be observed

Design D9a reasons that resolving seams on the same frame as the selection collapse reads
pre-mode geometry: a row that stops rendering raw can change height, and every seam below it moves.
The gesture defers the first resolution by one move for that reason.

Tried to make it bite, and could not. Two fixtures, both driven with the pointer held still across
several moves so any drift would show as two different answers: plain list items, and a list whose
CARET ROW is a long link whose raw form wraps over several rendered lines. With the deferral
removed, both give the same destination on the collapse frame as on the move after it.

So the deferral stands on its reasoning rather than on a measurement — it costs one pointer sample
and nothing else — and the case that covers it asserts stability rather than claiming a control it
does not have. What would settle it is a row whose raw and rendered heights are known to differ by
a whole row at the moment of the collapse; neither fixture here achieved that, and finding one is
its own measurement.

## 6d. Three things the first manual pass found

The beta's first real-vault pass turned up three flaws the harness had not, each with a different
cause. Recorded here with the figures that settled them; the fixes carry their own explanations.

**A subtree dropped between a heading and its first child landed at the end of the section.** In
the seam model, not the geometry: the depth one level inside the node above a seam was always
placed at `children.length` — right after a leaf or a folded node, whose children the seam sits
past, and wrong between a parent and its visible first child, where the seam sits before it. Every
first-child seam in the corpus offered the last index.

**The end of a note could not be targeted.** The last seam's y was the document's own bottom, and
the last line block carries the editor's bottom padding along with it:

| read, on the drag fixture | value |
| --- | --- |
| last text row's block, `top`–`bottom` | 150.19 – 176.56 |
| terminating gap line's block, `top`–`bottom` | 176.56 – 248.06 |

A 71px gap line on a seven-line fixture; on a real note that padding is a scroller's worth, so the
seam sat far below the last row. The seam now sits at the bottom of the last line with text.

**The ghost mark sat outside a deep list, while the indicator on the same seam was right.** The
seam row was a list line four levels in, which Obsidian indents with its own padding and a matching
negative `text-indent`:

| read, on the seam row and its ghost | value |
| --- | --- |
| row `padding-left` / `text-indent` / `margin-left` | 110px / −110px / 32px |
| indicator, overlay space | 128 (= 4 × 32) |
| ghost centre, viewport | 394.02 |
| column 4, viewport | 504.02 |
| ghost's computed `left` | −7.2px |

−7.2px is `icon × 0.5 − gutter`, the plain-line marker's shift — and the ghost's inline style
carried it as `left: … !important`. `MarginCompensation` keeps every marker icon it finds on a
plain line at that shift by writing `left` inline, and the ghost is a marker icon with a placement
of its own. Excluded from that pass, the ghost's centre reads 503.98. The same expression evaluated
correctly in a plain Chromium page throughout, which is what pointed away from the CSS and at a
writer.

**A paragraph dragged out of a nested section was offered the outer headings' columns.** With
`# H1` › `## H2` › `### H3` › two paragraphs, the note's last seam offered the first paragraph
depths 0 through 4. Run through the algebra, the drops at depths 0, 1 and 2 each wrote the same
document as the drop at depth 3: a paragraph written after a heading is inside its section, whatever
the tree said. The preview drew it under the H1's column and the release put it under the H3.
Those columns are no longer offered to a non-heading run — the sibling it would follow is the node
above's ancestor at that depth, and headings nest only under headings, so that one node is the whole
test. A heading run keeps them, re-levelled. The same rule removes the root column from the mockup's
six-destination seam for a bulleted run; that column was only ever a heading run's.

## 7. Where a drop can land: the seam and its depths

Not a measurement — the model the sections above leave to be chosen, recorded here so the design
does not re-derive it.

A destination is a parent and an index between its children, and a pointer position names one only
with help, because a single seam between two rendered rows stands for several destinations at
once. Below a deeply nested last child, a run can land as that child's sibling, as its parent's,
as its grandparent's, and so on outward — every one of those is "between these two rows".

The seam's candidates are bounded on both sides by the rows that flank it. Landing shallower than
the row *below* would make that row a descendant of what was dropped, which is a different
operation; landing deeper than one level inside the *deepest trailing branch above* names a parent
that has no such level. "One level inside the row above" needs one qualification: a row that
cannot hold children at all — an atom, which the algebra treats as a leaf — offers no level
inside it, so the deep bound is the deepest trailing descendant that CAN take children. So the seam's legal depths are the closed interval from the depth of the
following row to one past the depth of the preceding row's deepest trailing descendant, and the
pointer's horizontal position picks one of them. This is what Workflowy, Notion, Dynalist and
every file-tree drag do, and it is why all of them draw an indicator whose left end moves as the
pointer moves sideways: the left end *is* the answer to which destination was chosen.

Two of the interval's bounds are ours rather than universal, and both follow from rules already
stated elsewhere:

- A fold hides its subtree, so the depths inside a folded run are not offered — the deep bound is
  the deepest *visible* trailing descendant. A drop into a folded node opens the fold, which is
  `outline-folding`'s existing rule for a change to hidden content, not a new one.
- A destination is only a candidate when the operation would be accepted there. Asking the
  operation, rather than restating its conditions, is what keeps a preview from promising a
  landing the release will not deliver — and the next section is why that distinction is not
  pedantry. With one measured caveat, recorded in 7a: the shared re-encode step is not yet a
  COMPLETE oracle, so asking it is necessary and not sufficient.

## 7a. What the paste layer changes underneath this

`paste-lands-where-it-is-pointed` rewrites what an insertion at a destination does, and this
change sits on top of it. Three of its results reach the drag directly; they are recorded here
rather than in the drag's own design because they are facts about the layer below, not decisions
this change gets to take.

**The candidate set grows.** A heading-rooted payload landing in a list scope used to be refused;
it now converts, becoming a list item that carries its own `#` run as text. Nearly every seam is
therefore reachable by nearly every payload, and a drag's preview has correspondingly more to say
about what the run *becomes*, since conversion is now the common case rather than the refused one.

**What remains refused is no longer a property of the destination's KIND.** Two rejections
survive, and they are unalike:

| refusal | what decides it |
| --- | --- |
| `insertion-not-expressible` | an atom among the payload's own ROOTS, landing in a paragraph's children — an atom deeper in the payload is fine |
| `at-h6-bound` | the payload's DEEPEST heading, re-levelled to the destination, landing past `h6` |

**The guard does not yet cover an atom PARENT.** Measured against this branch's `ops.ts`:
`reencodeBlocksForDestination` accepts a payload under a `code` parent, a `table` parent and a
`quote` parent, because its expressibility arm tests the payload for atoms and the parent only for
`paragraph`. An atom is a leaf — `indent` refuses one as a target with
`not-expressible-under-target`, and the structural-operations spec calls atoms leaves outright — so
a destination inside one is not a destination. Until that guard sits beside the others, "ask the
operation" is necessary and not sufficient, and the seam's deep bound has to exclude a parent that
cannot hold children on its own account.

The second refusal is the one that matters most for a pointer gesture: it depends on the
destination's own heading depth, so on ONE seam a heading payload can be legal at the shallower columns and refused
at the deeper ones. Legality varies along the horizontal axis, which is exactly the axis a drag
invented to let the pointer choose. A candidate set built from a copy of the old kind-based
conditions would offer those deeper columns and fail on release.

Asking is also cheap now: the guard moved into the shared re-encode step and that step returns a
typed result, so "would this land?" is one call per candidate rather than a predicate to maintain
beside it.

**A dropped heading absorbs what follows it.** A heading opens a section running to the next
heading of its level or shallower, so a heading-rooted run dropped among siblings takes the
anchor's following siblings into its own section — stated behaviour in that change, bounded by
the destination scope's end, not a defect to work around. For a drag this is new information the
preview owes the reader: the seam and the column say where the run lands, and say nothing about
the rows below it changing parent. A preview that draws only the landing place is accurate and
still leaves the reader surprised.

## 7b. A move inside one scope is not a removal and an insertion

Measured while building the operation, over the same generated corpus the closure properties use
(`tests/generators.ts`, `arbTree()`): every scope of every document, every member as the run, every
index as the destination.

Composing `deleteSubtreeGroups` with the insertion rewrites a run that has not changed scope. The
insertion reads the destination's context from the tree the removal left, and where the destination
IS the scope the run came from, the run was part of that context. Three rewrites follow, all of
them visible to a reader who dragged a bullet two rows and expected two rows:

| what the composition did | why |
| --- | --- |
| a bullet among paragraphs came back a paragraph | the regime rule read the siblings the run was the counter-evidence to |
| a run returning to the top of a tight list came back loosened | the boundary it had occupied was gone, so the parent's nesting gap answered in its place |
| the file's terminating newline moved into the middle of the document | the gap travelled with the node that used to end the file |

Counts, over ~200 generated documents: **21347 of 43937** moves changed the document they should
have restored with the composition as it stood; **1550 of 23016** after the insertion learned to
read a scope's first boundary at index zero rather than the parent's gap (kept: it fixes the same
loosening for a paste); **0 of 28579** once a same-scope move is taken as a REORDER instead —
gaps positional, no re-encode, which is what `moveSurgery` has always done for the one-step form.

The remaining accepted-but-not-restored cases are all absorption: 3586 of them, every one a scope
whose member count changed because a heading took its neighbours into a section. That is stated
behaviour (section 7a), and the round-trip property scopes itself by the member count rather than
by predicting which operands absorb.

## 8. What stays open

- **Zoom on a task's mark.** Section 4 frees the checkbox's press for a drag, not its click. The
  affordance-budget entry's task question is untouched.
- **The mobile gesture.** A touch drag on a mark and a scroll are the same gesture until something
  discriminates them, and a long press is the usual discriminator. Nothing here measured one, and
  section 2's harness note says the mobile run cannot drive a coordinate-aimed press at a mark at
  all — so whatever is built there is a manual pass, as `content-space-caret`'s was.
- **The cost of a preview per pointer move.** A transaction per move is what a native drag already
  dispatches, and `guide-hover.ts` already dispatches one per hovered column, so the shape is not
  new. It was not timed here against the enforcement funnel's budget.
- **Where the atom-parent guard belongs.** 7a measures the hole; whether it closes by moving the
  guard into the shared re-encode step, the way the paste layer moved the others, or by the
  candidate rule excluding a childless parent on its own, is not settled here.
- **How much of an absorbed region a preview should mark.** Section 7a establishes that a heading
  drop re-parents the rows below it and that the reader should see so. Whether that is the whole
  absorbed span, its first row, or a count is a design question the mockup does not yet draw.
- **A mark's painted ink versus its box.** Section 1 reports boxes. What a bullet's dot actually
  covers inside its span was measured once, for the gutter, in
  [marker-text-gap.md](marker-text-gap.md); this pass did not re-measure it and nothing here
  depends on it.
