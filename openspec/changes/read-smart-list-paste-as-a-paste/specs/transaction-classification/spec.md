## ADDED Requirements

### Requirement: A smart-list paste is judged as the paste it came from
With "Smart lists" on, a paste at a list item's content start that Obsidian dispatches as a
replacement of the item's marker SHALL be classified and judged as the plain paste of the
clipboard's text at that content start, and so receives the verdict that paste receives with
"Smart lists" off. A change that is not exactly Obsidian's replacement for the pasted text, a paste
of more than one range or change, and a paste that does not follow a list prefix SHALL be judged as
dispatched.

*(Added `read-smart-list-paste-as-a-paste`: Obsidian 1.14.4 rewrites a list pasted at a list item's
content start into a replacement of the item's marker and drops the first pasted line's
indentation. The replacement is made from a caret, which "A transaction is judged on the user's own
changes" and `classify` read as an ordinary edit, so the paste passed unjudged
(`docs/research/obsidian-smart-list-paste`).)*

#### Scenario: A list pasted into an empty item lands at the item's depth
- **WHEN** the clipboard is `  - c2` / `- S` / `  - t1` / `  - t2` and the user pastes on the empty
  item of `- DEST` / `  - d1` / `  - `
- **THEN** `c2` and `S` are siblings of `d1`, `t1` and `t2` are `S`'s children, and the note reads
  `- DEST` / `  - d1` / `  - c2` / `  - S` / `    - t1` / `    - t2`, as it does with "Smart lists"
  off

#### Scenario: The clipboard's first-line indentation still decides its tree
- **WHEN** the clipboard is `  - a` / `  - b` and the user pastes on the empty item of `- A` /
  `- `
- **THEN** `a` and `b` are siblings, and the note reads `- A` / `- a` / `- b`

#### Scenario: A paste at the start of an item with children lands in its child scope
- **WHEN** the clipboard is `- p` / `  - q` and the user pastes with the caret at the content start
  of `- beta` in `- alpha` / `- beta` / `  - beta child` / `- gamma`
- **THEN** the note reads `- alpha` / `- beta` / `  - p` / `    - q` / `  - beta child` / `- gamma`

#### Scenario: A clipboard Obsidian converts keeps its nesting
- **WHEN** the clipboard holds an HTML list `a` with a nested `b`, and the user pastes on the empty
  item of `- top` / `  - mid` / `    - `
- **THEN** `b` is `a`'s child, and the note reads `- top` / `  - mid` / `    - a` / `      - b`

#### Scenario: A paste of more than one range is judged as dispatched
- **WHEN** the user has a caret in each of two empty items and pastes a two-line clipboard
- **THEN** the transaction is judged as Obsidian dispatched it, each line at its own caret

#### Scenario: A paste with "Smart lists" off is unchanged
- **WHEN** "Smart lists" is off and the user pastes the first scenario's clipboard on the same item
- **THEN** the note reads as it does with "Smart lists" on

**Covered by**: `tests/smart-list-paste.test.ts`;
`e2e-tests/specs/61-selection-enforcement.e2e.ts` ("pasting a mixed-depth payload normalizes its
roots to the destination depth"); `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` ("pasting
into an empty item that is the SOLE child at a deep level re-indents there, not top level (D16, real-vault repro)",
and the HTML-clipboard, two-caret and "Smart lists" off pastes); `e2e-tests/specs/80-outline-zoom.e2e.ts`
("a paste at a root WITH children lands in its child scope (G1b)"); the drawn cases under
`e2e-tests/cases/transaction-classification/`
