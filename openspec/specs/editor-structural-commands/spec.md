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

### Requirement: Cursor follows the moved node
After an accepted operation the cursor SHALL be placed on the moved node's first line at
its first content column (after any list marker), as located in the operation's result
tree.

#### Scenario: Cursor lands on the re-encoded node
- **WHEN** a paragraph is indented and becomes `- Second thought.`
- **THEN** the cursor sits immediately after the `- ` marker of that line

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
