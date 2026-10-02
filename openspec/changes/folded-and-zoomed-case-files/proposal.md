# Proposal

## Why

A case file states a document, a caret or selection, two settings and keys. It cannot start from a
folded or zoomed outline, and its drawing cannot show either
([#308](https://github.com/laughedelic/obsidian-true-outliner/issues/308), under
[#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)). The zoom and fold specs
carry the cases that need it: `docs/research/folded-and-zoomed-case-files` sorts their 147 cases by
what a case file would have to hold and finds that 37 of them are text, a caret, folds, a zoom root
and keys, and that only one of the 37 can be drawn today. The tracker's own zoomed drawing, #259,
says "Zoomed on `2. p`" in the sentence above a block that carries none of it.

The issue leaves one decision first, because it settles the format: how a folded or zoomed state is
written in a drawing, with the drawing staying the case file's own form and only whitespace made
visible (`.agents/skills/presenting-examples/SKILL.md`). The note measures the three candidates
against those cases, against the fonts the notation may use, and against the real app on desktop
and under mobile emulation.

## What Changes

- **A mark opens the line of the node it describes.** `►` opens the first line of a folded node and
  `●` the first line of the zoom root, in a `before` column and in a result column alike, beside
  the `▒` that opens a block-selected line. A line's marks come in the order `●►▒`, each at most
  once; `●` appears on one line of a column; a line cannot be both the zoom root and folded, since
  a zoom opens its root. The drawing keeps every line of the document, hidden ones included, as it
  is the document.
- **A column states the whole fold and zoom state.** A `before` starts with exactly the folds and
  the zoom it draws, and a result column is compared with the folds and the zoom the app holds, a
  column with no mark meaning none. A caret is compared only where it is drawn; a fold is a
  fact about the outline that a result either has or lacks, and "the zoom exits" and "the fold
  opens" are results. The six shipped case files leave nothing folded or zoomed, so none of them
  changes.
- **The runner arranges and reads the state.** It clears folds and zoom, zooms first and folds
  from the last line to the first, sets the selection last, and checks the editor holds the drawn
  `before`, marks included. Each phase's result is read back with the folded nodes' first lines
  and the zoom root's line beside the text and selection.
- **The plugin gains one probe.** `foldState().folded` names each fold's node line, and a
  `zoomState()` beside it returns the zoom root's line, for the reason `foldState()` exists: the
  fold and zoom state cannot be read from outside the plugin's module scope.
- **A failing case names what differs.** `folds` and `zoom` join `text`, `caret`, `selection` and
  `block selection`, and the drawing shows the marks of `before`, `expected` and `actual`.
- **Eight case files ship**, under `e2e-tests/cases/outline-zoom` and `outline-folding`, each
  mirroring a spec case the marks let move and each recorded on both platforms.
- The `presenting-examples` skill documents the two glyphs, the rule that a result states the
  whole state, and the marks' effect on a marked line's indentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `drawn-case-files`: the notation gains the fold and zoom marks; the runner arranges, checks and
  compares them; a failing case reports and draws them; the state helper reads and draws them.

## Non-goals

- **Commands run by name.** 14 more cases open with a step that runs `zoom-in`, `zoom-out`,
  `zoom-clear`, `fold-all`, `fold-more`, `fold-less` or `toggle-fold`, none of which a key reaches
  (`docs/research/folded-and-zoomed-case-files`, "The 147 cases"). A step that names a command
  changes the case-file format on its own terms, and this change leaves it.
- **A preamble name or a state column.** The note measures both and finds neither says a result.
- **Pointer gestures on a fold or zoom mark**, which the issue excludes.
- **Moving the spec cases.** The 37 stay in their specs, which also assert the notices and DOM
  reads a drawing cannot carry; the eight case files are added beside them.
- **The DOM around a fold or zoom** — the trail's crumbs, rendered lines, the fold count and
  affordance, layout — and the 96 cases that read it.
- **The `⌘⌥.` key.** `toggle-fold`'s hotkey did not reach the command under `browser.keys` on
  either config, for a reason not diagnosed; a case file uses `⌘⌥↑` and `⌘⌥↓`.
- **The drive skill's state read.** `scripts/drive-state.ts` keeps drawing what it draws until the
  open work on it lands.

## Impact

- `scripts/notation.ts`: reading, drawing, the side-by-side form and `undraw` for the two marks.
- `src/plugin/main.ts`: `foldState()` names node lines; `zoomState()` added.
- `e2e-tests/`: `drawing.ts`, `state-drawing.ts`, `case-report.ts`, `cases.ts`,
  `specs/98-drawn-cases.e2e.ts`, `cases/outline-zoom/`, `cases/outline-folding/`.
- `tests/`: `notation.test.ts`, `case-report.test.ts`, `case-files.test.ts`.
- `.agents/skills/presenting-examples/SKILL.md`.
- `docs/research/folded-and-zoomed-case-files.md` and its index row.
- A change that touches `src/` carries a patch bump when it lands.
