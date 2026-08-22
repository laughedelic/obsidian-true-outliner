## ADDED Requirements

### Requirement: Group forms of indent, outdent and reordering

Indent, outdent, move up and move down SHALL each have a GROUP form taking a forest of covered
roots — one contiguous sibling run per parent, in document order, the same input shape
`deleteSubtreeGroups` takes — and returning the same typed result the single-node forms return.

A group operation SHALL preserve the RELATIVE DOCUMENT ORDER of its covered roots, at every
cover shape. "Move these three up" means the three arrive above their neighbour still in the
order the user selected them; an operation that returns them shuffled has not performed the
gesture, whatever else it got right.

Subject to that, the group form's output tree SHALL BE the tree produced by applying the
SINGLE-NODE form to each covered root IN TURN, each step evaluated against the tree the
previous step produced:

- Indent, outdent and move up apply their roots in DOCUMENT ORDER.
- Move down applies its roots in REVERSE document order, because a forward-order move would
  swap a selected root past another selected root rather than past the run's own neighbour.
- Groups apply in document order, topmost first. Groups are independent by construction: a
  forest cover is a document-order interval closed under descendants, so no group's parent can
  be a member of another group.

Move up and move down SHALL additionally require the operand to be a SINGLE group — one
contiguous sibling run under one parent — and SHALL reject a multi-parent forest with
`cannot-reorder-across-scopes`. Indent and outdent carry no such restriction and apply to a
forest of any shape.

The asymmetry is measured, not stylistic. A reorder moves each group WITHIN ITS OWN SCOPE, so
a cover whose roots sit at different depths is scattered rather than moved: on

    L0
    - L1
      - L2
      - L3   <- covered
      - L4   <- covered

    L5       <- covered

move up carries `L5` to the top of the document while `L3` and `L4` shuffle inside `L1`. The
roots end up separated by content that was never selected, which is not a weaker version of
the requested gesture but a different one. Measured over generated documents (20 000 runs per
operation): every accepted multi-parent move up left the roots torn apart (3100 of 3100), while
indent and outdent left them adjacent in every accepted case (3723 and 2577 respectively, none
torn). Multi-parent move down was never accepted at all in 8141 attempts — its last root is its
scope's last child — so it is restricted on the same rule rather than on its own evidence.

Indent and outdent are unaffected because their destination is derived per group from that
group's own previous sibling or parent, and a group's roots stay adjacent under it.

Stating the algebra as a composition rather than as new rules is what keeps the two-regime
per-kind algebra intact without restating it. A heading root still level-shifts and a
non-heading root still reparents under the run's previous sibling; a sibling run mixing the
two gets each root's own rule, with no new rejection for the mixture.

Where the composition would NOT preserve the roots' order, the ORDER rule governs and the
composition does not define the result. The two can conflict because a composition moves one
root at a time, and an intermediate tree need not be REPRESENTABLE: markdown has no encoding
for a list item that follows a paragraph as its sibling, so the re-parse between two steps can
reshape the document under the steps that have not run yet.

Measured on `- L0` / `L1` / `L2`, moving the run `[L1, L2]` up. Step one swaps `L1` above
`- L0`; that encoding re-parses with `- L0` as L1's own child, so step two finds L2's previous
sibling to be `L1` and swaps past it — yielding `L2 / L1 / - L0`, the run reversed. Acting on
the whole run at once yields `L1 / L2 / - L0`, which is the requested gesture.

Every measured disagreement between the two rules has this shape — 49 of 49, always with the
composition losing the order and the whole-run result keeping it, never the reverse — which is
why the order rule is stated first and the composition is subordinate to it rather than the
other way round.

Group forms SHALL emit ONE minimal edit list for the whole transformation, satisfying the
existing minimal-edit guarantee against the ORIGINAL document: lines no root's transformation
semantically requires SHALL be byte-identical, with ordered-run renumbering the same documented
exception it already is. An implementation MAY perform the surgery in one pass rather than
literally re-parsing between steps, but its output tree SHALL equal the composition above.

A group of exactly one root SHALL produce a result identical to the single-node form, edits
included, so no existing behaviour changes when the operand resolves to one node.

#### Scenario: A sibling run indents as a block
- **WHEN** the group indent of `- a` / `- b` / `- c` is invoked for the run `[b, c]`
- **THEN** `b` and `c` both become children of `a`, in that order, after any children `a`
  already had

#### Scenario: A run moves down past its own neighbour, not past itself
- **WHEN** the group move down of `- a` / `- b` / `- c` is invoked for the run `[a, b]`
- **THEN** the result is `- c` / `- a` / `- b` — the run moved below `c` as a unit, with `a`
  and `b` keeping their relative order

#### Scenario: A run moves up past its own neighbour
- **WHEN** the group move up of `- a` / `- b` / `- c` is invoked for the run `[b, c]`
- **THEN** the result is `- b` / `- c` / `- a`

#### Scenario: A run keeps its order where a step-at-a-time composition would reverse it
- **WHEN** the group move up is invoked for the run `[L1, L2]` in `- L0` / `L1` / `L2`, where
  `L1` and `L2` are paragraphs — so an intermediate tree placing `- L0` as a paragraph's
  following sibling has no markdown encoding
- **THEN** the result is `L1` / `L2` / `- L0`, with the run in its original order — not
  `L2` / `L1` / `- L0`, which is what moving one root at a time produces

#### Scenario: A heading run level-shifts
- **WHEN** the group indent is invoked for a run of two sibling headings
- **THEN** each heading and its whole heading subtree shifts one level deeper, exactly as the
  single-node indent does for each

#### Scenario: A mixed-kind run applies each root's own rule
- **WHEN** the group indent is invoked for a run holding both a paragraph and a heading
- **THEN** the paragraph reparents under the run's previous sibling and the heading shifts
  level, matching what applying the single-node operation to each in document order produces

#### Scenario: A mixed-depth cover operates group by group
- **WHEN** the group outdent is invoked for a cover whose roots sit at two different depths,
  so the operand holds two groups
- **THEN** each group outdents within its own parent's scope, and the result equals applying
  the single-node outdent to every root in document order

#### Scenario: A reorder across scopes is rejected
- **WHEN** the group move up is invoked for a cover whose roots sit under two different
  parents
- **THEN** the operation is rejected with `cannot-reorder-across-scopes` and the document is
  unchanged — neither group is moved within its own scope

#### Scenario: A reorder within one scope is unaffected
- **WHEN** the group move up or move down is invoked for a cover whose roots are one
  contiguous sibling run
- **THEN** the run moves as a unit exactly as the composition prescribes

#### Scenario: A single-root group is the single-node operation
- **WHEN** any group form is invoked with exactly one root
- **THEN** its tree, its edits and its anchor are identical to those the single-node form
  produces for that same root

#### Scenario: Group closure
- **WHEN** any group operation is applied to any generated cover of any generated tree
- **THEN** either it is rejected, or `parse(encode(result.tree))` equals `result.tree`,
  applying `result.edits` to the source text yields `encode(result.tree)`, and `result.tree`
  equals the tree the sequential single-node composition produces

### Requirement: A group operation is accepted in full or rejected in full

If ANY step of the composition above rejects, the group operation SHALL reject with THAT step's
typed reason — the first such step in application order — and SHALL leave the tree and document
text unchanged. A group operation SHALL NEVER apply to a subset of its roots.

An empty forest SHALL be rejected with `empty-selection`, the reason multi-root deletion
already uses for the same input.

Partial application is refused for the same reason `deleteSubtrees` refuses a partial-subtree
input: the user issued one gesture over one selection, and a result where some of the selected
nodes moved and others did not is neither what was asked for nor recoverable in one undo of
anything they could name.

#### Scenario: One inexpressible root rejects the whole group
- **WHEN** the group outdent is invoked for a cover holding one top-level root and one nested
  root
- **THEN** the operation is rejected with `at-top-level` and the document is unchanged — the
  nested root is not outdented on its own

#### Scenario: A run already at the head of its scope rejects
- **WHEN** the group move up is invoked for a run whose first root is its parent's first child
- **THEN** the operation is rejected with `no-previous-sibling` and nothing changes

#### Scenario: A heading at the bound rejects the group
- **WHEN** the group indent is invoked for a run containing an h6 heading
- **THEN** the operation is rejected with `at-h6-bound` and no other root in the run is
  indented

#### Scenario: An empty forest is rejected
- **WHEN** any group operation is invoked with no roots
- **THEN** it is rejected with `empty-selection`

### Requirement: An operation result states the span its subjects occupy

An accepted operation's result SHALL additionally state a SUBJECT SPAN: the line range in the
RESULT document that the operation's subjects and their subtrees occupy, from the first
subject's own start line through the last subject's whole-subtree cover end. For a single-node
operation the span is that node's own subtree cover; for a group operation it spans every
moved root.

The span is stated rather than derived because node identity does not survive an operation —
results are freshly re-parsed — so a caller holding pre-operation ids cannot locate the moved
nodes afterward. It is the multi-node counterpart of the existing ANCHOR, which names one
landing position, and it does not replace it: the anchor still answers where a caret would go,
the span answers which nodes the operation acted on.

The span SHALL be CONTIGUOUS and SHALL be an exact whole-subtree cover of the result tree, so a
caller can dispatch it directly as a selection with no further computation.

Contiguity is a CONSEQUENCE of the operand rules above, not an independent hope. For indent and
outdent it holds at any cover shape: each group's roots keep their relative order and stay
adjacent under their destination parent. For the reorders it holds because they accept only a
single sibling run, which is exactly the restriction that rules out the scattering case — the
one shape measured to break it.

#### Scenario: The span covers every moved root
- **WHEN** a group indent moves three sibling subtrees under a previous sibling
- **THEN** the result's span runs from the first moved root's start line through the last
  moved root's subtree cover end

#### Scenario: The span is an exact cover
- **WHEN** any accepted operation reports a span
- **THEN** the range it names is an exact whole-subtree cover under the selection geometry —
  escalating it returns it unchanged

#### Scenario: A single-node operation states its own subtree
- **WHEN** a single node is moved
- **THEN** the span is that node's whole-subtree cover in its new position, and the anchor is
  unchanged from what the operation reported before this requirement existed
