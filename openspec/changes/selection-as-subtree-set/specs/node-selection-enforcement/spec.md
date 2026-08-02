## REMOVED Requirements

### Requirement: Boundary-crossing selections escalate to whole sibling subtrees
**Reason**: The rule's defining mechanism — expanding a crossing range to the contiguous run
of children of the ends' deepest common ancestor scope — is what this change removes, and the
requirement's name asserts it ("whole SIBLING subtrees"). Covered roots may now sit at
different depths and are not siblings, so the requirement is replaced rather than amended.

**Migration**: Superseded by "Boundary-crossing selections escalate to a forest of whole
subtrees" below, which keeps every guarantee the original's recorded rationale argued for —
a selection is always a set of whole subtrees, and every later operation on it has a valid
target — while dropping the outward expansion that rationale never justified. Everything the
original gained after this change was drafted is carried forward verbatim into the
replacement: the keymap-jurisdiction paragraph, the "A raw crossing range from any other
source still escalates" scenario, and the **Covered by** note re-pointing keyboard extension
at `node-selection-extension`. Only the cover's shape changes.

## ADDED Requirements

### Requirement: Boundary-crossing selections escalate to a forest of whole subtrees
In outline mode, when a `selection-only` transaction contains a non-empty range whose anchor
and head resolve to different nodes of the parsed tree, the filter SHALL replace that range
with the FOREST SPAN of the two ends:

- Let `firstNode` and `lastNode` be the two ends' nodes in document order.
- If one is an ancestor of the other, the span is the ANCESTOR's whole subtree cover.
- Otherwise the span's COVERED ROOTS are the maximal subtrees of the document-order run from
  `firstNode` to `lastNode` closed under descendants: take that run, add every descendant of
  every member, and the roots are the members whose parent is not itself a member. The span
  runs from the first root's subtree start to the last root's subtree end, which includes that
  root's owned trailing gap in full. The roots MAY sit at different depths.

Equivalently, and this is the form to check an implementation against: the span begins at
`firstNode`'s own subtree start, and ends at the subtree end of the OUTERMOST ancestor-or-self
of `lastNode` whose own start line is at or after that beginning. The start needs no such
qualification — every ancestor of `firstNode` begins above it, so none can fall inside the
span. The end does, and the qualifier is what distinguishes the two cases the rule must tell
apart:

- An ancestor that begins ABOVE the span is excluded, so crossing between two children of one
  parent does NOT reach that parent's later children.
- An ancestor whose own line falls INSIDE the span is included with its whole subtree, so
  a span that swallows a node's line also swallows its descendants below `lastNode`.

The end bound SHALL NOT be stated as "`lastNode`'s own subtree end". That under-expands
whenever an ancestor of `lastNode` begins inside the span: it would select that ancestor's
entire line while leaving its later children out, which is the downward-closure violation this
requirement exists to forbid, and would orphan those children on deletion.

The span is always a SINGLE CONTIGUOUS text range. Node order is text order and subtree covers
tile the document, so a document-order run closed under descendants is an interval in document
order, and an interval in document order is contiguous text. Every ancestor of a covered node
either sits entirely above the span or is itself covered with its whole subtree — never split
across it — so nothing needs bridging.

The governing invariant is DOWNWARD CLOSURE: **no node is ever selected without its whole
subtree.** The filter SHALL NOT expand a crossing range outward to a common ancestor's sibling
run — crossing out of a scope no longer pulls that scope's own root into the selection. A
covered node's owned trailing gap is never partially included: reaching any point of a node's
own content is enough to pull its whole gap into the cover.

*(Amendment 2026-07-25, `selection-as-subtree-set`: the replaced requirement expanded to the
contiguous run of children of the deepest common ancestor scope. Its recorded rationale — that
selecting a heading without its section, or an item without its children, has no valid
structural meaning — argues for downward closure only. The outward expansion was a consequence
of the common-ancestor formulation rather than a decision, and it made a single Shift+ArrowDown
from a subtree's last child select the whole document.)*

This requirement governs ranges the filter RECEIVES: pointer drags, stale or programmatically
restored ranges, and any other gesture that produces a raw boundary-crossing range. It does not
govern `Shift+ArrowUp`/`Shift+ArrowDown`, which `node-selection-extension` intercepts at the
keymap and which dispatch exact covers this layer leaves unchanged. (Carried forward unchanged
from the replaced requirement — this change alters the cover's SHAPE, not which gestures reach
the filter.)

#### Scenario: Crossing out of a scope does not pull in the parent
- **WHEN** a selection runs from inside the last child of a subtree into the following node,
  which is that subtree's parent's next sibling
- **THEN** the selection covers exactly those two subtrees, and the parent's own line is NOT
  part of it

#### Scenario: Crossing between two siblings does not reach their later siblings
- **WHEN** a selection runs from inside one child of a parent into the next child, where the
  parent has further children after both
- **THEN** the selection covers exactly those two children's subtrees — the parent's later
  children are not included, since the span ends at the second child's own subtree end

#### Scenario: Drag from mid-paragraph into the next paragraph
- **WHEN** the user drag-selects from the middle of one paragraph node into the middle of the
  next sibling paragraph
- **THEN** the selection becomes both paragraphs in full, including the second paragraph's own
  trailing gap

#### Scenario: An end inside an ancestor still covers the whole subtree
- **WHEN** a selection starts inside a heading's text and ends inside a paragraph within that
  heading's section
- **THEN** the selection covers the heading's entire subtree, since one end's node is an
  ancestor of the other's

#### Scenario: Roots may sit at different depths
- **WHEN** a selection covers a deeply nested item and a following top-level item
- **THEN** both are covered as whole subtrees at their own depths, and no common ancestor is
  added to make them siblings

#### Scenario: An ancestor swallowed mid-span brings its later children with it
- **WHEN** a selection runs from inside a nested item under one top-level node to inside the
  FIRST child of a later top-level node, which has further children after that child
- **THEN** the later top-level node is covered as a whole subtree, including the children below
  the end point — its own line is inside the span, so downward closure takes its whole subtree
  rather than ending at the node the drag stopped in

#### Scenario: A raw crossing range from any other source still escalates
- **WHEN** a `selection-only` transaction applies a range crossing from inside one node into
  the next by some means other than the extension keymap — a pointer drag, or a restored range
  that later becomes user-owned
- **THEN** the resulting selection is the forest span of the two ends, including the last
  root's owned trailing gap

#### Scenario: Reaching a node's content is enough, no second drag onto its gap needed
- **WHEN** the user drag-selects from the middle of one node's text to the middle of the next
  sibling node's text, stopping there without continuing onto that sibling's blank trailing gap
  line
- **THEN** the selection already includes the second node's whole owned trailing gap

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (forward/backward drags,
heading-subtree, cross-scope crossing, sibling crossing with later siblings present,
ancestor-swallowed-mid-span); `tests/escalate.test.ts` (forest-span computation,
downward-closure and contiguity properties over generated trees). Keyboard extension is covered
by `node-selection-extension`'s own suites instead.
