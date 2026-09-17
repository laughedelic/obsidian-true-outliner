## ADDED Requirements

### Requirement: A derived caret follows the place it was on
Where the pre-operation caret sat on an open PROVISIONAL POSITION (`outline-keyboard-grammar`),
a DERIVED dispatch — indent and outdent — SHALL land the caret on that position at its new
content column, rather than falling back to the subject rule.

This is not a new case. It is what the DERIVED case already says: the mapped position, used when
it is caret-addressable. The rule is stated because the addressability answer depends on which
tree the RESULT is read through, and reading it through the raw parse made the mapped position
non-addressable in every shape this covers — the place is a blank line there, which
`content-space-caret` calls a gap. The result SHALL therefore be read through the outline the
operation acted on, with the place among its node's own lines, which is the only reading under
which the caret can stay where the user put it.

It applies to a position at a node's END as well as to an interior one; both are the node's own
continuation position, and a rule that distinguished them would be reintroducing the gate the
operations no longer ask.

The SUBJECT case is unchanged and still correct for the moves, which take their caret from the
node they moved and not from the caret's own history. What a move must not do is leave the
POSITION behind, which `outline-keyboard-grammar` states.

#### Scenario: Tab keeps the caret on an interior position
- **WHEN** a position is open interior to a list item and Tab is pressed
- **THEN** the caret is on the position, at the item's new content column, not on the item's
  first line

#### Scenario: Shift+Tab keeps the caret on a position at the node's end
- **WHEN** a position is open at the end of a list item's last line and Shift+Tab is pressed
- **THEN** the caret is on the position, at the item's new content column

#### Scenario: A move still places its caret on the subject
- **WHEN** a position is open on a node and the node is moved
- **THEN** the caret is at the moved node's content start, per the subject case, and the
  position has moved with the node

#### Scenario: The position adds no exception
- **WHEN** the caret this rule places is checked against `content-space-caret`
- **THEN** it is addressable in the outline the operation acted on, so the split-materialization
  position named in "Every caret this plugin dispatches is addressable" remains the only stated
  exception
