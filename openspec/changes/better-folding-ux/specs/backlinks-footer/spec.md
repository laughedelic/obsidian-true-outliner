## MODIFIED Requirements

### Requirement: A reference shows one level of children, deeper subtrees folded

The children of a referencing node SHALL render. A child that has children of its own SHALL
render collapsed, with the same fold affordance the outline uses in the editor, positioned
beside its marker. Expanding it SHALL reveal its own children under the same rule.

A row's fold SHALL go BOTH ways: a row expanded by the reader SHALL be foldable again, to the
state it was rendered in. The affordance SHALL therefore be a property of the row having a
subtree, not of that subtree currently being hidden.

The affordance SHALL be the editor's fold chrome rather than one the footer draws for itself: the
same mark, the same column, revealed on hover while unfolded and persistent while folded, and a
folded row's own marker SHALL carry the folded treatment `outline-decorations` defines, so a
reader can tell a folded row from a leaf. `docs/research/18` D7 is the decision this satisfies.

What is shared is the CHROME, never the semantics. The footer is ordinary DOM, not an editor, and
the control SHALL remain a real `button`: reachable and operable from the keyboard, activated by
Enter and Space, carrying an accessible label naming what it reveals or hides, and carrying an
`aria-expanded` that tracks the row's current state in both directions. The editor's own
affordance is chrome inside a text editor, where the keyboard route is the fold command; a footer
row has no such route, so adopting the editor's presentation must not cost the footer the only one
it has.

The reader's expansions SHALL remain what they are today — about the reading, not about the note:
they SHALL NOT be written to the document and SHALL NOT persist beyond the footer's own lifetime.

#### Scenario: Immediate children are shown

- **WHEN** a referencing node has three children, none of which has children
- **THEN** all three render

#### Scenario: A grandchild-bearing child is folded

- **WHEN** a referencing node has a child that itself has two children
- **THEN** that child renders with a fold affordance and its own children are hidden until it is
  expanded

#### Scenario: An expanded row folds again

- **WHEN** the reader expands a row and then uses its fold affordance again
- **THEN** the row's children are hidden and the row is back to the state it rendered in

#### Scenario: A folded row is distinguishable from a leaf

- **WHEN** a row hiding two children renders beside a row with none
- **THEN** the first carries the folded marker treatment and the second does not

#### Scenario: The control is operable from the keyboard

- **WHEN** the reader tabs to a row's fold control and presses Enter, then Space
- **THEN** the row expands and folds again, and its `aria-expanded` reports each state
