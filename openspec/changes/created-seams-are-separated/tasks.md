# Tasks

## 1. The created-seam rule in normalization

- [ ] 1.1 Compute the pre-operation adjacency in `finalize` (`src/ops.ts`): the set of seam pairs by
  node id, final descendant to next sibling and parent to first child. Hand it to
  `normalizeBoundaries`. Verify with a unit test that a parsed tree's own pairs are all in the set
  (negative control: omitting parent-to-first-child pairs fails it).
- [ ] 1.2 In `normalizeBoundaries`, write one blank line at an empty seam whose pair is not in the set,
  unless both blocks are list items as written (`kindAsWritten`). Keep the parse-required separator
  as the floor for every seam. Verify with unit tests for each scenario of `A seam an operation
  creates is separated`: the pasted quote, the drag, the removal, the tight list, the code block in
  a tight list, the heading split, the untouched user boundary, the seam inside a moved run, the
  unwidened seam, and the block id. Negative control: dropping the created-seam check fails every
  one but the untouched boundary, the moved-run seam and the tight list.
- [ ] 1.3 Keep the pass a no-op on a parsed tree. Verify with the existing roundtrip and closure
  properties, plus a property that `finalize(doc, doc, …)` over generated documents leaves the text
  unchanged. Negative control: treating every seam as created fails it.
- [ ] 1.4 Re-check the existing unit tests that pin a flush created seam (edit-ops, ops, grammar,
  split, enforce). Update each expectation to the rule, and record in the test's comment which
  created seam gained the line. Verify with `npm test`.

## 2. Insertion, removal and reordering

- [ ] 2.1 Narrow `spliceAtIndex`'s separation-carrying (`src/ops.ts`) so the carried gap stands as a
  seam's whole separation only between list items, and normalization separates the rest. Verify with
  `Subtree insertion at a boundary`'s scenarios as unit tests: a tight list stays tight, a paragraph
  between a heading and a code block is separated, and a run at the end takes over the terminator.
  Negative control: restoring the carry for every seam fails the heading/code case.
- [ ] 2.2 Verify with unit tests that a deletion separates the seam it leaves (`> q` / `---` /
  blank / `after`), and that a deletion inside a tight list leaves it tight. Negative control:
  omitting removal-created pairs from the rule fails the first.
- [ ] 2.3 Verify with unit tests that a same-scope reorder keeps its positional gaps and separates
  only a created seam the positions leave empty, and that a heading-section swap separates a flush
  seam it creates. Negative control: reading reorder seams as old fails both.

## 3. Places and sibling headings

- [ ] 3.1 Write Enter's provisional positions separated on both sides in `splitNode`,
  `insertEmptyBefore` and `unwrapListItem` (`src/ops.ts`), adding only the lines a seam lacks. Verify
  with unit tests for:
  - a content-start Enter under a flush `> q`, a heading and a closing fence
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item` and above a flush `next`

  Negative control: the current place encodings fail each.
- [ ] 3.2 Verify that abandoning each of those places restores the source byte for byte, in
  `tests/undo-on-abandon.test.ts`. Negative control: a place written with a line the abandon edit
  does not remove fails it.
- [ ] 3.3 Separate `insertSiblingHeading`'s new heading from the section above it. Verify with the
  Shift+Enter heading scenarios in `tests/grammar.test.ts` and `tests/ops.test.ts`. Negative control:
  the old flush encoding fails them.
- [ ] 3.4 Update the e2e specs whose buffer assertions cover Enter places or Shift+Enter headings, and
  run each touched spec in narrow mode (`npm run test:e2e:narrow -- <spec>`).

## 4. Paste and type-over

- [ ] 4.1 Verify D7 with unit tests through `computeVerdict`: a type-over over a whole scope in a
  tight list stays tight; one that brings a quote above a paragraph separates them; the payload's own
  flush quote over a paragraph arrives separated. Negative control: suppressing the rule in the
  insertion's `finalize` fails the last two.
- [ ] 4.2 Verify that a paste onto a place leaves exactly one blank line above the pasted content,
  in the paste tests of `tests/enforce.test.ts`. Negative control: keeping the place's full width
  fails it.
- [ ] 4.3 Run the clipboard e2e specs in narrow mode, add the #264 manual case (`    first` / blank /
  `    > quote` pasted at the end of `## H` above `below`) as an e2e case, and confirm it fails on the
  layer below.

## 5. Dispatch and research

- [ ] 5.1 Measure a move that gains a blank line through `minimal-change-dispatch`: a drag that
  separates a created seam, and the table-widget scenarios. Record whether it still dispatches as a
  relocation, in `docs/research/lazy-continuation-at-seams.md`. Fix the narrowing if it no longer does,
  with a test whose negative control is the unfixed narrowing.
- [ ] 5.2 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in the note. Verify that
  no row loses a node.
- [ ] 5.3 Comment on #261 that the drag case is closed by this change.

## 6. Validation

- [ ] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 6.2 Run `openspec validate created-seams-are-separated --strict`.
