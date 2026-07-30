## ADDED Requirements

### Requirement: The ladder declines inside a nested editor
Mod-A SHALL decline when the view is a nested editor (a table cell's own `EditorView`),
leaving native select-all to act on the cell. The check SHALL be DOM ancestry, not file
resolution, for the reason given in `outline-keyboard-grammar`: `editorInfoField` resolves a
nested cell to the same outline-mode host file.

#### Scenario: Mod-A in a table cell is native
- **WHEN** the caret is inside a table cell whose text is `- word` and Mod-A is pressed
- **THEN** the selection is the cell's entire text including the literal `- `, not the
  ladder's content rung — the cell's text is never parsed as outline structure, so a
  leading `- ` the user typed is content, not a marker
