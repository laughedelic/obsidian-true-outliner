## Purpose

Defines folding as an outline operation rather than an Obsidian feature the plugin happens to sit
beside: what folds, what a fold hides, how a reader folds it (command, hotkey, affordance, guide
click), how a folded node says so, and what happens to fold state across structural operations,
zoom and a reload.

## ADDED Requirements

### Requirement: Every node with children folds, and a fold hides exactly its subtree

In outline mode, EVERY node with at least one child SHALL be foldable, whatever its kind. Three
kinds can hold children: a heading, a list item in any of its notations (bullet, ordered, task),
and a paragraph carrying children through the attachment rule. An atom — a table, a code fence, a
callout, a quote, raw HTML, a rule — is never a parent in the tree, so the plugin SHALL offer no
outline fold on one. A node with no children SHALL NOT be foldable.

This is a rule about what WE offer, not a veto over Obsidian. Declining to answer for a line
leaves the question to the providers below us, and for at least one atom kind — a raw HTML block,
measured — Obsidian's own folding still reports a fold there. Such a fold is Obsidian's, it is
left alone, and no affordance of ours SHALL appear for it: our affordance follows OUR rule, not
whatever the editor happens to consider foldable.

A fold SHALL hide from the end of the node's own last line through the end of its last
descendant's last line. A node's own trailing gap and the gap owned by its last descendant SHALL
remain visible: the blank line between two siblings is what separates them on screen, and hiding
it would make folding a node re-lay-out the node after it.

The rule SHALL be the same rule for every kind, taking precedence over any narrower answer
Obsidian would give for the same line, so that no node's fold extent depends on which notation
happens to encode it.

Folding SHALL NOT depend on Obsidian's "Fold heading" and "Fold indent" settings: those settings
govern Obsidian's own folding, and an outline node folds because it has children.

#### Scenario: A paragraph with attached children folds
- **WHEN** the caret is in a paragraph that has a list attached to it as children, and the fold
  command runs
- **THEN** the list is hidden and the paragraph line remains, with a blank line still separating
  it from the node that follows

#### Scenario: A childless node does not fold
- **WHEN** the caret is in a paragraph with no children and the fold command runs
- **THEN** nothing is hidden and no affordance is offered on that line

#### Scenario: An atom offers nothing to fold
- **WHEN** a table is followed by a list at the same level
- **THEN** the list is the table's SIBLING, the table has no children, and no fold affordance
  appears beside it

#### Scenario: A native fold on an atom is left alone
- **WHEN** a note contains a raw HTML block, which Obsidian's own folding reports as foldable
- **THEN** the plugin draws no affordance beside it and does not fold it, and whatever Obsidian
  does there is unchanged

#### Scenario: A heading folds its whole subtree
- **WHEN** a heading with nested headings and lists beneath it is folded
- **THEN** every descendant is hidden and the next sibling heading remains visible

#### Scenario: Folding works with Obsidian's own fold settings off
- **WHEN** "Fold heading" and "Fold indent" are both disabled and the fold command runs on a
  node with children
- **THEN** the node folds

### Requirement: Three commands fold, unfold and toggle the current node

The plugin SHALL provide three commands — fold node, unfold node, toggle fold — available in
outline mode. They SHALL ship with the default hotkeys `Mod+Alt+ArrowUp`, `Mod+Alt+ArrowDown` and
`Mod+Alt+Period` respectively, the same deliberate departure from the "avoid default hotkeys"
guideline `editor-structural-commands` already records for the move hotkeys, and for the same
reason: a gesture nobody can find is not a gesture. A user-assigned hotkey always overrides the
default.

Each command SHALL resolve its target as the nearest node at or above the caret that HAS
children — the node the caret is in when that node has children, and its nearest such ancestor
otherwise. A caret usually rests in a leaf, and "collapse this branch" is what the gesture means
there; resolving to nothing would make the hotkey do nothing in the commonest position.

Fold on an already-folded node SHALL do nothing, and unfold on an unfolded one SHALL do nothing;
neither SHALL be an error. Toggle SHALL fold an unfolded target and unfold a folded one.

Under a selection covering several subtrees, a command SHALL act on every covered subtree root,
matching how the structural commands read a selection. A command SHALL be UNAVAILABLE when the
selection holds more than one range.

Folding SHALL NOT change the document. It SHALL NOT move the caret EITHER, with one exception,
stated here so no two entry points read it differently: when the caret sits inside the range the
fold is about to hide — which includes the case where the command escalated to an ancestor and the
caret is in a descendant — it SHALL move to the folded node's own line, because a caret in hidden
text is unreachable. A caret anywhere else SHALL be left exactly where it is.

#### Scenario: Toggle from a leaf folds the branch above it
- **WHEN** the caret is in a childless list item nested under a parent that has children, and
  toggle fold runs
- **THEN** the parent folds, hiding the item the caret was in, and the caret sits on the parent's
  line

#### Scenario: Fold is idempotent
- **WHEN** the fold command runs twice on the same node
- **THEN** the node is folded once and the second invocation changes nothing

#### Scenario: A block selection folds every covered subtree
- **WHEN** the selection covers three sibling subtrees and toggle fold runs
- **THEN** each of the three that has children folds

#### Scenario: Folding leaves the document byte-identical
- **WHEN** a node is folded and unfolded again
- **THEN** the document text is unchanged and the undo history has no new entry

### Requirement: Document-wide fold commands act on the outline, not on the notation

The plugin SHALL provide fold all, unfold all, fold one level more and fold one level less. Fold
all SHALL fold every node with children; unfold all SHALL unfold every fold in the document. Fold
one level more SHALL fold the deepest currently-unfolded level, and fold one level less SHALL
unfold the shallowest currently-folded level, so repeated invocation walks the outline's depth in
either direction.

While a zoom scope is active these commands SHALL act only within that scope, since the rest of
the document is not on screen to be folded.

#### Scenario: Fold all reaches kinds Obsidian's own fold-all does not
- **WHEN** a note contains a heading, a list and a paragraph with attached children, and fold all
  runs
- **THEN** all three are folded

#### Scenario: Level folding walks the depth
- **WHEN** fold one level more runs twice on a fully-unfolded three-level outline
- **THEN** the third level is hidden, then the second, leaving the first visible

#### Scenario: Fold all while zoomed stays inside the scope
- **WHEN** the view is zoomed to a subtree and fold all runs
- **THEN** only nodes inside that subtree are folded

### Requirement: Every foldable node offers a pointer affordance in the marker gutter

A foldable node SHALL offer a fold affordance beside its marker, in the marker gutter, appearing
on hover for an unfolded node and remaining visible while the node is folded — a folded node's
only route back must not be hidden behind a hover.

The affordance SHALL be offered on exactly the lines the rule above makes foldable, and on no
others. Where Obsidian already paints its own fold chevron on such a line — heading and list lines
— that chevron SHALL be it; where it paints none, the plugin SHALL draw its own in the same place,
behaving identically. The condition SHALL be "a node WE make foldable, with no native chevron on
its line", not a kind: which lines Obsidian decorates is internal to Obsidian, may change, and —
per the requirement above — may cover lines we offer no fold on at all.

It follows that if Obsidian stops painting a chevron on heading or list lines — because a user
turned "Fold heading" or "Fold indent" off, or because its rule changes — those lines receive the
plugin's own affordance under the same condition, and folding stays available by pointer for every
node with children. That is the whole reason the condition is written this way.
`outline-decorations` states how both are positioned and how a folded one is drawn.

A click on the affordance SHALL toggle the node's fold and SHALL NOT place the caret, begin a
selection, or zoom.

#### Scenario: A paragraph with children gains a fold affordance
- **WHEN** the pointer hovers a paragraph that has attached children
- **THEN** a fold affordance appears beside its marker, in the same column a heading's appears in

#### Scenario: A folded node keeps its affordance visible
- **WHEN** a node is folded and the pointer leaves it
- **THEN** the affordance remains visible

#### Scenario: The affordance does not place a caret
- **WHEN** the user clicks the fold affordance of a node the caret is not in
- **THEN** the node folds and the caret stays where it was

### Requirement: A folded node states that it is folded, and how much it hides

A folded node SHALL be distinguishable from an unfolded one at a glance, through its own marker
rather than through chrome that appears elsewhere, and SHALL show how many descendants it hides.
The count SHALL be of every hidden descendant, not only immediate children, because that is what
the reader cannot see. `outline-decorations` states the visual treatment: the kind's own glyph in
a solid weight, and the count after the node's text.

#### Scenario: Folding changes the node's marker
- **WHEN** a node with children is folded
- **THEN** its marker renders in its folded treatment, and reverts when the node is unfolded

#### Scenario: The count is of everything hidden
- **WHEN** a node with two children, one of which has three children of its own, is folded
- **THEN** the node reports five hidden descendants

### Requirement: Clicking a guide toggles the subtree under it

A click on an indentation guide SHALL toggle folding for the children of the node that guide
belongs to: if any of them is unfolded, every child with children of its own SHALL fold; if all
are already folded, they SHALL unfold. Reading a single branch by collapsing everything beside it
is the gesture this exists for.

A click SHALL be attributed to a guide only when it lands within a stated tolerance of that
guide's column, narrower than the space between two levels, and never when it lands on the node's
own text. Outside that tolerance a click SHALL keep doing what it does today — placing a caret.

The gesture SHALL NOT place the caret, begin a selection, or change the document. A MODIFIED
click SHALL be left alone, as `outline-zoom` already requires for marker clicks. When indentation
guides are not rendered, the gesture SHALL NOT be offered: an affordance that disappears with a
display setting cannot be the only route to an operation, and the commands and the per-node
affordance remain.

#### Scenario: Clicking a guide collapses the branch beside it
- **WHEN** the user clicks the guide column belonging to a node whose four children each have
  children of their own, none folded
- **THEN** all four children fold, and the caret does not move

#### Scenario: Clicking the same guide again reopens them
- **WHEN** every child under that guide is folded and the user clicks it again
- **THEN** they all unfold

#### Scenario: A click on text is still a click on text
- **WHEN** the user clicks within a node's text, past the guide tolerance
- **THEN** the caret is placed there and nothing folds

#### Scenario: No guides, no gesture
- **WHEN** indentation guides are turned off and the user clicks where a guide column would be
- **THEN** the caret is placed there and nothing folds

### Requirement: Fold state follows a node through a structural operation

After an accepted structural operation — indent, outdent, move up, move down — the operand's own
fold state and the fold state of every node inside the operand SHALL be what it was before the
operation, at the operand's new position. A subtree is folded in order to be handled as one unit,
and the operation that moves it is the one that most needs it to stay that way.

Fold state elsewhere in the document SHALL be unaffected.

#### Scenario: Moving a folded node keeps it folded
- **WHEN** a folded node is moved down past its next sibling
- **THEN** the node is in its new position and still folded, hiding the same descendants

#### Scenario: Indenting a folded node keeps it folded
- **WHEN** a folded node is indented under its previous sibling
- **THEN** it is still folded

#### Scenario: Moving a node that CONTAINS folds keeps them
- **WHEN** an unfolded node with two folded children is moved up
- **THEN** both children are still folded at the new position

### Requirement: A caret never lands inside hidden content

Any operation that would place the caret or a selection endpoint inside a folded range SHALL open
that fold first. Hidden text the caret is in cannot be seen, edited with any confidence, or found
again.

#### Scenario: Navigating into a folded subtree opens it
- **WHEN** a command places the caret on a node inside a folded range
- **THEN** the fold containing it opens and the caret is visible

### Requirement: Fold state persists per file, under a setting

Fold state SHALL survive closing and reopening a note, and SHALL be stored outside the note: the
note's bytes SHALL NOT record it, and no marker, property or block id SHALL be written to a file
because something was folded.

A setting SHALL govern this, default ON. With it OFF, a note SHALL open with nothing folded, and
folding a node in one session SHALL leave no trace in the next.

#### Scenario: Folds come back
- **WHEN** a note with two folded nodes is closed and reopened
- **THEN** the same two nodes are folded and the rest of the note is not

#### Scenario: The file is untouched
- **WHEN** nodes are folded and unfolded repeatedly and the note is saved
- **THEN** the file on disk is byte-identical to what it was before

#### Scenario: Persistence off
- **WHEN** the setting is off, a note with folded nodes is closed, and reopened
- **THEN** nothing is folded
