# Tasks

## 1. The created-seam rule in normalization

- [ ] 1.1 Compute the pre-operation adjacency in `finalize` (`src/ops.ts`): the set of seam pairs by
  node id, final descendant to next sibling and parent to first child, relation-agnostic, and each
  block's kind as written. Verify with a unit test that a parsed tree's own pairs are all in the set and
  that `finalize(doc, doc, …)` over it creates no seam. Negative control: recording pairs with their
  relation fails an indent that re-nests a sibling as a first child.
- [ ] 1.2 Add `finalize`'s lineage parameter (new block → the old block directly above the seam it takes
  over), substituted on a seam's upper side only, and state it from every op that replaces a block.
  Verify with unit tests that each leaves its seam below as written:
  - a split mid-text and at the end of `para text` written directly above `# H`
  - a folded split
  - `p1` / blank / `p2` / `# H` merged, with `# H` / `p1` flush above staying flush too
  - a drafted heading after `## Foo` / `text` / `## Bar`

  Negative control: dropping each op's lineage fails its test. Substituting on both sides fails the merge.
- [ ] 1.3 Mark a seam created when either block's kind as written changed. Verify with the indent
  scenario (`p1` / blank / `p2` / `> q`, indent `p2`). Negative control: comparing ids only fails it.
- [ ] 1.4 Classify lists (maximal runs of adjacent sibling items by kind as written) and seams inside
  them (D4). In `normalizeBoundaries`, write one blank line at an empty created seam outside a list,
  keeping the parse-required separator as the floor. Verify with unit tests for the new requirement's
  scenarios:
  - the pasted quote (with the blank line under `## H`), the drag, the removal
  - the run of list items and the code block in a tight list
  - the untouched user boundary, the seam inside a moved run

  Negative controls:
  - dropping the created-seam check fails the pasted quote, the drag and the removal
  - dropping the list scope fails the code block in a tight list
  - reading every seam as created fails the untouched boundary and the moved run
- [ ] 1.5 Verify the never-widen limit with a unit test where an operation creates a seam that already
  holds one blank line. Negative control: appending the separator whether or not the seam is empty fails
  it.
- [ ] 1.6 Verify the block-id limits with unit tests: an attached id pasted above a paragraph keeps the
  new blank line below the id; deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps `^id3`
  flush and unattached. Negative controls: writing the separator before the attached id fails the first,
  and dropping the lone-id exemption fails the second.
- [ ] 1.7 Remove `splitNode`'s own heading-child separator (`separateFromHeading`), which the rule now
  provides. Verify with the heading-split scenario. Negative control: with both it and the rule's check
  removed, the heading split's child is written flush.
- [ ] 1.8 Keep the pass a no-op on a parsed tree. Verify with the roundtrip and closure properties, plus
  a property that `finalize(doc, doc, …)` over generated documents leaves the text unchanged. Negative
  control: treating every seam as created fails it.
- [ ] 1.9 Re-check the existing unit tests that pin a flush created seam outside a list (edit-ops, ops,
  grammar, split, enforce). Update each expectation to the rule, and record in the test's comment which
  created seam gained the line. Verify with `npm test`.

## 2. Insertion, removal and reordering

- [ ] 2.1 Give a list's exit gap to the seam that leaves the list, and a created in-list seam the list's
  own separation, in `spliceAtIndex` and `moveSubtreesTo`'s splice. Verify `Subtree insertion at a
  boundary`'s scenarios and the new requirement's as unit tests:
  - a list item pasted or dragged after `- b` in `- a` / `- b` / blank / `para` keeps the list tight
  - an item inserted before the only item of `# H` / blank / `- a`
  - a paragraph between a heading and a code block is separated
  - a run at the end takes over the terminator

  Negative control: the current carry loosens the first two.
- [ ] 2.2 Make `deleteSubtreeGroups` leave its splice seam alone when `spliceFollows`. Verify with unit
  tests:
  - a deletion separates the seam it leaves (`> q` / `---` / blank / `after`)
  - a deletion inside a tight list leaves it tight

  Negative control: omitting removal-created pairs from the rule fails the first.
- [ ] 2.3 Verify with unit tests that a same-scope reorder keeps its positional gaps and separates only a
  created seam outside a list that the positions leave empty, and that a heading-section swap separates
  a flush seam it creates. Negative control: reading reorder seams as old fails both.

## 3. Places and sibling headings

- [ ] 3.1 Write Enter's provisional positions separated on both sides, inside lists too, in every op
  that leaves one: `splitNode` (including its folded path), `insertEmptyBefore`, `unwrapListItem`, and
  `outdentSurgery` when it dissolves an empty item. Each always writes the place's own line, plus a blank
  line on each side only where that side lacks one. Verify with unit tests for:
  - a content-start Enter under a flush `> q`, a heading and a closing fence, and under a flush `  > q`
    inside an item
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item`
  - leaving a list under a paragraph (`para` / `- a` / `- ` / `next`)
  - an Enter at the end of an item whose first child is a paragraph
  - an Enter in a gap already three lines wide, which still changes the document

  Negative control: the current place encodings fail the first four.
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

- [ ] 4.1 State a type-over's lineage in `src/enforce.ts` (payload's first block → the replaced run's
  upper seam, last block → its lower seam), and verify with unit tests through `computeVerdict`:
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - a paste onto an empty `- ` between `- a` and `> q` does the same
  - typing `x` over a selected `para` in `# H` / blank / `para` / `> q` keeps `x` flush above `> q`
  - a quote typed over a paragraph that sat flush above another paragraph is separated from it

  Negative controls: disabling task 2.2's `spliceFollows` check fails the first two, and dropping the
  type-over's lineage fails the third.
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
