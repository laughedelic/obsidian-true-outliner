## 1. Recover a start only where it was lost

- [x] 1.1 In `renumberOrderedAgainst` (src/ops.ts), widen the `before` index from `nodeId → start`
      to the membership each node needs: which run of `before` it belonged to, that run's start,
      the number it carried itself, its run's members in order, and its index among them. The id
      list is one array per run, shared by every member and never copied or sliced per member —
      a prefix per member makes indexing a sibling list quadratic in its longest run, and this
      helper is reached by interactive structural edits (D1).
- [x] 1.2 Add the split condition. A fragment whose run left an earlier member OUTSIDE the
      fragment but still in the sibling list keeps its own numbers: `member.number` counted back
      over `run.indexOf(known)` (D1, D2).
- [x] 1.3 Add the join guard: a fragment holding a member of any OTHER before-run is back under
      the recovered start, whatever the split condition says (D3).
- [x] 1.4 Where counting back would begin the fragment below `1.`, take the recovered start: its
      own numbers do not fit either, and `0.` is a number no run in the source was written from
      (D4).
- [x] 1.6 In `renumberRuns`, leave a run alone when its consecutive renumbering would exceed the
      nine digits `parse.ts` reads a marker back at. Preserving a fragment's own numbers renumbers
      upward, which the old reading never did, so the parser's ceiling is newly reachable — and a
      tenth digit costs the item its kind and its subtree its column (D5).
- [x] 1.5 Rewrite the helper's doc comment. The three recovery shapes stay; the split joins them
      as the one shape the recovery must NOT reach, with why it reads differently from a removal
      and why "outside the fragment" and the join guard are both load-bearing.

## 2. The shapes, by example

- [x] 2.1 In `tests/ops.test.ts`, the reported repro: `insertSubtrees` of a parsed `- alpha` /
      `- beta` after `9. nine` in `- top` / `8. eight` / `9. nine` / `10. ten` leaves `10. ten`
      byte-identical.
- [x] 2.2 The heading control: the same anchor with a `## H` / `body` payload, which converts to a
      bullet on the way in, reaches the same seam and leaves `10. ten` alone.
- [x] 2.3 The minimal root-level frame: `- x` pasted after `1. a` in `1. a` / `2. b` / `3. c`
      rewrites no marker at all.
- [x] 2.4 A fragment that GAINS a member: a `- x` / `3. y` payload after `9. nine` reads
      `- x` / `9. y` / `10. ten` — the arrival counts back from the member already there (D1).
- [x] 2.5 Update the existing split scenario's test to `1. a` / `2. b` / `- x` / `3. c`, with the
      comment stating why a split and a removal are not one shape.
- [x] 2.6 The join-and-split shape: `moveUp` on the `- x` of `1. a` / `2. b` / `- x` / `5. c`
      reads `1. a` / `- x` / `1. b` / `2. c` (D3).
- [x] 2.7 The removal control that has to keep standing: indenting `8. eight` away from
      `8. eight` / `9. nine` leaves `8. nine`, the run's own start, not `9. nine`.
- [x] 2.8 A split arriving by OUTDENT rather than by paste, which the differential measures as
      the largest of the four relocating operations: `1. a` / (`- kid`) / `2. b` / `3. c`
      outdenting `- kid` leaves `2. b` / `3. c` alone.
- [x] 2.9 The counting-back floor (D4) and the nine-digit ceiling (D5), each with the subtree
      assertion that says closure held.
- [x] 2.10 The widening direction the old reading could not produce: a fragment keeping its own
      start normalizes `9. o` to `10. o`, and its child follows the content column. Asserted
      through `parentLineOf`, not by the child's presence: a subtree left behind at the old
      column comes back as a SIBLING, which is the defect the case exists to catch.

- [x] 2.11 A PROPERTY, not only examples. `renumbering-contract.test.ts` fences at what an
      operation relocates and does not run `insertSubtrees`, so the invariant this change exists
      for had no property behind it. Add one for the paste direction: on already-consecutive
      sources, a payload carrying no ordered item rewrites no ordered marker anywhere. It fails on
      `main`'s reading, with `- L0` / `1. L1` / `2. L2` as its counterexample.

## 3. Measurement

- [x] 3.1 Differential against `main` over `arbLabeledDoc`, seed 42, 3 000 documents, every node
      as the operand for indent, outdent, moveUp and moveDown AND as the paste anchor for five
      payload shapes, with both `src/ops.ts` versions loaded side by side. `insertSubtrees` is the
      operation #159 is about, so a differential without it measures around the report.
- [x] 3.2 Measure the DIRECTION of every difference — how many of the source's own lines come
      through verbatim on each side — rather than sampling it. Record the three counts.
- [x] 3.3 Record the rendering the rewritten markers change, with `commonmark`, at the root-level
      frame where strict CommonMark makes a list of it.
- [x] 3.5 Scope the direction claim to sources whose runs are already consecutive, and record the
      non-consecutive frame where `main` preserves more — both readings normalize there, so
      neither leaves the run alone.
- [x] 3.4 Write `docs/research/ordered-run-split-numbering.md` and its one index row.

## 4. Validate

- [x] 4.1 `npm test` — the whole unit suite, including `renumbering-contract`, `closure`,
      `roundtrip` and `depth-contract`.
- [x] 4.2 `npm run build` and `npm run lint`.
- [ ] 4.3 The e2e sweep, which the pushed checkpoint runs in CI.
- [ ] 4.4 Manual testing in Obsidian against the issue's own reproduction, including whether
      Obsidian's renderer reads the divided nested frame the way the root-level figures do.
