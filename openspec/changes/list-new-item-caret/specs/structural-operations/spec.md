## MODIFIED Requirements

### Requirement: Node split
`splitNode(doc, nodeId, position)` SHALL resolve a document position within a paragraph,
list-item, or heading node into ONE of two outcomes: a SPLIT at that position, or — when
the position is the node's own content start — an INSERTION BEFORE the node, which divides
nothing. Both are specified below, and which one applies is a function of the position
alone. The operation's name predates the second outcome; the two are one operation because
a caller cannot tell in advance which its position will produce, and because both answer
the same question, "what does a line break mean here".

For an INTERIOR position, the node is split. For a paragraph or list-item node WITH
children, the remainder SHALL become the node's new FIRST CHILD — the position
content-adjacent to the split point — encoded per the child scope's kind rules (a
paragraph parent's new child becomes a list item when its existing children are
list items, per the attachment rule). For a paragraph or list-item node with NO
children, the remainder becomes the next sibling of the same kind: list items reuse
the original's marker style (ordered runs renumber, and a task marker carries over
UNCHECKED whatever the original's state); paragraphs gain the separating blank line
the boundary rules require.

A split position at the node's own CONTENT START — its first line, at or before its
content column — SHALL INSERT BEFORE the node rather than split it. For a list item
carrying a TASK MARKER, that content column SHALL fall after the marker: a position in
front of `[ ]`, inside it, or immediately after it all name the same intent, and none of
them divides the marker. The marker is a prefix for SPLITTING only — it remains ordinary
content to the caret, to Home, and to the selection ladder. The node's own
lines, children, depth and trailing gap SHALL be unchanged, and the operation's anchor
SHALL be the inserted empty position, not the node's text. Where the node's SIBLING
scope has an empty markdown encoding, an empty node SHALL be materialized there: a list
item in the original's marker style, with ordered runs renumbered, or a HEADING at the
same level. Where it has none — a paragraph — the gap ABOVE the node SHALL widen by two
blank lines, leaving a blank-separated line as the anchor. A position at the start of a
CONTINUATION line is an ordinary interior split, not a content start.

An END-of-node split SHALL place its result in the node's CHILD scope when it has
children and its SIBLING scope when it does not, and SHALL widen the relevant gap by two
blank lines whenever that scope's kind has no empty encoding — including the case where
the node HAS children and the child scope resolves to `paragraph`. It SHALL NOT fall
through to the childless sibling path there, which placed the new position after the
entire subtree: the jump-over-the-subtree shape the content-adjacent rule exists to
prevent, reachable for any node whose first child is an indented paragraph.

The horizontal whitespace run immediately following the split point SHALL be consumed for
EVERY node kind — it separated two words now on different lines and belongs to neither
half. Previously list-item remainders were trimmed and paragraph remainders were not, so a
paragraph split left an invisible leading space with the cursor behind it.

A heading node's INTERIOR split SHALL always produce a CHILD, never a sibling: a heading's
only possible sibling is another heading, and a plain-text split has no heading-sibling
encoding to produce. The content-start case above is not a split — nothing is divided, an
empty node is inserted — and an empty heading at the same level IS encodable, so that case
is exempt from this restriction. The heading keeps its own level, marker and setext-ness,
truncated to the text before the cursor; the text after the cursor becomes a new child,
encoded per the same child-scope kind rule paragraph/list-item parents use (which resolves
to `paragraph` for a heading parent when no list-item donor exists among its children).
When the split-off remainder's kind is `paragraph` and the heading's existing first child
is ALSO a paragraph, the two SHALL be separated by a blank line so they remain distinct
nodes on re-parse. Splitting is scored against a heading's title line only: a split
targeted at a setext heading's underline line SHALL be rejected with `cannot-split`. A
mid-title split of a setext heading SHALL keep the underline attached to the truncated
(upper) heading — the underline is NOT continuation content of the title and SHALL NOT
travel with the split-off remainder.

Atoms SHALL be rejected with `cannot-split`. The operation SHALL satisfy the same
contract as all structural operations: typed rejection or `{tree, edits, cursor}`
where the result re-parses identically from its own encoding, edits reproduce the
encoding, untouched nodes keep verbatim lines, and `cursor` points at the
remainder's content start.

*(Amended 2026-07-21, real-vault manual pass: the original children-stay-up sibling
split made the new node visually jump over the whole subtree — unnatural in content
space.)*

*(Amended 2026-07-24, Q17 heading-Enter decision: headings were previously rejected
outright with `cannot-split`; Enter on a heading instead always inserted a blind
blank line ignoring cursor position, at the `outline-keyboard-grammar` layer. Headings
now split like every other kind, always into a child per the mixed-containment rule.)*

*(Amended 2026-08-07, measured catalogue of 49 cursor positions: a split at a node's
content start demoted the node's own text into a child of an empty parent — for every
heading, and for any list item with children. Insert-before replaces it, and the anchor
moves to the inserted position rather than the node's text. The end-of-node fall-through
and the per-kind whitespace difference were found in the same pass.)*

#### Scenario: Splitting a parent puts the remainder before the children
- **WHEN** `- alpha beta` with a child `- gamma` is split after `alpha `
- **THEN** the tree is `- alpha ` with children `- beta` then `- gamma` — the
  remainder is the first child, not a sibling below the subtree

#### Scenario: Mid-text split of a list item
- **WHEN** a childless `- alpha beta` is split after `alpha `
- **THEN** the encoding contains sibling items `- alpha ` and `- beta`, and
  re-parsing yields exactly that tree

#### Scenario: End-of-node split
- **WHEN** a childless node is split at the exact end of its text
- **THEN** for a list item the new sibling is an empty item node (`- `) with the
  cursor after its marker; for a paragraph — whose empty form has no markdown
  encoding — the gap widens by two blank lines with the cursor on the first,
  and the sibling node materializes when text is typed

#### Scenario: End-of-node split of a node whose child scope is a paragraph
- **WHEN** a list item whose first child is an indented paragraph is split at the exact
  end of its own text
- **THEN** the item's OWN trailing gap widens by two blank lines with the cursor on the
  first — between the item and that paragraph — and nothing is added after the subtree

#### Scenario: Split where a task item's text begins inserts an empty item before it
- **WHEN** `- [ ] bar` with a child is split at the position its text begins — after the
  checkbox
- **THEN** an empty `- [ ] ` is inserted as its preceding sibling, `- [ ] bar` keeps its own
  line, marker, depth and child verbatim, and the anchor is in the new empty item

#### Scenario: A position inside a task marker never divides it
- **WHEN** a task item is split at any position from its list marker's end through its task
  marker's end
- **THEN** every one of them produces the same result as the scenario above, and no result
  contains a partial `[ ]`

#### Scenario: Split at a node's content start inserts an empty sibling before it
- **WHEN** `- alpha` with a child `- child` is split at its content column
- **THEN** an empty `- ` is inserted as its preceding sibling, `- alpha` keeps its own
  lines, depth and child verbatim, and the anchor is in the new empty item

#### Scenario: Split at a heading's content start inserts an empty heading
- **WHEN** `## Hello` is split at any position at or before its content column
- **THEN** an empty `## ` is inserted as its preceding sibling, `## Hello` is
  byte-identical, no child is created, and the anchor is in the new empty heading

#### Scenario: Split at a paragraph's content start widens the gap above
- **WHEN** a paragraph is split at its content start
- **THEN** the gap above it widens by two blank lines, the paragraph is byte-identical,
  and the anchor is the first of those lines

#### Scenario: A task split carries an unchecked marker
- **WHEN** `- [x] done` is split at the end of its text
- **THEN** the new sibling is `- [ ] `, and splitting it mid-text likewise produces
  `- [ ] ` plus the remainder

#### Scenario: The split point's whitespace goes with neither half
- **WHEN** a paragraph `one two` is split after "one", before the space
- **THEN** the halves are `one` and `two`, with no leading space on the second

#### Scenario: Atom split rejected
- **WHEN** splitting is attempted at a position inside a code fence
- **THEN** the operation is rejected with `cannot-split` and nothing changes

#### Scenario: Mid-text split of a childless heading
- **WHEN** a heading `# Hello world` with no children is split after "Hello "
- **THEN** the tree becomes `# Hello ` with a single new paragraph child `world`,
  separated from it by a blank line, and the cursor at the child's content start

#### Scenario: Mid-text split of a heading with existing children
- **WHEN** a heading with an existing paragraph child is split mid-text
- **THEN** the split-off remainder becomes the heading's new FIRST child, placed
  before the existing paragraph child, separated from it by a blank line so both
  remain distinct paragraph nodes on re-parse

#### Scenario: End-of-heading split widens the gap
- **WHEN** a heading whose child scope resolves to `paragraph` is split at the exact end
  of its text (empty remainder)
- **THEN** the heading's own trailing gap widens by two blank lines — the same rule a
  childless paragraph's end-of-node split uses — and the cursor lands on the first,
  blank-separated on both sides, with no child materializing until text is typed

#### Scenario: Setext underline split rejected
- **WHEN** splitting is attempted at a position on a setext heading's underline
  line (`===` or `---`)
- **THEN** the operation is rejected with `cannot-split` and nothing changes

#### Scenario: Mid-title split of a setext heading keeps the underline attached
- **WHEN** a setext heading `Hello world` (underlined `====`) with no children
  is split after "Hello "
- **THEN** the tree becomes a setext heading `Hello ` (still underlined `====`)
  with a single new paragraph child `world` — the underline stays with the
  heading, it does not become part of the remainder or get treated as a
  continuation line of the title
