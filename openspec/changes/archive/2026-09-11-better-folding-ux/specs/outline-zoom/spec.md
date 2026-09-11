## MODIFIED Requirements

### Requirement: A zoom leaves the view at the top and the caret visible inside the scope

After any gesture that changes the zoom scope, the editor SHALL have focus, and the caret SHALL be
inside the visible range: where it already was when that position is still inside the scope, and on
the new zoom root otherwise. This holds for every entry point — the commands, a crumb, and a click
on a mark — so the caret and the current-node highlight never disagree about which node is active.

A subtree that is FOLDED SHALL be opened when it becomes the zoom scope. A focus view of a
collapsed node shows its first line and nothing else, and the only control left on screen is the
fold chevron that got it there. Folds OUTSIDE the scope SHALL be opened for the zoom's duration
as well, and put back on leaving: Obsidian paints a hidden fold's collapsed indicator on the
nearest visible line, which under a zoom is the scope's own edge — a control there would unfold
something off-screen.

Leaving a zoom SHALL restore the folds it opened, inside the scope or out: clearing the zoom, or zooming out past the
scope, SHALL fold again every node the zoom unfolded that is still intact — so a reader who zoomed
into a folded node comes back to it folded, as they left it. A node the reader unfolded themselves
while zoomed, or one that no longer exists as it was, or the one the caret now sits in, is not
restored. Zooming out to an ancestor SHALL NOT open those restored folds again on the way: the
ancestor's own view opens only what it finds folded at that moment, less what the exit just
restored.

While zoomed, the view SHALL be scrolled to the TOP, so the trail and the zoom root are the first
things in it whatever the subtree's length. Clearing the zoom SHALL bring the node just left back
into view, rather than leaving the reader wherever the collapsed layout happened to put them.

No position outside the visible range SHALL be reachable by clicking: the space below the zoomed
content belongs to no line, and a click there SHALL leave the caret inside the scope.

#### Scenario: Zooming into a node far down a note opens at the top
- **WHEN** the user zooms into a node that was scrolled well down the note
- **THEN** the view is at the top, with the trail visible, and the editor is focused

#### Scenario: Zooming into a folded node opens it
- **WHEN** the user zooms into a node whose subtree is folded
- **THEN** the whole subtree renders

#### Scenario: A fold outside the zoom shows no control on the scope's edge
- **WHEN** a later sibling is folded and the user zooms into a node before it
- **THEN** the scope's last line carries no collapsed indicator, and clearing the zoom folds the
  sibling again

#### Scenario: Clearing the zoom folds it again
- **WHEN** the user zooms into a folded node and clears the zoom
- **THEN** the node is folded, as it was before the zoom

#### Scenario: Zooming out restores only the scope being left
- **WHEN** two folded siblings are opened by zooming into their parent, then one of them is zoomed
  into and out of again
- **THEN** both stay open in the parent's view, and clearing the zoom folds both

#### Scenario: The caret keeps its place when the scope still contains it
- **WHEN** the user zooms in with the caret inside the node being zoomed to
- **THEN** the caret stays exactly where it was

#### Scenario: A caret the new scope does not contain moves to the root
- **WHEN** the user zooms to a node by clicking its mark while the caret is elsewhere
- **THEN** the caret is on the new zoom root, inside the visible range

#### Scenario: Clicking below the zoomed content does not put the caret outside it
- **WHEN** the user clicks in the empty space below the zoomed subtree
- **THEN** the caret is on a line of the visible range, not on a hidden one
