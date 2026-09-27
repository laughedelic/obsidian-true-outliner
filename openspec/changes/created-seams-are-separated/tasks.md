# Tasks

## 1. The created-seam rule in normalization

- [ ] 1.1 Compute the pre-operation adjacency in `finalize` (`src/ops.ts`): the set of seam pairs by
  node id, final descendant to next sibling and parent to first child, relation-agnostic. Verify with
  a unit test that a parsed tree's own pairs are all in the set, and that an indent's re-nested pair
  still is. Negative control: omitting parent-to-first-child pairs fails the indent case.
- [ ] 1.2 Add `finalize`'s lineage parameter (new block → the old block whose seam below it takes
  over), and read pairs through it. Verify with unit tests that a split, a merge and a drafted sibling
  heading leave the seam below them as written:
  - `para text` / `# H` split mid-text
  - `p1` / blank / `p2` / `# H` merged
  - `## Foo` / `## Bar` with a drafted heading after `## Foo`'s section

  Negative control: dropping the lineage fails all three.
- [ ] 1.3 Classify a seam as inside a list (D4), and in `normalizeBoundaries` write one blank line at an
  empty created seam outside a list. Keep the parse-required separator as the floor for every seam.
  Verify with unit tests for the new requirement's scenarios:
  - the pasted quote, the drag, the removal
  - the run of list items and the code block dropped into a tight list
  - the untouched user boundary, the seam inside a moved run

  Negative controls:
  - dropping the created-seam check fails the pasted quote, the drag and the removal
  - dropping the list scope fails the code block in a tight list
  - reading every seam as created fails the untouched boundary and the moved run
- [ ] 1.4 Verify the never-widen limit with a unit test where an operation creates a seam that already
  holds one blank line. Negative control: appending the separator whether or not the seam is empty fails
  it.
- [ ] 1.5 Verify the block-id limits with unit tests: an attached id pasted above a paragraph keeps the
  new blank line below the id, and deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps
  `^id3` flush and unattached. Negative controls: writing the separator before the attached id fails the
  first, and dropping the lone-id exemption fails the second.
- [ ] 1.6 Remove `splitNode`'s own heading-child separator (`separateFromHeading`), which the rule now
  provides. Verify with the heading-split scenario. Negative control: with both it and the rule's check
  removed, the heading split's child is written flush.
- [ ] 1.7 Keep the pass a no-op on a parsed tree. Verify with the roundtrip and closure properties, plus
  a property that `finalize(doc, doc, …)` over generated documents leaves the text unchanged. Negative
  control: treating every seam as created fails it.
- [ ] 1.8 Add a property that runs every structural op over generated documents and checks that no seam
  whose two blocks existed before, and did not move, gains a line. Negative control: dropping the lineage
  from `splitNode` fails it.
- [ ] 1.9 Re-check the existing unit tests that pin a flush created seam outside a list (edit-ops, ops,
  grammar, split, enforce). Update each expectation to the rule, and record in the test's comment which
  created seam gained the line. Verify with `npm test`.

## 2. Insertion, removal and reordering

- [ ] 2.1 Leave `spliceAtIndex`'s separation-carrying as it is, and verify `Subtree insertion at a
  boundary`'s scenarios as unit tests:
  - a tight list stays tight for list items and for blocks inside an item
  - a paragraph between a heading and a code block is separated
  - a run at the end takes over the terminator

  Negative control: disabling normalization's created-seam check fails the heading/code case.
- [ ] 2.2 Make `deleteSubtreeGroups` leave its splice seam alone when `spliceFollows`. Verify with unit
  tests:
  - a deletion separates the seam it leaves (`> q` / `---` / blank / `after`)
  - a deletion inside a tight list leaves it tight

  Negative control: omitting removal-created pairs from the rule fails the first.
- [ ] 2.3 Verify with unit tests that a same-scope reorder keeps its positional gaps and separates only a
  created seam outside a list that the positions leave empty, and that a heading-section swap separates
  a flush seam it creates. Negative control: reading reorder seams as old fails both.

## 3. Places and sibling headings

- [ ] 3.1 Write Enter's provisional positions in `splitNode`, `insertEmptyBefore` and `unwrapListItem`
  (`src/ops.ts`): always the place's own line, plus a blank line on each side only where that seam lacks
  one and lies outside a list. Verify with unit tests for each of these:
  - a content-start Enter under a flush `> q`, a heading and a closing fence
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item` above a flush `next`
  - an Enter in a gap already three lines wide, which still changes the document

  Negative control: the current place encodings fail the first three.
- [ ] 3.2 Make a dissolving op's stated removal (`src/plugin/grammar.ts`) cover the place's line and the
  separators it added. Verify in `tests/undo-on-abandon.test.ts`:
  - abandoning an unwrap leaves `- item` / blank / `next`
  - every opened place restores the source byte for byte

  Negative control: the `drop-line` form alone leaves two blank lines.
- [ ] 3.3 Separate `insertSiblingHeading`'s new heading from the section above it, with lineage for the
  seam below it. Verify with the Shift+Enter heading scenarios in `tests/grammar.test.ts` and
  `tests/ops.test.ts`. Negative control: the old flush encoding fails them.
- [ ] 3.4 Update the e2e specs whose buffer assertions cover Enter places, list departures or Shift+Enter
  headings, and run each touched spec in narrow mode (`npm run test:e2e:narrow -- <spec>`).

## 4. Paste and type-over

- [ ] 4.1 Verify D7 with unit tests through `computeVerdict`, each with the negative control of disabling
  task 2.2's `spliceFollows` check:
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - a paste onto an empty `- ` between `- a` and `> q` does the same
  - a type-over that brings a quote above a paragraph separates them
- [ ] 4.2 Verify that a payload's own flush quote over a paragraph arrives separated. Negative control:
  treating the payload's own pairs as old fails it.
- [ ] 4.3 Verify that a paste onto a place leaves exactly one blank line above the pasted content, in the
  paste tests of `tests/enforce.test.ts`. Negative control: keeping the place's full width fails it.
- [ ] 4.4 Run the clipboard e2e specs in narrow mode, and add the #264 manual case (`    first` / blank /
  `    > quote` pasted at the end of `## H` above `below`) as an e2e case. Confirm it fails on the layer
  below.

## 5. Dispatch and research

- [ ] 5.1 Make the relocation match in `src/plugin/dispatch.ts` set blank lines aside, and dispatch a
  created seam's blank line as an insertion of its own. Verify with the new `minimal-change-dispatch`
  scenario (a paragraph moved above a table it sat flush under) and the existing table-widget scenarios.
  Negative control: the current exact-lines match rewrites the table.
- [ ] 5.2 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in
  `docs/research/lazy-continuation-at-seams.md`. Verify that no row loses a node.
- [ ] 5.3 Comment on #261 that the drag case is closed by this change.

## 6. Validation

- [ ] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 6.2 Run `openspec validate created-seams-are-separated --strict`.
