## ADDED Requirements

### Requirement: The footer survives an active zoom scope
While a zoom scope is active (`outline-zoom`), the footer SHALL continue to render, after the
zoomed content. The scope hides the document around the zoom root, and the footer SHALL NOT be
hidden with it.

The footer SHALL keep answering for the NOTE while zoomed — the same references, the same
grouping, the same counts it shows unzoomed. Narrowing it to the zoomed node is deliberately not
specified here; it belongs with the footer's filter model, and until that exists the footer's
answer SHALL NOT silently change because a zoom is active.

Clearing the zoom SHALL leave the footer exactly as it was, having neither rebuilt its index nor
changed what it reports.

The footer's own requirement that it be chrome AFTER the content rather than a rendering of the
line it follows SHALL hold while zoomed, against the moved anchor. It is stated on the footer
because both of its defects are visible without any zoom at all; a zoom is only where the second
one shows every time, since the last VISIBLE line of a zoomed list subtree is nested by
construction, and where the first one is the whole of the empty space below a short document
rather than a line at the end of a long one.

#### Scenario: Nothing is rendered below the footer while zoomed
- **WHEN** a note with references is zoomed into a node
- **THEN** the footer is the last thing in the content, with no line after it

#### Scenario: The footer is still there while zoomed
- **WHEN** a note with references is zoomed into a node
- **THEN** the footer renders below the zoomed content, with the same references it shows unzoomed

#### Scenario: Zooming does not change what the footer reports
- **WHEN** the user zooms in, notes the footer's groups and counts, and zooms out
- **THEN** the groups and counts are the same throughout

#### Scenario: A dormant footer stays dormant
- **WHEN** a note with no references is zoomed into a node
- **THEN** the footer behaves exactly as it does unzoomed
