# outline-keyboard-grammar Specification

## Purpose
Defines the CM6 keyboard grammar that drives structural editing directly from the keyboard
in outline mode: which keys map to which structural operations and node-split behavior, how
the grammar scopes itself to outline-mode files, and the transaction/undo contract each
accepted keypress SHALL satisfy.
## Requirements
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

### Requirement: Enter splits the node
In outline mode, Enter SHALL split the node at the cursor. For a node WITH
children, the remainder becomes the node's new FIRST CHILD — content-adjacent to
the split point, never jumping over the existing subtree — encoded per the child
scope's kind rules. For a node with NO children, the remainder becomes a sibling of
the same kind (empty lower half when the cursor is at the node's end), as before.
The cursor lands at the remainder's content start. On a heading line, Enter SHALL
split the heading's text at the cursor: the heading keeps the text before the
cursor (same level, marker, and setext-ness unchanged) and the text after the
cursor becomes a new paragraph, landing as the heading's new FIRST child —
regardless of whether the heading already has children, since a heading's only
possible SIBLING is another heading and a plain-text split has no such encoding.
When the cursor is at the heading's end (or only trailing whitespace follows),
Enter SHALL widen the heading's own trailing gap and place the cursor on a line
blank-separated from both the heading and whatever follows, per the same
gap-widening rule a childless paragraph's end-of-node split already uses — the new
child materializes only once text is typed there. For a setext heading, a mid-title
Enter SHALL keep the underline attached to the (truncated) heading, never treating it
as part of the split-off remainder. Enter with the cursor on a setext heading's
underline line SHALL decline with the rejection cue (`cannot-split`), since the
underline carries no title text to split. On an atom's interior, Enter SHALL decline
the key (stock newline).

#### Scenario: Split a list item mid-text
- **WHEN** Enter is pressed with the cursor inside a childless `- alpha beta`,
  after "alpha "
- **THEN** the text becomes two sibling items `- alpha ` and `- beta` and the
  cursor sits after the new item's marker (narrowed by this change: a list item
  WITH children splits differently — see the scenario below)

#### Scenario: Split a parent lands the remainder as first child
- **WHEN** Enter is pressed mid-text in a list item that has children
- **THEN** the remainder becomes the item's new first child, sitting directly
  below the split point and above the existing children

#### Scenario: Enter at end creates an empty sibling
- **WHEN** Enter is pressed at the end of a childless list item's text
- **THEN** a new empty sibling item appears below and the cursor sits on it

#### Scenario: Enter mid-heading-text splits the title
- **WHEN** Enter is pressed with the cursor mid-text inside `# Hello world`
  (after "Hello ")
- **THEN** the heading becomes `# Hello ` and a new paragraph child `world`
  appears directly below it, with the cursor at the new paragraph's content start

#### Scenario: Enter mid-heading-text with an existing paragraph child
- **WHEN** Enter is pressed mid-text in a heading whose existing first child is
  itself a paragraph
- **THEN** the split-off remainder becomes a new paragraph, separated from the
  existing paragraph child by a blank line so the two stay distinct nodes on
  re-parse (they do not merge into one paragraph)

#### Scenario: Enter at the end of a heading widens the gap
- **WHEN** Enter is pressed at the end of a heading's text (cursor after the last
  character, no trailing whitespace)
- **THEN** the heading's trailing gap widens by two blank lines (one more than
  this behavior inserted before this change) and the cursor lands on the first
  one, blank-separated from the heading above and from whatever follows below,
  ready for a real child paragraph to materialize once text is typed

#### Scenario: Enter mid-title of a setext heading keeps the underline attached
- **WHEN** Enter is pressed mid-text inside a setext heading `Hello world`
  underlined `====`, after "Hello "
- **THEN** the heading becomes `Hello ` still underlined by `====`, with a new
  paragraph child `world` directly below it — the underline is never treated as
  part of the split-off remainder

#### Scenario: Enter on a setext heading's underline declines
- **WHEN** Enter is pressed with the cursor on a setext heading's underline line
  (`===` or `---`)
- **THEN** the key is declined with the rejection cue and nothing changes

### Requirement: Shift+Enter continues the node
In outline mode, Shift+Enter SHALL insert a newline that keeps the cursor inside the SAME
node as a continuation line — indented to the content column for list items, a plain
continuation line for paragraphs. The result SHALL re-parse as one (multiline) node. On
atoms it SHALL decline the key.

#### Scenario: Multiline list item
- **WHEN** Shift+Enter is pressed inside `- note text`
- **THEN** the new line is indented to the item's content column and the item re-parses
  as a single two-line node

