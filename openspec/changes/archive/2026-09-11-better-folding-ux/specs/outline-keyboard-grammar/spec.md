## ADDED Requirements

### Requirement: Enter on a folded node creates a sibling after its subtree

With the caret at the END of a folded node's own line, Enter SHALL create a new sibling AFTER the
folded node's whole subtree, and the node SHALL STAY FOLDED. Today the fold is silently dropped
and the new node is inserted inside the revealed subtree — which is the one place a reader who
just folded the node was not looking.

With the caret anywhere else in a folded node's text, so that Enter SPLITS the node, the node
SHALL be unfolded first: a split redistributes the node's own text, and the reader has to see
where its children end up.

A MERGE needs no rule of its own, and deliberately gets none. When a folded node is merged into
another, its hidden children follow their content to the node that now owns them and stay folded —
the general rule (`outline-folding`: a fold follows the lines it hid) already gives the right
answer, and the merged node's own marker says what is beneath it. Deleting a folded node outright
needs no rule either: `node-edit-enforcement` already removes whole subtrees with their gaps, so
the hidden descendants go with it.

#### Scenario: Enter at the end of a folded node
- **WHEN** the caret is at the end of a folded list item's line and Enter is pressed
- **THEN** a new empty sibling appears after the folded subtree, the caret is in it, and the
  original node is still folded

#### Scenario: Enter mid-text unfolds first
- **WHEN** the caret is in the middle of a folded node's text and Enter is pressed
- **THEN** the node unfolds and the split proceeds as it does for an unfolded node

#### Scenario: A deletion takes the hidden subtree
- **WHEN** a selection crossing a folded node's boundary is deleted
- **THEN** the whole subtree goes, hidden descendants included, as it does for an unfolded node
