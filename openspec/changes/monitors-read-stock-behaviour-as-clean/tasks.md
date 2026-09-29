## 1. Measure

- [x] 1.1 Re-measure each item in the running app with `npm run drive`: a wrapped quote (top level,
      nested, in an item; outline mode on and off), a table at the top of a note and after a
      paragraph, and the caret at the end of a folded item against both sides of `coordsAtPos`; and
      `67` with the real hooks. Recorded in `docs/research/ambient-e2e-monitors.md`, "Precision
      corrections (#315)". Verified by `npm run lint`, whose research-index check passes.

## 2. Correct the readings

- [ ] 2.1 `e2e-tests/monitors.ts`, grid: a quote's marker anchors the line and its text hangs.
      Row: a wrapped quote at the top level, nested and in an item reads clean, and a quote nudged
      off its column is reported by its marker. Negative control: the quote branch disabled makes
      the first row report `grid-off-column` and `grid-wrap-hang`. Verified by
      `npm run test:e2e:narrow -- 01-ambient`.
- [ ] 2.2 `e2e-tests/monitors.ts`, height map: a line that draws no text is skipped. Row: a note
      that opens with a table reads clean. Negative control: the skip removed makes the row report
      `heightmap-no-position`. Verified likewise.
- [ ] 2.3 `e2e-tests/monitors.ts`, caret: read against both sides of the head. Rows: the end of a
      folded item reads clean; a caret that neither side accounts for is reported. Negative
      control: the second side removed makes the first row report `caret-off-coords`. Verified
      likewise.
- [ ] 2.4 `e2e-tests/monitors.ts`, layout shift: edits carry their time, shifts carry their frame's
      time, and a change to identical text is not an edit. Rows: a shift before the first edit is
      not judged and one after it is; a replacement with the same text leaves the case unread.
      Negative controls: judging against every edit makes the first row report `shift-above-edit`;
      counting the identical replacement makes the second row read the case instead of skipping it. Verified likewise, and by
      `67-node-selection-extension`, whose real report was 10 observations in 7 cases before and is 0
      after.
- [ ] 2.5 `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`: the vetoed-edit case waits for
      "These blocks can't be joined into one." Negative control: the message text changed in
      `src/plugin/messages.ts` for one run makes the case time out on the wait; reverted. Verified by
      `npm run test:e2e:narrow -- 62-outline`, whose report lists no unexpected notice.

## 3. Sweep

- [ ] 3.1 Push the checkpoint. Verified by the CI matrix, desktop and mobile: every job's report is
      read from its log, and `docs/research/ambient-e2e-monitors.md` states which rules read clean
      over the whole suite, which still report and why, for #316 and #294.
- [ ] 3.2 Each rule the sweep still reports has an issue or a line in the note saying it is
      reference. Verified by reading the note against the issues the sweep cites.

## 4. Close

- [ ] 4.1 `openspec validate monitors-read-stock-behaviour-as-clean --strict`, sync the delta into
      `openspec/specs/e2e-verification/spec.md`, and archive. Verified by the `Landed` check.
