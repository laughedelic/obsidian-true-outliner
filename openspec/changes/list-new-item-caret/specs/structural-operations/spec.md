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

### Requirement: Adjacent-node merge
A `mergeNodes` operation SHALL join a node (`first`) with its immediately following
content-space neighbor (`second`) under a per-kind algebra, appending `second`'s
content directly to the end of `first`'s content — never leaving a continuation-line
remnant standing where the old separation was — consuming `first`'s trailing gap,
and re-parenting `second`'s children under the merged node. Joins that would absorb
a heading (and thereby its section's positional anchor), involve an atom on either
side, or produce markdown that re-parses to a different structure than the merged
tree SHALL be rejected with a typed reason.

When `first` is a heading, the merged node's trailing gap SHALL instead be whichever
of `first`'s or `second`'s own trailing gap has MORE lines, rather than
unconditionally `second`'s. A heading's own gap is its established separation from
its content — a section-level property, not a property of whichever node happened to
be absorbed — and SHALL NOT be silently shrunk merely because the absorbed node's own
gap happened to be smaller (e.g. two adjacent list items needing no separation from
each other). This preserves the ordinary (non-heading `first`) convention unchanged:
only a heading `first` triggers the comparison, and even then `second`'s gap still
wins whenever it is the longer of the two (e.g. when `second` is the document's own
terminal node and carries the file's trailing-newline representation).

*(Amended 2026-07-21 from the original conservative table, per the real-vault manual
pass: cross-kind content joins ARE the expected behavior — a list item's text merges
into its parent paragraph — and children re-parent rather than reject, matching
content-space outliner semantics. See node-edit-enforcement's chrome-transparency
requirement.)*

*(Amended 2026-07-24, found via manual testing of the heading-Enter-splits-paragraph
change: merging content into a heading then later splitting back out was silently
shrinking the heading's own gap to whatever the absorbed node's gap happened to be —
root cause predates that change, surfaced by it.)*

Re-parented children's indentation SHALL be shifted to match the merged node's ACTUAL
child indentation — sampled from a real surviving sibling child when one exists —
rather than an assumed marker-width-aligned column formula. Many documents (tab-
indented ones especially) indent children further than the formula assumes (e.g. a
full tab past the marker rather than exactly its width), and shifting by the wrong
delta corrupts a pure-tab-indented subtree with spaces at the fractional remainder.

"Immediately following content-space neighbor" is the node's document-order
successor: its own first child if it has one, else its next sibling, else the
nearest ancestor's next sibling (`rawSuccessorPath`) — the same node whose content
begins nearest below `first`'s content end, regardless of intervening gap lines.

Preconditions checked before the kind table: no following neighbor at all (last
node in the document) rejects with `no-following-neighbor`.

The per-kind merge table (rows = `first`, columns = `second`), pinned by
implementation and exercised by the property suite:

| First ＼ Second | paragraph / list-item | heading | atom |
|---|---|---|---|
| **paragraph / list-item** | join: `second`'s first content line (its list marker stripped, and a TASK marker with it) appends to `first`'s last content line; `second`'s continuation lines become `first`-kind continuations; `first` keeps its own kind and marker; `second`'s children re-parent under the merged node at `second`'s former position, re-encoded for the new scope | reject `merge-not-expressible` — absorbing a heading destroys its section's positional anchor | reject `merge-not-expressible` — atoms are opaque units |
| **heading** | join iff `second`'s content is a single line: it appends to the heading's text line, and `second`'s children re-parent as section children; multi-line content rejects `merge-not-expressible` (a markdown heading cannot hold continuation lines) | reject `merge-not-expressible` | reject `merge-not-expressible` |
| **atom** | reject `merge-not-expressible` | reject `merge-not-expressible` | reject `merge-not-expressible` |

#### Scenario: Paragraph merge appends at content end
- **WHEN** `mergeNodes` joins two paragraphs separated by a blank gap line
- **THEN** the result is one paragraph node whose last content line is the direct
  concatenation of the two texts, the gap is gone, and all other lines are
  byte-identical

#### Scenario: Cross-kind join keeps the survivor's encoding
- **WHEN** `mergeNodes` joins a paragraph with its first child list item
- **THEN** the item's text (marker stripped) appends to the paragraph's text, the
  merged node stays a paragraph, and the item's children re-parent under it

#### Scenario: Children re-parent instead of rejecting
- **WHEN** `mergeNodes` absorbs a node that has children of its own
- **THEN** those children keep their order and relative structure under the merged
  node, re-encoded for the new scope, and the result re-parses to exactly that tree

#### Scenario: Single-line content joins a heading
- **WHEN** `mergeNodes` joins a heading with a following single-line paragraph
- **THEN** the paragraph's text appends to the heading's title line; a multi-line
  paragraph in the same position is rejected with `merge-not-expressible`

#### Scenario: A heading absorbing content keeps its OWN gap when it is the longer one
- **WHEN** a heading with a real blank-line gap before its content absorbs a child
  whose own trailing gap is empty (e.g. the child was itself tightly adjacent to a
  following sibling)
- **THEN** the merged heading's trailing gap is the heading's own original gap, not
  the absorbed child's — whatever follows stays separated from the heading exactly
  as it was before the merge

#### Scenario: A heading absorbing its own terminal child still keeps that child's gap
- **WHEN** a heading with NO gap of its own absorbs a child that is the document's
  own last node (whose trailing gap carries the file's trailing-newline
  representation)
- **THEN** the merged heading's trailing gap is the absorbed child's (the longer of
  the two), unchanged from before this amendment

#### Scenario: Tab-indented grandchildren survive a merge without space corruption
- **WHEN** `mergeNodes` absorbs a list item whose own children are indented a full
  tab past the marker (not exactly the marker's own width), and those children have
  further-nested tab-indented children of their own
- **THEN** every re-parented line's indentation is shifted by whole tab units to
  match the merged node's real child column — no line ends up with a mix of spaces
  and tabs, and every re-parented node still parses as the same kind it was before

A task marker on the ABSORBED node SHALL be stripped along with its list marker. It states
something about a node that is ceasing to exist, and carrying it into the survivor's text
produces a literal `[ ]` mid-line — neither a checkbox nor anything the user wrote. The
SURVIVOR keeps its own marker, task marker included, exactly as it keeps its own kind.

#### Scenario: An absorbed task item's box goes with its marker
- **WHEN** `- [ ] bar` is merged into `- [x] foo`
- **THEN** the result is `- [x] foobar` — the survivor's own box is unchanged and no `[ ]`
  appears in its text
