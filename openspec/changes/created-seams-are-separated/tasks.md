# Tasks

## 1. The created-seam rule

- [ ] 1.1 Move the line alignment out of `src/plugin/dispatch.ts` into a shared module, with dispatch
  unchanged. Verify with the existing dispatch tests (`npm test`).
- [ ] 1.2 Classify seams from the alignment (D1): the user's, at a replacement's edge (with the
  kind-as-written check), or created. Verify with unit tests of the classifier:
  - an insertion, a deletion and a move of a run
  - a split mid-text
  - a merge
  - a replacement of one block by another of the same kind, and of another kind

  Negative control: classifying every seam by whether its two lines are unchanged fails the split,
  merge and replacement cases.
- [ ] 1.3 In `finalize` (`src/ops.ts`), encode, classify, add one blank line to each created, empty seam
  outside a list (D3, D4), and encode again. Verify with unit tests for the new requirement's
  scenarios:
  - the pasted quote, the drag, the removal
  - the run of list items and the code block in a tight list
  - the split's and the merge's outer seams
  - the re-encode that changes a kind
  - the untouched user boundary, the seam inside a moved run

  Negative controls:
  - skipping the pass fails the pasted quote, the drag and the removal
  - dropping the list scope fails the code block in a tight list
  - dropping the replacement-edge case fails the split and the merge
- [ ] 1.4 Verify the never-widen limit with a unit test where an operation creates a seam that already
  holds one blank line. Negative control: adding the separator whether or not the seam is empty fails it.
- [ ] 1.5 Verify the block-id limits with unit tests:
  - an attached id inserted above a paragraph keeps the new blank line below the id
  - deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps `^id3` flush and unattached

  Negative controls: writing the separator before the attached id fails the first, and dropping the
  lone-id exemption fails the second.
- [ ] 1.6 Remove `splitNode`'s own heading-child separator (`separateFromHeading`), which the rule now
  provides. Verify with the heading-split scenario. Negative control: with both it and the pass removed,
  the child is written flush.
- [ ] 1.7 Verify that the pass is a no-op on a parsed tree, with a property over generated documents that
  `finalize(doc, doc, …)` leaves the text unchanged. Add a property that the pass never adds more than one
  line to any seam, and never to a non-empty one. Negative controls: classifying every seam as created
  fails the first, and appending unconditionally fails the second.
- [ ] 1.8 Re-check the existing unit tests that pin a flush created seam outside a list (edit-ops, ops,
  grammar, split, enforce). Update each expectation to the rule, and record in the test's comment which
  created seam gained the line. Verify with `npm test`.

## 2. Gestures of two steps

- [ ] 2.1 Make `deleteSubtreeGroups` add no separators when a splice follows, and judge the splice's
  `finalize` against the text before the gesture, in `src/enforce.ts`'s type-over and empty-anchor paste
  paths. Verify with unit tests through `computeVerdict`:
  - `x` typed over a selected `para` in `> q` / `para` / `z` keeps both seams flush
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - a quote typed over a paragraph that sat flush above another paragraph is separated from it

  Negative control: judging the splice against the text after the deletion fails the first two.
- [ ] 2.2 Verify that a payload's own flush quote over a paragraph arrives separated, and that a paste onto
  a place leaves exactly one blank line above the pasted content (`tests/enforce.test.ts`). Negative
  control: skipping the pass fails the first, and keeping the place's full width fails the second.
- [ ] 2.3 Verify the narrowed indent-unit round trip: a list item's subtree copied and pasted back after
  itself is still byte-identical, in every unit the existing scenario covers. Negative control: applying
  the rule inside lists fails it for a subtree with a flush child block.

## 3. Places

- [ ] 3.1 Write Enter's provisional positions separated on both sides, inside lists too, in every op that
  leaves one: `splitNode` (including its folded path), `insertEmptyBefore`, `unwrapListItem`, and
  `outdentSurgery` when it dissolves an empty item. Each writes the place's own line, plus a blank line on
  each side only where that side lacks one. Verify with unit tests for:
  - a content-start Enter under a flush `> q`, a heading and a closing fence, and under a flush `  > q`
    inside an item
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item`
  - leaving a list under a paragraph (`para` / `- a` / `- ` / `next`)
  - an Enter in a gap already three lines wide, which still changes the document

  Negative control: the current place encodings fail the first four.
- [ ] 3.2 Make a dissolving op's stated removal (`abandonEdit` in `src/plugin/grammar.ts`, used by the
  keyboard grammar and `src/plugin/main.ts`'s command path) remove the place's line and the separators
  beside it. It then leaves one blank line outside a list, and inside a list the larger of the item's two
  gaps. Verify in `tests/undo-on-abandon.test.ts`:
  - abandoning an unwrap under `- item` above `next` leaves `- item` / blank / `next`
  - abandoning one in a loose list leaves one blank line, and in a tight list none
  - every opened place still restores the source byte for byte

  Negative control: the `drop-line` form alone leaves two blank lines in the loose list.
- [ ] 3.3 Verify that a Shift+Enter position stays adjacent, and that the drafted sibling heading is
  separated on both sides, in `tests/grammar.test.ts` and `tests/ops.test.ts`. Negative control: the
  pass applied to non-empty gaps separates the Shift+Enter position.
- [ ] 3.4 Update the e2e specs whose buffer assertions cover Enter places, list departures or Shift+Enter
  headings. Run each touched spec in narrow mode (`npm run test:e2e:narrow -- <spec>`).

## 4. Dispatch and research

- [ ] 4.1 Make the relocation match in `src/plugin/dispatch.ts` set blank lines aside, and dispatch a
  created seam's blank line as an insertion of its own. Verify with the new `minimal-change-dispatch`
  scenario and the existing table-widget scenarios. Measure in the real app a paragraph moved below a
  table and a removal that joins a table and a paragraph. Negative control: the current exact-lines match
  rewrites the table.
- [ ] 4.2 Add the #264 manual case (`    first` / blank / `    > quote` pasted at the end of `## H` above
  `below`) and the drag case as e2e cases, and run the clipboard and dragging specs in narrow mode. Confirm
  each fails on the layer below.
- [ ] 4.3 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in
  `docs/research/lazy-continuation-at-seams.md`. Verify that no row loses a node.
- [ ] 4.4 Comment on #261 that the drag case is closed by this change.

## 5. Validation

- [ ] 5.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 5.2 Run `openspec validate created-seams-are-separated --strict`.
