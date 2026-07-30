## MODIFIED Requirements

### Requirement: Deleting across boundaries removes whole subtrees with their gaps
A user deletion (or type-over) whose change range crosses node boundaries, OR whose
range exactly covers one or more whole subtrees, SHALL be rewritten to the structural
deletion of the range's whole-subtree cover, including each covered subtree's
trailing gap lines. Ranges already escalated by selection enforcement, exact
single-node covers, and stale mid-node ranges (e.g. a programmatically restored
selection) SHALL all resolve through the same subtree-cover rule. Typed-over text
SHALL be inserted as new content at the deletion site within the same transaction.

When the deletion's selection consists of SEVERAL ranges, each exactly covering
whole subtrees, every covered subtree SHALL be removed with its owned trailing gap
in the same transaction, forming one undo step.

The rewritten transaction's caret SHALL come from `caret-placement-policy`: the content
end of the node preceding the deleted region in document order, never inside a
focus-capturing node. The enforcement layer SHALL NOT compute a caret of its own, and
SHALL NOT read the caret as a node identity — it locates the surviving neighbour it
splices against by the deletion result's structural ANCHOR (`structural-operations`), so
the caret convention and the splice target are independent.

*(Amendment 2026-07-25, `fix-orphan-gap-on-node-deletion`: deleting one
exactly-selected node left its blank line behind, because the change span read as
within-node and never reached this requirement at all. Multi-range deletions passed
unenforced for the same structural reason — the verdict layer declined any
transaction with more than one change range. Amendment 2026-07-29,
`caret-placement-policy`: the caret after a deletion moves from the surviving node's
content start to the preceding node's content end, which is where this capability already
places a merge's caret.)*

#### Scenario: Deleting one exactly-selected node takes its gap
- **WHEN** the user selects exactly one node's whole subtree and deletes it
- **THEN** the node and its owned trailing gap are both removed, and no blank line
  is left where it was

#### Scenario: Deleting an escalated selection
- **WHEN** the user presses Backspace on a selection escalated to two sibling
  subtrees separated by a blank gap line
- **THEN** both subtrees and their trailing gap lines are removed, and the remaining
  neighbors are direct siblings with no leftover blank lines from the deleted nodes

#### Scenario: Deleting a multi-range selection of exact covers
- **WHEN** the user deletes a selection of two ranges, each exactly covering a whole
  subtree
- **THEN** both subtrees and their owned gaps are removed in one transaction, and
  the result re-parses to a well-formed tree

#### Scenario: Stale mid-node selection deletion
- **WHEN** a selection crossing from mid-node A to mid-node B was applied
  programmatically (never escalated) and the user presses Delete
- **THEN** the edit is rewritten to the structural deletion of the subtree cover of
  A and B, not a character-level splice

#### Scenario: Deleting every node degrades cleanly
- **WHEN** the user deletes a selection covering all nodes of the document
- **THEN** the resulting document (empty or preamble-only) is valid and the editor
  remains fully functional

#### Scenario: The caret lands where typing resumes
- **WHEN** a block deletion completes
- **THEN** the caret is at the content end of the node above the removed region — the
  same seam a merge lands on — and typing continues there

#### Scenario: A deletion next to a table does not strand undo
- **WHEN** the node immediately after a table is deleted
- **THEN** the caret lands outside the table, so undo applies to the note's own history
  rather than a nested cell editor's

#### Scenario: A type-over splices against the same node as before
- **WHEN** the user types over a whole-subtree selection, replacing it with text
- **THEN** the replacement is spliced against the same surviving neighbour as before this
  change, because the splice target is the deletion's anchor and not its caret
