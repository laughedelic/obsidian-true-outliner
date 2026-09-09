## MODIFIED Requirements

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
zoom entirely, and it SHALL show that it is armed when the pointer is on the marker itself or on
the file crumb it belongs to, so the row advertises the way out rather than only the ancestors. A
kind glyph there would name the file as a paragraph, which it is not.

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

A crumb's label SHALL be derived by the SAME rule a backlinks footer lineage segment's is — per
node kind, not by a weaker rule of the trail's own. No block syntax SHALL survive into a crumb:
not a heading's `#`, a quote's `>`, a task's `[ ]` or an ordered item's number, each of which the
marker already carries. The rule SHALL cover every kind, including those that cannot currently
BE an ancestor because an atom has no children — a second implementation that agrees only by
being unreachable is what this requirement exists to prevent. A node with MORE lines than the one shown SHALL be marked as shortened,
so a label never claims to be the whole of what it names. A node whose label would be empty
SHALL fall back to a label naming its kind, so no segment is ever blank; that fallback is a name
rather than a quotation and takes no such mark.

A crumb's label SHALL be rendered as inline content and SHALL NOT reach the reader as markdown
source. A crumb SHALL NOT contain block-level elements, and no embedded media SHALL render in
one.

The trail SHALL be drawn at the size of the note it heads, NOT at the size the backlinks
footer gives its own chains. A footer chain is context inside a card and reads smaller than the
mention it leads to; the trail is a header for the view, and its own requirement above puts it
level with the content beneath it. The two share one rendering primitive, so this is the one
place the shared treatment is deliberately not shared.

The trail SHALL take the backlinks footer's lineage treatment for that content in every other
respect, not one of its own: live and separately activatable links and tags, no colour accent, and the underline, cursor
and hover channels that treatment defines. The two surfaces draw the same primitive, and a crumb
that accented its links while a footer segment did not would reintroduce along a second axis
exactly the disagreement this requirement removes. The two differ in SIZE and not in colour: the trail sits level with the
note it heads while a footer chain is smaller than the mention it leads to, and both are drawn
in the same dimmed lineage colour. The treatment is defined relative to whatever the row's own
colour is, so it resolves correctly on either.

The file SHALL be a segment of the trail rather than a heading above it, because the note's title
is hidden while zoomed and naming the note twice is what hiding it avoids. This also means the
trail is never empty: a top-level zoom root has no ancestors, and without the file segment that
case would show no trail at all — no indication of being zoomed, and nothing to activate to leave
it. The file segment SHALL be plain text: a note's name is not markdown.

The trail SHALL be present only while zoomed, and SHALL disappear when the zoom is cleared.

#### Scenario: The trail names the ancestors, outermost first
- **WHEN** the user zooms into a list item nested under a second-level heading under a
  first-level heading
- **THEN** the trail reads: the file, then the first-level heading, then the second-level
  heading

#### Scenario: A crumb carries no block syntax
- **WHEN** the zoom root sits under a heading, a quote, a task and an ordered item
- **THEN** no crumb shows a `#`, a `>`, a `[ ]` or the ordered item's number, and each still
  shows what its node says

#### Scenario: A crumb renders its inline markdown
- **WHEN** an ancestor's text carries emphasis, a code span and a link
- **THEN** the crumb shows none of that syntax as source characters, and produces the same
  elements a footer lineage segment naming the same node produces

#### Scenario: A crumb's link is live and unaccented
- **WHEN** an ancestor's text carries a link
- **THEN** the link is separately activatable, drawn in the trail's own colour rather than the
  theme's link colour, and activating it — by click or by Enter — does not also re-root the view
  on that ancestor

#### Scenario: The trail reads at the note's own size
- **WHEN** the view is zoomed and the trail carries an ancestor crumb
- **THEN** the crumb's text is the size of the editor's own lines, not the smaller size the
  footer gives a lineage row

#### Scenario: A crumb's marker follows its node's state
- **WHEN** a task ancestor's checkbox is toggled while zoomed, its label unchanged
- **THEN** that crumb's marker updates to the new state rather than keeping the old one

#### Scenario: An image embed does not render in a crumb
- **WHEN** an ancestor's text carries an image embed
- **THEN** the crumb shows the embed's alt text and the trail stays one line of text tall

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
