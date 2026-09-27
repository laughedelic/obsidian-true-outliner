# Tasks

## 1. The edit site, found in `finalize`

- [ ] 1.1 Index the pre-operation document in `finalize` (`src/ops.ts`) by node id: each block's text without
  indentation, its kind as written, its parent, its previous sibling, and the order of blocks. Compute the
  changed text region (the unchanged prefix and suffix of the old and new text, before the pass). Verify with
  unit tests of the index and region over parsed documents.
- [ ] 1.2 Classify each seam of the surgery (D1): written lower block, written upper block, or blocks not
  consecutive before; bounded by the changed region (D6). Verify with unit tests of the classifier over
  hand-built old/new pairs:
  - a moved subtree's inner seams are not at the edit site, and its edges are
  - a re-indent that changes a block's kind puts its seams at the edit site
  - a surgery whose ids were all renewed puts no seam outside the changed region at the edit site

  Negative controls: judging written-ness by id presence alone fails the first, and dropping the region bound
  fails the last.
- [ ] 1.3 Separate each empty seam at the edit site outside a list (D3) that D4 does not exempt, before the
  parse floor runs. Verify with unit tests of the pass:
  - one already holding a blank line is unchanged
  - one inside a list is unchanged
  - one below a lone id line is unchanged
  - one above a block indented four columns is unchanged, unless the parse requires it

  Negative control: separating every seam at the edit site fails each.
- [ ] 1.4 Verify the pass is a no-op on parsed trees, with a property over generated documents that
  `finalize(doc, doc, …)` leaves the text unchanged. Exclude #255's shapes (a list item with a flush quote,
  callout or `- - -` first child) from the generator, per D9. Negative control: dropping the changed-region bound
  and treating every seam as written fails it.

## 2. What each gesture's edit site gives

- [ ] 2.1 Verify the new requirement's insertion, removal and move scenarios as unit tests through the ops:
  - the pasted quote (`## H` / blank / `first` / blank / `> quote` / blank / `below`)
  - the drag, and a seam inside a run moved under another heading at the same depth
  - the removal of `---` between `> q` and `after`
  - a list item inserted into a tight list, and a code block dropped into one
  - the reorder of `## Budget` past `## Packing`
  - the payload of `para` over a four-column list
  - `> q` / `para` pasted into an empty note (`pasteIntoEmptyBody`), and a type-over of a whole scope
    (`insertAsOnlyChildren`)

  Negative control: disabling the pass fails the pasted quote, the drag, the removal and the reorder.
- [ ] 2.2 Verify the rewrite scenarios as unit tests:
  - the heading split
  - Enter mid-text in `para text` between `# H` and `> q`
  - `para` merged into `- a` above a flush `> q`
  - Shift+Tab on `  > q` under `  - b`
  - Enter at the end of `# H` and at the content start of `- a` in `# H` / `- a`, which give the same spacing
  - a block-id correction that attaches `^l1` to `- b` above a flush `> q`

  Negative control: judging only new blocks as written fails the merge, the outdent and the correction.
- [ ] 2.3 Remove `splitNode`'s own heading-child separator (`separateFromHeading`), which the pass now provides.
  Verify with the heading-split scenario. Negative control: with both removed, the child is written flush.
- [ ] 2.4 Verify the limits as unit tests:
  - deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps `^id3` flush and unattached
  - an attached id on a list item inserted at the root above a paragraph keeps the blank line below the id
  - an unrelated operation leaves `> q` / `body` elsewhere byte-identical

  Negative controls: dropping the lone-id exemption fails the first, and writing the separator before the id
  fails the second.
- [ ] 2.5 Make `deleteSubtreeGroups` separate nothing when a splice follows. Verify with unit tests through
  `computeVerdict`:
  - `x` typed over a selected `para` in `# A` / `para` / `# B` gives `# A` / blank / `x` / blank / `# B`
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - `> z` / blank / `w` pasted onto an empty `- ` under `- a` is separated from `- a`
  - a paste onto a place leaves exactly one blank line above the pasted content

  Negative control: letting the deletion separate its join fails the second.
- [ ] 2.6 Verify the narrowed indent-unit round trip: a list item's subtree copied and pasted back after itself is
  still byte-identical in every unit the existing scenario covers. Negative control: applying the pass inside
  lists fails it for a subtree with a flush child block.
- [ ] 2.7 Re-check the existing unit tests that pin a flush seam at an edit site outside a list (edit-ops, ops,
  grammar, split, enforce). Update each expectation to the rule, and record in the test's comment which edit-site
  seam gained the line. Verify with `npm test`.

## 3. Places

- [ ] 3.1 Write Enter's provisional positions separated on both sides outside a list, in every op that leaves one:
  `splitNode` (including its folded path), `insertEmptyBefore`, `unwrapListItem`, and `outdentSurgery` when it
  dissolves an empty item. Each writes the place's own line, plus a blank line on each side only where that side
  lacks one and lies outside a list. Verify with unit tests for:
  - a content-start Enter under a flush `> q`, a heading and a closing fence
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item`
  - leaving a list under a paragraph (`para` / `- a` / `- ` / `next`)
  - an Enter after a code child in a tight list, which keeps the list tight
  - an Enter in a gap already three lines wide, which still changes the document

  Negative control: the current place encodings fail the first four.
- [ ] 3.2 Record on the surgery the gap lines a dissolving op adds beside its place, and return from `finalize` the
  place's removal (its line and those lines) on `OpOutput`. State it from every dissolving path: the Enter ladder,
  Shift+Tab through `outdentGroups` (`src/plugin/grammar.ts`), and the command path (`src/plugin/main.ts`).
  Verify in `tests/undo-on-abandon.test.ts`:
  - abandoning an unwrap under `- item` above `next` leaves `- item` / blank / `next`
  - a Shift+Tab dissolve in `para` / `- a` / `- ` / `next` does the same
  - one with two blank lines above `next` keeps both
  - every opened place still restores the source byte for byte

  Negative control: the `drop-line` form alone leaves the added lines.
- [ ] 3.3 Keep a position's separators with its removal record across carries (the amended "A carried place is
  declined like a fresh one"). Verify in `tests/undo-on-abandon.test.ts` that Enter at the end of a paragraph above
  a flush `> q`, then Tab, then ↑, leaves the document as it was before the Enter. Negative control: removing the
  carried position as its line alone leaves the added lines (#253).
- [ ] 3.4 Verify that a Shift+Enter position stays adjacent, and that the drafted sibling heading is separated on
  both sides, in `tests/grammar.test.ts` and `tests/ops.test.ts`.
- [ ] 3.5 Update the e2e specs whose buffer assertions cover Enter places, list departures, splits, merges or
  Shift+Enter headings. Run each touched spec in narrow mode (`npm run test:e2e:narrow -- <spec>`).

## 4. Dispatch, performance and research

- [ ] 4.1 Make the relocation match in `src/plugin/dispatch.ts` compare the two sides with blank lines set aside,
  keeping its removed-lines test on the unfiltered lines, and dispatch the blank lines that differ as insertions or
  deletions of their own. Verify with the new `minimal-change-dispatch` scenario, the existing table-widget
  scenarios, and a cross-scope move that takes a gap line with it. Measure in the real app a paragraph moved from
  another section to below a table, and a removal that joins a table and a paragraph. Negative control: the
  current exact-lines match rewrites the table.
- [ ] 4.2 Measure the pass's cost on the 2000-line note `src/ops.ts`'s latency budget cites, and record it in
  `docs/research/lazy-continuation-at-seams.md`. Verify it stays within that budget.
- [ ] 4.3 Add the #264 manual case (`    first` / blank / `    > quote` pasted at the end of `## H` above `below`)
  and the drag case as e2e cases, and run the clipboard and dragging specs in narrow mode. Confirm each fails on
  the layer below.
- [ ] 4.4 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in the note. Verify that no row loses a
  node.
- [ ] 4.5 Comment on #261 that the drag case is closed by this change.

## 5. Validation

- [ ] 5.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 5.2 Run `openspec validate created-seams-are-separated --strict`.
