## 1. Reproduce, at the operation layer (design D4)

- [x] 1.1 Failing tests for the two catalogued measurements, driven through `deleteSubtrees`
      rather than the helper: the first two of `1. 2. 3.` removed must leave `1. c` (records
      `3. c` today), and the first of `5. 6. 7.` removed must leave `5. b` / `6. c` (records
      `6. b` / `7. c`). Assert the whole encoded document, not the marker digits alone — the
      point is that nothing else moved. Written in `tests/edit-ops.test.ts`, not
      `tests/ops.test.ts` as this task first said: that is where the `deleteSubtrees` suite
      and its property tests already live
- [x] 1.2 MEASURE, do not infer, whether `indent` and `unwrapListItem` reach the same
      defect. BOTH DO. `indent` on `1. one` whose previous sibling is `- bullet` left
      `2. two` / `3. three` at the original level; `unwrapListItem` on an empty `1. ` left
      `2. b` / `3. c`, and on an empty `5. ` left `6. b` / `7. c`. Both scenarios stay in the
      delta spec. Measured alongside them: `outdent`'s truncated level is unaffected, and
      the siblings an outdent ADOPTS start at 2 — recorded in design.md's Non-Goals rather
      than changed. `mergeNodes` was probed here too and read as unaffected: the probe used
      `1. a` / `2. b` / `3. c`, where the survivor IS the run's head, so it could not show
      the defect. Task 6 has the shapes that do
- [x] 1.3 Pin the permutation case BEFORE touching the helper: `moveDown` on the first of a
      `5. 6. 7.` run leaves the run reading `5. 6. 7.` with the content exchanged. Green both
      before and after

## 2. The removal-aware rule (design D1, D2, D3)

- [x] 2.1 Extract the run walk into `orderedRuns` + `renumberRuns`, parameterized by how a
      run's start is chosen. `renumberOrdered(nodes)` keeps its exact current meaning — the
      full suite was green after the extraction and before any caller changed
- [x] 2.2 Add `renumberOrderedAfterRemoval(before, after)`: the ordered-member-id → run start
      map built from `before`, each surviving run's start chosen by its FIRST member's id,
      falling back to the minimum present when the id is absent. The fallback is documented
      at the definition as the OLD rule, so a mis-routed caller degrades to today's behavior
- [x] 2.3 Document both functions against each other: which transformation shape each is for,
      and the one-line reason the other exists

## 3. Route the removal call sites (design D1 Context)

- [x] 3.1 `deleteSubtreeGroups`: pass the pre-filter sibling list as `before`, with the note
      that several ranges are filtered in ONE pass per parent, so `before` is that parent's
      list as it entered the pass
- [x] 3.2 `indent`'s departure side and `unwrapListItem`, both confirmed by 1.2's measurement
- [x] 3.3 Audited every remaining `renumberOrdered` call. Seven are permutations or
      insertions (indent's arrival, outdent's adopted children and arrival, the swap, the
      empty-node insert, the split, `insertSubtrees`). Outdent truncating its level to a
      PREFIX is a removal that stays on the permutation rule because a prefix always
      retains the run's head — stated in a comment at the call site rather than left to be
      re-derived
- [x] 3.4 CORRECTION, found in review: this audit classified all three `mergeNodes`
      branches as insertions, on the argument that `second` always has a predecessor at its
      own level. Having a predecessor is not keeping the run's HEAD — the predecessor need
      not be in the run. All three branches are measured to lose one and are routed through
      the removal rule; the child-absorbing branch renumbered nothing at all. See task 7

## 4. Verification

- [x] 4.1 1.1's and 1.2's tests are green, and 1.3 is unchanged
- [x] 4.2 Negative control: reverting the three call sites to `renumberOrdered` fails exactly
      four tests with exactly the recorded outputs — `3. c`, `6. b` / `7. c`, indent's
      `2. two` / `3. three`, unwrap's `2. b` / `3. c`. Everything else stayed green, so the
      call sites are what the tests are measuring
- [x] 4.3 The run-merging removal (D3): a bullet standing between `1. 2.` and `5. 6.` is
      deleted, the survivors become one run, and it starts at 1. Note the fixture is a
      BULLET, not a paragraph: a paragraph ADOPTS a following list as its children
      (measured), so two runs separated by one are not siblings at all
- [x] 4.4 The removals that must NOT change: deleting from the middle of a run, and deleting
      a whole run so nothing remains to renumber
- [x] 4.5 Read `tests/closure.test.ts` and the `edit-ops` property suite output rather than
      assuming silence: closure, minimal-edit and totality all green over generated removals
- [x] 4.6 Full unit suite, `npm run build`, `npm run lint` — all clean (656 with section 5)

## 5. The child scope's marker (design D5, added from a real-vault report)

- [x] 5.1 Reproduce the reported gesture at the planner level before touching anything:
      selecting the first items of a numbered list under a heading and pressing Enter
      produced `- ` above the run. Located by measuring the post-deletion caret — it falls
      back to the ANCESTOR when the first item goes, so the key acts at the heading's end
      and places into its CHILD scope
- [x] 5.2 Take the marker, task marker and `listStyle` from the donating child — the first
      `list-item` among the parent's children, which is the node the KIND already came
      from. Decompose `emptyItemPrefix` so the sibling and child paths share one rule
- [x] 5.3 Renumber the child list on insertion, so a new ordered first child takes the run's
      start and the rest shift down
- [x] 5.4 Cover the shapes in `tests/split.test.ts`: ordered, a run starting at 5, the `)`
      delimiter, `*` bullets, a task donor, a non-empty remainder, a nested list under an
      item, a paragraph's adopted list — and plain bullets as the regression
- [x] 5.5 Cover the reported GESTURE in `tests/grammar.test.ts`, over a block selection of
      the first items, under a heading, under a parent item, and after a paragraph
- [x] 5.6 Negative control: drop the donor lookup and confirm 9 tests fail with exactly the
      reported bullet (`# H` / `- ` / `1. c`)
- [x] 5.7 E2E in a real vault (`e2e/specs/30-keyboard-grammar.e2e.ts`): Shift+ArrowDown over
      the first items, Enter, and the buffer keeps its numbering. Ran the whole
      keyboard-grammar spec — 33 passing. The first run failed on the TEST's own assumption
      (one Shift+ArrowDown selects one node, not two), not on the fix

## 6. Merge is a removal too (found in review, correcting task 3.3)

- [x] 6.1 Measure all three `mergeNodes` surgery branches before changing any of them, and
      record what each produced: the separator join gave `1. ax` / `2. c` where the survivor
      was `5. a`; absorbing an ordered first child gave `2. b` / `3. c` (no renumber at all);
      the cross-scope merge left `2. b` at the top level
- [x] 6.2 Route all three through `renumberOrderedAfterRemoval`. `merged` keeps `first`'s
      id, so the lookup finds the run `first` was in — which is what a run joined across an
      absorbed separator must resume from
- [x] 6.3 Regression tests per branch in `tests/edit-ops.test.ts`, plus the plain same-level
      merge that must NOT change
- [x] 6.4 Negative control: reverting the three branches fails exactly those three tests
      with exactly the measured outputs
- [x] 6.5 Full suite (660), build, lint; `tests/edit-ops.test.ts`'s own merge property suite
      (closure, totality, unchanged-on-reject) still green

## 7. Record

- [x] 7.1 The catalogue's C2 entry now points at this change and names the two further shapes
      1.2 measured. The measured outputs themselves are untouched — they are the pre-change
      record
