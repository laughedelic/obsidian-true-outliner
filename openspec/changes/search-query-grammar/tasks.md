## 1. The query parser

- [ ] 1.1 Add `parseQuery(query): Query` to `src/search.ts` — steps split on `>` outside quotes,
      terms split on whitespace, each term carrying its text, whether it was quoted and whether it
      was excluded (design D1). Verify with `tests/search.test.ts` covering: whitespace splitting;
      a quoted term keeping its inner spaces; an unclosed quote running to the end; `-` marking an
      exclusion; a bare `-` producing no term; `>` inside quotes staying literal; a trailing `>`
      producing an empty last step; an empty query producing one empty step. Negative control:
      split on `>` before quotes are recognised and confirm the quoted-separator case fails
- [ ] 1.2 Keep `parseQuery` off the per-node path: every entry point below SHALL take a parsed
      `Query`, with the string-taking wrappers parsing once and delegating. Verify by asserting in
      a test that matching 1,000 texts parses the query once (a counter on the parser)

## 2. The term rule

- [ ] 2.1 Implement the term predicate per design D3: a word-anchored prefix, plus one edit —
      insertion, deletion, substitution, or transposition of adjacent characters — for terms of
      four characters or more. Verify with `tests/search.test.ts` cases for each edit shape, for a
      three-character term getting no tolerance, for a term not matching inside a longer word, and
      for a two-edit difference failing. Negative control: lower the floor to three and confirm the
      short-term case fails; raise it to five and confirm the four-letter transposition case fails
- [ ] 2.2 Implement the quoted term as a literal case-insensitive substring (design D4), and the
      exclusion rule (design D5). Verify: a quoted phrase matching across a space; a quoted term
      matching mid-word; a quoted term failing on one edit; an exclusion removing an otherwise
      admitted text; a query of exclusions alone admitting the rest. Negative control: apply the
      word anchor to quoted terms and confirm the mid-word case fails
- [ ] 2.3 Add a property test holding the two grammars together: for any text and any query, a
      quoted query's answer equals the literal-substring answer the shipped `matchesText` gives.
      This is the migration claim in design D4, and it is the one that says nothing findable today
      becomes unfindable

## 3. The chain

- [ ] 3.1 Add the chain match to `src/search.ts`: ancestor steps satisfied by distinct entries in
      order, greedy leftmost, gaps allowed, returning which entry satisfied each step so a caller
      can mark it (design D6, D9). Verify with `tests/search.test.ts`: a skipped generation
      admitted; reversed order refused; a chain shorter than the steps refused; an empty step
      consuming no entry; a trailing `>` admitting every node under a matching ancestor. Negative
      control: require adjacency and confirm the skipped-generation case fails
- [ ] 3.2 Answer an excluded term in an ancestor step against the whole chain (design D5). Verify
      that `-A > B` refuses a node with an ancestor matching A anywhere above it, including above
      the entry that satisfied the step. Negative control: test the exclusion against the
      satisfying entry alone and confirm the case fails
- [ ] 3.3 Keep `matchesText` and `matchRanges` at their current signatures, answering the LAST step
      (design D2). Verify the whole existing `tests/search.test.ts` suite passes unchanged for
      single-step queries — that suite is the compatibility contract the two in-flight surface
      changes rebase onto
- [ ] 3.4 Extend `matchNodes(doc, query)` to answer chain queries against each node's own lineage.
      Verify: a chain query admitting only the nodes under a matching ancestor; a single-step query
      returning exactly what it returns today

## 4. Ranges and marks

- [ ] 4.1 Make `matchRanges` report every positive term's occurrences for one step, merged where
      they touch or overlap, with excluded terms contributing nothing (design D9). Verify:
      two terms both reported; a tolerated slip reporting the word it found rather than the term's
      own length; overlapping matches merged into one; an excluded term reporting nothing. Negative
      control: return ranges unmerged and confirm the overlap case fails
- [ ] 4.2 Add the test that holds ranges to the predicate, as the shipped suite does: a text has
      ranges for a step exactly when that step matches it and the step has a positive term

## 5. The footer

- [ ] 5.1 Make `admitReferences` in `src/plugin/footer-filter.ts` build the reference's chain —
      the source note's name, then the lineage segments — and answer a parsed query against it,
      with the last step answered against the node and its rendered children (spec
      `backlink-filtering`). A single-step query keeps the OR across the whole corpus. Verify with
      `tests/footer-filter.test.ts`: the existing single-step cases unchanged; a two-word query in
      either order; an ancestor step narrowing to one heading; the note name as the chain's root;
      an ancestor step not answered by the node's own text. Negative control: fold the chain into
      the searched text and confirm the "not answered by the node itself" case fails
- [ ] 5.2 Carry the admitting step into the mark walk — in `src/plugin/backlinks-footer.ts` on
      `main`, in `src/plugin/inline-render.ts` if `search-palette` has landed — so a lineage row
      marks its own step and a hit row marks the last (spec `backlinks-footer`). Verify
      with `npm run test:e2e:narrow -- 77-footer-controls` extended by a chain-query case: only the
      ancestor step's text is marked in the lineage row. Negative control: mark every row with the
      whole query and confirm it fails
- [ ] 5.3 Update the field's placeholder and the e2e assertions that read it, if the wording still
      claims a plain term. No other footer chrome changes

## 6. The word cache

- [ ] 6.1 Hang a node's words off the mtime-keyed entry in `src/plugin/source-tree-cache.ts`
      (design D8), computed with the tree and invalidated by the same key. Verify with a unit test
      that a second query over an unchanged file tokenizes nothing, and that touching the file
      recomputes
- [ ] 6.2 Re-run `docs/research/prototypes/search-grammar/bench.mjs --scale 30` against the shipped
      matcher and confirm the figure the design rests on: the cached path at roughly a third of the
      per-pass one. Record the number in the change if it has moved

## 7. Validation

- [ ] 7.1 `npm run typecheck`, `npm test`, `npm run lint`
- [ ] 7.2 Manual pass in a real vault, on desktop and phone: a two-word query, a quoted phrase, an
      exclusion, a mistyped word, and an `A > B` query, each on the footer of a hub note. Record
      what it did and did not establish in `docs/research/search-grammar`, as the footer content
      filter's pass did
- [ ] 7.3 `openspec validate search-query-grammar --strict`
