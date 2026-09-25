## ADDED Requirements

### Requirement: A pasted payload's blank lines are written empty
A structural paste, at a caret or over a selection, SHALL write every blank line between the
payload's nodes as an EMPTY line, whatever whitespace the clipboard carried on it. A blank line's
whitespace says nothing in Markdown, and a clipboard writes it in its own unit, so carrying it over
leaves lines of stray spaces or tabs between the pasted nodes that the outline gives no caret
position to clean up.

A whitespace-only line inside a code block or another atom is one of the atom's own lines, not a
blank line between nodes, and SHALL be kept as it is. The note's own blank lines SHALL NOT be
touched by a paste.

#### Scenario: A clipboard's blank line of spaces lands empty
- **WHEN** a list whose blank line holds two spaces is pasted into a tab-indented list
- **THEN** that line lands empty, and the items around it land with tabs

#### Scenario: A blank line in a pasted code block stays
- **WHEN** a list item holding a fenced block with a whitespace-only line in its code is pasted
- **THEN** that line is written as the code had it

#### Scenario: A paste over a selection empties its blank lines too
- **WHEN** a payload with a whitespace-only blank line replaces a selected node
- **THEN** that line lands empty
