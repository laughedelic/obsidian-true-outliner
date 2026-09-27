## ADDED Requirements

### Requirement: A rewritten deletion of an ordered item keeps its own numbers
A deletion or merge of an ordered list item SHALL receive the same verdict whether or not
items follow it in its list. Where items follow it, Obsidian's live list renumbering appends new
numbers for them to the user's transaction (`transaction-classification`, "Multi-range user
edits receive verdicts"). When the verdict is a `rewrite`, the numbers the note ends with SHALL
be the ones the structural operation writes (`structural-operations`, "Ordered-run
renumbering"), and no line outside the runs the operation changes SHALL be renumbered. An edit
that passes keeps whatever Obsidian appended, as a native edit does.

#### Scenario: A block deletion of a nested ordered item
- **WHEN** `   2. b` is block-selected in `1. p` / `   1. a` / `   2. b` / `   3. c` /
  `2. q`, with each nested item at three columns, and the user presses Backspace
- **THEN** the note reads `1. p` / `   1. a` / `   2. c` / `2. q`, with no empty line
  where `b` was

#### Scenario: Backspace removes an emptied middle item
- **WHEN** the caret is at the end of `2. a` in `1. p` / `2. a` / `3. q` and the user
  presses Backspace twice
- **THEN** the note reads `1. p` / `2. q` and the caret is at the end of `p`, as it is
  when `2. a` is the last item

#### Scenario: A linewise cut of an ordered item
- **WHEN** the caret is in `2. b` in `1. a` / `2. b` / `3. c`, with nothing selected, and
  the user cuts
- **THEN** the note reads `1. a` / `2. c`
