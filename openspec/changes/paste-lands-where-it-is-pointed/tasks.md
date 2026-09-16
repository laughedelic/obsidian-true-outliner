## 1. One guarded call site

- [ ] 1.1 Move the expressibility guard out of `insertSubtrees` and into
      `reencodeBlocksForDestination`, beside the rule it guards (design D4/D6)
- [ ] 1.2 Unit test: `insertAsOnlyChildren`'s path refuses an atom below a paragraph.
      Negative control — with the guard left in `insertSubtrees`, the test fails, because that
      path never calls it
- [ ] 1.3 Unit test: the three insert paths return the SAME verdict for one payload and one
      destination. Negative control — before 1.1 and task 4, the caret path passes, the
      type-over path vetoes and the only-children path rewrites

## 2. Measurements still owed

- [ ] 2.1 Record the root-level absorption magnitude on a real note in the dev vault, so
      design D3's accepted case is judged against a real document rather than a fixture
- [ ] 2.2 Confirm in a real instance that Obsidian renders `- ## Notes` with heading styling
      at depth, in outline mode and out of it
- [ ] 2.3 Measure whether Obsidian's metadata cache indexes a heading inside a list item —
      i.e. whether a `[[note#Notes]]` anchor still resolves after a conversion (design D2's
      one unmeasured claim). Record either way in `docs/research/paste-across-encoding-regimes`

## 3. The heading arm

- [ ] 3.1 `encodingKindAtDestination` decides a heading payload's fate from the destination
      kind: stays a heading in a heading-bearing scope, becomes a list item in a list scope
      (design D1)
- [ ] 3.2 Re-levelling in `reencodeForDestination`: the payload's root takes the destination's
      depth, every heading in it shifts by the same delta, clamped at `h6`, routed through
      `headingWithLevel` so setext normalizes to ATX
- [ ] 3.3 Conversion into a list scope re-encodes every node in the payload that HAS CHILDREN
      as a list item, carrying a heading's own `#` run verbatim into the item's text (D1/D2)
- [ ] 3.4 Unit tests in `tests/reencode.test.ts` for both arms at several depths. Negative
      control — against today's re-encode step, which has no heading arm, the payload keeps
      its source levels and every one of these fails
- [ ] 3.5 Unit test: the payload's tree is preserved exactly across the conversion — same node
      count, same parent/child relationships. Negative control — convert only the root and
      re-indent the descendants verbatim, and the `heading → paragraph → list` shape loses a
      level (examples.md B3)
- [ ] 3.6 Unit test: an item converted into a list scope and then outdented back to a heading
      scope restores the original heading and its rank (design D2). Negative control — drop the
      `#` run on conversion and the rank is gone

## 4. Refusal instead of a native fall-through

- [ ] 4.1 `computePasteVerdict` vetoes on a rejection rather than returning `PASS` (design D5)
- [ ] 4.2 Unit test: a payload with an atom below a paragraph vetoes, with the existing
      `insertion-not-expressible` cue. Negative control — today's fall-through passes it
      through and the buffer is corrupted
- [ ] 4.3 Unit test: nothing that D1 now converts reaches the veto — a heading payload into a
      list scope is accepted at every depth
- [ ] 4.4 Unit test: an outdent that returns a converted item to a heading scope re-parses
      cleanly and the result is a heading node (design D2's reverse trip, pinned as behaviour
      rather than left to chance)

## 5. Absorption

- [ ] 5.1 Unit test: a heading payload spliced among siblings at a heading level takes the
      following content into its section, and the result re-parses to that tree (design D3 —
      pinned as stated behaviour, so a later change cannot alter it silently)
- [ ] 5.2 Unit test: absorption stops at the destination scope's end — a sibling heading of the
      enclosing level is never taken in
- [ ] 5.3 Closure tests: every accepted paste re-parses to the operation's declared tree, for
      both arms and at every depth

## 6. End to end

- [ ] 6.1 E2E paste scenarios matching `examples.md` frames B1/B2, C1, D1/D2 and E1/E2, in the
      existing clipboard group (which `run-e2e.mjs` forces to one worker — the OS clipboard is
      shared)
- [ ] 6.2 E2E: undo restores the pre-paste buffer byte-identically in one step, for a converted
      paste and for an absorbing one
- [ ] 6.3 Real-vault manual pass on the reporter's own shapes, plus the drag work's drop path
      if it has landed by then
- [ ] 6.4 Record the findings in `docs/research/open-questions`, as the entry that settles the
      heading arm left open since Q2 follow-up #4

## 7. Land

- [ ] 7.1 `openspec validate paste-lands-where-it-is-pointed --strict`
