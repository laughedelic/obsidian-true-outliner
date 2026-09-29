## 1. Measure

- [x] 1.1 Re-measure each item in the running app with `npm run drive`: a wrapped quote (top level,
      nested, in an item; outline mode on and off), a table at the top of a note and after a
      paragraph, a properties block and an inline embed, and the caret at the end of a folded item
      against both sides of `coordsAtPos`; and `67` with the real hooks. Recorded in
      `docs/research/ambient-e2e-monitors.md`, "Precision corrections (#315)": its quote table, the
      table, properties and embed paragraph, the caret paragraph and the set-up paragraph.

## 2. Correct the readings

- [x] 2.1 `e2e-tests/monitors.ts`, grid: a quote's marker anchors the line and its text hangs.
      Rows: a wrapped quote at the top level and nested reads clean; a quote nudged half a pixel
      reads clean, nine pixels right is `grid-off-column` and eighteen left is
      `grid-left-of-column`. Negative control: the quote branch disabled makes the first row report
      `grid-off-column` and `grid-wrap-hang`, and the half-pixel step report `grid-off-column`.
      Verified by `npm run test:e2e:narrow -- 01-ambient`.
- [x] 2.2 `e2e-tests/monitors.ts`, height map: an empty line whose next sibling is a widget is
      skipped. Row: a note that opens with a table reads clean. Negative control: the skip removed
      makes the row report `heightmap-no-position`. Verified likewise.
- [x] 2.3 `e2e-tests/monitors.ts`, caret: read against both sides of the head. Rows: the end of a
      folded item reads clean; a caret that neither side accounts for is reported. Negative
      control: the second side removed makes the first row report `caret-off-coords`. Verified
      likewise.
- [x] 2.4 `e2e-tests/monitors.ts`, layout shift: a change to identical text is not an edit. Row: a
      replacement with the same text leaves the case unread. Negative control: counting the
      identical replacement makes the row read the case instead of skipping it. Verified likewise,
      and by `67-node-selection-extension`, whose report is in the note, before and after.
- [x] 2.5 `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`: the vetoed-edit case waits for
      "These blocks can't be joined into one." Negative control: the message text changed in
      `src/plugin/messages.ts` for one run makes the case time out on the wait; reverted. Verified by
      `npm run test:e2e:narrow -- 62-outline`, whose report lists no unexpected notice.

## 3. Sweep

- [ ] 3.1 Push the checkpoint. Verified by the CI matrix, desktop and mobile: each job's
      `[e2e] monitors:` report is read from its log (the step summary carries the same file), and
      `docs/research/ambient-e2e-monitors.md` states which rules read clean over the whole suite,
      which still report and why, for #316 and #294. The rows of its "What is left" table that read
      "A rule to correct: #315" are rewritten to the sweep's result.
- [ ] 3.2 Each rule the sweep still reports has an issue or a line in the note saying it is
      reference. Verified by reading the note against the issues the sweep cites.

## 4. Close

- [ ] 4.1 Sync the delta into `openspec/specs/e2e-verification/spec.md`. Verified by the `Landed`
      check, which also holds the archive.
- [ ] 4.2 `openspec validate monitors-read-stock-behaviour-as-clean --strict`.
