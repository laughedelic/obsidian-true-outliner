## MODIFIED Requirements

### Requirement: Structural key bindings
In outline mode, high-precedence bindings SHALL map Tab → indent node and Shift+Tab →
outdent node, targeting the node at the cursor line. Move up/down are NOT bound in this
keymap: they carry a default hotkey on their commands instead (see
`editor-structural-commands`), because unlike Tab they have no stock Obsidian behavior to
beat and so do not need `Prec.highest` interception. The grammar SHALL still implement
move up/down as planned keys, so that a future configurable-keymap layer can bind them
without reintroducing a second placement path. Each accepted operation SHALL dispatch as
one CM6 transaction (annotated with a `userEvent`) forming a single undo step. Rejections
SHALL show the transient cue and change nothing.

The dispatched selection SHALL come from `caret-placement-policy`, the same procedure the
command palette and the enforcement rewrite path use. This requirement states which case
each operation falls into; it does not restate the rule.

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

## ADDED Requirements

### Requirement: Bindings decline inside a nested editor
Every key this capability binds SHALL decline when the view is a nested editor (a table
cell's own `EditorView`), leaving the key to stock behaviour. The check SHALL be DOM
ancestry, applied through the one shared gate all bindings route through — NOT file
resolution: `editorInfoField` resolves a nested cell to the SAME outline-mode host file, so
resolving the file is what would ENABLE these handlers there. Only the cell's position in
the DOM distinguishes it.

Declining is the behaviour because Tab, Enter and the arrow keys all have meaning in
Obsidian's own table editor; acting on the host node would mean Enter splits the table the
user is typing into. Acting on the host node from a cell remains available through the
structural COMMANDS, which read the host note through the public `Editor` API.

#### Scenario: A structural key in a table cell is stock
- **WHEN** the caret is inside a table cell's nested editor in an outline-mode note and
  Tab, Shift+Tab, Enter or Shift+Enter is pressed
- **THEN** the key behaves exactly as stock, the host document is unchanged, and no
  rejection cue appears — in particular the cell's own text is never parsed as the outline

#### Scenario: The move command still acts on the host node from inside a cell
- **WHEN** the caret is inside a table cell's nested editor and the move node up command
  runs
- **THEN** the whole table moves as one node in the host document
