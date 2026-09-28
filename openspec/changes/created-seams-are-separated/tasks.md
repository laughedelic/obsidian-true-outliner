# Tasks

## 1. The edit site, as a function of two trees

- [x] 1.1 Write the outline view of a block (D1): kind as it will re-parse, and content with indentation, list
  marker, ordinal number, heading level and block id set aside, the id wherever it is written. Verify with unit
  tests over every kind, tasks, setext headings and ordered runs included: renumbering, a level shift, a re-indent
  and an id attachment, including `dropLoneId`'s id line, leave the view unchanged; a list item turned paragraph,
  a changed task text or a changed heading title changes it. Negative control: comparing text without indentation fails the renumbering and level-shift
  cases.
- [x] 1.2 Index the pre-operation document by node id (D6): each block's view, parent, previous sibling and order.
  Read the surgery's parents and previous siblings after re-nesting its headings by level.
  Classify each seam of a surgery (D1): written lower block, changed previous sibling, a first child with a new
  parent, written upper block, or blocks not consecutive before. Verify with unit tests over hand-built old/new
  pairs:
  - a moved run of several roots keeps its inner seams, and its edges are at the edit site
  - a re-indent that changes a block's kind puts its seams at the edit site
  - deleting `1. a` from `1. a` / `2. b` / `3. c` / `para` puts no seam around `para` at the edit site
  - Tab on `## B`, through `indent`, puts only the seam above `### B` at the edit site, and so does Tab on a
    root-level `## Budget` under `## Packing`
  - a level-skip outdent puts no seam at the edit site
  - a lone-id drop puts no seam around its host at the edit site
  - `finalize(doc, doc)`'s pair has no seam at the edit site

    Negative controls: counting any new parent fails the first, judging on text fails the third and fourth, and
  reading the hierarchy off the surgery's own tree fails the fourth.

## 2. The seam oracle, measured on today's operations

- [x] 2.1 Add `commonmark` as a dev dependency, and a reader model in `tests/` that says, for a seam's text, whether
  CommonMark or reading mode's three extra rows (`lazy-continuation-at-seams`) continue the lower block into the
  upper one. Verify it against every row of the note's tables. Negative control: dropping the reading-mode rows
  fails the list-item-above-`> quote` row.
- [x] 2.2 Build the generator (D11): notes whose every gap is flush, one blank line or two, including flush
  seams the user wrote under quotes, callouts and list items. Written as text rather than ported from
  `chore/node-placement-grammar`'s sweeps: those build trees valid by construction, which cannot hold a seam the
  user wrote flush under a container.
- [x] 2.3 Write the oracle's checks (D11) over every structural operation and every applicable node or cover, with
  the classifier of group 1 naming the edit site. Run it on today's operations, and record each check's failures
  in `docs/research/lazy-continuation-at-seams.md`, with the operation and a drawn case for each family. Verify
  that check 2 fails today on the pasted quote and the drag, and that check 1 holds.
- [x] 2.4 Leave the oracle's checks that today's operations fail recorded as expected failures, each with the task
  that closes it, so a checkpoint's CI stays green.

## 3. The pass

- [x] 3.1 Separate each empty seam at the edit site outside a list (D3) that D4 does not exempt, in `finalize`,
  before the parse floor runs, and restore every seam away from the edit site to the blank lines it had (D1).
  Skip a place (D5). Verify with unit tests of the pass:
  - a reorder to the top of a scope leaves the seams between the blocks it passed as written
  - one already holding a blank line is unchanged
  - one inside a list is unchanged
  - one below a lone id line is unchanged
  - one above a block indented four columns is unchanged, unless the parse requires it
    - one beside a dissolved item's empty residue, an empty `- ` or an empty drafted heading is unchanged

  Negative control: separating every seam at the edit site fails each.
- [x] 3.2 Verify the pass is a no-op on parsed trees, with a property over generated documents that
  `finalize(doc, doc, …)` leaves the text unchanged, #255's shapes marked (D10). Negative control: treating every
  block as new fails it.
- [x] 3.3 Make the group forms take one edit site (D8): restate `Surgery`'s equivalence note, and compare the
  group-composition oracle's trees with blank lines set aside. Verify the new group scenario, and that the
  existing group properties hold. Negative control: running the pass per step fails the scenario.

## 4. What each gesture's edit site gives

- [x] 4.1 Verify the new requirement's insertion, removal and move scenarios as unit tests through the ops:
  - the pasted quote, and the paste after a line that repeats in the payload
  - the drag, and the run `> q` / `body` dragged from `## A` to `## B`
  - the removal of `---` between `> q` and `after`
  - a list item inserted into a tight list, and a code block dropped into one
  - the reorder of `## Budget` past `## Packing`
  - the renumbering and the level shift
  - the payload of `para` over a four-column list
  - `> q` / `para` pasted into an empty note (`pasteIntoEmptyBody`), and a type-over of a whole scope
    (`insertAsOnlyChildren`)

  Negative control: disabling the pass fails the pasted quote, the drag, the removal and the reorder.
- [x] 4.2 Verify the rewrite scenarios as unit tests:
  - the heading split, and the setext split
  - Enter mid-text in `para text` between `# H` and `> q`
  - `para` merged into `- a` above a flush `> q`
  - Shift+Tab on `  > q` under `- b`
    - a sibling heading carrying a remainder, with the original's first child written flush

  Negative control: dropping the view clause, so that a block is written only when it is new, fails the upper
  seam of the `para text` split and the heading split.
- [x] 4.3 Remove `splitNode`'s own heading-child separator (`separateFromHeading`), which the pass now provides.
  Verify with the heading-split scenario. Negative control: with both removed, the child is written flush.
- [x] 4.4 Verify the limits as unit tests:
  - deleting `> q` from `Lead.` / blank / `^id3` / `> q` / `# H` keeps `^id3` flush and unattached
  - dropping the lone `^id` onto `Lead.` keeps `- a` directly below the id line
  - an attached id on a list item inserted at the root above a paragraph keeps the blank line below the id
  - an unrelated operation leaves `> q` / `body` elsewhere byte-identical

  Negative controls: dropping the lone-id exemption fails the first, and writing the separator before the id
  fails the third.
- [x] 4.5 Make `deleteSubtreeGroups` separate nothing when a splice follows. Verify with unit tests through
  `computeVerdict`:
  - `x` typed over a selected `para` in `# A` / `para` / `# B` gives `# A` / blank / `x` / blank / `# B`
  - a type-over of `- b` in `- a` / `- b` / `> q` with `- x` / `- y` leaves `- a` / `- x` flush
  - `> z` / blank / `w` pasted onto an empty `- ` under `- a` is separated from `- a`
    - a paste onto a place leaves exactly one blank line above the pasted content
  - Enter over a block-selected `para` in `# A` / `para` / `# B` writes the place as today, and typing on it leaves
    one blank line below the text

    Negative control: letting the deletion separate its join fails the second and the last.
- [x] 4.6 Verify the narrowed indent-unit round trip: a list item's subtree copied and pasted back after itself is
  still byte-identical in every unit the existing scenario covers. Negative control: applying the pass inside
  lists fails it for a subtree with a flush child block.
- [x] 4.7 Re-check the existing unit tests that pin a flush seam at an edit site outside a list (edit-ops, ops,
  grammar, split, enforce, group). Update each expectation to the rule, and record in the test's comment which
  edit-site seam gained the line. Verify with `npm test`.

## 5. Dispatch, the oracle's figures and the decision

- [x] 5.1 Make the relocation match in `src/plugin/dispatch.ts` compare the two sides with blank lines set aside,
  keeping its removed-lines test on the unfiltered lines, and dispatch the blank lines that differ as insertions or
  deletions of their own. Verify with the new `minimal-change-dispatch` scenario, the existing table-widget
  scenarios, and a cross-scope move that takes a gap line with it. Measure in the real app a paragraph moved from
  another section to below a table, and a removal that joins a table and a paragraph. Negative control: the
  current exact-lines match rewrites the table. Measured: it does not, for a paragraph moved up past a table
  (`tests/created-seams.test.ts`, "dispatch"), because the cost comparison already picks the relocation reading
  there; the match's blank-line filter widens what it accepts and is kept for the moves the comparison does not
  decide. The real-app measurements are the e2e table scenarios, which pass.
- [x] 5.2 Run the oracle over the pass, turn every expected failure of 2.4 that the pass closes into a passing
  check, and record the figures after the pass: each check's failures, and the seams separated where no reader
  would have continued them. Verify that checks 1 to 5 hold, #255's and #272's shapes aside.
- [x] 5.3 Bring the count of 5.2 to the maintainer, with the narrower rule of D11 drawn on the cases it would
  change. Apply the decision, and state it in the new requirement and the research note. Decided: the uniform
  rule stays (design D11).
- [x] 5.4 Measure the pass's cost on the 2000-line note `src/ops.ts`'s latency budget cites, and record it in
  `docs/research/lazy-continuation-at-seams.md`. Verify it stays within that budget.
- [ ] 5.5 Update the e2e specs whose buffer assertions cover structural edits at flush seams outside a list. Add the
  #264 manual case (`    first` / blank / `    > quote` pasted at the end of `## H` above `below`) and the drag
  case as e2e cases, and run the clipboard and dragging specs in narrow mode. Confirm each fails on the layer
  below.
  Done: the paste case in `62-outline-edit-enforcement.e2e.ts`, and every buffer assertion the pass changed. Open:
  the drag case, which needs a drop above a note's first row that the dragging spec's helpers do not reach; its
  result is pinned through `moveSubtreesTo` in `tests/created-seams.test.ts`.
- [ ] 5.6 Re-run the seam sweep, the insertion differential and the drag sweep
  (`docs/research/prototypes/seam-differential/`), and record the figures in the note. Verify that no row loses a
  node.
- [ ] 5.7 Comment on #261 that the drag case is closed by this change.

## 6. Validation

- [ ] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run typecheck:e2e`.
- [ ] 6.2 Run `openspec validate created-seams-are-separated --strict`.
