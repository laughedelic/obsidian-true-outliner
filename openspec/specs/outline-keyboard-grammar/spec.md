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

### Requirement: Enter splits the node
In outline mode, Enter SHALL act on the EMPTY POSITION adjacent to the cursor:

- At a node's content END — the empty position BELOW it, in its CHILD scope when it has
  children and in its SIBLING scope when it does not.
- At a node's content START — its first line, at or before its content column, marker
  interior included — the empty position ABOVE it, in its SIBLING scope. The node's own
  lines, children and depth SHALL NOT change. The start of a CONTINUATION line is an
  ordinary interior position, not a content start.
- Anywhere between — an ordinary split. For a node WITH children the remainder becomes the
  node's new FIRST CHILD, content-adjacent to the split point and never jumping over the
  existing subtree, encoded per the child scope's kind rules. For a node with NO children
  the remainder becomes the next sibling of the same kind. The cursor lands at the
  remainder's content start.

The cursor SHALL land on the empty position, never on the node's own text. Where the
destination scope's kind has an empty markdown encoding, a real empty node SHALL be
materialized there: a list item in the original's marker style, with ordered runs
renumbered, or — in the content-start case only — a heading at the same level. Where it has
none, the adjacent gap SHALL widen into a provisional position.

On a heading line, an interior Enter SHALL split the heading's text at the cursor: the
heading keeps the text before it, unchanged in level, marker and setext-ness, and the text
after it lands as the heading's new FIRST child, encoded per the same child-scope kind rules
every other parent uses — which resolves to a paragraph unless the heading's existing
children establish another kind. A heading's split remainder is always a CHILD, because a
plain-text split has no heading-sibling encoding to produce; the content-start case is not a
split and is not covered by that restriction. For a setext heading, a mid-title Enter SHALL
keep the underline attached to the truncated heading, and Enter on the underline line SHALL
be rejected with `cannot-split`.

Enter on a list item whose own content is EMPTY SHALL NOT split. It SHALL OUTDENT the item,
on the same terms as Shift+Tab, so a run of Enters walks back out of the nesting a run of
Enters walked into. Where outdent is not available — at the top level, or directly under a
heading, where markdown has no sibling spot — the item SHALL be UNWRAPPED: its marker goes
and the cursor is left on a provisional position. An empty item that has CHILDREN and cannot
outdent SHALL be rejected with the cue rather than orphaning them. An item whose only content
is an unchecked task marker counts as empty, because that marker was written by this
grammar's own continuation rule and requiring its deletion first would be a wart.

A split of a task item SHALL carry the task marker to the new item, unchecked, whatever the
original's checked state.

The horizontal whitespace run immediately following the split point SHALL be consumed, for
every node kind: it separated two words now on different lines and belongs to neither half.

On an atom, Enter SHALL decline the key, because stock behavior is already the next line of
the same type — a `> ` line in a quote, a row in a table, a plain line in a code fence. On a
THEMATIC BREAK it SHALL be rejected with `cannot-split` instead: an `hr` has no text to
split and no next line of its own kind, and the stock newline turns `---` into a paragraph
and an empty list item.

With a NON-EMPTY selection, Enter SHALL remove the selection exactly as the Backspace
gesture does — a character range within a node, whole subtrees for a block selection — and
then apply the rules above at the cursor that results. With MULTIPLE cursors it SHALL
decline the key; planning only the main range while dispatching a single cursor discards
every other range with no document change to undo.

#### Scenario: Split a list item mid-text
- **WHEN** Enter is pressed with the cursor inside a childless `- alpha beta`, after "alpha "
- **THEN** the text becomes two sibling items `- alpha ` and `- beta` and the cursor sits
  after the new item's marker

#### Scenario: Split a parent lands the remainder as first child
- **WHEN** Enter is pressed mid-text in a list item that has children
- **THEN** the remainder becomes the item's new first child, directly below the split point
  and above the existing children

#### Scenario: Enter at end creates an empty sibling
- **WHEN** Enter is pressed at the end of a childless list item's text
- **THEN** a new empty sibling item appears below and the cursor sits on it

#### Scenario: Enter at a parent item's content start inserts an empty item above
- **WHEN** Enter is pressed at the content start of `- alpha`, which has a child `- child`
- **THEN** an empty `- ` appears above it, `alpha` keeps its own depth and its child
  verbatim, and the cursor is in the new empty item

#### Scenario: Enter at a heading's content start inserts an empty heading above
- **WHEN** Enter is pressed before the "H" of `# Hello`, or anywhere inside its `#` marker
- **THEN** an empty `# ` at the same level appears above it, `# Hello` is byte-identical,
  and the cursor is in the new empty heading — the title is not demoted into a paragraph

#### Scenario: Enter at a paragraph's content start widens the gap above
- **WHEN** Enter is pressed at the content start of a paragraph
- **THEN** the gap above it widens into a provisional position holding the cursor, and the
  paragraph's own text is unchanged and unmoved

#### Scenario: Enter on an empty nested item outdents it
- **WHEN** Enter is pressed on an empty `- ` nested under another list item
- **THEN** the item moves out one level, exactly as Shift+Tab would move it, and the cursor
  stays at its content start

#### Scenario: Enter on an empty top-level item leaves the list
- **WHEN** Enter is pressed on an empty `- ` at the top level
- **THEN** the marker is removed, the cursor is left on a provisional position, and typing
  there produces a paragraph

#### Scenario: Enter on an empty task item leaves the list too
- **WHEN** Enter is pressed on a top-level `- [ ] ` with no text of its own
- **THEN** it behaves exactly as the empty `- ` above — the task marker does not make the
  item non-empty

#### Scenario: Enter on an empty item that cannot outdent or unwrap is rejected
- **WHEN** Enter is pressed on an empty top-level `- ` that has children
- **THEN** the document, selection and undo history are unchanged and the cue appears

#### Scenario: A task split continues the task, unchecked
- **WHEN** Enter is pressed at the end of `- [x] done`
- **THEN** the new item is `- [ ] `, not `- `

#### Scenario: Enter mid-heading-text splits the title
- **WHEN** Enter is pressed mid-text inside `# Hello world`, after "Hello "
- **THEN** the heading becomes `# Hello ` and a new paragraph child `world` appears below
  it, separated by a blank line, with the cursor at the paragraph's content start

#### Scenario: Enter mid-heading-text with an existing paragraph child
- **WHEN** Enter is pressed mid-text in a heading whose existing first child is
  itself a paragraph
- **THEN** the split-off remainder becomes a new paragraph, separated from the
  existing paragraph child by a blank line so the two stay distinct nodes on
  re-parse (they do not merge into one paragraph)

#### Scenario: Enter mid-heading-text with an existing list child
- **WHEN** Enter is pressed mid-text in a heading whose existing first child is a list item
- **THEN** the remainder is encoded as a list item too, matching the child scope, and lands
  above the existing one

#### Scenario: Enter at the end of a heading widens the gap
- **WHEN** Enter is pressed at the end of a heading's text whose child scope resolves to a
  paragraph
- **THEN** the heading's trailing gap widens by two blank lines and the cursor lands on the
  first, blank-separated from the heading above and from whatever follows, ready for a
  child paragraph to materialize once text is typed

#### Scenario: Enter at the end of a heading whose children are list items
- **WHEN** Enter is pressed at the end of a heading whose first child is a list item
- **THEN** the empty position is materialized as a real empty `- ` first child instead,
  because that scope's kind has an empty encoding

#### Scenario: Enter at the end of an item whose first child is a paragraph
- **WHEN** Enter is pressed at the end of a list item whose first child is an indented
  paragraph
- **THEN** the item's own gap widens into a provisional position between the item and that
  paragraph — the new position is not placed after the whole subtree

#### Scenario: The split point's whitespace goes with neither half
- **WHEN** Enter is pressed in a paragraph `one two` with the cursor after "one"
- **THEN** the two paragraphs read `one` and `two`, with no leading space on the second

#### Scenario: Enter mid-title of a setext heading keeps the underline attached
- **WHEN** Enter is pressed mid-text inside a setext heading `Hello world`
  underlined `====`, after "Hello "
- **THEN** the heading becomes `Hello ` still underlined by `====`, with a new
  paragraph child `world` directly below it — the underline is never treated as
  part of the split-off remainder

#### Scenario: Enter on a setext heading's underline declines
- **WHEN** Enter is pressed with the cursor on a setext heading's underline (`===` or `---`)
- **THEN** the key is rejected with the cue and nothing changes

#### Scenario: Enter on a thematic break is rejected
- **WHEN** Enter is pressed with the cursor anywhere on a `---` thematic break
- **THEN** the document is unchanged and the cue appears — the stock newline, which would
  split it into a paragraph and an empty list item, never runs

#### Scenario: Enter over a text selection replaces it first
- **WHEN** Enter is pressed with a character range selected inside one node
- **THEN** the selected text is gone and the node is split at that position, as though the
  selection had been deleted and Enter pressed at the resulting cursor

#### Scenario: Enter over a block selection replaces it first
- **WHEN** Enter is pressed with whole subtrees selected
- **THEN** those subtrees are removed and Enter acts at the cursor the removal leaves, so
  the result is one empty position where the selection was

#### Scenario: Enter with multiple cursors declines
- **WHEN** Enter is pressed with more than one cursor
- **THEN** the grammar declines and stock behavior runs for every range — no range is
  silently discarded

### Requirement: Shift+Enter continues the node
In outline mode, Shift+Enter SHALL insert a line break that keeps the cursor inside the SAME
node as a continuation line, prefixed so the new line starts at the node's own content
column: a list item's continuation indent, an indented paragraph's own leading whitespace,
nothing for a paragraph at column 0. A continuation line's prefix is read from the line the
cursor is on, so a node already broken across lines keeps its established alignment.

The insertion point SHALL be clamped to the node's content column, never landing inside a
marker or the node's indentation — the same clamp Enter applies — and the horizontal
whitespace run immediately following it SHALL be consumed.

Where content follows the cursor, the result SHALL re-parse as ONE multiline node. At a
node's END there is nothing to carry down, so the inserted line is blank: a provisional
position, ADJACENT to the node's last content line rather than blank-separated from it,
which is what makes text typed there the node's own continuation line rather than a new
node. That adjacency is required, not incidental — see the provisional-position requirement.

On a HEADING, Shift+Enter SHALL create a new SIBLING heading at the same level, carrying any
text after the cursor, with the cursor at its content start. A heading has no continuation
line of its own, so the key is free for the gesture that drafts a document's structure. The
new heading SHALL be written ATX whatever the original's form, because an empty setext
heading has no encoding. This applies on a setext heading's underline line as well, where
Enter is rejected.

On an atom Shift+Enter SHALL decline the key, and on a THEMATIC BREAK it SHALL be rejected,
for the same reasons Enter is.

With a non-empty selection or multiple cursors, Shift+Enter SHALL behave as Enter does:
remove the selection first and act at the resulting cursor, or decline under multi-cursor.

#### Scenario: Multiline list item
- **WHEN** Shift+Enter is pressed inside `- note text`
- **THEN** the new line is indented to the item's content column and the item re-parses as a
  single two-line node

#### Scenario: An indented paragraph keeps its own indentation
- **WHEN** Shift+Enter is pressed mid-text in a paragraph indented under a list item
- **THEN** the continuation line carries that paragraph's own leading whitespace, so the
  source stays aligned with the tree rather than relying on a lazy continuation from column 0

#### Scenario: The insertion point is clamped out of chrome
- **WHEN** Shift+Enter is pressed with the cursor inside a list item's marker
- **THEN** the break happens at the item's content column and the marker is left whole

#### Scenario: Shift+Enter at a node's end leaves an adjacent provisional line
- **WHEN** Shift+Enter is pressed at the end of a list item's text
- **THEN** the cursor lands on a blank line at the item's content column with no blank line
  between it and the item, and typing there makes it the item's second line — one node

#### Scenario: Shift+Enter on a heading drafts the next one
- **WHEN** Shift+Enter is pressed at the end of `## Foo`
- **THEN** a new `## ` appears directly below it as a sibling at the same level, with the
  cursor at its content start

#### Scenario: Shift+Enter mid-heading-title carries the remainder
- **WHEN** Shift+Enter is pressed mid-title in `## Foo bar`, after "Foo "
- **THEN** the heading becomes `## Foo ` and a sibling `## bar` follows it

#### Scenario: Shift+Enter on a setext heading produces an ATX sibling
- **WHEN** Shift+Enter is pressed on a setext heading, on its title or on its underline
- **THEN** the new sibling is written `# ` or `## ` at the same level, and the original
  heading keeps its setext form

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

### Requirement: Provisional positions
An accepted structural keypress MAY leave the cursor on a blank or whitespace-only line that
belongs to no node's own lines. Such a line is a PROVISIONAL POSITION: it holds the place
where a node, or a node's continuation line, materializes as soon as text is typed there,
and until then it is blank space in the file.

A provisional position is a cursor position, not a node. The OUTLINE — the tree this plugin
presents, decorates, and operates on — SHALL have the same nodes before and after the keypress
that created a position, and for as long as the position is open. This holds in both
directions, and each has a shape that reaches it:

- A position SHALL add no node. An end-of-node position is blank-separated or adjacent to the
  node above, and in neither case does the blank line itself parse as content.
- A position SHALL remove no node, and SHALL move no line out of the node it belonged to. A
  position opened INTERIOR to a node — Shift+Enter at the end of a line that is not that
  node's last — writes a blank line between lines that were the node's own. The RAW PARSE of
  the buffer does gain a node there: a blank line ends a node's own lines, so the lines below
  the position re-parse as a separate node, one level deeper where the bisected node is a list
  item. That is a property of the encoding, not of the outline, and typing one character
  reverses it. The outline SHALL be the one the position stands for, in which those lines are
  still the node's own.

The two kinds SHALL be distinguishable from the DOCUMENT ALONE, with no editor state and no
record of which key was pressed:

- Enter's provisional position SHALL be blank-separated from the content above it and below
  it, so text typed there parses as a node distinct from both neighbours.
- Shift+Enter's provisional position SHALL be ADJACENT to the node above it, so text typed
  there parses as that node's own continuation line.

This is the reason an end-of-node Enter widens a gap by two lines rather than reusing the
single blank line that already separates two nodes. The narrower encoding was evaluated and
is provably ambiguous: at the end of a top-level paragraph both keys leave the cursor at
column 0 of the line below, and the only remaining difference is gap width, which
`node-edit-enforcement` forbids reading editing intent from. Resolving it would require
remembering which key ran — the editor state this design does not have.

The same reading answers the interior position without a new rule. Nothing separates the line
below an interior position from the position itself, so a character typed there joins the two:
in the MATERIALIZED parse — the parse of the document with the position's own line filled in,
which is the outline the position stands for — that line is one of the node's own lines,
exactly as the position's own line is. The RAW parse of the buffer, with the position still
blank, is the one that says otherwise, and it is that discrepancy the outline resolves.

A provisional position SHALL behave as the empty node it stands for whenever the user acts on
it as one. Moving the cursor away without typing, and deleting it with Backspace or Delete,
both remove the position and everything the operation that opened it did — and NOTHING the
same keypress did before that operation — rather than leaving debris or editing the
surrounding gap by one line. Where the keypress removed a non-empty selection first, that
removal stands. `structural-history-integration`'s "An unused structural keypress has its
place removed" states the rule, including the case where the position is not opened but left
behind as the residue of leaving a list, which is removed rather than reversed.

A structural keypress dispatched WHILE a position is open SHALL act on the outline above, not
on the raw parse. Which node a key targets, which lines move with it, and which lines a
node-granular selection covers SHALL all be what they would be with no position open.

#### Scenario: The keypress creates no node
- **WHEN** Enter is pressed at the end of a childless paragraph
- **THEN** the document's node count is unchanged, and the cursor sits on a blank line with
  a blank line between it and each neighbour

#### Scenario: An interior position removes no node either
- **WHEN** Shift+Enter is pressed at the end of the first line of a two-line list item
- **THEN** the outline still holds one list item whose own lines are both the first line and
  the line below the position, and no paragraph child exists

#### Scenario: Typing materializes a new node
- **WHEN** text is typed on Enter's provisional position
- **THEN** it becomes a node distinct from the nodes above and below it, with no further
  keypress and no rewrite

#### Scenario: Typing materializes a continuation line
- **WHEN** text is typed on Shift+Enter's provisional position
- **THEN** it becomes the second line of the node above it, which stays one node

#### Scenario: Typing on an interior position rejoins the whole node
- **WHEN** text is typed on a position opened interior to a multi-line node
- **THEN** the node holds every one of its own lines again — the lines above the position, the
  typed line, and the lines below it — as one node, with no further keypress and no rewrite

#### Scenario: The two are distinguishable without state
- **WHEN** the same document position is reached by Enter and by Shift+Enter at the end of
  the same top-level paragraph
- **THEN** the two documents differ, and typing the same character into each yields a new
  node in the first case and a continuation line in the second

#### Scenario: A position opened over a selection is abandoned without restoring it
- **WHEN** a non-empty selection is replaced by a provisional position, and the cursor is then
  moved away with nothing typed
- **THEN** the position is gone in full and the selection stays removed

#### Scenario: A structural key acts on the node the position is in
- **WHEN** a position is open interior to a list item that has no children, and Tab, Shift+Tab,
  or a move is pressed
- **THEN** the operation treats the item's lines below the position as the item's own, moving
  or re-indenting them with it and never as a child subtree, and the result is what the same
  key produces on the same item with no position open

#### Scenario: Node-granular selection sees one node
- **WHEN** a position is open interior to a node and the selection is extended by one node
- **THEN** the selection covers that whole node, its lines below the position included, rather
  than stopping at the position

