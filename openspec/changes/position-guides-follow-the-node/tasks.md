## 1. The rule, in the facts

- [x] 1.1 Change `computeLineGuides`' second parameter (src/plugin/decorate.ts) from a line number
      to the materialized row's guide fact (`lineNumber`, `guideDepths`, `listGuideDepths`). In
      `trimGapTails`, when the pass reaches that line and it is a gap line, narrow its fact on both
      tracks to the intersection with the handed depths, and carry the narrowed depths upward as
      the content below (design D1, D2). Update the existing callers in `tests/decorate.test.ts`
      to hand over the typed row's fact. Verify: `npm run build` passes and the "guide tails"
      tests pass with their expectations unchanged.
- [x] 1.2 Rewrite `trimGapTails`' doc comment where it argues "a line number rather than a
      different document": say what the row fact carries, and why the result is the intersection
      (the node's bound and the document's bound). Explain; do not advocate, and no figures.
- [x] 1.3 In `factsFor`'s new-node branch (src/plugin/decorations.ts), derive the position's row
      from `computeLineGuides(provisional.doc)` at the scope-local line
      (`provisional.line - provisional.offset`), and hand it over before the shift back. Drop the
      no-op argument from the bisecting branch, and correct both comments. The "Guides still come
      from the document as it actually is" comment states the rule this change replaces (design
      D3). Verify: `npm run build` and `npm run lint` pass.

## 2. Unit tests (`tests/decorate.test.ts`)

- [x] 2.1 The reported shape, driven through `planKey` (Enter, Enter at the end of `- b` on
      `# H` / blank / `para` / blank / `- a` / `- b`): the position's row carries `[0]`, and every
      row above it carries what it carries with no position open. Also the heading-parent control
      (`# H` / blank / `- a` / `- b`), whose row keeps `[0]`. Negative control: hand the row its
      own walk-assigned depths instead of the typed row's (the old rule), and the paragraph case
      fails with `[0,1]` while the control still passes.
- [x] 2.2 The continuation case: `para` / blank / `- a`, caret on row 1 at column 0. The row
      carries no guide at `para`'s depth. Negative control: the old rule gives it one.
- [x] 2.3 The blank run above narrows: `# H` / blank / `para` / blank / `- a` / blank / blank,
      caret on the last row. The row between and the position's row both carry `[0]`, and
      neither carries `para`'s depth. Negative control: the old rule gives both `[0,1]`.
- [x] 2.4 The existing extension cases still hold unchanged: "extends the guide to an open
      provisional position, and to the blanks between", and "adds no DEPTH: a childless node with
      a position below it owns no guide". The second is the guard for D1's rejected alternative:
      handing over the typed row's depths outright makes it fail. Add the reported shape to the
      table in "leaves the line's GUIDES exactly where they were".
- [x] 2.5 The differential property (design D4), over `arbMarkdownText` and `arbTree` with a
      `numRuns` the suite's timeout carries. For every blank line `materializeProbe` accepts, at
      the line's end and at column 0, compose the open guides as `factsFor` does, with the
      bisection gate read inline. The position's row and the blank run above it must equal the
      typed document's guides on both tracks. The only allowed difference must be depths missing
      from the open side that equal the materialized node's parent's depth, where that parent is
      childless in the document. Negative control: the old rule makes the property fail, and
      fast-check shrinks the counterexample to a list-under-paragraph or continuation shape;
      record which in the commit message.

## 3. Rendered verification

- [ ] 3.1 E2e in `e2e/specs/51-guides-gradient.e2e.ts`: create `# H` / blank / `para` / blank /
      `- a` / `- b`, put the caret at the end of `- b`, and press Enter twice through `h.keys`.
      The position's row must resolve fewer gradient layers than `- b`'s row. After typing one
      character, that row must resolve the same count it did as a position. Repeat inside a zoom
      on `# H`, where the guides are re-based and the same two relationships must hold. Assert the
      relationships, not pixel values. Negative control: revert 1.3's hand-over, and the first
      assertion fails. Run:
      `npm run test:e2e:narrow -- 51-guides-gradient "left a subtree"`, and again with `--mobile`.
- [ ] 3.2 The existing extension case still passes:
      `npm run test:e2e:narrow -- 51-guides-gradient "caret parked past the end of a section"`.
- [ ] 3.3 Manual pass in `test-vault/`: the report's steps with and without a zoom. The guide no
      longer crosses the position's marker, and typing a character changes nothing on that row.
      Fold anything the fixtures could not judge into `docs/research/32` or
      `docs/research/12-decoration-follow-ups.md`.

## 4. Land

- [ ] 4.1 Push a checkpoint and confirm the CI matrix is green across every group, desktop and
      mobile.
- [ ] 4.2 Sync the delta into `openspec/specs/outline-decorations/spec.md`, archive the change,
      and bump the version with `npm version patch`, all on the branch before merging.
- [ ] 4.3 `openspec validate position-guides-follow-the-node --strict`
