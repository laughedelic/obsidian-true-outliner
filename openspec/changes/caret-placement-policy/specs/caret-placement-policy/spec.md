## ADDED Requirements

### Requirement: One decision procedure places every structural operation's caret
A single pure decision procedure SHALL answer, for every structural operation: given the
operation, the document before and after it, the operation's own structural anchor, and
the pre-operation selection — where the caret goes, and whether that position is
recoverable by mapping or must be recorded in history.

Every dispatch site SHALL obtain its caret from that procedure and SHALL NOT re-derive
it: the outline keyboard grammar, the command-palette commands, and the edit-enforcement
rewrite path. No operation, and no CodeMirror adapter, SHALL decide a caret of its own.
Adapters convert between the procedure's line/column positions and character offsets, and
supply facts the procedure cannot compute (the pre-operation selection head mapped
forward through the change set); they SHALL NOT add rules.

The procedure SHALL distinguish four cases, and nothing else:

- **Derived** (indent, outdent): the pre-operation position mapped forward, used only when
  it is caret-addressable, otherwise the subject rule below.
- **Subject** (move up/down, heading level shift): the operation's subject node, at its
  content start.
- **Exact** (split, merge, structural paste): the position the operation itself computed —
  a join point, a split point, the end of an inserted run — which only the operation
  knows.
- **Deletion**: the convention stated below.

This procedure SHALL NOT decide which positions are addressable; that is
`content-space-caret`'s question, and this procedure consumes its answer.

#### Scenario: Both entry points give the same caret
- **WHEN** the same operation is invoked from its key binding and from the command
  palette, on the same document with the same caret
- **THEN** the resulting caret is identical, because both read it from the same procedure

#### Scenario: The enforcement rewrite path uses the same procedure
- **WHEN** a user edit is rewritten into a structural deletion, merge or paste
- **THEN** the rewritten transaction's caret comes from the same procedure that serves the
  keyboard grammar, not from a rule local to the enforcement layer

#### Scenario: Adding a rule has one place to add it
- **WHEN** a new structural operation is introduced
- **THEN** it states which of the four cases it belongs to and gains a caret with no new
  placement logic at its dispatch site

### Requirement: A deletion leaves the caret at the preceding node's content end
After a structural deletion the caret SHALL land at the content end of the node that
immediately precedes the deleted region in full document order — descending into the
previous sibling's deepest last descendant, which is the node that owns the gap at the
seam. When no node precedes the deleted region, the caret SHALL land at the content start
of the node that follows it. When neither exists, because the document is now empty or
preamble-only, the caret SHALL land at the scope's own start.

This replaces the previous emergent convention, which preferred a FOLLOWING survivor and
fell back to a PRECEDING one, so the caret alternated between the two depending on whether
anything survived below.

The stated convention SHALL agree with the three rules already in force at the same seam:
`content-space-caret` resolves a gap-line position to its owner's content end;
`node-edit-enforcement` places a merge's caret at the join point, immediately after the
surviving node's own last content; and both are where a user resumes typing.

#### Scenario: Deleting a middle node
- **WHEN** a node with both a preceding and a following sibling is deleted
- **THEN** the caret is at the preceding node's content end, not at the following node's
  content start

#### Scenario: Deleting the last node
- **WHEN** the last node under a parent is deleted
- **THEN** the caret is at the preceding node's content end — the same rule as the middle
  case, not a different one

#### Scenario: Deleting the first node
- **WHEN** the first node of the document is deleted and nothing precedes it
- **THEN** the caret is at the content start of the node that follows

#### Scenario: The predecessor is a nested descendant
- **WHEN** the deleted node's previous sibling has children, so the visually preceding line
  belongs to a deep descendant
- **THEN** the caret is at that descendant's content end, not at the previous sibling's own
  content end

#### Scenario: Deleting every node degrades cleanly
- **WHEN** a deletion removes every node in scope
- **THEN** the caret is at the scope's own start and the editor remains usable

#### Scenario: Deletion and merge agree at the same seam
- **WHEN** a node is deleted, and separately the same node is merged into its predecessor
- **THEN** both leave the caret at the predecessor's content end

### Requirement: A structural operation's caret never lands inside a focus-capturing node
The procedure SHALL take a set of FOCUS-CAPTURING node kinds — kinds whose interior the
host renders as a widget carrying its own editor instance and its own undo history. A
caret the procedure places on a node the user did NOT act on — the survivor after a
deletion, the neighbour after a merge — SHALL NOT fall inside such a node.

When the computed landing falls inside one, the procedure SHALL try, in this order: the
following node's content start; then the nearest non-capturing node walking backward in
document order; then the nearest walking forward. When every candidate is capturing, the
computed position stands, and that residual SHALL be documented rather than silently
handled.

The set SHALL be a stated input with recorded evidence, not an inference from node kind.
It contains `table` on the measured evidence that Obsidian's Live Preview mounts a
separate nested editor for a table cell. Adding a kind SHALL require the same kind of
measurement.

This rule cannot be expressed through addressability: `content-space-caret` states
explicitly that an atom's own lines ARE addressable, and that remains true — a user may
still move the caret into a table by their own gesture. What is forbidden is an OPERATION
leaving it there.

#### Scenario: Deleting the node after a table
- **WHEN** the node immediately following a table is deleted, so the preceding-node
  convention would land the caret inside the table
- **THEN** the caret lands outside the table instead, and undo remains available in the
  note's own editor

#### Scenario: A user gesture into a table is unaffected
- **WHEN** the user moves the caret into a table with the arrow keys or a click
- **THEN** the caret goes there, exactly as `content-space-caret` specifies

#### Scenario: Every candidate is capturing
- **WHEN** a deletion between two tables leaves no non-capturing candidate
- **THEN** the computed position stands, and the case is recorded as a known residual
  rather than producing an invalid position

### Requirement: A dispatched caret is recorded exactly when mapping cannot reproduce it
Whether a structural operation's caret is recorded into CodeMirror's undo history SHALL be
a property of the DISPATCH, not of the operation: the caret SHALL be recorded whenever the
position being dispatched is not the position CodeMirror's history would recompute by
mapping the pre-operation selection forward through the change set.

This SHALL be decided by comparison against CodeMirror's own mapping, using the same
association the history's redo restore hardcodes, rather than by consulting a list of
operation names. A list keyed on the operation is insufficient in a way that is already
measurable: when indent or outdent falls back to the operation's own cursor because the
mapped position would not be addressable, that particular dispatch is choosing a cursor,
and a per-operation list leaves it unrecorded.

The rule SHALL subsume the previous per-operation set exactly — a chosen caret never
equals the mapped one, a derived caret always does — so no operation that is recorded
today stops being recorded.

#### Scenario: A move is recorded
- **WHEN** a node is moved and the dispatched caret follows it, which mapping cannot
  reproduce
- **THEN** the caret is recorded, and redo restores it at any depth

#### Scenario: An ordinary indent is not recorded
- **WHEN** Tab indents a node and the dispatched caret is the mapped position
- **THEN** nothing is recorded, and redo recomputes the same position by mapping

#### Scenario: An indent that falls back IS recorded
- **WHEN** Tab or Shift+Tab acts with a whole-block cover selected, so the mapped position
  would not be addressable and the operation's own cursor is dispatched instead
- **THEN** that dispatch is recorded, and a redo restores the fallback position rather
  than recomputing the non-addressable mapped one

#### Scenario: The rule cannot drift from the dispatch sites
- **WHEN** a dispatch site changes which caret it dispatches
- **THEN** the recording decision follows automatically, with no list to update

### Requirement: Every caret this plugin dispatches is addressable
Every caret position dispatched by a structural operation, from any dispatch site, SHALL
be caret-addressable per `content-space-caret`. This SHALL be verified over generated
documents and operation sequences, not only for enumerated cases.

The property is stated here rather than only in `content-space-caret` because the places
that PRODUCE a caret are not all obvious — the mapped cursor, the enforcement rewrites'
cursor, the operations' own anchors, and whatever the history recomputes — and each has
introduced a violation of it at least once.

#### Scenario: Generated documents and operations
- **WHEN** structural operations are applied to generated trees at arbitrary depths
- **THEN** no dispatched caret falls on a gap line or inside a list item's marker prefix

#### Scenario: A block cover as the operand
- **WHEN** an operation is invoked while a whole-subtree cover is selected, whose head
  sits on the trailing gap line the cover owns
- **THEN** the dispatched caret is still addressable

### Requirement: A caret's content start has one definition
Where the procedure places a caret at a node's content start, it SHALL use
`content-space-caret`'s content boundary — the one that treats a heading's `#` prefix as
ordinary content — and not the marker boundary the structural operations use for their own
purposes.

Consequence, and a deliberate behaviour change: after a structural operation on a heading
the caret SHALL sit at column 0, before the `#` characters, matching where Home puts it on
the same line. On a list item whose content itself begins with `#`, the caret SHALL sit
after the list marker and before the `#`.

The operations' own marker boundary is unchanged and keeps its other callers — split-point
clamping, chrome recognition, transaction classification, and the selection ladder. They
ask about markers, not about where a caret may sit.

#### Scenario: Moving a heading
- **WHEN** a heading is moved up or down
- **THEN** the caret is at column 0 of the heading's line, the same position Home gives,
  rather than after the `#` and its space

#### Scenario: A list item whose text starts with a hash
- **WHEN** a list item reading `- # title` is moved
- **THEN** the caret is after the `- ` marker and before the `#`

#### Scenario: The selection ladder is unaffected
- **WHEN** progressive select-all runs on a heading
- **THEN** its covers are unchanged by this requirement
