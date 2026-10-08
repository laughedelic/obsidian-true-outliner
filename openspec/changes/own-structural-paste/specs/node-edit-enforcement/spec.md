## ADDED Requirements

### Requirement: A structural paste is taken before Obsidian's paste handling
In an outline-mode editor, a paste over one selection range whose clipboard text is a structural
block sequence SHALL insert that text over the selection as a plain paste, before Obsidian's own
paste handling runs and after its `editor-paste` listeners, so the enforcement judges the same paste
on every Obsidian build. The clipboard text SHALL be the one Obsidian's paste chooses, except that
HTML SHALL be converted whatever Obsidian's "Convert pasted HTML to Markdown" says, and a plain text
beside files SHALL be the text where Obsidian's paste would insert the files. A paste a listener
handled SHALL be left alone, and any other paste SHALL be left to Obsidian unless "An HTML paste is
inserted as converted on every build" or "A pasted list item does not repeat its destination's
marker" takes it.

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
- **WHEN** the clipboard holds only a plain text, a lone childless item `- a` or lines with no block
  structure, and the user pastes on a paragraph line or in the middle of an item's text
- **THEN** the paste goes through Obsidian's own handling, as it does outside outline mode, and
  `- a` pasted inside `beta` gives `be- ata`

#### Scenario: A structural paste over several ranges away from a marker is Obsidian's
- **WHEN** the user has a caret in each of two paragraphs and pastes a structural plain text
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

#### Scenario: A list beside a file is taken as text
- **WHEN** the clipboard holds the plain text `- a` / `  - b` and an image file, with no Markdown,
  and no HTML or only the image's own `<img>`, and the user pastes on the empty item of `- top` /
  `  - mid` / `    - `
- **THEN** `b` is `a`'s child, the note reads `- top` / `  - mid` / `    - a` / `      - b`, and no
  file is inserted, on every Obsidian build

#### Scenario: A clipboard whose paste is not its text is Obsidian's
- **WHEN** the clipboard holds files and no text, a plain text that is not a list beside a file,
  Obsidian's properties, or a plain text beside a different `text/uri-list`
- **THEN** the paste goes through Obsidian's own handling

**Covered by**: `tests/paste-text.test.ts`;
`e2e-tests/specs/61-selection-enforcement.e2e.ts` ("pasting a mixed-depth payload normalizes its
roots to the destination depth"); `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` ("pasting
into an empty item that is the SOLE child at a deep level re-indents there, not top level (D16,
real-vault repro)", and the HTML, conversion-setting, list-beside-a-file, two-paragraph,
`editor-paste` and "Smart lists" off pastes); `e2e-tests/specs/69-paste-differential.e2e.ts`;
`e2e-tests/specs/80-outline-zoom.e2e.ts` ("a paste at a root WITH children lands in its child scope
(G1b)"); the drawn cases under `e2e-tests/cases/node-edit-enforcement/`

### Requirement: An HTML paste is inserted as converted on every build
In an outline-mode editor, a paste whose clipboard text is converted HTML, as "A structural paste is
taken before Obsidian's paste handling" chooses it, SHALL insert that text over every selection
range, whatever Obsidian's "Convert pasted HTML to Markdown" says, unless Obsidian's paste would
write it as a link over the selection. The enforcement then judges it as any paste.

*(Added `own-structural-paste`: the maintainer's decision. With the conversion off, Obsidian's paste
takes the clipboard's plain text instead, which on 1.14.4 its collapse rewrites at a list item; the
setting is read only through a private API, so outline mode converts on every build and setting
(`docs/research/obsidian-smart-list-paste`).)*

#### Scenario: Converted with the conversion off
- **WHEN** Obsidian's "Convert pasted HTML to Markdown" is off, the clipboard holds the HTML
  `<p><b>a</b></p>` beside the plain text `- x`, and the user pastes on the paragraph line `p`, at
  its end
- **THEN** the line reads `p**a**`, on every Obsidian build

#### Scenario: A URL over a selection is Obsidian's link
- **WHEN** the clipboard holds HTML whose text is the URL `https://example.com`, and the user pastes
  over the selected word `see`
- **THEN** the paste goes through Obsidian's own handling, which writes `[see](https://example.com)`

**Covered by**: `tests/paste-text.test.ts`; `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`
(the conversion-off and URL-over-a-selection pastes); `e2e-tests/specs/69-paste-differential.e2e.ts`

### Requirement: A pasted list item does not repeat its destination's marker
In an outline-mode editor, for a paste not taken as structural, each selection range that sits right
after a list item's marker SHALL receive its text without the text's own first-line list prefix,
when that line has one: the item keeps its indentation and marker, and takes the pasted line's task
box, else its own. The text SHALL be the clipboard text "A structural paste is taken before
Obsidian's paste handling" chooses, and the rule SHALL apply whatever Obsidian's "Smart lists" says.
Each range of a paste over several ranges SHALL be treated alike, and the result SHALL be the same
on every Obsidian build.

*(Added `own-structural-paste`: the maintainer's decision. Obsidian 1.13.7 wrote such a paste with
the marker repeated (`- - a`), and 1.14.4's paste hook wrote it once while "Smart lists" was on;
outline mode writes it once on every build and under either setting
(`docs/research/obsidian-smart-list-paste`). A text drop, and the mobile app's Paste command and
menu, insert without a paste event and are outside this requirement, #377.)*

#### Scenario: A lone item pasted on an empty item
- **WHEN** the clipboard is `- a` and the user pastes on the empty item of `- A` / `- `
- **THEN** the note reads `- A` / `- a`, with the caret after `a`

#### Scenario: An empty task item keeps its box
- **WHEN** the clipboard is `- a` and the user pastes after the box of the empty item `- [ ] `
- **THEN** the item reads `- [ ] a`

#### Scenario: A pasted task brings its box
- **WHEN** the clipboard is `- [x] a` and the user pastes on an empty item `- `
- **THEN** the item reads `- [x] a`

#### Scenario: A pasted box replaces the item's
- **WHEN** the clipboard is `- [x] a` and the user pastes after the box of the empty item `- [ ] `
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

#### Scenario: With "Smart lists" off
- **WHEN** Obsidian's "Smart lists" is off, the clipboard is `- a`, and the user pastes on the empty
  item of `- A` / `- `
- **THEN** the note reads `- A` / `- a`

#### Scenario: A lone HTML item is converted whatever the conversion setting says
- **WHEN** Obsidian's "Convert pasted HTML to Markdown" is off, the clipboard holds the HTML list
  item `<b>a</b>` beside the plain text `x`, and the user pastes on the empty item of `- A` / `- `
- **THEN** the note reads `- A` / `- **a**`

#### Scenario: A lone item beside a file is taken as text
- **WHEN** the clipboard holds the plain text `- a` and an image file, with no HTML or Markdown, and
  the user pastes on the empty item of `- A` / `- `
- **THEN** the note reads `- A` / `- a`, and no file is inserted

**Covered by**: `tests/paste-text.test.ts`; the drawn cases under
`e2e-tests/cases/node-edit-enforcement/`; `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` (the
two-caret, "Smart lists" off, lone HTML item and lone-item-beside-a-file pastes);
`e2e-tests/specs/69-paste-differential.e2e.ts`
