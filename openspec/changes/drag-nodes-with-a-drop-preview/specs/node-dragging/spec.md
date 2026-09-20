## Purpose

Defines the pointer gesture that moves a node, or a whole block selection, to another place in the
outline: what a press on a node's mark means, what the press picks up, which destinations a
pointer position can name, what the preview promises before the release, and what the release
writes. The gesture is a way of INVOKING a structural operation, never a second set of rules about
what the document may become.

## ADDED Requirements

### Requirement: A press on a node's mark that moves picks that node up

A primary-button press on the mark that stands for a node — this plugin's marker icon, the bullet
or number a list item shows in its place, or a task's checkbox — SHALL begin a drag once the
pointer has moved past a stated threshold while the button is held. Below that threshold the press
SHALL remain what it is today: the zoom gesture `outline-zoom` states, resolved when the button is
released.

The press SHALL be claimed at the moment it arrives, before its meaning is known, so that nothing
else acts on it while it is undecided: it SHALL NOT place the caret, begin a text selection, or
fold the node. A press that ends without passing the threshold SHALL deliver the gesture it would
have delivered before this capability existed, unchanged.

A TASK's checkbox is the one mark where the claim is NARROWER, and deliberately so. Its toggle
survives a drag only because a gesture that leaves the box produces no activation on it, so
nothing has to be suppressed there and nothing SHALL be: the press is watched for movement rather
than swallowed, and a press that never passes the threshold reaches the checkbox and toggles it,
as it does today. Claiming that press and replaying the toggle as a document write is explicitly
NOT the mechanism — the toggle is Obsidian's, with its own states and its own plugins, and this
capability does not reimplement it.

A MODIFIED press SHALL be left alone, as every other gesture on a mark already leaves it.

A task's checkbox SHALL be a drag source like any other mark. Its own click SHALL keep toggling
the task, which a drag never produces — so this gesture reaches every node kind, including the one
kind whose mark cannot carry the zoom.

The gesture SHALL be expressed over POINTER input, so that mouse, pen and touch reach it by one
path. On touch, a press SHALL become a drag only after a stated dwell, since without one a drag
and a scroll are the same gesture.

#### Scenario: A press that moves picks up the node
- **WHEN** the user presses a list item's bullet and moves the pointer past the threshold
- **THEN** that item's subtree is in flight, no text selection was drawn, and the caret has not
  moved

#### Scenario: A touch that rests on a mark becomes a drag
- **WHEN** a touch presses a bullet and rests there, unmoved, past the dwell
- **THEN** that item's subtree is in flight, and lifting the touch over a destination drops it
  there

#### Scenario: A touch that moves before the dwell is a scroll
- **WHEN** a touch presses a bullet and moves past the threshold before the dwell is up
- **THEN** nothing is picked up, the movement is left to the platform's own scroll, and the release
  neither drops nor zooms

#### Scenario: A press that does not move still zooms
- **WHEN** the user presses a heading's marker and releases without moving
- **THEN** the view zooms to that heading, exactly as it did before this capability existed

#### Scenario: A press that wanders and comes back is a drag
- **WHEN** the user presses a mark, moves past the threshold, returns the pointer over the same
  mark, and releases there
- **THEN** the gesture is a drag resolved at that position, and no zoom happens

#### Scenario: A task is dragged by its checkbox without toggling
- **WHEN** the user presses a task's checkbox, drags the item elsewhere and releases
- **THEN** the item moves and its checked state is unchanged

#### Scenario: A task's own click still toggles it
- **WHEN** the user presses a task's checkbox and releases without moving
- **THEN** the task's checked state toggles and nothing moves

#### Scenario: A modified press is not this gesture
- **WHEN** the user presses a mark with the platform's primary modifier held and moves
- **THEN** no drag begins

### Requirement: A mark says it can be dragged before it is pressed

A mark that is a drag source SHALL state so under the pointer, through the cursor, before any
press is made. Nothing else on the row distinguishes a draggable mark from an ornament, and a
gesture whose only discovery route is trying it is not discoverable — the same reason the guide
press states itself under the pointer.

#### Scenario: The cursor states the affordance
- **WHEN** the pointer rests on a node's mark in outline mode
- **THEN** the cursor says the mark is draggable, and moving off restores it

#### Scenario: A mark that is not a drag source says nothing
- **WHEN** the pointer rests on a mark the trail or the footer drew, or on any mark outside
  outline mode
- **THEN** the cursor is unchanged

### Requirement: What is dragged is the selection's covered subtrees

The operand of a drag SHALL be resolved by the rule `selection-structural-ops` already states for
every structural operation, with the one refinement a press makes possible — a press names a
node, where a keyboard command names only the selection:

- When the pressed node is one of the current selection's covered ROOTS, the operand is that whole
  cover — its covered roots, as one contiguous sibling run per parent, in document order.
- Otherwise the operand is the pressed node's own subtree, and the selection SHALL become that
  node's cover, so that what is in flight is always what is drawn as selected. A press on a node
  INSIDE a covered root's subtree is this case, not the first: a reader with a section selected who
  reaches into it for one item pointed at that item, and dragging the section instead acts on what
  they did not point at.

The rule SHALL be stated over the selection alone and SHALL NOT consult how the selection was
produced. A cover reached by dragging, by Shift+Arrow, by Mod+A or by undo drags identically.

#### Scenario: Pressing inside a multi-node cover drags the whole cover
- **WHEN** three sibling items are selected as a cover and the user drags the middle one's bullet
- **THEN** all three subtrees are in flight and land together, in their original order

#### Scenario: Pressing inside a selected section drags the pressed node
- **WHEN** a heading section is selected as a cover and the user drags the bullet of a list item
  inside it
- **THEN** only that item's subtree is in flight, and the selection is now that item's own cover

#### Scenario: Pressing outside the cover drags only that node
- **WHEN** a cover is selected elsewhere in the note and the user drags an unrelated item's bullet
- **THEN** only that item's subtree is in flight, and the selection is now that item's own cover

#### Scenario: A bare caret does not widen the operand
- **WHEN** the caret sits inside a paragraph and the user drags a DIFFERENT node's mark
- **THEN** the dragged node's subtree is the operand, and the caret's own node is untouched

### Requirement: A destination is a seam and a depth, and only legal ones are offered

While a drag is in flight, the pointer SHALL name at most one destination, resolved from both of
its axes:

- The VERTICAL position picks a seam — a boundary between two NODES.
- The HORIZONTAL position picks a depth from the seam's legal interval.

A seam SHALL be a boundary between nodes and SHALL NOT be taken from rendered rows. A table, a
code fence and a paragraph broken over several lines each render several rows, and a trailing gap
line renders a row of its own; boundaries taken from rows would invent seams inside a single node
and on both sides of every blank line, at depths that are not node depths.

A seam's legal depths SHALL be the closed interval running from the depth of the node BELOW it to
one level inside the deepest trailing descendant of the node ABOVE it THAT CAN HOLD CHILDREN.
Shallower than the node below is excluded because it would make that node a descendant of what was
dropped, which is a different operation; deeper is excluded because no parent exists at that
depth — including where the trailing descendant is a leaf, which offers no level inside it at all.
Within that interval, a depth at which a NON-HEADING run would follow a heading as its sibling
SHALL NOT be offered either: a paragraph or a list written after a heading is inside its section
whatever the tree says, so the drop would write the same document as the heading's own column and
the preview would have stated a place the release cannot reach. A heading run keeps every depth of
the interval, re-levelled by the destination.

Seams SHALL be read with the run TAKEN OUT of the document: the boundaries above and below the run
are one seam, at the run's top, and its depths are those the nodes flanking the run bound once the
run is gone. The run's own place — its parent and its index among the siblings it has — SHALL be
offered at that seam, as the way out of a drag the reader thinks better of: a drop there writes
nothing and leaves no undo entry. The run's own bottom SHALL be a seam that offers nothing, so a
pointer resting there names no destination rather than the seam past it; a release there cancels.

A heading run SHALL additionally be offered, at every seam, each level SHALLOWER than the seam's
shallow bound, down to the top level — or, under an active zoom, the zoom root's own child depth —
written at the position the seam names and at the level the column names. A heading closes the
section it lands in: `## Plan` dropped between `## Materials` and its first child at the `##`
column stands beside Materials, which is left childless, and `## Plan` dropped at its own seam on
the `#` column is an outdent in place. The release SHALL write the level the column named rather
than the one the destination's parent would imply, so the preview's mark and the written heading
agree.

The document's own two ends SHALL be seams, since moving a run to the top or the bottom is among
the commonest things this gesture is for. Where there is no node below the seam, the shallow bound
SHALL be the top level — or, under an active zoom, the zoom root's own child depth. The preamble
SHALL NOT be a destination or a seam boundary: `node-selection-enforcement` places it outside
jurisdiction, and the first seam is the one before the first NODE.

The horizontal rule SHALL be a PARTITION of the axis across the seam's legal columns, clamped at
BOTH ends: every horizontal position SHALL resolve to exactly one candidate — the nearest column —
with positions left of the shallowest resolving to it and positions right of the deepest resolving
to that. There SHALL be no position over the seam that resolves to no candidate, since a release
where nothing is resolved cancels, and a drag thrown away by landing between two columns is a
gesture that punishes precision it never asked for.

The interval SHALL be further narrowed, and the narrowings SHALL come from rules already stated
elsewhere rather than from conditions restated here:

- Depths inside FOLDED content SHALL NOT be offered, the deep bound being the deepest VISIBLE
  trailing descendant. A drop whose destination lies inside a folded node SHALL open that fold, as
  `outline-folding` already requires of any change to hidden content. Where that destination is
  one level inside a folded node, the run SHALL land as its LAST child — the position the seam
  itself names, since the seam sits after everything the fold hides. Every other seam's index is
  fixed by the nodes that flank it; this one SHALL be stated rather than left to follow.
- A depth at which the resulting operation would be REJECTED SHALL NOT be offered. The candidate
  set SHALL be filtered by the operation's own acceptance rather than by a copy of its conditions,
  so a destination the preview shows is always one the release can deliver.
- No seam or depth inside the operand's own subtrees SHALL be offered: a run cannot land inside
  itself.
- While a zoom is active, only seams within the zoom scope SHALL exist, so a drag cannot name a
  destination the scope would reject.

Where the pointer names no legal destination, the drag SHALL continue with no destination and no
preview, and a release there SHALL cancel.

#### Scenario: One seam offers several depths
- **WHEN** the pointer rests on the seam below a deeply nested last child and moves horizontally
  across the columns
- **THEN** the destination changes from a child of the row above, through each of its ancestors'
  sibling positions, to a sibling of the row below — one destination per legal column

#### Scenario: A depth shallower than the following row is not offered
- **WHEN** the row below the seam is nested two levels in and the pointer moves left of the
  outermost legal column
- **THEN** the destination stays at the shallowest legal depth rather than making the following
  row a descendant of the dragged run

#### Scenario: The last seam takes a run to the top level
- **WHEN** a run is dragged past the last node in the document
- **THEN** the seam after it offers the top level as its shallowest destination, and a drop there
  puts the run last in the document

#### Scenario: The preamble is not a destination
- **WHEN** a note begins with frontmatter and a run is dragged above the first node
- **THEN** the shallowest destination offered sits after the preamble, and no destination places
  the run inside or above it

#### Scenario: A multi-line node offers no seam inside itself
- **WHEN** the pointer moves down the rows of a table, a fenced code block or a paragraph broken
  over several lines
- **THEN** the seams offered are those before and after that node, and none between its own rows

#### Scenario: A leaf offers no level inside it
- **WHEN** the node above a seam is a code fence or a table, which cannot hold children
- **THEN** no destination inside it is offered, and the deepest destination on that seam is one
  level inside the nearest trailing ancestor that can hold children

#### Scenario: Every horizontal position resolves to a column
- **WHEN** the pointer moves continuously along a seam from far left of its shallowest column to
  far right of its deepest
- **THEN** the destination changes from column to column with no position in between resolving to
  none, and positions past either end hold at that end's column

#### Scenario: A drop into a folded node lands last
- **WHEN** a run is dropped one level inside a folded node that hides three children
- **THEN** the run lands after those three children and the fold opens

#### Scenario: A folded subtree offers no depths
- **WHEN** the row above the seam is folded and hides three levels of descendants
- **THEN** the deepest destination offered is one level inside the folded node itself, and none of
  its hidden levels is offered

#### Scenario: A drop into a folded node opens it
- **WHEN** a run is dropped as a child of a folded node
- **THEN** the run lands there and the fold opens, so nothing arrives invisible

#### Scenario: An inexpressible destination is not offered
- **WHEN** a run whose own roots include an atom is dragged over a seam whose only depths lie
  inside a paragraph's children, which cannot hold one
- **THEN** no destination is offered at that seam, and a release there cancels rather than
  failing

#### Scenario: Legality can differ between columns of one seam
- **WHEN** a heading-rooted run is dragged along a seam inside a deep heading scope, where the
  shallower columns leave room for the run's own heading levels and the deeper ones do not
- **THEN** the shallower columns are offered and the deeper ones are not, so the destination stops
  at the deepest column the run actually fits — a seam's legality is resolved per column, never
  per seam

#### Scenario: A run cannot land inside itself
- **WHEN** the pointer moves over the rows of the dragged run's own subtree
- **THEN** no destination is offered on any of its seams

#### Scenario: A paragraph is not offered the columns of the headings above it
- **WHEN** a paragraph inside an `###` section nested under `##` and `#` headings is dragged to
  the note's end
- **THEN** the seam offers the `###` section's own depth and one level inside the last paragraph,
  and neither the `#`'s nor the `##`'s column — where the same drop would have written the same
  document
- **AND** the `###` heading itself dragged there is offered all three, re-levelled to each — the
  `###` column being its own place, since that seam is the run's own top

#### Scenario: The run's own place is offered at its top, and nothing at its bottom
- **WHEN** a list item is dragged and the pointer rests on the seam at its own top, on the column it
  already sits at
- **THEN** that place is offered, and a release there writes nothing and leaves no undo entry
- **WHEN** the pointer rests instead on the seam at the run's own bottom
- **THEN** no destination is offered there, and a release cancels

#### Scenario: A heading lands beside the heading above it
- **WHEN** a `##` section is dragged to the seam between another `##` heading and that heading's
  first child, and the pointer rests on the `##` column
- **THEN** the run is offered at that column as a `##` heading, and a drop writes it after the
  other heading's own lines, taking that heading's former children as its own

#### Scenario: A heading outdents in place
- **WHEN** a `##` section in the middle of a note is dragged to its own seam and the pointer rests
  on the `#` column
- **THEN** the run is offered there as a `#` heading, and a drop rewrites its level without moving
  it

#### Scenario: A zoom bounds the destinations
- **WHEN** the view is zoomed into a node and a descendant is dragged
- **THEN** every destination offered lies inside the zoom scope, and none would move the run out
  of it

### Requirement: The preview states where the run will land and what it will become

While a destination is resolved, the view SHALL show it, and what it shows SHALL be derived from
the SAME resolution the release applies. The preview and the result SHALL NOT be computed
separately: a preview that can disagree with its own release is worse than none.

The preview SHALL state three things:

- **Where in the document**: an indicator at the seam, between the two rows the run will land
  between. Where the row above the seam is a heading, or the row below it is an atom, the
  indicator SHALL NOT sit at the top of the row below: a heading leaves clearance under itself that
  a line pressed against the next row wastes, and a code block's background paints over a line
  drawn on its own edge. It SHALL sit in the middle of the gap line between the two rows, or at the
  bottom of the row above where no gap line separates them.
- **At what depth**: the indicator's left end SHALL sit on the column the run's first root's mark
  will occupy — the destination depth's own column, not the row's own indentation and not the
  column the run currently sits at.
- **What the run becomes**: the mark the first root will have AFTER re-encoding for the
  destination SHALL be drawn at that column. A run that changes kind on arrival — a heading
  section landing in a list — SHALL show the kind it will have, never the kind it has in flight.
- **What the drop will take with it**: where the destination would ABSORB content that is not part
  of the run — a dropped heading opening a section over the anchor's following siblings — the
  absorbed rows SHALL be drawn one level in, under the ghost mark, with the guide that will connect
  them — starting below the mark and ending at the last absorbed row with content — and nothing
  else: the result shown as the result. Those rows change parent without moving,
  so nothing at the seam would otherwise say they were involved, and a preview that states only the
  landing place states half the result. No tint marks them; on a long section a tint is half a
  page of colour, and the move already says it.

The destination's PARENT SHALL additionally be distinguished, so the parent is named rather than
counted out of columns.

The rows in flight SHALL be drawn as lifted for the duration of the drag, and the document SHALL
NOT move until the release: nothing the drag shows is a document change. The absorbed rows' shift
is the one thing the preview moves, sideways and only those rows; their text, order and lines are
untouched.

The preview SHALL be derived state only. It SHALL NOT dispatch a document change, alter the
selection, or persist anything.

#### Scenario: The indicator's left end names the depth
- **WHEN** the pointer moves horizontally across a seam's legal columns
- **THEN** the indicator's left end moves with it, sitting on each destination's own column in
  turn

#### Scenario: The indicator sits under a heading
- **WHEN** a paragraph is held over the seam between a heading and the heading's first child, with
  a blank line between them
- **THEN** the indicator is drawn across the middle of that blank line, neither against the
  heading's text nor against the child's

#### Scenario: The indicator is not covered by a code block
- **WHEN** a run is held over the seam above a code block
- **THEN** the indicator is drawn in the gap above the block, or at the bottom of the row above
  where there is none — where the block's background does not paint

#### Scenario: The ghost mark is the kind the run will have
- **WHEN** a heading section is dragged to a destination inside a list
- **THEN** the mark drawn at the destination column is the one the run will have after
  re-encoding, not a heading's

#### Scenario: The destination parent is distinguished
- **WHEN** a destination is resolved several levels inside a subtree
- **THEN** the parent the run will attach to is accented, alongside the indicator

#### Scenario: An absorbing drop says what it will absorb
- **WHEN** a heading-rooted run is held over a destination whose following siblings the dropped
  heading's section would take in
- **THEN** those rows are drawn one level in under the ghost mark, as well as the landing place,
  and the shift ends where the absorption ends — the next heading that can stand beside the
  dropped one keeps its place

#### Scenario: A drop that absorbs nothing marks nothing extra
- **WHEN** a run that opens no section is held over any destination
- **THEN** only the landing place is drawn, with no absorbed region marked

#### Scenario: The document does not move before the release
- **WHEN** a drag is in flight over any destination
- **THEN** the buffer is byte-identical to what it was when the drag began, and the rows in
  flight are still in their original places, drawn as lifted

#### Scenario: No destination, no preview
- **WHEN** the pointer moves somewhere that names no legal destination
- **THEN** no indicator is drawn, and the rows in flight stay lifted

### Requirement: A drop is one structural operation

Releasing over a resolved destination SHALL move the operand's subtrees there as ONE structural
operation: one document change, one undo step, with the caret and the fold state carried, exactly
as `editor-structural-commands` requires of every operation it dispatches. A drop SHALL NOT be
observable downstream as a deletion followed by a paste.

The moved run SHALL be re-encoded for its destination under the rule `structural-operations`
already states for an insertion, preserving its own internal relative nesting exactly whatever
depth or regime it came from.

The selection after a drop SHALL be the cover of the nodes that moved, so the run that was in
flight is the run that is selected when it lands — the same rule `selection-structural-ops` states
for an operation on a cover.

#### Scenario: A drop is a single undo step
- **WHEN** a run is dragged to a new destination and undo is invoked once
- **THEN** the buffer is byte-identical to what it was before the drag

#### Scenario: A dropped run keeps its internal nesting
- **WHEN** a subtree three levels deep is dropped at a shallower destination
- **THEN** every descendant keeps its depth relative to the run's root, and the root sits at the
  destination's depth

#### Scenario: Fold state travels with the run
- **WHEN** a run containing a folded node is dropped elsewhere
- **THEN** that node is still folded where it lands

#### Scenario: The moved run is what is selected afterwards
- **WHEN** a three-root cover is dropped at a new destination
- **THEN** the selection is the cover of those three roots in their new place

### Requirement: A cancelled drag leaves nothing behind

A drag SHALL be cancelled by Escape, by a release where no destination is resolved, by the
pointer's capture being lost, or by the document changing underneath it. A cancelled drag SHALL
leave the document byte-identical, add no undo entry, leave the selection as it was when the drag
began, and clear every trace of the preview and the lifted treatment.

A drag SHALL NOT outlive the view it began in.

#### Scenario: Escape cancels
- **WHEN** Escape is pressed mid-drag
- **THEN** the drag ends, the document is unchanged, and no preview remains

#### Scenario: A release with no destination cancels
- **WHEN** the pointer is released somewhere that names no legal destination
- **THEN** nothing moves and nothing is added to the undo history

#### Scenario: A drop onto the place it came from writes nothing
- **WHEN** a run is dropped at the destination it already occupies
- **THEN** the document is byte-identical and no undo entry is added

#### Scenario: A document change under the drag ends it
- **WHEN** the file is rewritten externally while a drag is in flight
- **THEN** the drag ends with nothing written, rather than applying a destination resolved against
  a document that has moved

### Requirement: The gesture is scoped like every other gesture here

The drag SHALL be offered only where outline mode is on, and SHALL decline inside nested per-cell
editors, matching `outline-zoom` and `outline-folding` rather than stating its own scope. Marks
drawn by chrome that answers its own clicks — the zoom trail's, the backlinks footer's — SHALL NOT
be drag sources.

#### Scenario: Off-mode notes offer no drag
- **WHEN** a note without outline mode is open and a list bullet is pressed and moved
- **THEN** stock behaviour applies and nothing is picked up

#### Scenario: Chrome marks are not drag sources
- **WHEN** a mark in the zoom trail or in a backlinks footer row is pressed and moved
- **THEN** no drag begins and that chrome's own gesture is unaffected

### Requirement: A held drag scrolls the view at its edges

While a drag is held within a stated band of the scrollable area's top or bottom edge, the view
SHALL scroll, at a rate that grows with how far past the edge the pointer is, so a destination off
screen is reachable without releasing. Scrolling during a drag SHALL change nothing but the
scroll position.

#### Scenario: Dragging to the edge scrolls
- **WHEN** a run is dragged to within the band at the bottom of the view and held there
- **THEN** the view scrolls, and destinations below come into reach

#### Scenario: Further past the edge scrolls faster
- **WHEN** a run is held barely inside the band, and then held nearly on the edge
- **THEN** the view scrolls both times, and further over the second hold than the first

#### Scenario: Autoscroll writes nothing
- **WHEN** a drag has autoscrolled and is then cancelled
- **THEN** the document is byte-identical to what it was before the drag

### Requirement: The gesture is verified against real pointer input

Coverage for this capability SHALL drive a REAL pointer — a genuine down/move/up sequence at
coordinates, hit-tested by the browser — rather than events synthesised onto an element, because
what the hit-testing does is half of what this gesture is. Where a platform cannot be driven that
way, the gap SHALL be recorded with the pass that covers it instead, and SHALL NOT be reported as
coverage.

State asserted DURING a drag SHALL be recorded rather than read by stopping: a held button does
not survive the end of the driving call, so a gesture broken into calls to take a reading is no
longer a held gesture at all. The suite SHALL sample what it needs from inside the page as the
gesture runs, drive the whole gesture uninterrupted, and assert against the recording.

#### Scenario: The drag is driven as a real pointer gesture
- **WHEN** the desktop suite exercises a drop
- **THEN** it is driven by a real pointer press, movement and release at coordinates, and the
  assertions read the resulting buffer

#### Scenario: Mid-drag state is recorded, not read mid-drag
- **WHEN** the suite asserts what the preview showed at each of several destinations in one drag
- **THEN** the whole drag runs uninterrupted and the assertions read a recording taken from inside
  the page, rather than pausing the gesture to look

#### Scenario: An undrivable platform is recorded, not claimed
- **WHEN** a platform's harness cannot aim a press at a mark
- **THEN** that platform's coverage states what it could not drive, and the gesture's behaviour
  there is carried as a manual pass
