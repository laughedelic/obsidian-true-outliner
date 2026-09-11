## 1. The matcher

- [ ] 1.1 Create `src/search.ts` with `matchesText`, `matchNodes` and `referenceMatches` per
      design D2 and D3; verify with `tests/search.test.ts` covering case-insensitivity,
      whitespace trimming, the empty query, a match in each of the node / ancestor first line /
      child / nowhere positions, and a deeper descendant NOT matching. Negative control: make
      `matchesText` case-sensitive and confirm the case test fails
- [ ] 1.2 Add the test that holds D2 to the row model: for a match at N, the texts
      `referenceMatches` searches equal the texts `buildRows` renders for N (node, segments,
      one level of children). Negative control: widen `referenceMatches` to grandchildren and
      confirm it fails

## 2. The hit vocabulary

- [ ] 2.1 Rename `isReference` → `isHit` and `refOf` → `hitOf` in `footer-model.ts`, with the
      hit annotation typed as the content reference plus an optional backlink kind (design D4);
      verify `npm run build` and `tests/footer-model.test.ts` pass with the tests' names updated
- [ ] 2.2 Rename the row's `is-reference` DOM class to `is-hit` in `backlinks-footer.ts` and
      `styles.css`, and update every e2e spec that reads it (grep `is-reference` under `e2e/`);
      verify `npm run test:e2e:narrow -- 73-footer-render` passes

## 3. The term after placement

- [ ] 3.1 Add `admitReferences(placed, controls)` to `footer-filter.ts` (design D5), applying
      the kind axis and the term via `referenceMatches`; verify with `tests/footer-filter.test.ts`
      cases for kind-only, term-only, both, and a property reference matching on its text.
      Negative control: return every reference regardless of the term and confirm the term case
      fails
- [ ] 3.2 Make `fillGroup` use `admitReferences` in place of its hand-rolled kind narrowing;
      verify `npm run test:e2e:narrow -- 77-footer-controls` still passes the kind-axis tests
- [ ] 3.3 Split the controls pass so that, while a term is active, `render` places every
      axis-admitted source, admits references through `admitReferences`, drops empty groups,
      then sorts and caps (design D1); while the term is empty the existing pass runs unchanged.
      Verify with unit tests on the pure half: totals count admitted references only, a group
      with no admitted reference is absent, the cap applies after the term. Negative control:
      apply the cap before the term and confirm the "term reads what the cap would have skipped"
      case fails
- [ ] 3.4 Keep the header's previous totals on screen until the term-active pass lands, and
      guard the pass with the existing generation counter; verify by typing quickly in the field
      on the hub fixture and confirming no intermediate count from a stale pass is shown
- [ ] 3.5 Change the field's placeholder from "Filter by note name…" to "Filter…"; verify in
      `77-footer-controls`'s row-reveal test

## 4. Marking matches

- [ ] 4.1 Add the text-node walk that wraps each occurrence of the term in
      `<mark class="to-match">` after `renderInline` resolves, applied to admitted rows only
      while a term is active (design D6), and the `styles.css` rule that separates it from a bare
      `<mark>`; verify with a unit test on a detached element containing a link and an author's
      highlight: the link survives, the author's mark has no class, the term's mark has it.
      Negative control: match on the source string instead and confirm the link case fails

## 5. End-to-end

- [ ] 5.1 Add to `e2e/specs/77-footer-controls.e2e.ts`: a term in a referencing node's text
      admits it and excludes a sibling reference; a term in an ancestor admits the reference
      beneath; a term only in a folded descendant admits nothing; the totals follow the term; the
      match is marked and clearing the term removes every mark. Each test's negative control:
      run it with the term filter disabled in `admitReferences` and confirm it fails
- [ ] 5.2 Add to `e2e/specs/78-footer-caps.e2e.ts`: with the cap below the hub fixture's total
      and a term matching only a source beyond the cap, the reference is shown; with no term,
      the excluded source is not read (the existing assertion). Negative control: cap before
      term, as in 3.3
- [ ] 5.3 Manual pass on the hub fixture and on a real vault: type a phrase from a reference,
      an ancestor heading, a child; confirm the footer narrows, marks, and the header count
      matches the rows; record findings in `docs/research/31`

## 6. Docs and validation

- [ ] 6.1 Add to `docs/research/18` D8 the note that the name-only rule is superseded by this
      change and the measurement that superseded it; verify the note links to `docs/research/31`
- [ ] 6.2 `openspec validate search-hits-and-footer-content-filter --strict`
