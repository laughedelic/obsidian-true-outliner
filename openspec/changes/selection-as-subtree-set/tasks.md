## 1. Forest-cover geometry

- [ ] 1.1 Add a single exported forest-cover computation to `src/escalate.ts`: given two
      end nodes, return the covered ROOTS (maximal subtrees of the document-order run,
      closed under descendants) and their combined span. Ancestor/descendant ends return
      the ancestor's subtree, unchanged
- [ ] 1.2 Replace `siblingRunCover`'s use in `escalateRange` with it; keep `subtreeCoverOf`
      as-is
- [ ] 1.3 Rebuild `coveredSubtreeRoots` on the same function — one implementation, now FOUR
      consumers (`decorations.ts` ×2, `enforce.ts`'s `coverIdsOf` and
      `computeMultiRangeDeletionVerdict`, `classify.ts`'s `isExactSubtreeCoverDeletion`),
      per design D4 and the two "silently-stale duplicate" incidents in docs/research/04
      (Q18, Q19)
- [ ] 1.4 Unit tests for the geometry: the cross-scope case that used to pull in a parent,
      ancestor/descendant ends, mixed-depth roots, and the ANCESTOR-SWALLOWED-MID-SPAN case
      design D2 turns on — a span from a nested item into the first child of a later
      top-level node must cover that node's whole subtree, not stop at the end node
- [ ] 1.5 Re-expect `tests/escalate.test.ts`'s "escalates to the contiguous run of whole
      top-level sections, not just the endpoints" (the `multi-sibling scope resolution`
      describe). It is the one unit test that pins the old rule directly: `Body one.` →
      `Body two.` currently expects `pos(0, 0)`, pulling in `# One`; the forest span starts
      at `pos(2, 0)`. Rename the describe too — it no longer resolves a scope

## 2. Invariant and property tests

- [ ] 2.1 Add the DOWNWARD-CLOSURE property to `tests/escalate.test.ts`: every covered root's
      whole subtree is inside the cover, and no node whose own lines are inside the cover has
      a descendant outside it. Note there is no existing sibling-run property to replace —
      the old invariant is encoded only in unit tests (1.5) and implicitly in
      `siblingRunCover`, which is why the closure gap in the first draft of design D2 went
      unnoticed. This property is the one that would have caught it
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

- [ ] 3.1 Make `siblingCoverIds` in `src/enforce.ts` return GROUPS — one contiguous sibling
      run per parent — using the exported computation from 1.1 rather than its own
      traversal, and have `coverIdsOf`'s caller dispatch to `deleteSubtreeGroups` instead of
      `deleteSubtrees`. `deleteSubtreeGroups` (`fix-orphan-gap-on-node-deletion` D2) already
      removes runs under different parents in one structural pass with one diff, so no new
      deletion machinery is needed and `deleteSubtrees`' single-run contiguity rule stays
- [ ] 3.2 Confirm deletion of a mixed-depth cover removes each root's subtree with its owned
      gap and leaves the remaining tree well formed
- [ ] 3.3 Property test over generated trees: deleting any escalated cover re-parses to a
      valid tree with no orphaned nodes
- [ ] 3.4 Confirm `computeMultiRangeDeletionVerdict` needs no shape change — it already maps
      each range's `coveredSubtreeRoots` to one group. Verify it with a multi-range selection
      whose ranges are themselves mixed-depth covers, which is newly reachable

## 3b. The widened classification gate

- [ ] 3b.1 Enumerate what `classify.ts`'s `isExactSubtreeCoverDeletion` newly admits once
      `coveredSubtreeRoots` is forest-aware, and confirm each shape is one the verdict layer
      models. The gate belongs to `transaction-classification` ("A change exactly covering
      whole subtrees is a boundary-crossing edit"), a capability this change does not
      otherwise touch — design D4. Relaxing a predicate silently admits inputs nobody
      considered; measure rather than reason
- [ ] 3b.2 Negative control: disable the forest computation and confirm the new
      classification assertions fail, so they are known to be testing the gate and not the
      geometry
- [ ] 3b.3 Re-run `tests/classify.test.ts` and
      `e2e/specs/60-transaction-classification.e2e.ts` in full; the within-node-deletion
      scenarios are the ones that must NOT move

## 4. Payload root normalization

- [ ] 4.1 Extend `reencodeBlocksForDestination` in `src/ops.ts` so a payload whose roots came
      from different depths lands with its roots as siblings at the destination depth, each
      root's internal relative structure preserved verbatim
- [ ] 4.2 Unit tests: mixed-depth roots, single root (unchanged behavior), and a root whose
      own descendants are deeper than the destination

## 5. Selection chrome

- [ ] 5.1 Render chrome per covered root for a mixed-depth forest, anchored to each root's
      own column rather than the shallowest root's. Both `decorations.ts` call sites gate on
      `coveredSubtreeRoots`; today a mixed-depth cover would fail that gate and drop to
      character-level highlight
- [ ] 5.2 Visual check against the existing decoration e2e suite; the chrome mechanism itself
      (blur, live-preview reveal) is untouched. `63-selection-visual-treatment.e2e.ts` asserts
      against `coveredSubtreeRoots` directly and must be re-read after 1.3

## 6. End-to-end verification

- [ ] 6.1 Update `61-selection-enforcement.e2e.ts`'s crossing scenarios to the new covers,
      including the cross-scope case that no longer includes the parent. Its
      `Shift+ArrowDown crossing a boundary` case is on `node-selection-extension`'s move-out
      list — leave it where it is and re-expect it here, rather than moving it early
- [ ] 6.2 New scenario: two cursors in adjacent siblings extended once no longer collapse to
      a whole-document range
- [ ] 6.2b New scenario: deleting a mixed-depth cover — the observable end of the 3b gate
      widening, and the one path that exercises geometry, classification, and multi-group
      deletion together
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
- [ ] 7.4 Record findings in `docs/research/04` as a numbered entry, continuing the Q-series
      (Q29 is the last one recorded)

## 8. Documentation

- [ ] 8.1 Close out `docs/research/13`. Two entries, and neither needs what the original task
      assumed: the "Escalation math re-examination candidate" entry's actual question was
      GAP inclusion, already answered by `escalate-include-owned-gap`; and "The
      selection/cursor-UX track" entry already records this pivot and already states that it
      resolves the former. All that remains is marking change 2 of the five as shipped and
      recording whatever the manual pass (7.x) found
- [ ] 8.2 Note in `docs/research/05-org-mode-comparison.md`'s divergence table that our
      selection model now matches the outliner mainstream on downward-vs-upward closure
