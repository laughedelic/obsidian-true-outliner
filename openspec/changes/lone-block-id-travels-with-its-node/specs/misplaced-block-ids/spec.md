# Spec Delta

## Purpose

Shows the user, in outline mode, every block id that is not attached to a node of the outline —
because Obsidian reads it as something no node stands for, or does not read it as an id at all —
and offers the edits that make it an id the outline and Obsidian agree on.

## ADDED Requirements

### Requirement: Which block ids are misplaced, and what Obsidian reads them as
A line SHALL be MISPLACED when it is one of the following, each with the reading the menu and the
mark's title state (`docs/research/lone-block-id`):

| Shape | Obsidian reads it as |
| --- | --- |
| a lone block id that does not attach, following a list's last line after one or more blank lines, indented into no list item | the whole list |
| a lone block id that does not attach, indented to a list item's content column | that list item |
| a lone block id followed, after only blank lines, by another lone block id | nothing: the next id names the same block |
| a lone block id with no content line above it in the document | nothing |
| a line that would be a lone block id but for trailing whitespace | not an id |
| a paragraph whose first line would be a lone block id and which has further lines | not an id: the line below joins it |

"Lone block id" and "attach" are `document-tree-mapping`'s. A lone id that attaches is never
misplaced, and no other line is.

#### Scenario: An id after a list under a lead paragraph is misplaced
- **WHEN** `Lead.`, `- a`, `- b`, `  - c`, a blank line and `^foo` are in outline mode
- **THEN** `^foo` is misplaced, and its reading is the whole list

#### Scenario: An id after a block inside an item is misplaced
- **WHEN** `- a` holds the indented paragraph `inner prose`, followed by a blank line and
  `  ^x3`
- **THEN** `^x3` is misplaced, and its reading is the item `a`

#### Scenario: The first of two consecutive ids is misplaced, the second is not
- **WHEN** a paragraph is followed by `^y1` and `^y2`, each after a blank line
- **THEN** `^y1` is misplaced with the reading that it names nothing, and `^y2` is not marked

#### Scenario: An attached id is never misplaced
- **WHEN** a table is followed by a blank line and `^t1`
- **THEN** nothing is marked

### Requirement: A misplaced id is marked on its line
In outline mode, the text of a misplaced id — from `^` to the end of the id, not its leading
whitespace — SHALL be marked with a highlight, carrying a title that states the reading and that a
press offers the corrections. The paragraph holding the misplaced line SHALL draw a warning glyph
in place of its kind's marker (`outline-decorations`), at every `markerVisibility` value. For a
paragraph of several lines, the mark covers the first line's id text only.

The mark and the glyph are decorations like every other in outline mode: absent outside it and
in a nested per-cell editor, and never changing the document.

#### Scenario: The mark and the glyph appear together
- **WHEN** a note holding a misplaced `^foo` is open in outline mode
- **THEN** `^foo` is highlighted, its title names Obsidian's reading, and its line's marker is the
  warning glyph

#### Scenario: Nothing is marked outside outline mode
- **WHEN** outline mode is off for the same note
- **THEN** no line carries the mark or the glyph, and turning the mode on draws both without any
  document change

#### Scenario: The glyph shows even where leaf markers are hidden
- **WHEN** `markerVisibility` is `'with-children'`
- **THEN** the misplaced id's line still draws the warning glyph

### Requirement: A press on the mark or the glyph opens the corrections
A plain press on the mark or on the warning glyph, released without moving past `node-dragging`'s
threshold, SHALL open the correction menu at the press, on a mouse and on a touch screen alike. The
press SHALL NOT place a caret, begin a selection, fold, or zoom. The glyph is still the paragraph's
mark, so a press on it that moves past the threshold drags the paragraph as it would any node.

The menu SHALL be compact: a first row, disabled, stating Obsidian's reading; then one row per
correction below; then a row removing the id. Choosing a row SHALL apply that edit as one undo
step. Dismissing the menu SHALL change nothing.

#### Scenario: A press on the mark opens the menu
- **WHEN** the misplaced `^foo` after `Lead.` and its list is pressed
- **THEN** a menu opens reading the whole list, then `Attach to “Lead.”`, `Attach to “c”` and
  `Remove ^foo`, and the caret has not moved

#### Scenario: A press on the glyph opens the same menu
- **WHEN** the warning glyph on the same line is pressed
- **THEN** the same menu opens, and the view does not zoom

#### Scenario: A correction is one undo step
- **WHEN** `Attach to “c”` is chosen and then undo is invoked once
- **THEN** the document is back to its state before the correction

### Requirement: A command opens the corrections from the keyboard
A command SHALL open the same menu for the misplaced line the caret is on, placed at the caret. It
SHALL be available only in outline mode and only while the caret's line is misplaced.

#### Scenario: The command opens the menu at the caret
- **WHEN** the caret is on the misplaced `^foo` line and the command is run
- **THEN** the correction menu opens at the caret

#### Scenario: The command is unavailable elsewhere
- **WHEN** the caret is on a line that is not misplaced
- **THEN** the command is not offered

### Requirement: The corrections and the edits they make
Each misplaced shape SHALL offer these corrections, in this order, followed by removing the id:

- **The whole list.** `Attach to “<lead>”`, when the list's top-level items are children of a
  paragraph; then `Attach to “<last>”`, the node whose own lines end right above the id.
- **A list item.** `Attach to “<item>”`, the item Obsidian names; then `Attach to “<last>”`, when
  the node whose own lines end right above the id is a list item other than that item.
- **Names nothing.** Removing the id only.
- **Trailing whitespace.** `Remove trailing whitespace`.
- **The line below joins it.** `Separate from the line below`.

A row's label SHALL name its target by the start of the target's text. A target that already
carries a block id of its own — attached, or inline at the end of its last line — SHALL NOT be
offered.

The edits:

- `Attach to` SHALL append one space and the id, as written, to the end of the target's last own
  line, and delete the id's line together with the blank lines between it and the line above. The
  caret SHALL land at the end of the appended id.
- Removing the id SHALL delete its line together with the blank lines between it and the line
  above, leaving the caret at the end of the line above.
- `Remove trailing whitespace` SHALL delete the whitespace after the id.
- `Separate from the line below` SHALL insert an empty line after the id's line.

After each edit the id is either attached, or not an id the parse keeps as misplaced for the
same reason, and the mark follows the re-parse.

#### Scenario: Attaching to the lead paragraph
- **WHEN** `Attach to “Lead.”` is chosen for `Lead.`, `- a`, `- b`, `  - c`, blank, `^foo`
- **THEN** the note reads `Lead. ^foo`, `- a`, `- b`, `  - c`, and nothing is marked

#### Scenario: Attaching to the last node
- **WHEN** `Attach to “c”` is chosen for the same note
- **THEN** the note reads `Lead.`, `- a`, `- b`, `  - c ^foo`, and nothing is marked

#### Scenario: A top-level list offers the last node only
- **WHEN** `- a`, `- b`, a blank line and `^l1` at column 0 are pressed on
- **THEN** the menu offers `Attach to “b”` and removing the id, and no lead paragraph

#### Scenario: An id after an item's children offers the item and the last node
- **WHEN** `- a`, `  - child`, a blank line and `  ^x1` are pressed on
- **THEN** the menu offers `Attach to “a”`, then `Attach to “child”`, then removing the id

#### Scenario: Trailing whitespace is removed
- **WHEN** `Remove trailing whitespace` is chosen for `^t4` with trailing spaces after a table
- **THEN** the line reads `^t4`, the id attaches to the table, and nothing is marked
