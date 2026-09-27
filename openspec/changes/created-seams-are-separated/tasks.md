# Tasks

## 1. Marks and the pass that separates them

- [ ] 1.1 Add seam marks to the surgery: `(upper block, lower block)` pairs by node id. Make `finalize`
  (`src/ops.ts`) separate each marked pair that is still adjacent, empty, outside a list (D3) and not
  under D4, before the parse floor runs. Verify with unit tests of the pass over hand-built surgeries:
  - a marked seam gains one blank line
  - one already holding a blank line is unchanged
  - one inside a list is unchanged
  - one below a lone id line is unchanged
  - one above a block indented four columns is unchanged

  Negative control: separating every marked pair fails each of the last four.
- [ ] 1.2 Verify the pass is a no-op on parsed trees, with a property over generated documents that
  `finalize(doc, doc, …)` with no marks leaves the text unchanged. Negative control: marking every seam
  fails it.

## 2. Each operation marks its seams

- [ ] 2.1 Mark the run's outer seams in `insertSubtrees` and in `moveSubtreesTo`'s cross-scope splice, and
  every seam inside a pasted payload. Verify with unit tests:
  - the pasted quote (`## H` / blank / `first` / blank / `> quote` / blank / `below`)
  - the drag scenario
  - the run of list items in a tight list, and the code block dropped into one
  - the payload of `para` over a four-column list
  - a seam inside a run moved under another heading, left as written

  Negative control: dropping the insertion's marks fails the pasted quote and the drag.
- [ ] 2.2 Mark the join in `deleteSubtreeGroups`, and in the removal half of a cross-scope move, unless
  `spliceFollows`. Verify with unit tests:
  - `> q` / `---` / blank / `after` loses `---` and keeps `> q` / blank / `after`
  - a deletion inside a tight list leaves it tight
  - deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps `^id3` flush and unattached

  Negative control: dropping the join mark fails the first.
- [ ] 2.3 Mark the new seam between the halves in `splitNode` (including content-start splits that
  materialize an empty item or heading), and remove its own heading-child separator
  (`separateFromHeading`), which the mark now covers. Verify with unit tests:
  - a heading split mid-title separates its child
  - Enter mid-text in `para text` between `# H` and `> q` gives `# H` / `para` / blank / `text` / `> q`
  - a content-start Enter on a list's first item under a heading separates the heading from the new item

  Negative control: dropping the split's mark fails the heading split.
- [ ] 2.4 Mark the drafted heading's two seams in `insertSiblingHeading`, with and without a remainder.
  Verify in `tests/grammar.test.ts` and `tests/ops.test.ts`. Negative control: dropping the marks leaves it
  flush.
- [ ] 2.5 Verify that the ops creating no seams mark none, with unit tests:
  - a merge keeps `p1p2` directly above `# H`, and `paraa` directly above `- b`
  - an indent and an outdent keep their neighbours' separation
  - a same-scope reorder keeps its positional gaps
  - a lone id's drop keeps `Lead.` / `^id` / `- a` flush

  Negative control: marking a merge's outer seams fails the first.
- [ ] 2.6 Re-check the existing unit tests that pin a flush created seam outside a list (edit-ops, ops,
  grammar, split, enforce). Update each expectation to the rule, and record in the test's comment which op's
  mark added the line. Verify with `npm test`.

## 3. Gestures of two steps

- [ ] 3.1 Make a type-over's and an empty-anchor paste's insertion (`deleteAndSplice` in `src/enforce.ts`)
  mark only the seams inside its payload. Verify with unit tests through `computeVerdict`:
  - `x` typed over a selected `para` in `# A` / `para` / `# B` keeps both seams flush
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - a payload's own flush quote over a paragraph arrives separated

  Negative control: marking the insertion's outer seams fails the first.
- [ ] 3.2 Verify that a paste onto a place leaves exactly one blank line above the pasted content, and that an
  Enter over a block selection that is then abandoned leaves exactly what the deletion alone wrote
  (`tests/enforce.test.ts`, `tests/undo-on-abandon.test.ts`). Negative control: keeping the place's full
  width fails the first.
- [ ] 3.3 Verify the narrowed indent-unit round trip: a list item's subtree copied and pasted back after
  itself is still byte-identical, in every unit the existing scenario covers. Negative control: applying the
  marks inside lists fails it for a subtree with a flush child block.

## 4. Places

- [ ] 4.1 Write Enter's provisional positions separated on both sides outside a list, in every op that leaves
  one: `splitNode` (including its folded path), `insertEmptyBefore`, `unwrapListItem`, and `outdentSurgery`
  when it dissolves an empty item. Each writes the place's own line, plus a blank line on each side only where
  that side lacks one. Inside a list, keep today's encoding. Verify with unit tests for:
  - a content-start Enter under a flush `> q`, a heading and a closing fence
  - an end-of-heading Enter above a flush first child, where the typed text must not join that child
  - an unwrap under `- item`
  - leaving a list under a paragraph (`para` / `- a` / `- ` / `next`)
  - an Enter after a code child in a tight list, which keeps the list tight
  - an Enter in a gap already three lines wide, which still changes the document

  Negative control: the current place encodings fail the first four.
- [ ] 4.2 Make each dissolving op (`unwrapListItem`, `outdentSurgery`'s dissolve) state its own removal:
  the place's line and the blank lines it added. The removal leaves what the note held around the dissolved
  item, or one blank line where that is empty and outside a list. Route it through both the keyboard grammar
  (`src/plugin/grammar.ts`) and the command path (`src/plugin/main.ts`), and leave the carries' `drop-line`
  unchanged. Verify in `tests/undo-on-abandon.test.ts`:
  - abandoning an unwrap under `- item` above `next` leaves `- item` / blank / `next`
  - one with two blank lines above `next` keeps both
  - every opened place still restores the source byte for byte

  Negative control: the `drop-line` form alone leaves the extra blank lines.
- [ ] 4.3 Verify that a Shift+Enter position stays adjacent. Negative control: marking its seams separates
  it.
- [ ] 4.4 Update the e2e specs whose buffer assertions cover Enter places, list departures or Shift+Enter
  headings. Run each touched spec in narrow mode (`npm run test:e2e:narrow -- <spec>`).

## 5. Dispatch and research

- [ ] 5.1 Make the relocation match in `src/plugin/dispatch.ts` set blank lines aside, and dispatch a marked
  seam's blank line as an insertion of its own. Verify with the new `minimal-change-dispatch` scenario and the
  existing table-widget scenarios. Measure in the real app a paragraph moved below a table and a removal that
  joins a table and a paragraph. Negative control: the current exact-lines match rewrites the table.
- [ ] 5.2 Add the #264 manual case (`    first` / blank / `    > quote` pasted at the end of `## H` above
  `below`) and the drag case as e2e cases, and run the clipboard and dragging specs in narrow mode. Confirm
  each fails on the layer below.
- [ ] 5.3 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in
  `docs/research/lazy-continuation-at-seams.md`. Verify that no row loses a node.
- [ ] 5.4 Comment on #261 that the drag case is closed by this change.

## 6. Validation

- [ ] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 6.2 Run `openspec validate created-seams-are-separated --strict`.
