## ADDED Requirements

### Requirement: Fallback indent unit for brand-new indentation
When a structural operation must materialize indentation with no existing evidence in
the document to infer a unit from (no destination-sibling list item to copy
whitespace from, and no other indented list item anywhere in the document —
`destinationIndent`'s existing-document-inference steps both come up empty), the
operation SHALL accept an optional caller-supplied fallback indent unit and use it
instead of an unconditional default. When no fallback is supplied, the existing
two-space default SHALL still apply, so this is purely additive: no existing behavior
changes unless a caller opts in. Existing-document inference SHALL still take priority
over the fallback whenever it has evidence to act on — the fallback only ever governs
the true no-evidence case.

#### Scenario: No fallback supplied keeps the existing two-space default
- **WHEN** a node is indented under a list-item parent with no existing indented list
  item anywhere in the document, and no fallback indent unit is supplied
- **THEN** the new indentation is two spaces, exactly as before this requirement existed

#### Scenario: A supplied fallback governs brand-new indentation
- **WHEN** the same indent is performed with a caller-supplied fallback of a tab
  character (or a specific space width)
- **THEN** the new indentation uses that exact unit instead of the two-space default

#### Scenario: Existing document indentation still wins over the fallback
- **WHEN** the document already has an indented list item using tabs elsewhere, and a
  node is indented under a list-item parent with no fallback OR a spaces-based
  fallback supplied
- **THEN** the new indentation still infers tabs from the existing document content —
  the fallback never overrides an already-established indentation style

## MODIFIED Requirements

### Requirement: Adjacent-node merge
A `mergeNodes` operation SHALL join a node (`first`) with its immediately following
content-space neighbor (`second`) under a per-kind algebra, appending `second`'s
content directly to the end of `first`'s content — never leaving a continuation-line
remnant standing where the old separation was — consuming `first`'s trailing gap,
and re-parenting `second`'s children under the merged node. Joins that would absorb
a heading (and thereby its section's positional anchor), involve an atom on either
side, or produce markdown that re-parses to a different structure than the merged
tree SHALL be rejected with a typed reason.

*(Amended 2026-07-21 from the original conservative table, per the real-vault manual
pass: cross-kind content joins ARE the expected behavior — a list item's text merges
into its parent paragraph — and children re-parent rather than reject, matching
content-space outliner semantics. See node-edit-enforcement's chrome-transparency
requirement.)*

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

#### Scenario: Tab-indented grandchildren survive a merge without space corruption
- **WHEN** `mergeNodes` absorbs a list item whose own children are indented a full
  tab past the marker (not exactly the marker's own width), and those children have
  further-nested tab-indented children of their own
- **THEN** every re-parented line's indentation is shifted by whole tab units to
  match the merged node's real child column — no line ends up with a mix of spaces
  and tabs, and every re-parented node still parses as the same kind it was before
