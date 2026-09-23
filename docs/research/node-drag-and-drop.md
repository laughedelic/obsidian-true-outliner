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

## 6e. What the second pass found

The second real-vault pass ran against the fixes above and the absorbed-rows preview (option J in
the mockup's fourth panel). Its findings were in the seam model and in the preview's geometry, not
in the algebra, and the model ones are stated here because they changed what a seam IS.

**A heading could not be set down beside the heading above it, nor outdented in place.** With
`## Plan` dragged under `## Materials`, the seam between Materials and its first child offered one
column, `###` — the interval's shallow bound is the node below's depth, and Materials' children sit
one level in. Yet `## Plan` written there is legal (Materials is left childless, Plan takes its
children), and so is `# Plan` written where Plan already stands. Both are levels SHALLOWER than the
shallow bound, at the seam's own position. On the Kitchen Renovation fixture, the seam under
Materials offered a heading run one place before and three after (`###`, `##`, `#`); the seam at
Plan's own top offered two before and three after — `#` beside Kitchen's children, its own place,
and one level inside `intro`, as a list item. The algebra reads the level from the destination for these,
because the parent it lands in implies a level one deeper.

**The seams around the run were two, and both offered a move.** The seam above `- one` and the one
below its subtree each read the run as one of their flanking nodes, so the positions right above and
below it were offered and wrote nothing when taken. Reading the seams with the run removed merges
the two into one at the run's top, whose depths are bounded by the nodes on either side of the run.
The run's own place stays on that seam: a first cut dropped it, and the second pass wanted it back
as the way out of a drag — set the run down where it was, or move it sideways on the same seam. The
run's bottom is kept as a seam offering nothing rather than dropped: with it gone the pointer over
the run's bottom resolved to the next seam down and moved the run one place — the e2e no-op case
caught that on the first run. On the unit fixture with `- one` before a table, a fence and a
paragraph, the seams went from four with a move each to five, with the dead one at the run's bottom.

**The absorbed rows' guide ran a row too far, and covered the ghost mark.** The span ended at the
last absorbed node's last line, which for a node with a trailing gap is the blank line, one row past
every other guide; it now ends at the last line with content. The guide on the first absorbed row
was drawn full height, over the mark straddling the row's top edge; it now starts half a mark below
it. And a row that already sat at the ghost's column lost its own guide when the shift moved it one
column right without adding the column it vacated — that column is now drawn on every absorbed row,
since it is the guide the dropped heading will own.

**The indicator sat wrong under a heading and above a code block.** Drawn at the top of the row
below the seam, it pressed against the first child of a heading with the heading's own clearance
unused above it, and at the top of a fenced block it was painted over by the block's background. A
first correction anchored it to the bottom of the heading's row, which read as underlining the
heading. Where the row above the seam is a heading, or the row below is an atom, the indicator now
takes the middle of the gap line between the two rows — the seam's own room — and the row above's
bottom only where no gap line separates them. The ghost had to follow it: the decoration pass
drew the ghost only on rows with a fact, so on the gap line the indicator was drawn and the mark
was not — every drop under a heading, and every drop above a code block, table or callout, lost its
mark. And the mark itself was read by parsing the destination's first line alone, which for a
table is a paragraph; the destination now carries the re-encoded node's own kind and level.

## 6f. What a move costs on a long note

The open question in section 8 — the cost of a preview per pointer move, never timed — is closed
here, on the note the classification and enforcement budgets are measured on: 400 `##` sections
with a paragraph each, about 2000 lines. A heading is dragged down the view in 6px steps, 71 moves
with the button down, crossing eight seams; the same path is driven first with no button down, as
the baseline. What a move costs is read from inside the page as the interval from the recorder's
capture-phase sample on the editor root to a bubble-phase listener registered after the plugin's
own, so the plugin's handling of the move is inside it and the recorder's own work is not — after
the first two runs, whose clock started before the recorder's sweep of the rows.

| run | what a move read | recorder inside the clock | median | p95 | max |
| --- | --- | --- | --- | --- | --- |
| 1 | the seams and the unit, per move | yes | 282.1ms | 461.7ms | 736.8ms |
| 2 | the seams once per press; the unit per move | yes | 249.5ms | 682.4ms | 696.0ms |
| 3 | as 2 | no | 131.4ms | — | — |
| 4 | the seams and the unit once per press | no | 0.60ms | 93.7ms | 318.4ms |
| — | baseline: the same path, no button down | no | 0.20ms | 80.0ms | 213.8ms |

Eight dispatches in the 71 moves, in every run: the guard against a transaction per sample holds,
and the moves that stay on one seam dispatch nothing.

Three costs, taken apart by the differences. Re-reading the seams on every move — every place at
every seam re-encoded through the algebra's own call — was about 30ms of it here (1 → 2). The unit
probe was the bulk: an element appended to the editor root and measured forces a layout, and its
removal invalidates one, on every move (3 → 4). The recorder's own sweep, `getComputedStyle` on
every rendered row, was some 120ms of what the first two runs reported (2 → 3), and is no part of
the gesture. With both readings held for the press, what the gesture adds to a typical move is
0.4ms over the page's own 0.2ms. The tails are the dispatches: at eight in 71 moves the p95 is one,
and a dispatch on this note is the decoration rebuild the note's size sets, in the same range as
the page's own spikes on unpressed moves, which run the guide hover.

The autoscroll loop measured the same cost from the other side before the fix. It re-resolves the
preview once a frame, and at run 3's cost a frame took the page a tenth of a second: over two
600ms holds at the scroller's bottom edge the scroller moved 18 → 54 → 134px and the seam under
the resting pointer from line 23 to 29, where the rate asked for 6 and 20 pixels a frame. With the
readings cached the same two holds covered 180 and 220px — still a fifth of the ratio asked for,
because every frame that scrolls onto a new seam dispatches a preview, and the deep hold's frames
were the slow ones. The rate is now stated per second and applied by each frame's elapsed time.

## 6g. What the coverage sweep found

Writing one e2e case per destination class, and one each for a multi-root cover, a fold and a
zoom, turned up three gaps the earlier passes had not reached.

**A drop into a folded node did not open the fold.** `- three` dropped one level inside a folded
`- one` landed after the hidden `  - nested`, as the fold rule says it should, and the fold stayed
closed over both. The reveal rule opens a fold that hides the SELECTION, and the landed run was
selected — but the run had landed at the fold's end, and the fold carried through the change
covered the lines it had covered before. The drop now opens every fold touching the destination
parent's own line before it writes, in a dispatch of its own on the document the fold's positions
are stated in.

**A multi-root run landed selected as its first root.** `moveSubtreesTo` finalised on the first
root's id alone, so the cover after a drop of `- one` and `- two` together was `- one`'s subtree.
`finalize` already takes every subject for the group forms; the move now passes all its roots.

**Under a zoom, the seam after the last visible node could not be reached.** Its line is the first
line the zoom hides, and that line starts no block of its own: it sits inside the block of the
last visible line, so the seam read as that block's top — the same y as the dead seam at the
run's bottom, which then won every tie. Nor is the block's bottom the answer: the block keeps
the height of what it hides. Measured on the zoomed fixture, with the pointer at 236:

| seam | line below | read as the line's block top | read as the block's bottom | read as the visible text's bottom |
| --- | --- | --- | --- | --- |
| before `  - n1` | `  - n1` | 183 | — | — |
| the run's own bottom | `  - n2` | 209.4 | — | — |
| after `  - n2` | `- two`, hidden | 209.4 | 283.3 | ≈236 |

The seam before hidden content is now the bottom of the last visible line's own text, which
`coordsAtPos` states exactly.

## 6h. Three encoding answers the second pass questioned

Each is a rule the drop inherited from the insertion layer and the first surface to show before
the release. Recorded here with what changed and what it cost the suite.

**An `h2` dropped under an `h2` whose only child was an `h5` section became an `h5`.** The level
rule copies the destination's heading siblings, and only falls back to the parent's level plus
one where there is none. Changing it to the parent's reading made the drop write `### First`,
which dropped before `##### Deep` takes that section in as its child. Both are right answers at
that seam — a direct child of `## Second`, or a sibling of `Deep` at its rank — and the change was
reverted: the sibling reading never absorbs content nobody pointed at, and paste and drop keep
agreeing on it. One test of 1597 pinned the sibling reading, and it stands.

**A task dropped after a paragraph became a paragraph beginning `[x]`.** The kind rule encoded a
reparented node like its nearest content sibling. A task cannot be a paragraph; where the
attachment rule would force it (right after a paragraph, whose child a list item would become),
the move is refused and the seam filter drops that column. No existing test covered a task's
re-encoding.

**A list item dropped under a heading became a paragraph.** Same rule. A list item now keeps its
kind wherever the destination can hold one, and converts only right after a paragraph, for the
attachment rule's sake. Whether a list after a paragraph should be its child at all is
[discussion #185](https://github.com/laughedelic/obsidian-true-outliner/discussions/185); the
conversion is what the current reading of that rule requires, and would go with it.

## 6i. Absorbed rows moved one level in at every level

With `# A` › `## B` › `foo`, and `## C` held between `B` and `foo`, the seam offers C at `h1`, `h2`
and `h3`, and `foo` becomes C's child at each. The preview drew `foo` one level in all three times;
the result puts it at depth 1, 2 and 3. The shift was a constant written before a drop could land
shallower than the rows it takes. Each absorbed node whose parent is outside the span now moves by
the destination's depth plus one less its own depth, and its subtree with it — measured by the
depth the depth rules read on `foo`'s row at each column: 1, 2, 3.

The same pass found the parent accent on the wrong node for the two shallower columns. A levelled
place is written at its neighbour's text position — `parentId` is `B`, index 0, for all three — and
the accent read that parent: for `h2` it lit `A`'s guide between `B` and the seam, drawn from `B`'s
line, and for `h1` it lit the same. The place now names the node the run lands under — `A` for
`h2`, none for `h1` — and the accent reads that.

The ordered placeholder's dot was the bullet's size: the rule that sizes the ghost's bullet to the
native bullet matched every circle in a list-item ghost, the placeholder's dot included.

## 6j. The ghost's own space, and the seam between paragraphs

The third pass found guides crossing the ghost and the rule. With `# A` › `## B` › `foo`, and `## C`
held between `B` and `foo`, the seam sits in the middle of the gap line, where `A`'s guide (column
0) and `B`'s (column 1) both run. Under an `h1` both crossed the mark or the rule; under an `h2`,
`B`'s crossed the mark, and the guide `C` will own began only on `foo`'s row, half a mark below its
top, leaving a hole on the gap line. A guide on the ghost's column or deeper belongs to a node the
drop closes above the seam, so on a gap-line seam it is not drawn at all; on a seam drawn at the
bottom of the row above, it runs down to the mark and stops 2px short of it. The run's own guide
starts on the ghost's row, 2px below the mark. Read on the seam row's plain guide layers, full
height against stopped segments, at `h1`, `h2`, `h3`: 0/1, 1/1, 2/1, where the previous drawing
read 2/0 at each.

Between two paragraphs the rule sat on the lower paragraph's top edge while it sat evenly between
two tight list items. The rule took a gap line's middle only under a heading or above an atom; any
gap line between the two rows now takes it.

## 6k. A held touch is taken back by the platform's pan

The first phone pass could not pick a node up: the keyboard came up, then the editor lost focus.
The handler cancelled the touch's `pointerdown` and nothing else, and a touch's own events carry
the platform's readings of it. Measured in headless Chromium 1194 with touch emulation, driving
`Input.dispatchTouchEvent` at a mark (a `contenteditable=false` span inside a `contenteditable`,
its `pointerdown` cancelled as ours is) in a 300px scroller:

| Handling | Tap | Rest 1.2s | Rest 0.7s, then move | Swipe from the mark |
|---|---|---|---|---|
| `pointerdown` cancelled (as shipped) | `click` | `click` | `pointercancel` on the first move | scrolls, `pointercancel` within 70ms |
| `touchstart` cancelled too | nothing | nothing | the moves arrive, `pointerup` | nothing scrolls, `pointerup` |
| `touchmove` and `touchend` cancelled after a 350ms rest | `click` | nothing | the moves arrive, `pointerup` | scrolls, `pointercancel` within 70ms |

The shipped handling loses a held drag to the pan on its first move. Refusing the moves after the
rest keeps the drag and the swipe's scroll alike. Refusing the `touchstart` keeps the drag and costs
the swipe. The editor was never focused in any row, since a cancelled `pointerdown` suppresses the
compatibility `mousedown`; the keyboard on the phone came from something this setup does not
produce. Headless Chromium fired no `contextmenu` on a 1.2s rest, so it simulates no long press,
and the long press — a caret in an editable region, a menu, the keyboard — is the likeliest source.
WebKit is not measured. A synthesised `TouchEvent` in desktop Chromium reports `defaultPrevented`,
so the e2e checks which of a touch's events the handler refuses, in the page, on both runs.

The second phone pass, on the build that refuses the touch from its start: holding a mark still
selected its subtree, which is the dwell's pick-up, and moving the finger then did not drag it. Not
diagnosed. The pass also found the gesture unfit for a phone on its own terms: at the phone's
default unit the marks, fold controls and guides are too close together to land a finger on the
one meant, and the finger covers the seam and column it aims at. Touch dragging is off by default
since (design D12).

## 6l. A heading written shallower took its column's depth, not its siblings' level

The manual pass dragged `## B` into `# A` / `## B` / `## C` / `foo` / `#### D` / `bar` as C's
child: every place wrote `#### B`, beside D, except the one between `#### D` and `bar`, which wrote
`### B`. That place is one of a heading run's shallower columns, written at the seam's position to
close D's section, and it took its level from its column's depth plus one where every other place
takes the sibling rule's. The two agree only where a note skips no level.

Probed over every candidate of the two fixtures below, comparing the preview's first line and
the node it names as the parent against what the release writes:

| Fixture | Candidates | Level differs from the siblings' | Lands under another node |
|---|---|---|---|
| `# A` / `## B` / `## C` / `foo` / `#### D` / `bar` | 19 | 1 (`### B` under C) | 0 |
| `# A` / `## B` / `# A2` / `### C` / `#### D` / `bar` | 17 | 3 | 1 (`### B` closes `### C`, lands under `# A2`) |

A randomized pass with the same parent check, over generated notes with some headings written a
level deeper, then found another shape: a shallower column whose parent is a list item. A heading
cannot be one's child, so it lands under the nearest heading, while the preview accented the list
item. Both are fixed: the level is the sibling rule's at the column's parent, and a column whose
parent is not a heading is not offered. The property now holds the first line over notes that
skip levels, and the parent for these columns.

The same parent check over every candidate — 800 generated notes, 58,077 destinations whose parent
line is unique — found 60 more, in two shapes neither of these columns produces:

| Shape | Destinations |
|---|---|
| A heading converted to a list item, written right after a paragraph, becomes that paragraph's child | 57 |
| A heading moved within its own parent, past a shallower sibling heading, joins that sibling's section | 3 |

The first is the shared re-encode step's: a list item right after a paragraph is written as a
paragraph there and a task is refused, but a heading converted into a list item is written as one,
so a paste at the same place nests it the same way. The second is the reorder's: a run that stays
in its scope keeps its lines, and a heading kept at its level re-parses into the section it
crosses. Neither is decided here.

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
  affordance-budget entry's task question is untouched, and moved out to
  [#202](https://github.com/laughedelic/obsidian-true-outliner/issues/202).
- **Dragging on touch.** Built and shelved (design D12): off by default, and on a phone the pass
  in section 6k found it unusable as a gesture rather than only broken. What a finger can pick up
  and aim at is a question for a touch interface of its own; the code that stays behind the flag
  is the dwell, the slop and the refusal of the touch's own events, which the e2e covers in the
  page, and a tablet is where it would be judged next. Tracked in
  [#201](https://github.com/laughedelic/obsidian-true-outliner/issues/201).
- ~~**The cost of a preview per pointer move.**~~ Measured in section 6f: 0.4ms over the page's own
  cost of a move once the seams and the unit are read per press rather than per move, and a
  dispatch only when the destination changes.
- **Where the atom-parent guard belongs.** 7a measures the hole; whether it closes by moving the
  guard into the shared re-encode step, the way the paste layer moved the others, or by the
  candidate rule excluding a childless parent on its own, is not settled here.
- ~~**How much of an absorbed region a preview should mark.**~~ Settled in design D8 and section
  6i: the rows are drawn where the drop puts them, with no tint. Section 7a establishes that a
  heading drop re-parents the rows below it and that the reader should see so.
- **A mark's painted ink versus its box.** Section 1 reports boxes. What a bullet's dot actually
  covers inside its span was measured once, for the gutter, in
  [marker-text-gap.md](marker-text-gap.md); this pass did not re-measure it and nothing here
  depends on it.
