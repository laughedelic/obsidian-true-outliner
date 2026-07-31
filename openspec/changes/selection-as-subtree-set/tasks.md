## 1. Forest-cover geometry

- [x] 1.1 Add a single exported forest-cover computation to `src/escalate.ts`: given two
      end nodes, return the covered ROOTS (maximal subtrees of the document-order run,
      closed under descendants) and their combined span. Ancestor/descendant ends return
      the ancestor's subtree, unchanged
- [x] 1.2 Replace `siblingRunCover`'s use in `escalateRange` with it; keep `subtreeCoverOf`
      as-is
- [x] 1.3 Rebuild `coveredSubtreeRoots` on the same function — one implementation, now FOUR
      consumers (`decorations.ts` ×2, `enforce.ts`'s `coverIdsOf` and
      `computeMultiRangeDeletionVerdict`, `classify.ts`'s `isExactSubtreeCoverDeletion`),
      per design D4 and the two "silently-stale duplicate" incidents in docs/research/04
      (Q18, Q19)
- [x] 1.4 Unit tests for the geometry: the cross-scope case that used to pull in a parent,
      ancestor/descendant ends, mixed-depth roots, and the ANCESTOR-SWALLOWED-MID-SPAN case
      design D2 turns on — a span from a nested item into the first child of a later
      top-level node must cover that node's whole subtree, not stop at the end node
- [x] 1.5 Re-expect `tests/escalate.test.ts`'s "escalates to the contiguous run of whole
      top-level sections, not just the endpoints" (the `multi-sibling scope resolution`
      describe). It is the one unit test that pins the old rule directly: `Body one.` →
      `Body two.` currently expects `pos(0, 0)`, pulling in `# One`; the forest span starts
      at `pos(2, 0)`. Rename the describe too — it no longer resolves a scope

## 2. Invariant and property tests

- [x] 2.1 Add the DOWNWARD-CLOSURE property to `tests/escalate.test.ts`: every covered root's
      whole subtree is inside the cover, and no node whose own lines are inside the cover has
      a descendant outside it. Note there is no existing sibling-run property to replace —
      the old invariant is encoded only in unit tests (1.5) and implicitly in
      `siblingRunCover`, which is why the closure gap in the first draft of design D2 went
      unnoticed. This property is the one that would have caught it
- [x] 2.2 Property: an escalated cover is a single contiguous span (node order is text
      order) — this is what keeps a block selection representable as one range
- [x] 2.3 Keep and re-run the unchanged properties: expand-only, orientation preservation,
      multi-range uniformity, preamble jurisdiction
- [x] 2.4 Confirm `progressive-select-all`'s ladder rungs remain FIXPOINTS of the rewritten
      escalation: every rung is downward-closed and contiguous, so its forest span should be
      itself, but the ladder is the one shipped feature that dispatches covers into this filter
      and `select-all-ladder.ts` does not import the changed functions — nothing would fail
      loudly if it broke. Assert rung-in equals rung-out for each rung, and re-run
      `tests/select-all-ladder.test.ts` and `e2e/specs/64-progressive-select-all.e2e.ts`

## 3. Structural deletion over a forest

- [x] 3.1 Make `siblingCoverIds` in `src/enforce.ts` return GROUPS — one contiguous sibling
      run per parent — using the exported computation from 1.1 rather than its own
      traversal, and have `coverIdsOf`'s caller dispatch to `deleteSubtreeGroups` instead of
      `deleteSubtrees`. `deleteSubtreeGroups` (`fix-orphan-gap-on-node-deletion` D2) already
      removes runs under different parents in one structural pass with one diff, so no new
      deletion machinery is needed and `deleteSubtrees`' single-run contiguity rule stays
- [x] 3.2 Confirm deletion of a mixed-depth cover removes each root's subtree with its owned
      gap and leaves the remaining tree well formed
- [x] 3.3 Property test over generated trees: deleting any escalated cover re-parses to a
      valid tree with no orphaned nodes
- [x] 3.4 Confirm `computeMultiRangeDeletionVerdict` needs no shape change — it already maps
      each range's `coveredSubtreeRoots` to one group. Verify it with a multi-range selection
      whose ranges are themselves mixed-depth covers, which is newly reachable

## 3b. The widened classification gate

- [x] 3b.1 Enumerate what `classify.ts`'s `isExactSubtreeCoverDeletion` newly admits once
      `coveredSubtreeRoots` is forest-aware, and confirm each shape is one the verdict layer
      models. The gate belongs to `transaction-classification` ("A change exactly covering
      whole subtrees is a boundary-crossing edit"), a capability this change does not
      otherwise touch — design D4. Relaxing a predicate silently admits inputs nobody
      considered; measure rather than reason
- [x] 3b.2 Negative control. The original framing assumed the gate widened, so "disable the
      forest computation and watch the new assertions fail" does not apply — the assertion
      (every gate-decided cover is single-rooted) holds under BOTH rules, which is the finding.
      The control that does apply is vacuity: the property carries a coverage counter, verified
      to fail when raised past the observed 452, because a filter this narrow passes just as
      happily when it excludes everything. An earlier version reached its assertion once in 302
      cases
- [x] 3b.3 Re-run `tests/classify.test.ts` and
      `e2e/specs/60-transaction-classification.e2e.ts` in full; the within-node-deletion
      scenarios are the ones that must NOT move

## 4. Payload root normalization

- [x] 4.1 NO CODE CHANGE NEEDED — measured. `reencodeBlocksForDestination` maps each block
      through `reindentSubtreeVerbatim`, which swaps that block's OWN top-level whitespace for
      the destination indent independently, so roots from different source depths already land
      as siblings with their internals intact. Roots always run deepest-first (each is the
      subtree successor of the last, which only moves outward), so the clipboard slice's first
      block is over-indented and parses as a root rather than nesting under anything
- [x] 4.2 Unit tests: mixed-depth roots, single root (unchanged behavior), and a root whose
      own descendants are deeper than the destination

## 5. Selection chrome

- [x] 5.1 Render chrome per covered root for a mixed-depth forest, anchored to each root's
      own column. `selectedLineRootTargets` took the fact at the cover's START line and applied
      it to every line; since roots run DEEPEST-FIRST that would have pinned a whole mixed-depth
      selection to its deepest root's column. Now walks the roots, each contributing its own
      subtree's lines. `decorations.ts` has no unit coverage (it imports `obsidian`), so this
      is e2e- and eyeball-verified only
- [x] 5.2 Visual check against the existing decoration e2e suite; the chrome mechanism itself
      (blur, live-preview reveal) is untouched. `63-selection-visual-treatment.e2e.ts` asserts
      against `coveredSubtreeRoots` directly and must be re-read after 1.3

## 6. End-to-end verification

- [x] 6.1 MEASURED: no existing scenario needed re-expecting. Every crossing scenario in
      `61-selection-enforcement.e2e.ts` is a SAME-PARENT crossing, which the forest span and the
      sibling run answer identically. Added the cases that actually differ instead (below).
      `Shift+ArrowDown crossing a boundary` left in place per `node-selection-extension`'s
      move-out list
- [x] 6.2 New scenario: two cursors in adjacent siblings extended once no longer collapse to
      a whole-document range
- [x] 6.2b New scenario: deleting a mixed-depth cover — the observable end of the 3b gate
      widening, and the one path that exercises geometry, classification, and multi-group
      deletion together
- [x] 6.3 Copy/paste round-trip for a mixed-depth selection: roots land as siblings, internal
      structure intact
- [x] 6.4 Off-mode reference assertions unchanged
- [x] 6.5 Mobile-emulation run

## 7. Real-vault manual pass

- [ ] 7.1 Drag and keyboard selections across scope boundaries on real notes
- [x] 7.2 Judge mixed-depth chrome — design D4's open question. ANSWERED, with a measured
      before/after. In a pure-LIST document the question is moot: every list item's own shift is
      `0px` (list guides are deferred to Obsidian's native rendering), so all roots anchor
      identically and the cover is one clean rectangle. The difference only appears where roots
      have additive columns — headings and atoms. There, the pre-fix behavior left a covered
      root's own heading text OUTSIDE its own highlight, because every line took the cover's
      START line's column and the start line is the DEEPEST root. Per-root anchoring renders a
      stepped rectangle, one step per root, each root's own line inside its own step. It reads
      as the set of subtrees it is. Geometry does not move
- [ ] 7.3 Copy a mixed-depth selection into several destination depths and check the results
      against what Logseq produces for the same shapes
- [x] 7.4 Recorded as Q30: the false equivalence in D2 and why only a downward-closure
      property could catch it; the property that was exercised once in 302 cases; the gate that
      did not widen; and the two tasks that needed measurement rather than code. The real-vault
      pass's own findings (7.1, 7.3) still to be appended

## 8. Documentation

- [x] 8.1 Close out `docs/research/13`. Two entries, and neither needs what the original task
      assumed: the "Escalation math re-examination candidate" entry's actual question was
      GAP inclusion, already answered by `escalate-include-owned-gap`; and "The
      selection/cursor-UX track" entry already records this pivot and already states that it
      resolves the former. All that remains is marking change 2 of the five as shipped and
      recording whatever the manual pass (7.x) found
- [x] 8.2 Note in `docs/research/05-org-mode-comparison.md`'s divergence table that our
      selection model now matches the outliner mainstream on downward-vs-upward closure
