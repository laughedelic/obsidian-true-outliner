## 1. Recover a start only where it was lost

- [x] 1.1 In `renumberOrderedAgainst` (src/ops.ts), widen the `before` index from `nodeId → start`
      to the membership each node needs: its run's start, the number it carried itself, its run's
      members in order, and its index among them. The run's id list is shared by reference rather
      than sliced per member, so the index stays linear in the sibling list (D1).
- [x] 1.2 Add the split condition. A fragment whose run left an earlier member OUTSIDE the
      fragment but still in the sibling list keeps its own numbers: `member.number` counted back
      over `run.indexOf(known)` (D1, D2).
- [x] 1.3 Add the join guard: a fragment holding a member of any OTHER before-run is back under
      the recovered start, whatever the split condition says (D3).
- [x] 1.4 Clamp the counted-back start at zero. It can only go lower by prepending more new
      members to a fragment than its own number leaves room for, where no start is recoverable
      anyway, and zero is the lowest marker a run can be written from.
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

## 3. Measurement

- [x] 3.1 Differential against `main` over `arbLabeledDoc`, seed 42, 3 000 documents, every node
      as the operand for indent, outdent, moveUp and moveDown, with both `src/ops.ts` versions
      loaded side by side.
- [x] 3.2 Measure the DIRECTION of every difference — how many of the source's own lines come
      through verbatim on each side — rather than sampling it. Record the three counts.
- [x] 3.3 Record the rendering the rewritten markers change, with `commonmark`, at the root-level
      frame where strict CommonMark makes a list of it.
- [x] 3.4 Write `docs/research/ordered-run-split-numbering.md` and its one index row.

## 4. Validate

- [x] 4.1 `npm test` — the whole unit suite, including `renumbering-contract`, `closure`,
      `roundtrip` and `depth-contract`.
- [x] 4.2 `npm run build` and `npm run lint`.
- [ ] 4.3 The e2e sweep, which the pushed checkpoint runs in CI.
- [ ] 4.4 Manual testing in Obsidian against the issue's own reproduction, including whether
      Obsidian's renderer reads the divided nested frame the way the root-level figures do.
