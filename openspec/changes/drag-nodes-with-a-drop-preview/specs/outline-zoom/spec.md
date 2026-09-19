## MODIFIED Requirements

### Requirement: Clicking a node's mark zooms into that node
A plain left click on the mark that stands for a node — this plugin's marker icon, or the bullet or
number a list item shows in its place — SHALL zoom into that node, the same as invoking zoom in
with the caret on it. An ordered item SHALL be reachable by its digits whether or not Obsidian
emits a marker element of its own for that line. The gesture SHALL work for every node kind whose
mark is not already claimed by another click affordance, including one rendered as an opaque
widget, whose mark is injected rather than decorated.

The zoom SHALL resolve when the press is RELEASED, not when it arrives. A press on a mark can mean
this gesture or the drag `node-dragging` states, and which one it means is not known until the
pointer has either moved or not — so a press that moves past that capability's threshold is a drag
and SHALL NOT zoom, and a press released without passing it is this gesture. The press SHALL still
be claimed at the moment it arrives, so that nothing else acts on it while its meaning is
undecided; only the moment the zoom's effect is dispatched moves.

A TASK list item is the one exception: its mark is Obsidian's own checkbox, whose click already
toggles the task, and this gesture SHALL NOT contest that click. A task SHALL remain zoomable by
the command, the context menu, and a hotkey — the same three entry points every node has — so the
gap is a missing FOURTH way in for one kind, not a node this feature cannot reach at all. Giving a
task a click-to-zoom affordance without breaking its checkbox is open, and recorded in
docs/research/decoration-follow-ups rather than decided here. The task's mark is nevertheless a
DRAG source, which costs the checkbox nothing: its claim is on the click, not on the press
(docs/research/node-drag-and-drop).

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

#### Scenario: A press that moves is not a zoom
- **WHEN** the user presses a marker, moves the pointer past the drag threshold, and releases
- **THEN** no zoom happens, and the press was the drag gesture instead

#### Scenario: The zoom happens on release
- **WHEN** the user presses a marker and holds the button down without moving
- **THEN** the view has not zoomed yet, and it zooms when the button is released

#### Scenario: A task's checkbox keeps its own click
- **WHEN** the user clicks a task list item's checkbox
- **THEN** the task's checked state toggles, and the view does not zoom — the command, the
  context menu, and a hotkey remain how a task is zoomed by pointer-adjacent means

#### Scenario: A modified click is not this gesture
- **WHEN** the user clicks a marker with the platform's primary modifier held
- **THEN** no zoom happens
