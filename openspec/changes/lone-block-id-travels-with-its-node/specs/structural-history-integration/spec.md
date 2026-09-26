# Spec Delta

## ADDED Requirements

### Requirement: An abandoned place returns the caret to the node's last place
Where abandoning a place sends the caret to the node above it rather than to where the keypress
started — Delete with no node below, or a keypress that replaced a non-empty selection — the
caret SHALL land at that node's LAST place: the end of its attached block id where it carries
one (`content-space-caret`), and its content end otherwise. The id's line is the line directly
above the place, as the content end is for a node without one.

#### Scenario: Delete on the place after the note's last id
- **WHEN** Enter at the end of `^abc`, attached to `Para.` after a blank line at the end of the
  note, opens a place, and Delete is pressed on it
- **THEN** the note is byte-identical to what it was before the Enter, and the caret is at the
  end of `^abc`
