## MODIFIED Requirements

### Requirement: Escalation never shrinks the selection
An escalated range SHALL always contain the original range: escalation only ever moves
the ends outward. Ends the user placed beyond the computed subtree cover — on trailing
gap lines or at the document end — are retained, never pulled back.

**The one bound on this rule is an active zoom scope** (`outline-zoom`). While zoomed, an
escalated range SHALL be clamped to the zoom root's whole subtree cover, which is the only case
in which escalation moves an end inward. The clamp SHALL preserve the guarantee that the result
covers whole nodes exactly: the scope is itself a subtree cover, so the intersection of an
escalated cover with it is a cover. Containment SHALL then be read against the scope — an
escalated range contains the original range's own intersection with the scope — because no
position outside the scope is reachable in the first place.

#### Scenario: Select All without frontmatter is byte-identical to stock
- **WHEN** the user presses Select All in an outline-mode note with no frontmatter
- **THEN** the resulting selection spans the entire document exactly as in stock
  Obsidian, including any trailing newline

#### Scenario: A selection escalating past the zoom root is clamped to it
- **WHEN** a gesture while zoomed produces a range whose escalation would reach past the zoom
  root's subtree
- **THEN** the resulting selection ends exactly at the zoom root's subtree bounds

#### Scenario: A clamped escalation still covers whole nodes
- **WHEN** any selection is clamped by the zoom scope
- **THEN** the result is an exact node cover — re-escalating it leaves it unchanged

#### Scenario: With no zoom, escalation is unchanged
- **WHEN** no zoom is active
- **THEN** escalation expands only, exactly as specified above, with no clamp applied

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` ("Select All without
frontmatter…"); `tests/escalate.test.ts` (containment property over generated trees, and the
clamped-result-is-still-a-cover property).
