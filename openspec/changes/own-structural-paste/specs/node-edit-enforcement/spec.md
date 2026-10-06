## ADDED Requirements

### Requirement: A structural paste is taken before Obsidian's paste handling
In an outline-mode editor, a paste over one selection range whose clipboard text is a structural
block sequence SHALL insert that text over the selection as a plain paste, before Obsidian's own
paste handling runs and after its `editor-paste` listeners, so the enforcement judges the same paste
on every Obsidian build. Any other paste, and one a listener handled, SHALL be left to Obsidian.

*(Added `own-structural-paste`: Obsidian 1.14.4's paste hook rewrites a list pasted at a list item's
content start into a replacement of the item's marker and drops the first pasted line's
indentation; the enforcement passed that replacement as an ordinary edit
(`docs/research/obsidian-smart-list-paste`).)*

#### Scenario: A list pasted into an empty item lands at the item's depth
- **WHEN** the clipboard is `  - c2` / `- S` / `  - t1` / `  - t2` and the user pastes on the empty
  item of `- DEST` / `  - d1` / `  - `
- **THEN** the note reads `- DEST` / `  - d1` / `  - c2` / `  - S` / `    - t1` / `    - t2` on every
  Obsidian build, with "Smart lists" on or off

#### Scenario: The clipboard's first-line indentation still decides its tree
- **WHEN** the clipboard is `  - a` / `  - b` and the user pastes on the empty item of `- A` / `- `
- **THEN** `a` and `b` are siblings, and the note reads `- A` / `- a` / `- b`

#### Scenario: A paste at the start of an item with children lands in its child scope
- **WHEN** the clipboard is `- p` / `  - q` and the user pastes with the caret at the content start
  of `- beta` in `- alpha` / `- beta` / `  - beta child` / `- gamma`
- **THEN** the note reads `- alpha` / `- beta` / `  - p` / `    - q` / `  - beta child` / `- gamma`

#### Scenario: An HTML clipboard is pasted as its Markdown
- **WHEN** the clipboard holds an HTML list `a` with a nested `b`, and the user pastes on the empty
  item of `- top` / `  - mid` / `    - `
- **THEN** `b` is `a`'s child, and the note reads `- top` / `  - mid` / `    - a` / `      - b`

#### Scenario: A non-structural paste is Obsidian's
- **WHEN** the clipboard is a lone childless item `- a`, or plain lines with no block structure,
  and the user pastes
- **THEN** the paste goes through Obsidian's own handling, as it does outside outline mode

#### Scenario: A paste over more than one range is Obsidian's
- **WHEN** the user has a caret in each of two empty items and pastes a two-line clipboard
- **THEN** the paste goes through Obsidian's own handling

#### Scenario: A paste another plugin handled is left alone
- **WHEN** a listener of Obsidian's `editor-paste` event handles a structural paste and marks the
  event handled
- **THEN** the outline inserts nothing of its own

#### Scenario: A list beside an image is taken
- **WHEN** the clipboard holds an HTML list `a` with a nested `b` and also an image, inside the HTML
  from a web address or as a file beside it, and the user pastes on the empty item of `- top` /
  `  - mid` / `    - `
- **THEN** `b` is `a`'s child on every Obsidian build

#### Scenario: A clipboard whose paste is not its text is Obsidian's
- **WHEN** the clipboard holds only files, HTML that is a lone image beside a file, Obsidian's
  properties, or a plain text beside a different `text/uri-list`
- **THEN** the paste goes through Obsidian's own handling

**Covered by**: `tests/structural-paste.test.ts`;
`e2e-tests/specs/61-selection-enforcement.e2e.ts` ("pasting a mixed-depth payload normalizes its
roots to the destination depth"); `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` ("pasting
into an empty item that is the SOLE child at a deep level re-indents there, not top level (D16,
real-vault repro)", and the HTML, two-caret, `editor-paste` and "Smart lists" off pastes);
`e2e-tests/specs/80-outline-zoom.e2e.ts` ("a paste at a root WITH children lands in its child scope
(G1b)"); the drawn cases under `e2e-tests/cases/node-edit-enforcement/`
