## 1. Decide the layer (gate for everything else)

- [x] 1.1 Do NOT re-derive the cover's end offsets — `subtreeCoverEnd` (src/escalate.ts:106)
      already gives them. Measure instead the three collisions Option B would have to clear,
      per design D1: the deliberate `ch: 0` blank-line convention, `coveredSubtreeRoots`'s
      `!posBefore(hi, cover.end)` match, and the document's last node where there is no next
      line to point at
- [x] 1.2 From that, judge whether design D1's Option B is a one-position adjustment or a
      redefinition of the cover, and choose the layer
- [x] 1.3 Record the decision and its evidence in `docs/research/04` as a numbered finding,
      since `selection-as-subtree-set` builds on the outcome
- [x] 1.4 If Option B is chosen, confirm consecutive covers that now TOUCH still present as
      separate ranges — CodeMirror merges only overlapping ranges, measured 2026-07-25, and
      `node-selection-extension`'s block-vs-multi-cursor discriminator depends on it
      (N/A: Option A was chosen — no geometry moves, so covers never touch differently)

## 2. Single-range exact-cover deletion

- [x] 2.1 Implement the chosen fix so a deletion whose range exactly covers a whole subtree
      reaches the structural path
- [x] 2.2 If the fix lives in classification, route "does this span exactly cover subtrees"
      through `escalate.ts`'s exported cover computation rather than a second implementation —
      the duplication hazard recorded in docs/research/04 Q18 and Q19
- [x] 2.3 Unit tests: exact single-node cover, exact subtree cover with children, tight-list
      node with no gap, last node in the document
- [x] 2.4 Confirm no currently-verdicted deletion changes behavior

## 3. Multi-range verdicts

- [x] 3.1 Lift `collectEditFact`'s single-change-range restriction for exact-cover shapes
- [x] 3.2 Compute a verdict per range in `src/enforce.ts`; fall back to today's pass when any
      range is not an exact cover
- [x] 3.3 Unit and property tests: deleting any multi-range set of exact covers re-parses to a
      valid tree with no orphaned nodes and no leftover gap lines
- [x] 3.4 Confirm the latency budget in `node-edit-enforcement` still holds with per-range
      verdicts on the stress note

## 4. End-to-end verification

- [x] 4.1 E2E: select one node via a real gesture, delete, assert no orphan blank line
- [x] 4.2 E2E: multi-cursor selection of two exact covers, delete, assert a well-formed result
- [x] 4.3 Undo restores the pre-edit buffer byte-identically in one step, for both
- [x] 4.4 Off-mode reference assertions unchanged
- [x] 4.5 Mobile-emulation run

## 5. Real-vault manual pass

- [x] 5.1 Delete selected nodes of each kind on real notes — paragraphs, list items with
      children, heading sections, atoms — and check what is left behind
- [x] 5.2 Record findings in `docs/research/04`
