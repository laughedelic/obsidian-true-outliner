## MODIFIED Requirements

### Requirement: Decorations are scoped to outline mode
The decoration layer SHALL be registered as CodeMirror extensions via
`registerEditorExtension` and SHALL render indentation, guides, and markers only when the
editor's file has outline mode enabled (resolved through the same mode source the keyboard
grammar uses). Outside outline mode, or in the reading/preview view, the document SHALL
render exactly as stock Obsidian, with no additive indentation, guides, markers, or other
decorations present.

This scoping governs the CodeMirror decoration layer — the extensions that decorate the open
document's own lines. It does NOT govern the per-node decoration FACTS those extensions
consume: the fact derivation is a pure function of a parsed tree, is shared with surfaces
outside the CodeMirror line DOM (see `backlinks-footer`), and SHALL remain independent of which
surface is asking. In particular the fact derivation SHALL NOT consult the editor, the open
file, or the current mode.

The derivation SHALL be faithful to the tree it is given. Facts describing what a node IS —
its kind, whether it is an atom, whether it is a list item, whether it carries a native marker
— are properties of the node and SHALL be identical whether the tree came from the open
document or from elsewhere. Facts describing a node's place in the tree — its depth, its
supplemental depth, and whether it has children — SHALL describe the tree actually passed in.
A node whose children were pruned away therefore reports no children, which is correct: the
surface must draw what it was given, not what the node looked like somewhere else.

#### Scenario: No chrome off-mode
- **WHEN** a note without outline mode enabled is open in the editor
- **THEN** no indentation, guides, or markers are rendered; the DOM matches stock Obsidian
  live preview

#### Scenario: Toggle applies immediately
- **WHEN** outline mode is toggled on for the open note
- **THEN** decorations appear on the next editor render, with no reload required

#### Scenario: Node-identity facts are independent of the surface asking
- **WHEN** decoration facts are derived for a set of nodes as part of the open document, and
  derived again for the same nodes as part of a tree belonging to another note
- **THEN** the two derivations agree on kind, atom classification, list-item classification and
  native-marker status for every one of those nodes

#### Scenario: Position facts describe the tree that was passed in
- **WHEN** facts are derived for a node whose children have been pruned from the tree
- **THEN** the node reports having no children, and its depth is measured within the tree it was
  given rather than inherited from the tree it came from

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("draws no guides with outline mode
off"), `e2e/specs/52-block-markers-icons.e2e.ts` ("draws no markers with outline mode off").

### Requirement: Decorations never mutate document state
The decoration layer SHALL be a pure rendering projection: it SHALL NOT dispatch any
document-changing transaction, move the cursor/selection, or create undo history entries,
regardless of how often it recomputes.

The same guarantee SHALL extend to every other consumer of the decoration facts, including
surfaces that render trees parsed from notes other than the open one: deriving or rendering
facts for another note's tree SHALL NOT modify that note, SHALL NOT insert its content into the
open document, and SHALL NOT alter the open document's positions, caret, selection, or undo
stack.

#### Scenario: Rendering produces no transaction
- **WHEN** the decoration layer recomputes after a document change
- **THEN** no new transaction is dispatched beyond the one that triggered the recompute,
  and the document text, cursor position, and undo stack are exactly as they were left by
  that triggering change

#### Scenario: Rendering another note's tree is inert
- **WHEN** decoration facts are derived and rendered for a tree parsed from a different note
- **THEN** neither that note nor the open document is modified, and the open document's
  positions, caret, selection, and undo stack are unchanged

**Covered by**: `e2e/specs/53-decoration-contracts.e2e.ts` ("a decoration recompute
mutates nothing: buffer, cursor, and undo stack all unchanged" — after a known real edit,
a double mode toggle leaves buffer and cursor byte-identical, and a single undo reverts
that edit, proving no change-bearing transaction was interposed); `tests/decorate.test.ts`
("produces no facts for an empty document or preamble-only document" — the pure
computation has no side effects to begin with).
