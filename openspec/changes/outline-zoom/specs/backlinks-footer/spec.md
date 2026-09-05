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

The footer SHALL be rendered AFTER the line it is anchored to, without splitting it. A block widget
that sorts inside its line leaves the line's empty remainder rendered below the widget, and that
remainder is a real line: it takes the caret, so the space under the footer became a place a click
could put the cursor. Outside a zoom that stray line sat where a blank line would have been anyway;
under one it is the whole of the empty space below a short document.

The footer SHALL NOT take the chrome of the line it is anchored to. It is mounted after the
content rather than being a rendering of that line, so an ancestor guide belonging to that line
SHALL NOT be drawn through the footer.

#### Scenario: Nothing is rendered below the footer
- **WHEN** any note with the footer enabled is open
- **THEN** the footer is the last thing in the content, with no line after it

#### Scenario: The footer takes no guide from its neighbour
- **WHEN** the last line above the footer is a nested list item, so it carries an ancestor guide
- **THEN** no guide is drawn through the footer

#### Scenario: The footer is still there while zoomed
- **WHEN** a note with references is zoomed into a node
- **THEN** the footer renders below the zoomed content, with the same references it shows unzoomed

#### Scenario: Zooming does not change what the footer reports
- **WHEN** the user zooms in, notes the footer's groups and counts, and zooms out
- **THEN** the groups and counts are the same throughout

#### Scenario: A dormant footer stays dormant
- **WHEN** a note with no references is zoomed into a node
- **THEN** the footer behaves exactly as it does unzoomed
