## 1. Forest-cover geometry

- [ ] 1.1 Add a single exported forest-cover computation to `src/escalate.ts`: given two
      end nodes, return the covered ROOTS (maximal subtrees of the document-order run,
      closed under descendants) and their combined span. Ancestor/descendant ends return
      the ancestor's subtree, unchanged
- [ ] 1.2 Replace `siblingRunCover`'s use in `escalateRange` with it; keep `subtreeCoverOf`
      as-is
- [ ] 1.3 Rebuild `coveredSubtreeRoots` on the same function — one implementation, two call
      sites, per design D4 and the two "silently-stale duplicate" incidents in
      docs/research/04 (Q18, Q19)
- [ ] 1.4 Unit tests for the geometry, including the cross-scope case that used to pull in a
      parent, ancestor/descendant ends, and mixed-depth roots

## 2. Invariant and property tests

- [ ] 2.1 Replace `tests/escalate.test.ts`'s "cover is a run of siblings under one scope"
      property with DOWNWARD CLOSURE: every covered root's whole subtree is inside the
      cover, and no node is covered without its descendants
- [ ] 2.2 Property: an escalated cover is a single contiguous span (node order is text
      order) — this is what keeps a block selection representable as one range
- [ ] 2.3 Keep and re-run the unchanged properties: expand-only, orientation preservation,
      multi-range uniformity, preamble jurisdiction
- [ ] 2.4 Confirm `progressive-select-all`'s ladder rungs remain FIXPOINTS of the rewritten
      escalation: every rung is downward-closed and contiguous, so its forest span should be
      itself, but the ladder is the one shipped feature that dispatches covers into this filter
      and `select-all-ladder.ts` does not import the changed functions — nothing would fail
      loudly if it broke. Assert rung-in equals rung-out for each rung, and re-run
      `tests/select-all-ladder.test.ts` and `e2e/specs/64-progressive-select-all.e2e.ts`

## 3. Structural deletion over a forest

- [ ] 3.1 Make `siblingCoverIds` in `src/enforce.ts` forest-aware, using the same exported
      computation from 1.1 rather than its own traversal
- [ ] 3.2 Confirm deletion of a mixed-depth cover removes each root's subtree with its owned
      gap and leaves the remaining tree well formed
- [ ] 3.3 Property test over generated trees: deleting any escalated cover re-parses to a
      valid tree with no orphaned nodes

## 4. Payload root normalization

- [ ] 4.1 Extend `reencodeBlocksForDestination` in `src/ops.ts` so a payload whose roots came
      from different depths lands with its roots as siblings at the destination depth, each
      root's internal relative structure preserved verbatim
- [ ] 4.2 Unit tests: mixed-depth roots, single root (unchanged behavior), and a root whose
      own descendants are deeper than the destination

## 5. Selection chrome

- [ ] 5.1 Render chrome per covered root for a mixed-depth forest, anchored to each root's
      own column rather than the shallowest root's
- [ ] 5.2 Visual check against the existing decoration e2e suite; the chrome mechanism itself
      (blur, live-preview reveal) is untouched

## 6. End-to-end verification

- [ ] 6.1 Update `61-selection-enforcement.e2e.ts`'s crossing scenarios to the new covers,
      including the cross-scope case that no longer includes the parent
- [ ] 6.2 New scenario: two cursors in adjacent siblings extended once no longer collapse to
      a whole-document range
- [ ] 6.3 Copy/paste round-trip for a mixed-depth selection: roots land as siblings, internal
      structure intact
- [ ] 6.4 Off-mode reference assertions unchanged
- [ ] 6.5 Mobile-emulation run

## 7. Real-vault manual pass

- [ ] 7.1 Drag and keyboard selections across scope boundaries on real notes
- [ ] 7.2 Judge mixed-depth chrome — design D4's open question; if it reads badly, decide
      whether chrome or geometry moves
- [ ] 7.3 Copy a mixed-depth selection into several destination depths and check the results
      against what Logseq produces for the same shapes
- [ ] 7.4 Record findings in `docs/research/04` as a numbered entry

## 8. Documentation

- [ ] 8.1 Update `docs/research/13`'s "Escalation math re-examination candidate" entry: the
      question it raised is now answered, with this change as the answer
- [ ] 8.2 Note in `docs/research/05-org-mode-comparison.md`'s divergence table that our
      selection model now matches the outliner mainstream on downward-vs-upward closure
