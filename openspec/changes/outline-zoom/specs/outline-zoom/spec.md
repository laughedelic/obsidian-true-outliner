## Purpose

Defines zoom (hoisting): any node can become the temporary root of the view, hiding everything
outside its subtree behind a navigable breadcrumb path. Zoom is a SCOPE over the document, not a
mutation of it — the file never changes, and the scope is what every other layer's "the document"
becomes while it is active: selection, caret motion, the select-all ladder, selection extension,
and the operands of structural operations are all confined to it.

## ADDED Requirements

### Requirement: Zoom in makes the node at the caret the temporary root of the view
In outline mode, a zoom-in gesture SHALL resolve its target as follows, and the target SHALL NOT
depend on the direction the selection was drawn in.

For an EMPTY selection, the target is the node at the caret, by the same line-to-node resolution
structural commands already use — so a caret on a node's trailing gap resolves to that node.

For a NON-EMPTY selection, the target is the FIRST covered root in document order, resolved
through the same operand geometry `selection-structural-ops` defines. Neither the anchor nor the
head: both are properties of how the selection was drawn rather than of what it covers, so either
would zoom somewhere different for the same two nodes selected upward versus downward — the
defect that capability exists to remove.

Zoom SHALL be available on every node kind: heading, paragraph, list item, and every atom kind.
A node with no children SHALL be a valid zoom root; availability SHALL NOT depend on whether the
target has children, since that is not visible to the user before the gesture.

Zooming SHALL NOT modify the document. The file's bytes SHALL be identical before and after a
zoom in, a zoom out, and any sequence of the two.

Where the caret ends up is stated once for every gesture, below.

A NON-EMPTY selection SHALL collapse to the new zoom root's own start — the one position
guaranteed to lie inside the new scope however the selection was drawn, and for the same reason
the target is not read from either end.

Collapsing rather than clamping, because the alternative leaves ends the user did not place: a
range spanning siblings has ends outside the new scope, and pulling them inward produces a
selection the user never made while a zoom gesture was the only thing they asked for. Collapsing
also means no zoom transition can produce a selection that violates the confinement guarantee
below.

Where the caret resolves to no node — inside the document preamble, or in an empty document — the
gesture SHALL do nothing and leave the view unzoomed.

#### Scenario: Zooming into a list item makes it the root
- **WHEN** the caret is inside a nested list item and the user zooms in
- **THEN** that item and its descendants are the only content visible, and the caret stays where
  it was

#### Scenario: Zooming works on a heading section
- **WHEN** the caret is inside a heading whose section contains paragraphs, a nested list and a
  code block, and the user zooms in
- **THEN** the heading and its whole section are visible and nothing else is

#### Scenario: A childless node is a valid root
- **WHEN** the caret is in a paragraph with no children and the user zooms in
- **THEN** the view zooms to that paragraph alone rather than refusing the gesture

#### Scenario: Zooming never touches the file
- **WHEN** the user zooms in, zooms out, and the file is compared to its pre-zoom contents
- **THEN** the bytes are identical

#### Scenario: A selection spanning siblings collapses on zoom in
- **WHEN** the selection covers two sibling subtrees and the user zooms in
- **THEN** the view zooms to the first of them in document order, and the selection collapses to
  that node's own start — no selection end is left in hidden content

#### Scenario: Zoom target does not depend on selection direction
- **WHEN** the same two nodes are selected upward and downward and the user zooms in
- **THEN** both zoom to the same node

#### Scenario: A caret in the preamble does not zoom
- **WHEN** the caret sits inside YAML frontmatter and the user zooms in
- **THEN** nothing happens and the whole document stays visible

### Requirement: Everything outside the zoom root's subtree stops rendering
While zoomed, the VISIBLE RANGE SHALL be the zoom root's whole subtree cover — the root's own
lines, all its descendants, and the root's own trailing gap in full — using the same
subtree-cover geometry selection enforcement already defines. Every line outside that range
SHALL be removed from the rendered view entirely, not merely made invisible: hidden lines SHALL
occupy no vertical space and SHALL NOT receive the caret.

Hidden content SHALL remain in the document unchanged. Zoom SHALL NOT depend on any Obsidian
folding setting being enabled.

Chrome this plugin renders at the document's end SHALL NOT be hidden by the range that hides the
content around the scope. The backlinks footer in particular SHALL keep rendering after the zoomed
content; `backlinks-footer` states what it shows while zoomed.

The note's own title and its properties block SHALL also be hidden while zoomed, so the zoomed
view is the trail, the subtree, and the footer and nothing else. These are not document lines —
they are rendered beside the content rather than in it — so hiding them is stated here as a
requirement on the VIEW rather than as a consequence of the hidden line ranges. Clearing the zoom
SHALL restore both.

Nothing SHALL render below the footer. Chrome mounted after the content SHALL NOT split the line
it is anchored to, since the empty remainder of a split line is a real line that takes the caret
and occupies the space a reader clicks into.

The visible range's own FIRST AND LAST lines SHALL render in full. The zoom root SHALL keep every
piece of its own rendering — this plugin's marker, depth and guides, and Obsidian's own line
classes and native list rendering with them — and the cover's trailing gap SHALL still be a line
of the visible range. Stated because both are lines the hiding mechanism reaches past: they
neighbour a replacement, and a replacement that reaches one position too far takes the
decorations anchored there, or the line itself, with it.

#### Scenario: Content above and below is gone from the layout
- **WHEN** the user zooms into a node in the middle of a long note
- **THEN** no line above or below the node's subtree is rendered, and the zoomed content sits at
  the top of the editor with no blank space standing in for the hidden lines

#### Scenario: A top-level first node has nothing above it
- **WHEN** the user zooms into the document's first top-level node
- **THEN** only the range below it is hidden, and the view renders without a stray blank line at
  the top

#### Scenario: Frontmatter is hidden along with everything else outside the scope
- **WHEN** a note with YAML frontmatter is zoomed into a node
- **THEN** the frontmatter is not rendered

#### Scenario: The backlinks footer is not swallowed by the hidden range
- **WHEN** a note with references is zoomed into a node in the middle of it
- **THEN** the footer still renders below the zoomed content

#### Scenario: Nothing renders below the footer
- **WHEN** a note with references is zoomed into a node
- **THEN** no line is rendered after the footer

#### Scenario: A sibling widget atom on the far side of the range is hidden too
- **WHEN** the user zooms into a code block whose next sibling is a table
- **THEN** the table is not rendered

#### Scenario: The zoom root renders like any other line of its kind
- **WHEN** the user zooms into a list item
- **THEN** the root line carries its own list rendering — its native bullet at the same size it
  has unzoomed, and its own indentation and no more

#### Scenario: The cover's trailing gap stays in the visible range
- **WHEN** the user zooms into a node whose subtree ends on a blank line and which is followed by
  further content
- **THEN** that blank line is still rendered, as the last line of the visible range

#### Scenario: The note title and properties are hidden while zoomed
- **WHEN** a note with frontmatter is zoomed into a node
- **THEN** neither the inline title nor the properties block is rendered, and both return when the
  zoom is cleared

### Requirement: The ancestor path renders as a navigable breadcrumb trail
While zoomed, a breadcrumb trail SHALL be shown directly above the zoomed content, listing — in
order — the file, then each ancestor of the zoom root from the outermost inward. The zoom root
itself SHALL NOT appear in the trail, because it is the first visible line of the content.

The trail SHALL be rendered with the SAME visual treatment this plugin gives a squashed ancestor
chain anywhere else — the lineage row the backlinks footer already defines, with its per-segment
icons and ordinals — and SHALL NOT introduce a presentation of its own for the same idea. Two
deliberate departures are stated below: what stands in its marker gutter, and that its segments
are always separated.

The trail's own MARKER SHALL NOT name a node kind. It is a control: activating it SHALL clear the
zoom entirely, and it SHALL show that it is armed whenever the pointer is anywhere on the trail,
so the row advertises the way out rather than only the ancestors. A kind glyph there would be
naming the file as a paragraph, which is what it currently does and what it says wrongly.

The marker SHALL show that it is armed when the pointer is on the NOTE's own crumb — the segment
that means what the control does — and not on the rest of the row: a mid-chain ancestor under the
pointer promises zooming to THAT ancestor, and the mark answering there is a second, contradictory
signal for one gesture.

That marker SHALL sit on the SAME column a top-level node's marker sits on, whatever kind the zoom
root is. The trail is a header for the view, not a rendering of the root's line, so it SHALL NOT
take that line's own indentation, marker gutter or depth guides.

The trail's segments SHALL be separated from one another, whatever the footer's own separator
setting says. The two surfaces differ in what the separator is for: a footer lineage row sits in a
card whose structure already groups it, while the trail is a single horizontal path in which the
join between one ancestor and the next is the only thing distinguishing them.

Each segment SHALL be activatable: activating an ancestor segment SHALL make that ancestor the
zoom root; activating the file segment SHALL clear the zoom entirely, as the marker does.

A segment's label SHALL be its node's first line with its encoding chrome removed — the heading's
`#` markers, or the list item's marker — so the label reads as the node's text. A node with MORE
lines than the one shown SHALL be marked as shortened, so a label never claims to be the whole of
what it names. A node whose label would be empty SHALL fall back to a label naming its kind, so no
segment is ever blank; that fallback is a name rather than a quotation and takes no such mark.

The file SHALL be a segment of the trail rather than a heading above it, because the note's title
is hidden while zoomed and naming the note twice is what hiding it avoids. This also means the
trail is never empty: a top-level zoom root has no ancestors, and without the file segment that
case would show no trail at all — no indication of being zoomed, and nothing to activate to leave
it.

The trail SHALL be present only while zoomed, and SHALL disappear when the zoom is cleared.

#### Scenario: The trail names the ancestors, outermost first
- **WHEN** the user zooms into a list item nested under a second-level heading under a
  first-level heading
- **THEN** the trail reads: the file, then the first-level heading, then the second-level
  heading — and does not include the zoomed item itself

#### Scenario: Activating a crumb zooms to that ancestor
- **WHEN** the user activates the second crumb of a three-crumb trail
- **THEN** that ancestor becomes the zoom root and the trail shortens accordingly

#### Scenario: Activating the file crumb clears the zoom
- **WHEN** the user activates the file crumb
- **THEN** the whole document is visible again and the trail disappears

#### Scenario: The trail's marker clears the zoom too
- **WHEN** the user activates the marker at the head of the trail
- **THEN** the whole document is visible again, exactly as activating the file segment does

#### Scenario: The marker arms from the note's own crumb
- **WHEN** the pointer rests on the file segment of the trail
- **THEN** the marker shows itself as armed, and it does not when the pointer is on an ancestor
  segment instead

#### Scenario: A crumb whose node has more to say says so
- **WHEN** an ancestor's node has lines beyond the one its crumb shows
- **THEN** the crumb is marked as shortened rather than reading as the node's whole text

#### Scenario: The marker holds the top-level column under any root
- **WHEN** the user zooms into a heading, and again into a list item
- **THEN** the trail's marker is centred on the same column in both, the one a top-level node's
  marker occupies

#### Scenario: Segments are separated whatever the footer setting is
- **WHEN** the footer's own lineage separator is set to none
- **THEN** the trail still separates its segments

#### Scenario: A top-level zoom root has a file-only trail
- **WHEN** the user zooms into a top-level node
- **THEN** the trail contains the file alone

#### Scenario: An empty node still gets a readable crumb
- **WHEN** an ancestor's own line carries no text beyond its marker
- **THEN** its crumb shows a label naming that node's kind rather than rendering blank

### Requirement: Clicking a node's mark zooms into that node
A plain left click on the mark that stands for a node — this plugin's marker icon, or the bullet or
number a list item shows in its place — SHALL zoom into that node, the same as invoking zoom in
with the caret on it. An ordered item SHALL be reachable by its digits whether or not Obsidian
emits a marker element of its own for that line. The gesture SHALL work for every node kind, including one rendered
as an opaque widget, whose mark is injected rather than decorated.

The click SHALL NOT also do what a click there would otherwise do: it SHALL NOT place the caret,
begin a selection, or fold the node. The caret SHALL move to the new zoom root, since the node
clicked is usually not the node the caret was in.

A MODIFIED click SHALL be left alone. Obsidian's own follow-link and multi-caret gestures live
there, and this one never claims them.

Marks the trail and the footer draw are NOT node marks: they belong to chrome that answers its own
clicks, and SHALL keep doing so — the trail's mark zooms out, and a footer row navigates.

Only the mark is a target. The whitespace that follows a list marker SHALL stay a caret position,
and a guide SHALL do nothing — it has no hit area of its own, and giving it one is a separate
piece of work.

#### Scenario: Clicking a marker icon zooms to its node
- **WHEN** the user clicks the marker beside a heading
- **THEN** the view zooms to that heading, exactly as the command would

#### Scenario: A list item's bullet is its mark
- **WHEN** the user clicks a list item's bullet
- **THEN** the view zooms to that item, and the item is not folded

#### Scenario: An ordered item's number is its mark
- **WHEN** the user clicks the number of a nested ordered item
- **THEN** the view zooms to that item

#### Scenario: A widget-rendered node's mark works the same
- **WHEN** the user clicks the marker beside a table
- **THEN** the view zooms to the table

#### Scenario: A modified click is not this gesture
- **WHEN** the user clicks a marker with the platform's primary modifier held
- **THEN** no zoom happens

### Requirement: A zoom leaves the view at the top and the caret visible inside the scope
After any gesture that changes the zoom scope, the editor SHALL have focus, and the caret SHALL be
inside the visible range: where it already was when that position is still inside the scope, and on
the new zoom root otherwise. This holds for every entry point — the commands, a crumb, and a click
on a mark — so the caret and the current-node highlight never disagree about which node is active.

While zoomed, the view SHALL be scrolled to the TOP, so the trail and the zoom root are the first
things in it whatever the subtree's length. Clearing the zoom SHALL bring the node just left back
into view, rather than leaving the reader wherever the collapsed layout happened to put them.

No position outside the visible range SHALL be reachable by clicking: the space below the zoomed
content belongs to no line, and a click there SHALL leave the caret inside the scope.

#### Scenario: Zooming into a node far down a note opens at the top
- **WHEN** the user zooms into a node that was scrolled well down the note
- **THEN** the view is at the top, with the trail visible, and the editor is focused

#### Scenario: The caret keeps its place when the scope still contains it
- **WHEN** the user zooms in with the caret inside the node being zoomed to
- **THEN** the caret stays exactly where it was

#### Scenario: A caret the new scope does not contain moves to the root
- **WHEN** the user zooms by clicking the mark of a node the caret was not in
- **THEN** the caret moves to that node

#### Scenario: Clicking below the zoomed content does not put the caret outside it
- **WHEN** the user clicks in the empty space below the zoomed subtree
- **THEN** the caret is on a line of the visible range, not on a hidden one

### Requirement: Zoom out steps to the parent or clears the scope
Two zoom-out gestures SHALL exist while zoomed: one that makes the zoom root's PARENT the new
zoom root, and one that clears the zoom entirely.

Stepping out from a top-level zoom root — which has no parent — SHALL clear the zoom, so the
step-out gesture always has an effect while zoomed. Both gestures SHALL do nothing when there is
no zoom.

Every zoom gesture SHALL be available both as a command (so it can be bound to a hotkey and
invoked from the command palette) and, for the in and clear gestures, from the editor context
menu.

#### Scenario: Stepping out climbs one level
- **WHEN** the user is zoomed into a node three levels deep and steps out
- **THEN** its parent becomes the zoom root and the parent's siblings remain hidden

#### Scenario: Stepping out from the top level clears the zoom
- **WHEN** the user is zoomed into a top-level node and steps out
- **THEN** the whole document is visible again

#### Scenario: Zoom out with no zoom active does nothing
- **WHEN** no zoom is active and the user invokes either zoom-out gesture
- **THEN** the view is unchanged and no error or cue is shown

### Requirement: The zoom scope confines every selection, caret, and operand
While zoomed, no selection range, caret position, or structural operand SHALL fall outside the
visible range. This is the single confinement guarantee the other capabilities' zoom clauses
bound themselves by; it holds regardless of which gesture produced the position.

Enumerating behaviors — the progressive select-all ladder and Shift+Arrow selection extension —
SHALL take the scope as the bound of their enumeration, so their last reachable element is the
zoom root's own subtree and every element they produce is an exact node cover. Correcting
behaviors — selection escalation — SHALL clamp their result to the scope; because the scope is
itself a subtree cover, a clamped result SHALL still be an exact cover.

Caret motion whose computed target lies outside the scope SHALL leave the caret where it is.

#### Scenario: Select All tops out at the zoom root
- **WHEN** the user presses Mod-A repeatedly while zoomed
- **THEN** the ladder climbs to the zoom root's whole subtree and stops there — it never selects
  hidden content and never falls through to native Select All

#### Scenario: Selection extension stops at the scope
- **WHEN** the user extends the selection downward with Shift+Arrow until the last visible node
  is covered and presses again
- **THEN** the selection does not grow past the zoom root's subtree

#### Scenario: Motion stops at the boundary
- **WHEN** the caret is on the last visible line and the user presses the down arrow
- **THEN** the caret does not move into hidden content

#### Scenario: A clamped escalation is still a whole-node selection
- **WHEN** a selection gesture produces a range that escalation would expand past the zoom root's
  subtree
- **THEN** the resulting selection covers whole nodes exactly, bounded by the zoom root's subtree

### Requirement: An operation whose result would leave the zoom scope is rejected
While zoomed, a structural operation SHALL be rejected — with no document change — when its
result would place a node outside the zoom root's subtree. The judgement SHALL be made over the
operation's RESOLVED OPERAND — the covered roots of the current selection — rather than over a
single node, so a multi-root operand with one escaping root is refused as a whole rather than
applied to the roots that happen to be safe. It covers an operand containing the zoom root
itself and an outdent of any direct child of the zoom root. For the node-splitting keys the same
ground is judged by DESTINATION SCOPE rather than by node identity — a split landing in the zoom
root's child scope is inside the scope and is allowed — which `outline-keyboard-grammar` states
case by case.

The rejection SHALL use the same typed-rejection feedback path as every other structural
rejection, with a distinct reason of its own. Because the keyboard and the command palette
already resolve one operand and one after-state between them, the two SHALL agree on this
judgement by construction rather than by each implementing it.

Operations whose results stay inside the scope SHALL be unaffected: indenting, moving among
siblings, splitting, merging and deleting inside the subtree all behave exactly as they do
unzoomed.

#### Scenario: Outdenting a direct child of the zoom root is refused
- **WHEN** the selection covers a direct child of the zoom root and the user outdents
- **THEN** the document is unchanged and a rejection cue explains that the result would leave the
  zoomed view

#### Scenario: A multi-root operand with one escaping root is refused as a whole
- **WHEN** the selection covers several sibling subtrees that are direct children of the zoom root
  and the user outdents
- **THEN** none of them moves

#### Scenario: A split whose destination is the zoom root's sibling scope is refused
- **WHEN** the caret is at the end of a CHILDLESS zoom root's own line and the user presses Enter
- **THEN** no sibling is created, the document is unchanged, and the rejection cue is shown

#### Scenario: A split whose destination is inside the scope is allowed
- **WHEN** the caret is at the end of a zoom root that HAS children and the user presses Enter
- **THEN** a new position is created in the root's child scope, inside the visible range

#### Scenario: The same refusal comes from the command palette
- **WHEN** the outdent command is invoked from the palette with the caret in a direct child of the
  zoom root
- **THEN** it is rejected the same way, with the same cue

#### Scenario: Operations inside the subtree are untouched
- **WHEN** the user indents, moves, splits or deletes nodes strictly inside the zoom root's
  subtree
- **THEN** every operation behaves exactly as it does with no zoom active

### Requirement: Depth is measured from the zoom root while zoomed
While zoomed, the indentation contribution and the indentation guides of every visible line SHALL
be computed from the line's depth RELATIVE TO THE ZOOM ROOT: the zoom root renders at depth 0, its
children at depth 1, and so on. Guides for levels above the zoom root SHALL NOT be rendered.

One exception SHALL hold and SHALL be visible rather than hidden: a list item's own native
indentation is Obsidian's rendering, driven by raw markdown nesting, and is never modified by
this plugin. A zoom root that is a list item therefore keeps that native indentation, and only
this plugin's own contribution is re-based.

#### Scenario: A deep heading renders at the left margin
- **WHEN** the user zooms into a third-level heading nested under two ancestors
- **THEN** the heading renders with no indentation contribution from this plugin and its children
  render one level in

#### Scenario: Guides above the root are gone
- **WHEN** the user zooms into a node several levels deep
- **THEN** no guide column is drawn for the ancestor levels that are no longer visible

#### Scenario: Re-basing is reversed on zoom out
- **WHEN** the user zooms in and then clears the zoom
- **THEN** every line's indentation and guides are identical to what they were before the zoom

### Requirement: Zoom exits automatically when it can no longer be honest
The zoom SHALL clear itself, leaving the document fully visible, on any of exactly three
triggers:

1. The zoom root no longer resolves to a node — its lines were removed, or the document has no
   nodes left.
2. A change touches any position outside the visible range as that range stood before the change.
   This covers history transactions, which bypass enforcement entirely; writes from sync or
   another application; and edits dispatched from another pane onto the same file.
3. Outline mode is switched off for the file.

An automatic exit SHALL NOT modify the document and SHALL NOT move the caret.

Ordinary edits inside the scope — including editing the zoom root's own text — SHALL NOT exit the
zoom.

#### Scenario: Deleting the zoom root exits the zoom
- **WHEN** the user selects the zoom root's whole subtree and deletes it
- **THEN** the zoom clears and the rest of the document becomes visible

#### Scenario: Undo past the zoom's boundary exits the zoom
- **WHEN** the user zooms in and then undoes an edit made before zooming, which touches content
  outside the visible range
- **THEN** the zoom clears rather than leaving a scope that no longer matches the document

#### Scenario: Editing the root's own text keeps the zoom
- **WHEN** the user types into the zoom root's own line, including emptying it of text
- **THEN** the zoom stays exactly as it was

#### Scenario: Turning outline mode off clears the zoom
- **WHEN** the user disables outline mode for the file while zoomed
- **THEN** the whole document renders as stock Obsidian, with no zoom and no breadcrumb trail

### Requirement: Zoom is per editor view and is never persisted
A zoom SHALL belong to one editor view. Two views showing the same file SHALL be able to hold
different zoom scopes, or none, independently of each other.

Zoom state SHALL NOT be written to the note, to frontmatter, or to the plugin's data store. A
zoom SHALL NOT survive switching the file shown in a view, closing the view, or restarting
Obsidian; in each case the view opens unzoomed.

#### Scenario: Two panes zoom independently
- **WHEN** the same file is open in two panes and the user zooms one of them
- **THEN** the other pane still shows the whole document

#### Scenario: Reopening a note shows it unzoomed
- **WHEN** the user zooms into a node, switches to another file, and returns
- **THEN** the note is shown unzoomed

#### Scenario: Nothing is persisted
- **WHEN** the user zooms into a node and Obsidian is restarted
- **THEN** the note opens unzoomed, and neither the note nor the plugin's stored data mentions
  the zoom

### Requirement: Zoom is scoped to outline mode and declines inside nested editors
Every zoom gesture, the hiding, the breadcrumb trail, and the confinement rules SHALL apply only
to files in outline mode. Outside outline mode the editor SHALL be byte-identical to stock
Obsidian in behavior and rendering, with no zoom commands taking effect.

Zoom SHALL take no effect inside a nested per-cell editor, through the same nested-editor gate
the other editor extensions use.

Declining inside a nested editor SHALL NOT mean declining while one is OPEN. A command invoked
with the caret in a table cell SHALL act on the note the cell belongs to, and SHALL keep acting on
it afterwards: the note's own editor is the one every gesture is routed to, whichever editor
currently holds focus.

#### Scenario: Zoom commands do nothing outside outline mode
- **WHEN** the file is not in outline mode and the user invokes zoom in
- **THEN** nothing is hidden, no trail appears, and the editor behaves as stock Obsidian

#### Scenario: A nested editor is unaffected
- **WHEN** the caret is inside a nested per-cell editor and a zoom gesture is invoked
- **THEN** the nested editor is unchanged and shows no trail

#### Scenario: A table is a node like any other
- **WHEN** the user puts the caret in a table and invokes zoom in
- **THEN** the view zooms to the table, and every other node in that note still zooms afterwards
