## 1. Pin the defect

- [x] 1.1 Add parser cases: under `-  a`, a child at two columns is a sibling and at three a
      child; a continuation line is measured the same way; a tab after the marker advances to
      the next stop; a marker alone keeps the one-space column. Negative control: the first
      two must fail against the unmodified parser, which nests at two columns.
- [x] 1.2 Add `markerWidth` cases agreeing with the parser for one, two and three spaces and
      an ordered marker, and a list-to-paragraph case shedding the whole run. Negative
      control: `-  a` must report 2 against the unmodified re-encoder.
- [x] 1.3 Add an indent case in `tests/ops.test.ts`: `- b` indented under `-  a` lands at
      three columns and re-parses as its child. Negative control: the unmodified re-encoder
      writes two columns.
- [x] 1.4 Add an e2e case to `20-structural-commands`: indent under `-  parent` writes three
      columns and Obsidian marks the line as level 2. Negative control: today the buffer
      reads `  - second` and Obsidian marks it level 1.

## 2. Measure the run

- [x] 2.1 Capture the whitespace run in `parseListMarker` and set the content column past it,
      tabs expanded; export the function. Verify 1.1 passes.
- [x] 2.2 Derive `markerWidth` from `parseListMarker`, and strip the whole run in the
      list-to-paragraph kind change. Verify 1.2 and 1.3 pass.
- [x] 2.3 Run `npx vitest run` and verify the corpus, round-trip and property suites still pass.
- [x] 2.4 Run `npm run test:e2e:narrow -- 20-structural-commands` and verify the spec passes.

## 3. Reach and remove the surplus

- [x] 3.1 Add `surplusMarkerSpace` cases in `tests/ops.test.ts`: `-  a` at 3 is one, `- a` at
      2 none, `- [ ]  bar` at 7 one, `##  Two` at 4 one, a single tab none, indentation alone
      none, a column inside or past the run none.
- [x] 3.2 Add classifier cases: Backspace at the content start of `-  beta`, `- [ ]  bar` and
      `##  Two` is `within-node-edit`. Negative control: against the unmodified classifier
      each is `boundary-crossing-edit`.
- [x] 3.3 Narrow `crossesViaChromeDeletion` by the predicate; leave `recognizeMergeIntent`
      as it is, with the reason recorded beside it. Verify 3.2 passes and the merge cases
      in `tests/enforce.test.ts` still do.
- [x] 3.4 Add e2e cases in `57-marker-surplus-space`: a caret set inside the run lands at
      column 3; Backspace there leaves `- b` with the caret at 2; a second Backspace merges;
      the `select` transaction `cursorLineBoundaryLeft` dispatches resolves to column 3.
      Desktop and mobile.

## 4. Mark the surplus

- [x] 4.1 Add `computeSurplusMarkerSpace` and its plugin in `decorations.ts`, marking the run
      past its first character at each of the line's content-start columns, with the title.
- [x] 4.2 Add the rule to `styles/10-editor.css`: highlight background, dotted rule,
      `white-space: pre`.
- [x] 4.3 Add e2e cases: `- a` unmarked, `-  b`, `1.  c`, `- [ ]  d`, `-   e` each carry one
      mark of non-zero width, the three-space mark wider than the one-space; off-mode carries
      none; Backspace removes the mark with the space.
- [x] 4.4 Widen the marker-sizing gate from "exactly one space" to "followed by a space"
      (`SPACED_MARKER_CLASS`), so the mark follows the gutter and the text follows the mark.
      Amend the `56-list-grid` case that pinned the old column, and add a `57` case asserting
      each mark's left edge at a one-space item's text start and each text at its mark's end.
- [x] 4.5 Add the press: `pointerdown` in the capture phase, trailing mouse events swallowed,
      the run re-read from the document, dispatched as a `delete` user event. E2e case: a
      press on `-    e`'s mark leaves `- e`, caret at 2, no mark, one undo step. Desktop and
      mobile.

## 5. Normalize a rewritten first line

- [x] 5.1 Add `normalizeMarkerRun` cases in `tests/reencode.test.ts`, and
      `reencodeForDestination` cases: `-  a` with a continuation line and a child re-encodes
      as `  - a` with both shifted by the column change; `- a` changes only its indentation;
      `-\ta` collapses.
- [x] 5.2 Add indent cases in `tests/ops.test.ts`: `-  a` indented beside `  - q` lands as
      `  - a` with its subtree following; `- b` indented under `-  a` leaves `-  a` alone.
- [x] 5.3 Normalize in `reencodeForDestination`'s no-conversion branch, shifting the subtree
      by the column change. Verify 5.1 and 5.2 pass and the round-trip and property suites
      still do.
- [x] 5.4 Add an e2e case in `20-structural-commands`: indenting `-  second` with its child
      writes `  - second` and `    - child`, levels 2 and 3 to Obsidian.

## 6. Close the change

- [x] 6.1 Run `npm run lint`, `npx tsc --noEmit` and `npm run build:e2e`; verify all clean.
- [x] 6.2 Run `openspec validate list-marker-content-column --strict`.
