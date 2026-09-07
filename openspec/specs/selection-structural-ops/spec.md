# selection-structural-ops Specification

## Purpose
Defines what a structural operation ACTS ON when the selection is not a bare caret, and what
the selection is once it has run: the operand is the selection's covered subtrees rather than
the node under its head, and a selection that was a block cover survives the operation as the
cover of the nodes that moved. One rule, read by the keyboard grammar and the command palette
alike, so the two entry points cannot answer the question differently.
## Requirements
### Requirement: A structural operation's operand is the selection's covered subtrees

Indent, outdent, move up and move down SHALL resolve their operand from the CURRENT SELECTION,
not from the node at the selection's head. The operand is the covered roots of that selection —
the forest of whole subtrees `node-selection-enforcement` computes for the range — presented as
one contiguous sibling run per parent, in document order, in the same grouping multi-root
deletion already consumes.

The rule SHALL be stated over the selection alone and SHALL NOT consult, record, or infer how
the selection was produced, matching `node-selection-extension` and `progressive-select-all`.
A cover reached by dragging, by Shift+Arrow, by Mod+A, or by undo behaves identically.

Three inputs resolve to a single root, which is what keeps every existing single-node behaviour
byte-identical:

- An EMPTY selection resolves to the node whose line span contains the caret line, exactly as
  before this capability existed.
- A range that is NOT an exact cover — an ordinary character selection inside one node's own
  content — SHALL first be escalated by `node-selection-enforcement`'s own geometry, which
  yields that node's cover. The operand is that one root.
- An exact cover with one root is that root.

A selection whose range lies outside node jurisdiction — the preamble — SHALL leave the
operation declined and stock behaviour in place, unchanged from today.

Reading the operand from the head was not merely incomplete, it was arbitrary: a cover's head
is whichever end the extension grew from, so the same three selected items indented a
different node depending on whether they were selected upward or downward.

#### Scenario: A multi-node cover indents every covered subtree
- **WHEN** the selection covers three sibling list items, the first of which has a previous
  sibling, and indent is invoked
- **THEN** all three become children of that previous sibling, in their original order, after
  any children it already had — not just the item under the selection's head

#### Scenario: A backward selection gives the same operand as a forward one
- **WHEN** the same two subtrees are selected by extending downward, and then by extending
  upward from the other end, and indent is invoked on each
- **THEN** the resulting document is byte-identical in both cases

#### Scenario: A bare caret is unchanged
- **WHEN** the selection is empty and any structural operation is invoked
- **THEN** the operand is the node at the caret line and the document change is byte-identical
  to what the same operation produced before this capability existed

#### Scenario: A within-node text selection is unchanged
- **WHEN** a character range lying inside one node's own content is selected and indent is
  invoked
- **THEN** exactly that node is indented, as before, and the range's own endpoints have no
  effect on which node is chosen

#### Scenario: A cover's provenance does not matter
- **WHEN** the same cover is reached by Shift+ArrowDown, by Mod+A, and by dragging, and the
  same operation is invoked from each
- **THEN** the three results are identical

### Requirement: A block selection survives the operation

Where the pre-operation selection was an exact block cover, an accepted operation SHALL
dispatch the cover of the MOVED SUBTREES in the resulting document, so the same nodes remain
selected and a repeated press keeps acting on them. This selection SHALL be an exact cover
under `node-selection-enforcement`'s geometry, so the transaction filter's escalation leaves
it unchanged and no correction follows the dispatch.

It SHALL be a SINGLE range. That is not an extra constraint on this rule but a consequence of
`structural-operations`' operand rules: indent and outdent leave a cover's roots adjacent at any
depth, and the reorders accept only a single sibling run — the restriction that exists precisely
because a multi-scope reorder scatters the roots. A block selection is told from a multi-cursor
one by holding exactly one range, so an operation that returned several would leave the editor in
a state neither this capability nor `node-selection-extension` can read back.

Where the pre-operation selection was NOT a cover — a bare caret, or a character range within
one node — the dispatch SHALL state a CARET decided by `caret-placement-policy`, exactly as
today. The discriminator is the shape of the selection the operation acted on, not the number
of roots it resolved to: a single-root cover keeps its cover, and a within-node range keeps
its caret.

The moved subtrees are identified through the operation's own reported SUBJECT SPAN rather
than by node identity, which does not survive an operation's re-parse.

The cover is recomputed from the RESULT tree, so it takes whatever those subtrees have become.
Where an operation re-parents other nodes beneath a moved root — outdent, which adopts the
former following siblings — the recomputed cover includes them, because they are now part of a
covered subtree.

#### Scenario: Repeated presses keep acting on the same nodes
- **WHEN** a cover over three sibling subtrees is indented, and indent is invoked again without
  any intervening selection change
- **THEN** the second press indents the same three subtrees again — the selection was not lost
  after the first

#### Scenario: The dispatched selection needs no escalation
- **WHEN** any structural operation dispatches a cover
- **THEN** the transaction filter applies no selection correction to it, and the settled
  selection is byte-identical to what the dispatch stated

#### Scenario: A single-root cover keeps its cover
- **WHEN** one Shift+ArrowDown selects a node's whole subtree and indent is invoked
- **THEN** the selection afterward is that subtree's cover in its new position, not a caret

#### Scenario: A within-node selection still yields a caret
- **WHEN** a character range inside one node is selected and indent is invoked
- **THEN** the dispatch states a caret from `caret-placement-policy` — the mapped pre-operation
  position — and no block chrome appears

#### Scenario: A rejected operation leaves the selection alone
- **WHEN** move up is invoked over a cover whose roots sit under two different parents, and the
  operation is rejected
- **THEN** the document and the selection are both unchanged and one cue appears — the cover the
  user built is still selected afterward

#### Scenario: Re-parented nodes join the recomputed cover
- **WHEN** a node with following siblings under the same parent is outdented from a
  single-root cover, so those siblings become the outdented node's own children
- **THEN** the selection afterward covers the outdented subtree including its new children

### Requirement: Both entry points resolve one operand and one after-state

The keyboard bindings and the command-palette commands SHALL resolve their operand and their
after-state through this capability's rules and SHALL NOT re-derive either. Invoked on the
same document with the same selection, the two SHALL produce an identical document and an
identical resulting selection.

ONE existing exception, which this capability does not introduce and cannot close: where an
operation materializes brand-new indentation and the document holds no indentation evidence to
infer from, the keyboard path supplies the editor's live indent unit while the command path
cannot. Obsidian's public `Editor` API exposes no route to CodeMirror's `indentUnit` facet, so
the commands fall back to the two-space default (`src/plugin/main.ts`). The two paths then
differ by that unit alone — the tree, the operand and the resulting selection are the same. It
is stated here rather than left to a code comment, because "the two agree" is otherwise read as
unconditional.

A structural operation over a cover SHALL dispatch as ONE transaction forming ONE undo step,
with the same `userEvent` annotation its single-node form carries, so classification,
enforcement and history treat it exactly as they treat the single-node case. Where the
dispatched selection is not what mapping the pre-operation selection forward would produce, it
SHALL be recorded by the existing rule in `caret-placement-policy` — which already compares
whole selections, and therefore needs no separate rule for covers.

#### Scenario: Palette and keyboard agree
- **WHEN** indent is invoked over the same multi-node cover from Tab and from the command
  palette, in a document that already has indentation to infer a unit from
- **THEN** the resulting document and the resulting selection are identical

#### Scenario: The two differ only by the indent unit, only where there is nothing to infer from
- **WHEN** the same indent runs in a document with NO existing indented list item, so the unit
  is not inferable, and the editor's configured unit is a tab
- **THEN** both paths move the same nodes to the same places and dispatch the same selection,
  and the only difference is the indentation characters the new level is written with

#### Scenario: One undo step reverts the whole group
- **WHEN** a cover over several subtrees is indented and undo is invoked once
- **THEN** the document returns byte-identically to its pre-operation state

#### Scenario: Redo restores the group's own selection
- **WHEN** a cover is moved, then undone, then redone
- **THEN** the selection after redo is the cover the operation dispatched, not a selection
  recomputed by mapping

### Requirement: Several ranges decline

With a selection of MORE THAN ONE range, a structural operation SHALL decline: the keyboard
binding SHALL fall through to stock behaviour and the command SHALL be unavailable, leaving
the document, the selection and the undo history untouched. Both entry points SHALL answer
alike.

This is the existing keyboard behaviour, stated here so the command path matches it rather
than silently acting on one range. Structural edits from several independent ranges interact
in the document, which is a separate design question; declining is the honest answer until it
is answered.

#### Scenario: Multi-cursor Tab is stock
- **WHEN** two carets sit in different nodes and Tab is pressed
- **THEN** the outline binding declines and stock behaviour runs, with no structural operation
  performed on either

#### Scenario: The command is unavailable under multi-cursor
- **WHEN** two carets sit in different nodes and a structural command is invoked from the
  palette or its hotkey
- **THEN** nothing happens — the document, selection and undo history are unchanged

### Requirement: An operand that would leave the zoom scope is refused
While a zoom scope is active (`outline-zoom`), a structural operation SHALL be refused — with no
document change and no selection change — when its result would place any node outside the zoom
root's whole subtree.

The check SHALL be made over the RESOLVED OPERAND, not over a single node: an operation SHALL be
refused when ANY covered root of the operand is the zoom root itself, and an outdent SHALL be
refused when any covered root is a direct child of the zoom root. A multi-root operand whose
first root is safe and whose last root would escape SHALL be refused as a whole; the operation
SHALL NOT be applied to the roots that happen to be safe.

The check SHALL live at the single site where the operand and the after-state are resolved, so
the keyboard and the command-palette entry points cannot disagree about it, exactly as they
cannot disagree about the operand itself.

The refusal SHALL carry a typed rejection reason of its own, distinct from the reasons the
operations already produce for their own algebra, and SHALL surface through the existing
rejection-feedback path. An operation the algebra rejects for its own reason SHALL keep that
reason rather than acquiring this one.

An operand lying wholly inside the zoom root's subtree SHALL be unaffected: indent, outdent
between the scope's own levels, move up and move down all behave exactly as they do with no zoom.

#### Scenario: Outdenting a direct child of the zoom root is refused
- **WHEN** the selection covers a direct child of the zoom root and outdent is invoked
- **THEN** the document is unchanged and the cue names the zoomed view as the reason

#### Scenario: A multi-root operand is refused as a whole
- **WHEN** the selection covers three sibling subtrees that are direct children of the zoom root
  and outdent is invoked
- **THEN** none of the three moves — the operation is refused rather than applied to a subset

#### Scenario: An operation on the zoom root itself is refused
- **WHEN** the operand resolves to the zoom root and any of indent, outdent, move up or move down
  is invoked
- **THEN** the document is unchanged and the cue is shown

#### Scenario: Both entry points agree
- **WHEN** the same operation is invoked at the same selection from its keyboard binding and from
  the command palette
- **THEN** both are refused with the same reason, or both apply

#### Scenario: An operand inside the scope is untouched
- **WHEN** the selection covers subtrees strictly inside the zoom root's subtree and any
  structural operation is invoked
- **THEN** it applies exactly as it does with no zoom, including its after-state selection

#### Scenario: An algebra rejection keeps its own reason while zoomed
- **WHEN** an operation inside the scope is rejected by its own algebra — for instance an indent
  with no previous sibling
- **THEN** the cue is that operation's own message, not the zoom-scope one

