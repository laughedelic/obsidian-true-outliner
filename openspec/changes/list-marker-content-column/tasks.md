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

## 3. Close the change

- [x] 3.1 Run `npm run lint`, `npx tsc --noEmit` and `npm run build:e2e`; verify all clean.
- [x] 3.2 Run `openspec validate list-marker-content-column --strict`.
