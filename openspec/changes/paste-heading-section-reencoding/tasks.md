## 1. Reproduce and characterize

- [ ] 1.1 Write an e2e probe reproducing the reported breakage: cut a heading section containing
      a paragraph, a nested list and a callout, paste it inside a list at depth 1 and at depth 3
- [ ] 1.2 Record the exact before/after buffers, so the current behavior is documented rather
      than described
- [ ] 1.3 Probe the inverse: a list subtree pasted into a heading section

## 2. Examples and the D1 decision

- [ ] 2.1 Write `examples.md` in this change, showing each of design D1's three options against
      the same shapes, in the outline-codeblock format the caret and extension changes use
- [ ] 2.2 Decide D1 with the examples in hand; record the choice and its reasoning in design.md
- [ ] 2.3 Record the decision in `docs/research/04` as a numbered finding, since it settles a
      question open since Q2

## 3. Implementation

- [ ] 3.1 Implement the cross-regime rule in `reencodeBlocksForDestination` — one call site, per
      design D3
- [ ] 3.2 Ensure the whole subtree re-encodes as a unit (D2), with descendants relative to the
      root's new regime
- [ ] 3.3 Unit tests in `tests/ops.test.ts`: heading section into a list at several depths, list
      subtree into a heading section, single heading with no children
- [ ] 3.4 Closure tests: the result re-parses to a well-formed tree in every case

## 4. Atoms and edge kinds

- [ ] 4.1 Explicit coverage for a pasted section containing a callout, a fenced code block and a
      table — atoms move as opaque units, and that assumption has failed twice on this path
- [ ] 4.2 Coverage for a setext heading in the payload, which the property-test generator does
      not produce

## 5. End-to-end and manual verification

- [ ] 5.1 E2E paste scenarios matching the examples file
- [ ] 5.2 Undo restores the pre-paste buffer byte-identically in one step
- [ ] 5.3 Real-vault manual pass on the reporter's own shapes
- [ ] 5.4 Record findings in `docs/research/04`
