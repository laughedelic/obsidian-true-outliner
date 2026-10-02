## MODIFIED Requirements

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
  paragraph child `world` below it, separated by a blank line — the underline is never treated as
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
