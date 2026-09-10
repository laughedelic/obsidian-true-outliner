## 1. The scoped derivation

- [x] 1.1 Add the pure scoped materialization beside the existing provisional helpers in
  `src/plugin/decorate.ts`: text, caret line and column, and a scope (or null) in; the position's
  own fact, the materialized document in the scope's line numbering, the offset, and the
  bisection answer out. Verify with a unit test in `tests/decorate.test.ts` asserting that with a
  null scope it returns exactly what `provisionalFact`/`materializeProbe` return today.
  Negative control: pass the scope through unused — the null case must still pass and the scoped
  case must fail.
- [x] 1.2 Unit-test the scoped case against the document in docs/research/12: zoomed to a node
  with one hidden ancestor, a position on the blank line below a child renders at the depth a
  sibling of that child renders at, one level less than the whole-buffer derivation gives.
  Negative control: build the probe from the whole buffer instead — the asserted depth must come
  back one level too deep.
- [x] 1.3 Unit-test the bisecting case: a position opened interior to a multi-line node inside a
  zoomed subtree leaves every visible line's depth equal to the zoomed rendering with the caret
  elsewhere. Negative control: the same, derived from the whole buffer — every line must come
  back one level right.
- [x] 1.4 Pin the coordinate premise in `tests/projection-decorate.test.ts`: over the generated
  corpus, a subtree document's text is byte-identical to the source lines from the root's start
  line, and its last line is the cover's end line. Negative control: shift the slice by one line
  — the property must fail.

## 2. Wiring the render paths

- [x] 2.1 Make `computeProvisional` in `src/plugin/decorations.ts` the thin wrapper: resolve
  `zoomScope`, call the pure derivation, and store the offset on the `Provisional` record with
  the line and the own fact in absolute line numbers and the document in scope-local ones.
  Verify the unit suite still passes and `npm run build` type-checks.
- [x] 2.2 Shift in `factsFor`: in the bisecting branch, decorate and compute guides from the
  scoped document and shift both by the offset; in the new-node branch, recompute guides from the
  scope's document at the root-relative provisional line and shift. Verify by unit-testing the
  facts a zoomed state produces in both branches against the zoomed baseline.
  Negative control: drop the shift in either branch — the asserted line numbers must go wrong.
  (Verified at the composition the branches perform: `decorations.ts` imports `obsidian`, so
  `factsFor` itself is out of the unit suite's reach and its wiring is e2e's to check.)
- [x] 2.3 Re-base the trail in `computeTrail`: hand `computePositionTrail` the scoped document at
  the root-relative cursor line and shift the result back, replacing the un-rebased call and the
  comment that documents it as unbuilt. Verify with a unit test that the accented depths on a
  provisional position inside a zoomed subtree match the depths the zoomed guides draw.
  Negative control: leave the raw cursor line in place — the accents must land on depths the
  zoomed view carries no guide at, and the test must fail.

## 3. Rendered behaviour

- [x] 3.1 Add an e2e case to `e2e/specs/80-outline-zoom.e2e.ts`: zoomed to a node with a hidden
  ancestor, open an end-of-node provisional position inside it and assert every visible line's
  indentation and guide columns are unchanged from the pre-keypress render, and that the
  position's own row sits on the column its materialized node would. Assert relationships against
  the published unit, never absolute pixel widths. Negative control: run it against the current
  build — it must fail before task 2 lands.
- [x] 3.2 Add the bisecting counterpart to the same spec: a position opened interior to a
  multi-line node inside the zoomed subtree leaves the visible subtree on its zoomed columns.
  Negative control: as above, it must fail on the current build.
- [x] 3.3 Add the caret-leaves case: moving off the position without typing restores exactly the
  pre-position render. Negative control: assert it against a build with 2.2 reverted — the
  restored render must differ. (It does not: a before/after pair cannot see a transient defect,
  since the view returns to the same place either way. The case asserts all three points —
  before, during, after — which is what gives it a control that fires.)
- [x] 3.4 Run the zoom and decoration groups narrow (`npm run test:e2e:narrow -- 80-outline-zoom`,
  then the decorations and position-indicator specs) and confirm no existing case regresses.
  (One did, correctly: `51-guides-gradient`'s single-root qualifier case pinned the frame
  disagreement this change removes — the outermost guide blinking back on as the caret crossed a
  blank row. Rewritten to pin the agreement, with its own negative control.)

## 4. Landing

- [x] 4.1 Mark the docs/research/12 entry closed by this change, keeping its measurement, and
  check nothing else in that note still describes the trail gap as open.
- [ ] 4.2 Sync the delta specs into `openspec/specs/` and archive the change on this branch.
- [ ] 4.3 Bump the patch version (`npm version patch`) and confirm `manifest.json` and
  `versions.json` moved together with no tag created.
- [ ] 4.4 `openspec validate positions-re-base-with-the-zoom --strict`
