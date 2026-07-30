# editor-structural-commands Specification

## Purpose
Defines the editor-facing commands that expose mapping-core's structural operations
(indent, outdent, move up, move down) inside Obsidian: how a command resolves its target
node from the cursor, dispatches the resulting edits as a single transaction, places the
cursor afterward, and surfaces rejection feedback without touching the document.
## Requirements
### Requirement: Four structural commands
In outline mode the plugin SHALL provide four commands — indent node, outdent node, move
node up, move node down — with no default hotkeys (per plugin guidelines). Each command
SHALL resolve the target node as the mapping-core node whose line span contains the
cursor line, and apply the corresponding mapping-core operation.

#### Scenario: Indent at cursor
- **WHEN** the cursor is on any line of a node with a previous sibling and the indent
  command runs
- **THEN** the document text changes exactly as the mapping-core `indent` op prescribes
  for that node

### Requirement: Single-transaction dispatch with undo grouping
An accepted operation's minimal edit list SHALL be applied as one editor transaction via
the public `Editor` API: one undo step reverts the whole structural operation, and no
lines outside the edit ranges are touched.

#### Scenario: One undo step per op
- **WHEN** a structural command succeeds and undo is invoked once
- **THEN** the document returns byte-identically to its pre-command state

### Requirement: Cursor follows the operation's result
After an accepted operation the cursor SHALL be placed by `caret-placement-policy`, the
single decision procedure the keyboard grammar and the enforcement rewrite path also use,
so no two entry points can diverge. This requirement states which case each command falls
into; it does not restate the rule.

MOVE is a SUBJECT placement: the moved node's first line, at its content start — its
position is a choice no mapping can reproduce. Following `caret-placement-policy`'s single
content-start definition, a moved HEADING's caret sits at column 0, before the `#`
characters, which are ordinary content; a moved list item's sits after its marker.

INDENT and OUTDENT are DERIVED placements: the pre-command caret mapped forward through
the operation's change set, preserving the column the user was at rather than resetting to
the node's content start, and falling back to the subject placement when the mapped
position would not be caret-addressable.

*(Amendment 2026-07-28, `minimal-changesets-for-structural-ops`: this requirement
previously mandated the content-column placement for EVERY command, which the
column-preserving indent/outdent behaviour supersedes. Amendment 2026-07-29,
`caret-placement-policy`: the rule itself moves to that capability, and the content-start
column for a heading changes from after its `#` prefix to column 0 — the code had never
matched this requirement's own "after any list marker" wording for headings.)*

**Why a palette command uses two transactions.** It applies its change and its cursor
separately, because a selection-only transaction between two commands is what keeps them
as separate undo steps — `Editor.transaction` carries no `userEvent`, and CodeMirror joins
adjacent `userEvent`-less changes into one history event otherwise. This structure is
retained deliberately; only the placement RULE is shared with the keyboard path.

That separate cursor transaction does record the cursor into history unconditionally,
which makes `caret-placement-policy`'s recording test moot for this path. For indent and
outdent this is unobservable: the value recorded is the mapped cursor, which is exactly
what the history would recompute, so undo and redo behave identically to the keyboard path
at every depth (measured). It therefore does NOT bring the second-undo cost that
`structural-history-integration`'s "Known limitation" describes for cursor-choosing
operations.

#### Scenario: Cursor preserves the column on indent
- **WHEN** a paragraph is indented via the command and becomes `- Second thought.`, with
  the caret partway through its text
- **THEN** the caret stays at the same relative column within that text, not at the
  node's content start

#### Scenario: Cursor lands on the moved node
- **WHEN** a node is moved up or down via the command
- **THEN** the cursor sits at that node's content start in its new position

#### Scenario: A moved heading's caret is at column 0
- **WHEN** a heading is moved up or down via the command
- **THEN** the caret is at column 0 of its line, before the `#` characters — the same
  position Home gives on that line

#### Scenario: Both entry points agree
- **WHEN** the same operation is invoked from the command palette and from its key
  binding, with the same document and caret
- **THEN** the resulting caret is the same, because both read it from the same procedure

### Requirement: Rejection feedback without document changes
A rejected operation SHALL leave the document, selection, and undo history untouched, and
SHALL surface a brief non-modal cue with a human-readable reason derived from the typed
rejection (one reason→message table).

#### Scenario: Bound rejection cue
- **WHEN** the indent command runs on an h6 heading
- **THEN** the document is unchanged and a transient notice explains the heading-level
  bound

### Requirement: Fresh-tree guarantee
Every command SHALL parse the current editor buffer at invocation time (no stale cached
tree), so external edits, sync, or other plugins can never cause an op to apply edits
computed against outdated text.

#### Scenario: Op after external change
- **WHEN** the buffer changed since the last command and a structural command runs
- **THEN** the op is computed from the current buffer content

