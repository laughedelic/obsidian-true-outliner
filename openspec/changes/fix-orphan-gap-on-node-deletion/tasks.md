## 1. Decide the layer (gate for everything else)

- [ ] 1.1 Measure what an escalated cover's end actually is: one-line gap, multi-line gap, tight
      list with no gap, and the document's last node. Record the offsets
- [ ] 1.2 From that, judge whether design D1's Option B is a one-position adjustment or a
      redefinition of the cover, and choose the layer
- [ ] 1.3 Record the decision and its evidence in `docs/research/04` as a numbered finding,
      since `selection-as-subtree-set` builds on the outcome

## 2. Single-range exact-cover deletion

- [ ] 2.1 Implement the chosen fix so a deletion whose range exactly covers a whole subtree
      reaches the structural path
- [ ] 2.2 If the fix lives in classification, route "does this span exactly cover subtrees"
      through `escalate.ts`'s exported cover computation rather than a second implementation —
      the duplication hazard recorded in docs/research/04 Q18 and Q19
- [ ] 2.3 Unit tests: exact single-node cover, exact subtree cover with children, tight-list
      node with no gap, last node in the document
- [ ] 2.4 Confirm no currently-verdicted deletion changes behavior

## 3. Multi-range verdicts

- [ ] 3.1 Lift `collectEditFact`'s single-change-range restriction for exact-cover shapes
- [ ] 3.2 Compute a verdict per range in `src/enforce.ts`; fall back to today's pass when any
      range is not an exact cover
- [ ] 3.3 Unit and property tests: deleting any multi-range set of exact covers re-parses to a
      valid tree with no orphaned nodes and no leftover gap lines
- [ ] 3.4 Confirm the latency budget in `node-edit-enforcement` still holds with per-range
      verdicts on the stress note

## 4. End-to-end verification

- [ ] 4.1 E2E: select one node via a real gesture, delete, assert no orphan blank line
- [ ] 4.2 E2E: multi-cursor selection of two exact covers, delete, assert a well-formed result
- [ ] 4.3 Undo restores the pre-edit buffer byte-identically in one step, for both
- [ ] 4.4 Off-mode reference assertions unchanged
- [ ] 4.5 Mobile-emulation run

## 5. Real-vault manual pass

- [ ] 5.1 Delete selected nodes of each kind on real notes — paragraphs, list items with
      children, heading sections, atoms — and check what is left behind
- [ ] 5.2 Record findings in `docs/research/04`
