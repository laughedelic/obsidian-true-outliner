## Context

See proposal.md — Why. What decides this design is one measurement:
[docs/research/fold-mechanics.md](../../../../docs/research/fold-mechanics.md). Obsidian's fold
is CodeMirror's fold, behind a `foldService` facet that already holds three providers and takes a
fourth; a provider that answers from our tree makes any node foldable, makes Obsidian's own
`editor:toggle-fold` work on it, and makes the fold persist and restore per file. The chevron is
the exception — Obsidian paints it by its own heading/list rule, not from `foldable()` — so the
mechanism is inherited and the affordance is ours.

What the code already provides, and what this design leans on:

**Folded state is readable and writable from anywhere.** `zoom-view.ts` already imports
`foldedRanges` and `unfoldEffect` from `@codemirror/language` and dispatches them; the same
module supplies `foldEffect`, `foldable` and `foldService`. Nothing new enters the bundle.

**The tree is already computed per state.** `parsed-doc.ts` caches the parse; `decorate.ts`
produces per-line facts including each line's node and depth; `zoom-scope.ts` and
`selection-structural-ops` already turn a caret or a selection into subtree roots and their line
covers. A fold range is that cover expressed as offsets, so no new geometry is invented.

**The marker gutter is already shared chrome.** `decorations.ts` measures Obsidian's chevron and
transforms it onto our marker column per line (`--to-chevron-dy`, `--to-chevron-dead-right`), and
draws our own marker icons there. A second affordance in that column is a fourth tenant of a 14px
gutter whose budget is already the subject of a parking-lot entry
([12](../../../../docs/research/decoration-follow-ups.md), "The affordance budget").

**Guides are one gradient, not elements.** Each line's `--to-guides` paints every ancestor level
at `depth × unit` on a single `::after`
([09](../../../../docs/research/experiment-2-guide-lines.md)). There is no per-guide element to
click and there will not be one.

**Marker clicks are already claimed.** `zoom-click.ts` owns a capture-phase `pointerdown` above
the editor and zooms on a mark; `outline-zoom` requires that a marker click NOT fold. Fold
gestures have to compose with that listener rather than race it.

## Goals / Non-Goals

**Goals:**

- One fold rule, derived from the tree, that every kind and every entry point agrees on.
- Inherit Obsidian's fold state, placeholder, commands and persistence rather than shadowing them.
- Keep the affordance budget honest: one fold target per line, in one column, whoever draws it.
- Fold state that survives the operations a folded subtree exists to make possible.

**Non-Goals:**

- A fold model of our own in plugin data. Fold state stays CodeMirror's, persisted by Obsidian.
- Animated collapse. Out of scope, and CM6's block replacement gives no natural hook for it.
- Changing where Obsidian paints its own chevron. We add where it paints none; we do not remove.
- Reading mode, the core Backlinks pane, and configurability of the guide gesture (proposal —
  Non-goals).

## Decisions

### D1. One `foldService` provider, at high precedence, answering from the tree

`Prec.high(foldService.of(...))` so our answer wins over the three native providers on lines they
also claim. The provider resolves the line to its node through the cached parse, returns `null`
when the node has no children, and otherwise returns `{ from: end of the node's own last line, to:
end of its last descendant's last line }`.

*Alternative rejected:* answering only where the natives return `null` (the "fill the gaps" shape).
It is smaller, but it leaves fold extents differing by kind — a heading folding to the next heading,
a list item folding by indentation, a paragraph folding by our tree — and it leaves every fold
subject to Obsidian's "Fold heading" / "Fold indent" settings. The whole point of the change is
that a node folds because it is a node.

*What the gate could not settle:* how any of this behaves with Obsidian's own "Fold heading" and
"Fold indent" settings off. Driving them from the harness gave contradictory readings — the same
call left the indicators in place in one sequence and removed them in another, and in a third left
the editor unable to apply a fold at all — so nothing measured through it can be trusted in either
direction. No code here reads those settings; whether Obsidian's fold layer is present without
them is recorded as open in docs/research/fold-mechanics. Everything else in this design rests on the default
configuration, which is measured throughout.

### D2. The trailing gap stays visible

A fold ends at the last descendant's last CONTENT line, not at the end of its owned gap. Measured
native folds do the same, and hiding the blank line between two siblings makes folding one node
change the spacing of the next. Stated in the spec so it cannot drift.

### D3. Commands dispatch effects; they never edit the document

Fold and unfold are `foldEffect` / `unfoldEffect` dispatches, resolved through the same
`selection-structural-ops` operand the structural commands use. This keeps folding outside
`transaction-classification` entirely: a fold produces no `ChangeSet`, so the enforcement filter,
the minimal-change dispatch and the undo history never see it.

*Escalation to the nearest ancestor with children* (spec: "Three commands…") is resolved by
walking the node path from the caret's node upward — the path is already in hand from the parse.

### D4. A fold follows its own content, decided in a transaction filter

Measured, and not what this design first assumed: CodeMirror's own mapping cannot be relied on to
keep a fold across a structural operation at all. A move drops it even when the change set never
overlaps the folded range, and an indent drops it too — the note that recorded indent as the
surviving case did not survive re-measurement.

So the fold layer restates itself on every change, in a transaction filter, from one rule:

> A fold survives a change if the lines it HID are still there in one piece — the same lines, in
> the same order, ignoring each line's indentation. It then follows them wherever they went.
> Otherwise it opens.

The identity is the hidden run and nothing else. Indentation is excluded because an indent
rewrites exactly that and changes nothing about what is hidden; the node's own visible line is
excluded because typing on it changes nothing about what is hidden either. A whole run rather than
a first line, because a list of repeated items would otherwise match the wrong sibling. Ties go to
the candidate nearest where the run used to be.

*Why a filter, and why every fold rather than the touched ones.* The filter is the only place that
sees both dispatch sites — the keyboard path and the command path produce ordinary transactions,
and neither carries an `OpOutput` a design could read the moved node out of (`OpOutput` has an
anchor and a span, no per-root paths, and `finalize` regenerates ids). Restating every fold rather
than only the ones a change reaches is what makes the rule independent of CodeMirror's mapping
behaviour, which is the thing that could not be trusted. It is idempotent — a `foldEffect` for a
fold that already exists is ignored — and the fast path checks the mapped position first, so an
ordinary keystroke pays one line comparison per fold.

*Alternatives rejected.* Extending `OpOutput` with result paths: a change to the mapping core's
public output for a presentation concern, and it would still leave the keyboard path to plumb.
Making the move emit an edit shape a fold can map through: a change to `ops.ts`'s minimal
changesets for the same reason. Both were the design's earlier answers, and both are heavier than
a rule that needs nothing from the operation at all.

*One mechanical detail that is load-bearing.* The effects are appended as a second transaction
spec, and that spec must be marked `sequential`. Without it CodeMirror merges the two specs
non-sequentially and maps the effects through the change set — a second time, since these
positions are already stated in the document the change produces. Measured: a fold carried through
an indent landed one line late, and one carried through a move landed inside deleted text and
vanished.

*A fold closing over the caret.* The reveal rule (caret never in hidden content) has one case it
must not apply to: Obsidian's own chevron dispatches a fold and nothing else, so folding an
ancestor from above a caret that sits deeper hides that caret — and reopening the fold made every
ancestor of the caret unfoldable by pointer, more of them the deeper the caret sat. The view
plugin tells the two apart by what arrived in the update: a fold effect over a caret that was
already there moves the caret to the fold's head line (where our own gestures put it); a caret
arriving in an existing fold opens the fold.

*A caret stepping over a fold.* Our own Up and Down walk raw lines from the one beside the caret,
because `moveVertically`'s landing line is not trusted (a widget-rendered block can be crossed in
one step) — and the raw line beside a folded head is the first line the fold hides. Landing there
did not merely reveal the fold: CodeMirror's own fold state drops any fold the selection head
lands inside, so every Down from a folded node opened it in the same transaction, before the
reveal rule could see it. The walk now resumes on the far side of a fold it meets. Extending a
selection over a folded node (Shift+Down) needed no change of its own: it already selected the
node whole, with the head at the fold's END — a visible position, after the placeholder — and
only the reveal rule, counting that end as hidden, opened the fold under it. The rule is strict
at both ends now.

### D4a. Folding stays out of the history, and undo restores it anyway

Folding is view state, not document state: a fold produces no `ChangeSet`, so nothing about it
enters the undo history, and undo reaches past any number of folds to the last real edit.

That would normally cost something — undoing a move would restore the text and leave the fold
behind — and it does not, because of D4. Undoing a move re-inserts the same hidden run, so the
same rule that carried the fold forward carries it back; undoing an edit INSIDE a folded subtree
changes those lines, so the same rule opens the fold and the reader sees what the undo did.

This replaces an earlier decision to register `invertedEffects` for the fold effects the plugin
dispatches. That would have put a subset of folds into the history, which is a second answer to
"is folding undoable" living beside the first. Nothing needs it: the rule that keeps a fold on its
content is direction-agnostic, because undo and redo are just more changes.

### D5. Our own affordance is a widget in the marker column, not a second gutter

For a foldable line Obsidian paints no chevron on, the plugin renders a fold affordance as a
line-start widget in the marker gutter — the same place `decorations.ts` already puts marker icons
and the same place the native chevron is transformed onto. One element per line at most: when
Obsidian's chevron is present, we position it and draw none of our own.

*How much of this there is:* none, in the default configuration — corrected by task 1's gate,
which measured the opposite of what this design first assumed. Obsidian's indicator DOES follow
`foldable()`; the earlier reading came from registering a provider into a live editor, where the
fold decoration for an unchanged line is not rebuilt. Registered at load, the chevron appears on
every line the provider claims, the paragraph included.

It is still drawn on every line we fold, and still hidden in CSS by the presence of a native
chevron rather than by a rule about which lines Obsidian decorates. That costs one element per
foldable line and buys independence from a decision that is Obsidian's to change — which matters
more than it first appeared, because the configuration this was expected to serve (both fold
settings off) turned out to be one the harness cannot drive reliably enough to test. The test
takes Obsidian's indicators out of the DOM directly instead, which is the same condition and a
deterministic one.

*Where in the gutter:* the midpoint between the parent's guide and the marker — half a unit left
of the marker column — for ours and for the native chevron alike, which the plugin already
transforms per line. The first version anchored both a fixed gutter-and-a-half off the marker,
which the manual pass caught two ways: a paragraph's control sat visibly nearer its marker than a
heading's (a glyph's width of difference between the two anchors), and neither moved when the
indentation width was changed. The footer had made the midpoint choice already. The midpoint has
a floor: at the mobile default unit it lands the glyph's right edge inside a checkbox's
half-width, so the offset is never less than that half-width plus half the glyph and a gap — one
CSS value, `--to-fold-chevron-offset`, that every placement reads.

*How the native chevron gets there:* measured per line, on both axes, by the plugin's existing
per-line pass. The horizontal transform's arithmetic assumes the wrapper's edge sits on the text
origin, and Obsidian moves that edge by kind AND by state — a folded block line is tagged as a list
line and takes the list padding with an inset that shifts the wrapper right by as much; the
caret's own line takes neither. One dead-space sample from whichever chevron came first in the
viewport therefore put every paragraph's chevron onto its icon, or a level too far from it,
depending on where the caret was — the manual pass's "jumps onto the icon". The correction is
the difference between where the glyph is and where it belongs, with what is already applied read
from the computed transform, so it converges.

*Alternative rejected:* a CM6 `gutter()` beside the content. It is the obvious mechanism and the
wrong one here: a gutter sits outside the readable-line-width column, so the affordance would
detach from the outline's own left edge and would not follow the zoom scope's re-based guides.

*Alternative rejected:* reusing the native chevron by making Obsidian paint more of them. Its rule
is internal; there is no supported way to extend it.

### D6. A folded marker is the same glyph at full contrast, plus the count — decided

The mark's job is to say what kind of node this is; folding is a second fact about the same node,
and the marker gutter's width is derived from the marks it must hold
([21](../../../../docs/research/marker-text-gap.md)), so a folded variant that grows the box would
move every line. That rules out anything drawn around the glyph before taste enters.

Seven candidates were drawn against every foldable mark at real geometry in
[`fold-marker-mockup.html`](../../../../docs/research/fold-marker-mockup.html) and reviewed
rendered. **Chosen: the glyph at full text contrast plus the hidden-descendant count.** Contrast,
not weight: the mockup drew "solid" as a heavier stroke, and the manual pass caught that a
heading's glyph is filled rectangles no stroke reaches — so the stroke change told a paragraph
from a heading, not a folded node from an open one.

*Why not the others.* The halo (Logseq's answer,
[12](../../../../docs/research/decoration-follow-ups.md)) is too heavy at 14px and crops the
corners of a wide glyph — the "H", an ordered "12."; the shaped halo fixes the cropping only by
becoming a different shape per kind, so one state reads as several, and behind a task's checkbox
it is nearly the checkbox again. Outline and dashed outline sit 3px off a 14px glyph in a gutter
the fold affordance already shares, and an outline competes with the caret accent's own ring.
The underline is the quietest but collides with the guide line running through that column.

The contrast change is the only treatment every mark can carry identically, and the count is the
only one that says HOW MUCH is hidden — which is the question a folded node actually raises, and
the one thing a bullet, already solid, cannot answer on its own.

The hidden-descendant count renders as a widget after the node's text, `contenteditable="false"`
and outside the document — the same class of chrome as the trail and the footer, and subject to
the same "never mutate document state" requirement `outline-decorations` already carries.

### D6b. The count IS the tail control, not a badge beside one — decided

Built as a bordered pill, the count landed immediately next to Obsidian's own fold placeholder —
which is not an ornament but a control: clicking the `…` unfolds. Two adjacent pieces of chrome
for one idea, and the louder of the two was the half a reader could not click.

Seven ways to spend less on it were drawn at real geometry in
[`fold-count-mockup.html`](../../../../docs/research/fold-count-mockup.html).
**Chosen: the count moves INTO the placeholder** — one control after the node's text, carrying the
ellipsis, the number and the click, with the native placeholder hidden wherever ours is drawn.

*Why not the others.* Dropping the pill's border and fill (B) is quieter but still two elements
saying one thing. Replacing the ellipsis with the bare number (D) reads as content on first sight
and gives a count of 1 a very small target. The gutter (E) is 14px wide and already the chevron's.
Hover-only (F) withholds the count exactly while a reader is scanning a folded outline, and says
nothing at all on touch. No count (G) gives up the one thing the folded state cannot otherwise
say.

*What it costs:* the ellipsis becomes ours to draw. We do not reconfigure CodeMirror's
`placeholderDOM` to get there — that facet field throws on a merge conflict, so claiming it would
make a future Obsidian release that sets it a startup failure rather than a cosmetic clash. The
native placeholder is left in place and hidden by a rule keyed on ours being present, which is the
same mechanism the fold affordance already uses for the native chevron.

### D6c. The marker and the chevron speak one language — decided

Found in the manual pass: a folded paragraph looked different from a folded heading or list item,
because the two controls came from different hands. Obsidian's chevron turns to
`--collapse-icon-color-collapsed` — the accent, in the bundled themes — the moment it collapses,
while ours stayed muted; beside a marker at text contrast the native one read as highlighted with
nothing pointing at it, and ours read as inert.

The states, for every kind and whichever control the line shows:

| state | marker | chevron |
| --- | --- | --- |
| rest, unfolded | muted; caret accent when the caret is on or under the node | hidden |
| line hovered | unchanged | shown, Obsidian's chevron colour |
| mark hovered (zoom) | highlight | — |
| chevron hovered | — | highlight |
| folded | text contrast (D6); the caret accent still wins on the caret's node | folded colour |
| folded, chevron hovered | — | highlight |

Two tokens carry it: `--to-decor-accent` (the caret trail's colour, already in use) and a new
`--to-decor-highlight` (`--text-accent-hover`), one step past it, for a control under the pointer.
The marker's own hover — the zoom gesture — is the highlight together with the cursor, and says
"clickable"; hovering the rest of the line changes nothing about the mark. A first version
accented the mark on line hover as well, and the second manual round read that as the mark being
highlighted by the whole node — the two controls keep their two meanings by each answering to its
own hover only. Two more things that round settled: the caret's colour wins over the folded one
on the caret's own node, and the mark is stacked above Obsidian's chevron wrapper, which on a
folded block line reaches over it (measured: the element under a folded paragraph's icon was the
wrapper, so hovering showed the chevron's cursor and a click unfolded instead of zooming).

The footer is not in this table: its
control is drawn in the footer's own mark colour and hovers to text contrast, a convention of that
surface that its own spec holds.

Left open, deliberately: a keyboard focus ring on the footer's button (a real `button`, so the
platform's own applies), and whether a touch layout should show every chevron at rest — it does
today, under `(pointer: coarse)`, and nothing here changes that.

### D7. The guide gesture is hit-test arithmetic, not an element

The click's x-offset within the content column is compared against the guide columns the line
already declares (`depth × unit`, plus the marker gutter's base). Within a tolerance narrower than
half a unit, and only left of the node's own text, the click is a guide click; otherwise it falls
through untouched.

A fold control's claim on a press is decided by the same geometry, not by the event's target. On
a touch screen the two disagree: Chrome snaps a tap to the nearest small clickable element and
leaves the coordinates where the finger was, so a tap on the parent's guide a few pixels from a
chevron — the case at a phone's narrow unit — arrives targeting the chevron's SVG. Measured on the
emulated phone: the guide's second press reopened one child instead of two. A control owns a press
only when the point lies within its own hit box.

A guide has no element, so nothing hovers it — and the manual pass found the gesture working and
invisible: nothing said where a press would land, and a press a few pixels off the band did
nothing a reader could tell from there being nothing to press. The same arithmetic now runs on
pointer moves and thickens the guide it names, on every element the guide runs through, and the
stylesheet shows the cursor on the pointer's own line. Thickened rather than banded: each depth's
guide layer reads a per-depth width property, and the gesture sets it — so the lit guide is drawn
by the layer that draws it at rest, continuous across gap lines and widget atoms, where a band
drawn per row (the first version) broke into pieces that did not meet. Its own width token,
two pixels over the guide's: the caret trail's width defaults to the guide's — the trail is a
colour — so "the trail's width" would have lit nothing.

Four things the third and fourth manual rounds settled about the arithmetic. Painted columns count
from what the view roots at, so inside a zoom the column is offset by the root's depth before the
ancestry chain is indexed. The line under the pointer is found by coordinates when the target is
not a line, because the outermost guide's band is half outside every line's box. The band is wider
on the left (nearly half a unit) than on the right (a third): right of a guide sit the next level's
mark and chevron; left of it is the parent level's empty run. The hover is editor STATE — a field
the pointer tracker sets, read by the decoration pass, which paints that depth's layer thicker on
every line the guide runs through. A first version wrote a per-line style property from the tracker,
and CodeMirror's line decorations own that attribute and rewrite it on every rebuild, which every
caret move causes: the lit guide went dark on the click that placed a caret and on any move that
reshaped the trail. The cursor is a class on the editor root, for the same family of reason: the
pointer is over some child of a line, each with a cursor rule of its own, so a class on the line
reached none of them. And a press on a guide is a guide press whatever it finds to fold — reported
as unhandled when there was nothing, it fell through and placed the caret.

This dissolves the parking-lot blocker, which assumed a hit area had to be invented. It also keeps
the guides themselves `pointer-events: none`, so nothing about their painting changes.

*Where it lives:* the existing capture-phase `pointerdown` listener in `zoom-click.ts`, extended
rather than duplicated. Two listeners racing for the same press is the defect that listener was
written to avoid, and the ordering between "is this a mark?" and "is this a guide column?" has to
be decided in one place. Marks win; they are the smaller target and the more specific claim.

*Touch:* the same `pointerdown`, as `outline-zoom` established — a mouse-only listener makes the
gesture not exist on mobile, and the guide tolerance may need to be wider there. Left to the
implementation pass with a mobile e2e run as the check.

### D7a. Leaving a zoom folds again what entering it opened — decided

The first version left them open, deliberately (`outline-zoom` said so). The manual pass made
the call the other way: a reader who zoomed into a folded node expects to come back to it folded.
The zoom view records, per scope it enters, the folds it opened; leaving that scope — zooming out
past it, or clearing — folds them again if still intact and not the one the caret now sits in, and
the scope being entered on the way out opens only what it finds folded *less* those, so zooming
out does not reopen what the exit restored. Nested zooms keep a stack keyed by anchor: the inner
scope restores what it opened and nothing more.

Folds OUTSIDE the scope are opened for the zoom's duration as well, and restored the same way.
Measured on the fourth round: Obsidian paints a hidden fold's collapsed indicator on the visual
block holding the fold's start, and everything the zoom's tail hides is one block ending on the
scope's last visible line — so a later sibling's fold put a collapsed chevron on the scope's last
child, and a press on it unfolded something off-screen.

### D8. Persistence is Obsidian's, and the setting is a suppression

Nothing is written by us: with the provider registered, `app.foldManager` already saves and
restores our folds. The setting therefore does not choose a storage; it decides whether a restored
fold is kept. With it off, the plugin unfolds everything inside its jurisdiction when a note's
editor is created — the same lifecycle hook the footer's per-note state already uses. Obsidian's
own folds in non-outline notes are none of our business either way.

### D9. The footer reuses the editor's fold chrome, and deletes its own

`to-backlinks-fold` and its CSS rule go away rather than being fixed in place, which is what the
parking-lot entry asks for. The row's fold becomes a property of the row HAVING a subtree, kept in
`ViewState` per node id — the same shape the group cap's `truncatable` uses for the same reason
(once expanded, the old "has hidden children" test stops being true and the affordance vanished).
The footer's rows are DOM, not CM6, so what is shared is the mark, its column, its hover behaviour
and its folded treatment — not the fold state itself, which stays the footer's own reading state.

## Risks / Trade-offs

- **We take over folds that work today.** A high-precedence provider changes the extent of every
  heading and list fold to our subtree cover. → Task 1 diffs native vs. ours across the fixture
  corpus before anything is built on it; a divergence that is not clearly an improvement is a
  reason to narrow D1's precedence to the kinds Obsidian declines.
- **Obsidian's fold settings may gate more than `foldable()`.** → Measured in task 1; the fallback
  is stated in D1.
- **A fourth tenant in a 14px gutter.** The affordance budget entry already says the gutter is
  full. → We add no new column: at most one fold affordance per line, in the column the chevron is
  already transformed onto, and the marker takes the folded state rather than a new element.
- **The guide gesture competes with caret placement.** A tolerance too wide steals ordinary
  clicks near an indent. → The spec fixes the failure direction (a click on text is always a
  click on text), and the tolerance is verified by an e2e that clicks just inside and just
  outside it.
- **Re-derived fold state can be wrong where the operation re-encodes a node.** An outdent that
  changes a list item into a paragraph produces a node whose identity is the path, not the text.
  → Fold state is keyed by path from the operation's own result, which is the same source the
  caret placement uses; if the result reports no path for an operand, its fold is dropped rather
  than guessed.
- **The block-identity match can pick the wrong twin.** Two identical subtrees in one document
  are indistinguishable to the rule, and only proximity separates them. → Ties go to the candidate
  nearest the block's mapped position, and the failure is a fold landing on an identical sibling,
  not on unrelated content.
- **The fallback scan is linear in the document.** A fold whose run cannot be found at the mapped
  position costs a scan of the note. → It runs only when the fast path misses, only for documents
  that have folds at all, and the miss case ends in an unfold rather than a search that repeats.

## Open Questions

- **Whether the reveal should be a notice.** An edit inside a folded subtree opens it, which is
  visible on its own; whether a sync landing one off-screen also deserves a cue is unanswered and
  costs nothing to defer.
- **Where the count sits when a node's text wraps.** After the text means after its LAST visual
  row, which is not where a reader looks. Anchoring it to the first row instead is a rendering
  decision the mockup does not settle, and either answer satisfies the spec.
- ~~**The guide tolerance on touch.**~~ Answered by the mobile run: no. Every guide-gesture case
  passes under mobile emulation at the desktop tolerance, and one number serves both.
- **Whether `fold one level more/less` should track a remembered depth** rather than recomputing
  the deepest unfolded level each time. Only observable when the two disagree — after an edit that
  changes depth between invocations — and either answer satisfies the spec's scenarios.
