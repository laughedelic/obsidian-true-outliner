## ADDED Requirements

### Requirement: A structural paste is taken before Obsidian's paste handling
In an outline-mode editor, a paste over one selection range whose clipboard text is a structural
block sequence SHALL insert that text over the selection as a plain paste, before Obsidian's own
paste handling runs and after its `editor-paste` listeners, so the enforcement judges the same paste
on every Obsidian build. A paste a listener handled SHALL be left alone, and any other paste SHALL be
left to Obsidian unless "A pasted list item does not repeat its destination's marker" rewrites it.

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

#### Scenario: A structural HTML paste is converted whatever the conversion setting says
- **WHEN** Obsidian's "Convert pasted HTML to Markdown" is off, the clipboard holds an HTML list `a`
  with a nested `b` beside the plain text `a` / `b`, and the user pastes on the empty item of
  `- top` / `  - mid` / `    - `
- **THEN** the HTML is converted, `b` is `a`'s child, and the note reads `- top` / `  - mid` /
  `    - a` / `      - b`

#### Scenario: A non-structural paste away from a marker is Obsidian's
- **WHEN** the clipboard is a lone childless item `- a`, or plain lines with no block structure, and
  the user pastes on a paragraph line or in the middle of an item's text
- **THEN** the paste goes through Obsidian's own handling, as it does outside outline mode, and
  `- a` pasted inside `beta` gives `be- ata`

#### Scenario: A structural paste over several ranges away from a marker is Obsidian's
- **WHEN** the user has a caret in each of two paragraphs and pastes a structural clipboard
- **THEN** the paste goes through Obsidian's own handling

#### Scenario: A paste another plugin handled is left alone
- **WHEN** a listener of Obsidian's `editor-paste` event handles a structural paste and marks the
  event handled
- **THEN** the outline inserts nothing of its own

#### Scenario: A list beside an image is taken
- **WHEN** the clipboard holds an HTML list `a` with a nested `b` and also an image, inside the HTML
  (from a web address, or inline as `data:`) or as a file beside it, and the user pastes on the empty
  item of `- top` / `  - mid` / `    - `
- **THEN** `b` is `a`'s child on every Obsidian build

#### Scenario: A clipboard whose paste is not its text is Obsidian's
- **WHEN** the clipboard holds files and no text Obsidian's paste would choose (a plain text beside a
  file, with no HTML, among them), HTML that is a lone image beside a file, Obsidian's properties, or
  a plain text beside a different `text/uri-list`
- **THEN** the paste goes through Obsidian's own handling

**Covered by**: `tests/paste-text.test.ts`;
`e2e-tests/specs/61-selection-enforcement.e2e.ts` ("pasting a mixed-depth payload normalizes its
roots to the destination depth"); `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` ("pasting
into an empty item that is the SOLE child at a deep level re-indents there, not top level (D16,
real-vault repro)", and the HTML, conversion-setting, two-range, `editor-paste` and "Smart lists"
off pastes); `e2e-tests/specs/69-paste-differential.e2e.ts`; `e2e-tests/specs/80-outline-zoom.e2e.ts`
("a paste at a root WITH children lands in its child scope (G1b)"); the drawn cases under
`e2e-tests/cases/node-edit-enforcement/`

### Requirement: A pasted list item does not repeat its destination's marker
In an outline-mode editor, for a paste not taken as structural, each selection range that sits right
after a list item's marker SHALL receive its text without the text's own first-line list prefix,
when that line has one: the item keeps its indentation and marker, and takes the pasted line's task
box, else its own. Each range of a paste over several ranges SHALL be treated alike, and the result
SHALL be the same on every Obsidian build.

*(Added `own-structural-paste`: the maintainer's decision. Obsidian 1.13.7 wrote such a paste with
the marker repeated (`- - a`) and 1.14.4's paste hook wrote it once; outline mode writes it once on
every build (`docs/research/obsidian-smart-list-paste`).)*

#### Scenario: A lone item pasted on an empty item
- **WHEN** the clipboard is `- a` and the user pastes on the empty item of `- A` / `- `
- **THEN** the note reads `- A` / `- a`, with the caret after `a`

#### Scenario: An empty task item keeps its box
- **WHEN** the clipboard is `- a` and the user pastes after the box of the empty item `- [ ] `
- **THEN** the item reads `- [ ] a`

#### Scenario: A pasted task brings its box
- **WHEN** the clipboard is `- [x] a` and the user pastes on an empty item `- `
- **THEN** the item reads `- [x] a`

#### Scenario: A numbered item keeps its number
- **WHEN** the clipboard is `- a` and the user pastes on the empty item of `1. A` / `2. `
- **THEN** the note reads `1. A` / `2. a`

#### Scenario: At the start of an item's text
- **WHEN** the clipboard is `- a` and the user pastes with the caret at the content start of `- beta`
- **THEN** the item reads `- abeta`, with the caret after `a`

#### Scenario: Each of several carets
- **WHEN** the user has a caret in each of the empty items of `- A` / `- ` / `- ` and pastes `- a` /
  `- b`
- **THEN** the note reads `- A` / `- a` / `- b`

**Covered by**: `tests/paste-text.test.ts`; the drawn cases under
`e2e-tests/cases/node-edit-enforcement/`; `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` (the
two-caret paste)
