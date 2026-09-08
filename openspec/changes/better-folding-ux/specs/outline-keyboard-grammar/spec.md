## ADDED Requirements

### Requirement: Enter on a folded node creates a sibling after its subtree

With the caret at the END of a folded node's own line, Enter SHALL create a new sibling AFTER the
folded node's whole subtree, and the node SHALL STAY FOLDED. Today the fold is silently dropped
and the new node is inserted inside the revealed subtree — which is the one place a reader who
just folded the node was not looking.

With the caret anywhere else in a folded node's text, so that Enter SPLITS the node, the node
SHALL be unfolded first: a split redistributes the node's own text, and the reader has to see
where its children end up.

Backspace or any edit that would MERGE a folded node into another SHALL likewise unfold it first,
for the same reason. Deleting a folded node outright needs no special rule — `node-edit-enforcement`
already removes whole subtrees with their gaps, so the hidden descendants go with it.

#### Scenario: Enter at the end of a folded node
- **WHEN** the caret is at the end of a folded list item's line and Enter is pressed
- **THEN** a new empty sibling appears after the folded subtree, the caret is in it, and the
  original node is still folded

#### Scenario: Enter mid-text unfolds first
- **WHEN** the caret is in the middle of a folded node's text and Enter is pressed
- **THEN** the node unfolds and the split proceeds as it does for an unfolded node

#### Scenario: A merge unfolds first
- **WHEN** the caret is at the content start of a folded node and Backspace merges it into the
  previous node
- **THEN** the node unfolds first, and the merge proceeds as it does for an unfolded node
