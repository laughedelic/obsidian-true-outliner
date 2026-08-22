## MODIFIED Requirements

### Requirement: Structural key bindings
In outline mode, high-precedence bindings SHALL map Tab → indent node and Shift+Tab →
outdent node, targeting the operand `selection-structural-ops` resolves from the current
selection — the covered subtrees of a block selection, and the node at the cursor line when
the selection is empty or lies within one node's own content. Move up/down are NOT bound in
this keymap: they carry a default hotkey on their commands instead (see
`editor-structural-commands`), because unlike Tab they have no stock Obsidian behavior to
beat and so do not need `Prec.highest` interception. The grammar SHALL still implement
move up/down as planned keys, including over a selection operand, so that a future
configurable-keymap layer can bind them without reintroducing a second placement path. Each
accepted operation SHALL dispatch as one CM6 transaction (annotated with a `userEvent`)
forming a single undo step. Rejections SHALL show the transient cue and change nothing,
including a group rejection, which shows ONE cue for the whole operand.

These keys SHALL continue to decline when the selection holds more than one range.

*(Amendment 2026-08-17, `selection-aware-structural-ops`: these bindings previously targeted
"the node at the cursor line" and planned from the selection's HEAD, so Tab over a cover of
several subtrees indented exactly one of them — whichever end the cover had grown from.)*

The dispatched selection SHALL come from `caret-placement-policy`, the same procedure the
command palette and the enforcement rewrite path use, WHENEVER the operand was a caret or a
within-node character range. Where the operand was a block cover, the dispatched selection is
the cover of the moved subtrees per `selection-structural-ops`, and no caret is placed. This
requirement states which case each operation falls into; it does not restate either rule.

Move up and move down are SUBJECT placements — the moved node's own new location, which is
not recoverable by mapping the pre-operation cursor through the change set. This holds
whichever entry point invokes them, which is what makes the keymap and the command
interchangeable for these two operations. A moved
heading's caret sits at column 0, before its `#` characters, per that capability's single
content-start definition. Indent and outdent are DERIVED placements — the pre-operation
cursor mapped forward through their (minimal) change set, preserving the column the user
was at rather than resetting to the node's content start, falling back to the subject
placement when the mapped position would not be caret-addressable.

#### Scenario: Tab indents against core default
- **WHEN** Tab is pressed with the cursor on a list item that has a previous sibling
- **THEN** the mapping-core indent op's edits are applied as one transaction and the
  cursor stays at the same relative column within the indented text, not reset to the
  node's content start

#### Scenario: Tab over a block cover indents every covered subtree
- **WHEN** Tab is pressed with a selection covering three sibling subtrees whose first root
  has a previous sibling
- **THEN** all three are indented in one transaction, and the selection afterward covers the
  same three subtrees in their new position

#### Scenario: Shift+Tab over a block cover outdents every covered subtree
- **WHEN** Shift+Tab is pressed with a selection covering two nested sibling subtrees
- **THEN** both are outdented in one transaction, and the selection afterward covers them

#### Scenario: A group rejection shows one cue
- **WHEN** Tab is pressed over a cover whose first root has no previous sibling
- **THEN** the document, selection and undo history are unchanged and exactly one cue
  appears — not one per covered root

#### Scenario: Rejection changes nothing
- **WHEN** Tab is pressed on a node with no previous sibling
- **THEN** the document, selection, and undo history are unchanged and the cue appears

#### Scenario: Move places the cursor at the moved node's content start
- **WHEN** the move node up or move node down command moves a node
- **THEN** the transaction states the moved node's own resulting cursor explicitly, and
  the selection lands there

#### Scenario: Moving a heading lands the caret at column 0
- **WHEN** the move node up or move node down command moves a heading
- **THEN** the caret is at column 0 of the heading's line, before the `#` characters,
  matching where Home lands on that line
