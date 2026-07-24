## MODIFIED Requirements

### Requirement: Node split
`splitNode(doc, nodeId, position)` SHALL split a paragraph, list-item, or heading
node at a document position within its text. For a paragraph or list-item node WITH
children, the remainder SHALL become the node's new FIRST CHILD — the position
content-adjacent to the split point — encoded per the child scope's kind rules (a
paragraph parent's new child becomes a list item when its existing children are
list items, per the attachment rule). For a paragraph or list-item node with NO
children, the remainder becomes the next sibling of the same kind, as before: list
items reuse the original's marker style (ordered runs renumber); paragraphs gain
the separating blank line the boundary rules require; an end-of-paragraph split
yields only the blank separation with the cursor on it (an empty paragraph has no
markdown encoding).

A heading node SHALL ALWAYS split into a CHILD, never a sibling, regardless of
whether it already has children — a heading's only possible sibling is another
heading, and a plain-text split has no heading-sibling encoding to produce. The
heading keeps its own level, marker, and setext-ness, truncated to the text before
the cursor; the text after the cursor becomes a new paragraph child, encoded per the
same child-scope kind rule paragraph/list-item parents already use (which resolves
to `paragraph` for a heading parent when no list-item donor exists among its
children). When the split-off remainder's kind is `paragraph` and the heading's
existing first child is ALSO a paragraph, the two SHALL be separated by a blank
line so they remain distinct nodes on re-parse instead of merging into one
paragraph. When the remainder is empty (cursor at the heading's end, or only
trailing whitespace follows), the heading's own trailing gap SHALL widen exactly as
the childless-paragraph end-of-node case does, with the cursor on the resulting
blank-separated line; the child materializes only once text is typed. Splitting is
scored against a heading's title line only: a split targeted at a setext heading's
underline line SHALL be rejected with `cannot-split`. A mid-title split of a setext
heading SHALL keep the underline attached to the truncated (upper) heading — the
underline is NOT continuation content of the title and SHALL NOT travel with the
split-off remainder.

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
  encoding — the split yields only the blank separation with the cursor on it,
  and the sibling node materializes when text is typed

#### Scenario: Atom split rejected
- **WHEN** splitting is attempted at a position inside a code fence
- **THEN** the operation is rejected with `cannot-split` and nothing changes

#### Scenario: Mid-text split of a childless heading
- **WHEN** a heading `# Hello world` with no children is split after "Hello "
- **THEN** the tree becomes `# Hello ` with a single new paragraph child `world`,
  and the cursor sits at the new paragraph's content start

#### Scenario: Mid-text split of a heading with existing children
- **WHEN** a heading with an existing paragraph child is split mid-text
- **THEN** the split-off remainder becomes the heading's new FIRST child, placed
  before the existing paragraph child, separated from it by a blank line so both
  remain distinct paragraph nodes on re-parse

#### Scenario: End-of-heading split widens the gap
- **WHEN** a heading is split at the exact end of its text (empty remainder)
- **THEN** the heading's own trailing gap widens by two blank lines (the same
  rule a childless paragraph's end-of-node split uses, and one more blank line
  than this operation's pre-amendment `insertionPlan`-based behavior inserted)
  and the cursor lands on the first one, blank-separated on both sides — no
  child materializes until text is typed

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
| **paragraph / list-item** | join: `second`'s first content line (marker stripped) appends to `first`'s last content line; `second`'s continuation lines become `first`-kind continuations; `first` keeps its own kind and marker; `second`'s children re-parent under the merged node at `second`'s former position, re-encoded for the new scope | reject `merge-not-expressible` — absorbing a heading destroys its section's positional anchor | reject `merge-not-expressible` — atoms are opaque units |
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
