## ADDED Requirements

### Requirement: The cover sequence is bounded by an active zoom scope
While a zoom scope is active (`outline-zoom`), the ordered sequence of covers a Shift+Arrow press
steps along SHALL be enumerated within that scope: no element SHALL exceed the zoom root's own
whole subtree cover, and the zoom root's own subtree SHALL be the sequence's last element in
either direction.

The bound SHALL be applied to the ENUMERATION, not to its output. A press SHALL NOT produce a
range that is a truncated cover — every dispatched selection SHALL remain an exact node cover, as
already required, and the last element SHALL be reached by the sequence stopping rather than by
clipping a larger cover.

Every other property of extension SHALL hold unchanged inside the bound: one node per press,
symmetry, statelessness, per-range independence, and the composition with the select-all ladder.
A press with nowhere left to go inside the scope SHALL leave the selection unchanged, the same
way an exhausted unbounded sequence does.

Where the anchor node is the zoom root itself, the sequence SHALL consist of the zoom root's own
subtree alone, and every press SHALL leave the selection unchanged.

#### Scenario: Extension stops at the zoom root's subtree
- **WHEN** the user extends downward while zoomed until the zoom root's whole subtree is covered
  and presses Shift+ArrowDown again
- **THEN** the selection is unchanged and no hidden node is drawn in

#### Scenario: The bounded sequence still dispatches exact covers
- **WHEN** any press while zoomed changes the selection
- **THEN** the resulting selection is an exact node cover — escalating it leaves it unchanged

#### Scenario: Symmetry holds inside the bound
- **WHEN** the user presses Shift+ArrowDown and then Shift+ArrowUp while zoomed, away from the
  sequence's ends
- **THEN** the second press restores exactly the selection the first press grew from

#### Scenario: Extension from the zoom root itself has nowhere to go
- **WHEN** the caret is in the zoom root's own line and the user presses Shift+ArrowDown
  repeatedly
- **THEN** the selection becomes the zoom root's whole subtree and then stops changing

#### Scenario: Clearing the zoom restores the unbounded sequence
- **WHEN** the user clears the zoom and extends again
- **THEN** the sequence continues past the former zoom root into its siblings, exactly as with no
  zoom
