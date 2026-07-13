## ADDED Requirements

### Requirement: Grammar is scoped to outline mode
The keyboard grammar SHALL be registered as a CodeMirror extension via
`registerEditorExtension` and SHALL activate per keypress only when the editor's file has
outline mode enabled (resolved through the public `editorInfoField`). Outside outline
mode every grammar binding SHALL decline the key so editor behavior is byte-for-byte
stock Obsidian.

#### Scenario: Stock behavior off-mode
- **WHEN** Tab is pressed in a list in a note without outline mode
- **THEN** Obsidian's default indent behavior runs, unaffected by the plugin

#### Scenario: Toggle takes effect immediately
- **WHEN** outline mode is toggled while the note is open
- **THEN** the next keypress already follows the new mode, with no editor reload

### Requirement: Structural key bindings
In outline mode, high-precedence bindings SHALL map Tab → indent node, Shift+Tab →
outdent node, Alt+ArrowUp → move node up, Alt+ArrowDown → move node down, targeting the
node at the cursor line. Each accepted operation SHALL dispatch as one CM6 transaction
(annotated with a `userEvent`) forming a single undo step, with the selection placed at
the operation's cursor result. Rejections SHALL show the transient cue and change
nothing.

#### Scenario: Tab indents against core default
- **WHEN** Tab is pressed with the cursor on a list item that has a previous sibling
- **THEN** the mapping-core indent op's edits are applied as one transaction and the
  cursor sits at the moved item's content start

#### Scenario: Rejection changes nothing
- **WHEN** Tab is pressed on a node with no previous sibling
- **THEN** the document, selection, and undo history are unchanged and the cue appears

### Requirement: Enter splits the node
In outline mode, Enter SHALL split the node at the cursor into two siblings of the same
kind (empty lower half when the cursor is at the node's end), placing the cursor at the
new sibling's content start. On a heading line, Enter SHALL instead create an empty
paragraph as the heading's first child. On an atom's interior, Enter SHALL decline the
key (stock newline).

#### Scenario: Split a list item mid-text
- **WHEN** Enter is pressed with the cursor inside `- alpha beta`, after "alpha "
- **THEN** the text becomes two sibling items `- alpha ` and `- beta` (children, if any,
  staying with the first) and the cursor sits after the new item's marker

#### Scenario: Enter at end creates an empty sibling
- **WHEN** Enter is pressed at the end of a list item's text
- **THEN** a new empty sibling item appears below and the cursor sits on it

### Requirement: Shift+Enter continues the node
In outline mode, Shift+Enter SHALL insert a newline that keeps the cursor inside the SAME
node as a continuation line — indented to the content column for list items, a plain
continuation line for paragraphs. The result SHALL re-parse as one (multiline) node. On
atoms it SHALL decline the key.

#### Scenario: Multiline list item
- **WHEN** Shift+Enter is pressed inside `- note text`
- **THEN** the new line is indented to the item's content column and the item re-parses
  as a single two-line node
