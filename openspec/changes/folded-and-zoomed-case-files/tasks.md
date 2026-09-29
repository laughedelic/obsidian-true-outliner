# Tasks

## 1. The marks in the notation

- [ ] 1.1 Read `●` and `►` in `readDocument` and draw them in `drawDocument` (D1, D2): the strip at
      a line's start takes `●`, `►` and `▒` in that order, each once; `ReadDocument` gains
      `foldedLines` and `zoomLine`, `DrawnState` gains `folded` and `zoom`; the refusals of the
      spec name the line. Verify with `tests/notation.test.ts`: the spec's three scenarios, and a
      fast-check property that drawing a random text with a random set of folded lines, a zoom
      line and a range and reading it back returns all four; negative control: stripping the marks
      in any order (dropping the order check) lets `▒►` through and fails the malformed-mark case.
- [ ] 1.2 Draw the marks in `layout` after the edge glyph and read them in `undraw`, both forms (D7).
      Verify with `tests/notation.test.ts`: a column with a zoom root, a fold and a block-selected
      line laid out in both forms and read back as written; negative control: reading the mark as
      part of the cell's text fails the side-by-side case.
- [ ] 1.3 Carry `foldedLines` and `zoomLine` through `parseCase` for `before` and each result, and
      add the marks to the glyphs a note cannot contain (`GLYPHS` in `case-report.ts`). Verify with
      `tests/notation.test.ts`: a case file with a zoom start parses to the marked line, and one with
      a `●` on two lines is refused with the file's line number; negative control: parsing results
      without their marks fails the first.

## 2. Reading and comparing the state

- [ ] 2.1 Give the plugin's probes the two facts (D4, D6): each `foldState().folded` entry gains
      `line`, the node whose provider range has the same lines, and `zoomState()` returns the
      root's line or null. Verify with the e2e case of 3.1 on both configs; negative control:
      returning the range's `from` as `line` fails the two-line paragraph case.
- [ ] 2.2 Add `folded` and `zoom` to `readEditorState` and draw them in `state-drawing.ts`, with a
      note for a fold no node claims. Verify with `e2e-tests/specs/98-drawn-cases.e2e.ts`
      ("the editor drawn as it is read"): a folded list item, a folded two-line paragraph and a
      zoomed second node each draw their mark on the node's first line, on desktop and mobile;
      negative control: reading only the DOM for the zoom root fails once the note is scrolled past
      the root.
- [ ] 2.3 Compare `folds` and `zoom` in `compareState`, add them to `Difference`, draw the marks of
      `before`, `expected` and `actual` in `phaseMessage` and `beforeMessage`, and write them in
      `recordedCase` (D3). Verify with `tests/case-report.test.ts`: a fold that opened, a zoom that
      moved, and a result without a mark after a fold each report their difference and draw; a
      result with no mark passes on a state with none; negative control: skipping the compare when
      the column has no mark fails the third.

## 3. Arranging the state

- [ ] 3.1 Arrange a case's folds and zoom in `98-drawn-cases.e2e.ts` and hold `before` to them
      (D5): clear, zoom, fold from the last line, select, read; a state the editor cannot hold
      fails at `before` with the two drawings. Verify with the shipped case files of 4.1 and a
      scratch case file per unheld state (`►` on a leaf, `►` outside the zoom); negative control:
      folding from the first line to the last loses the inner fold and fails the nested case at
      `before`.
- [ ] 3.2 Clear folds and zoom before every case, whether or not it draws any. Verify by running the
      six existing case files after a case that leaves a fold and a zoom behind; negative control:
      removing the clear fails the existing case that follows.

## 4. Case files that ship

- [ ] 4.1 Add eight case files, each mirroring the spec case it names and recorded with `--record` on
      both platforms so the carets are measured. Under `e2e-tests/cases/outline-zoom/`: #259
      (`80:361`, a zoom start and ⌘⇧↓), a refused edit that leaves the zoom (`80:1516`, Backspace at
      the root's content start), an edit that keeps it (`80:1656`, typing into the root) and one
      that ends it (`80:1668`, emptying the root's line). Under `e2e-tests/cases/outline-folding/`:
      `96:69` (Enter inside a folded node opens it), `96:53` (Enter at its end keeps it folded),
      `92:41` (a move carries the fold) and `92:159` (undo of a move brings it back, three
      phases). Verify with `tests/case-files.test.ts` and `npm run test:e2e:narrow -- drawn-cases`
      on both configs; negative control: deleting the `●` from `80:1516`'s `expected` fails it on
      `zoom`.

## 5. The human-facing form

- [ ] 5.1 Extend `.agents/skills/presenting-examples/SKILL.md`: the two glyphs and their order in
      the table, the rule that a result states the whole fold and zoom state where a caret is
      compared only if drawn, the indentation cost of a marked line, and the limit that a note
      cannot hold `●` or `►`. Verify by running the SKILL.md `layout.ts` example with a marked
      column and comparing its output with the block printed beside it.

## 6. Validation

- [ ] 6.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`
      and `npm test` pass.
- [ ] 6.2 `npm run test:e2e:narrow -- drawn-cases` and with `--mobile` pass, and a narrow run of
      `91-fold-commands` and `80-outline-zoom` on each config shows the probe change did not move a
      passing run.
- [ ] 6.3 `openspec validate folded-and-zoomed-case-files --strict`.
