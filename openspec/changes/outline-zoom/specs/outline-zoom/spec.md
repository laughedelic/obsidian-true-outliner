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

For an empty selection the caret SHALL NOT move as a result of zooming, in either direction.

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

#### Scenario: The note title and properties are hidden while zoomed
- **WHEN** a note with frontmatter is zoomed into a node
- **THEN** neither the inline title nor the properties block is rendered, and both return when the
  zoom is cleared

### Requirement: The ancestor path renders as a navigable breadcrumb trail
While zoomed, a breadcrumb trail SHALL be shown directly above the zoomed content, listing — in
order — the file, then each ancestor of the zoom root from the outermost inward. The zoom root
itself SHALL NOT appear in the trail, because it is the first visible line of the content.

The trail SHALL be rendered with the SAME visual treatment this plugin gives a squashed ancestor
chain anywhere else — the lineage row the backlinks footer already defines, with its marker
gutter, per-segment icons and ordinals, and its separator — and SHALL honour the same appearance
settings. It SHALL NOT introduce a presentation of its own for the same idea.

Each crumb SHALL be activatable: activating an ancestor crumb SHALL make that ancestor the zoom
root; activating the file crumb SHALL clear the zoom entirely.

A segment's label SHALL be its node's first line with its encoding chrome removed — the heading's
`#` markers, or the list item's marker — so the label reads as the node's text. A node whose
label would be empty SHALL fall back to a label naming its kind, so no segment is ever blank.

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

#### Scenario: A top-level zoom root has a file-only trail
- **WHEN** the user zooms into a top-level node
- **THEN** the trail contains the file alone

#### Scenario: An empty node still gets a readable crumb
- **WHEN** an ancestor's own line carries no text beyond its marker
- **THEN** its crumb shows a label naming that node's kind rather than rendering blank

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

#### Scenario: Zoom commands do nothing outside outline mode
- **WHEN** the file is not in outline mode and the user invokes zoom in
- **THEN** nothing is hidden, no trail appears, and the editor behaves as stock Obsidian

#### Scenario: A nested editor is unaffected
- **WHEN** the caret is inside a nested per-cell editor and a zoom gesture is invoked
- **THEN** the nested editor is unchanged and shows no trail
