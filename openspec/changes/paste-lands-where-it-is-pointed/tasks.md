## 1. One guarded call site

- [x] 1.1 Move the expressibility guard out of `insertSubtrees` and into
      `reencodeBlocksForDestination`, beside the rule it guards (design D4/D6)
- [x] 1.2 Unit test: `insertAsOnlyChildren`'s path refuses an atom below a paragraph.
      Negative control — with the guard left in `insertSubtrees`, the test fails, because that
      path never calls it
- [x] 1.3 Unit test: the three insert paths return the SAME verdict for one payload and one
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

- [x] 3.1 `rules.ts` decides a heading payload's fate from the destination, beside
      `encodingKindAtDestination`: `destinationHeadingLevel` answers with a level in a
      heading-bearing scope and `undefined` in a list scope, where the payload converts (design D1)
- [x] 3.2 Re-levelling in `reencodeHeadingSubtree`: the payload's root takes the destination's
      depth, every heading in it shifts by the same delta, routed through `headingWithLevel` so
      setext normalizes to ATX; a payload whose deepest heading would pass `h6` is refused with
      `at-h6-bound`, on the same terms `indent` refuses it (design D2a)
- [x] 3.3 Conversion into a list scope re-encodes every node in the payload that HAS CHILDREN
      as a list item, carrying a heading's own `#` run verbatim into the item's text (D1/D2)
- [x] 3.4 Unit tests in `tests/edit-ops.test.ts` for both arms at several depths. Negative
      control — against today's re-encode step, which has no heading arm, the payload keeps
      its source levels and every one of these fails
- [x] 3.5 Unit test: the payload's tree is preserved exactly across the conversion — same node
      count, same parent/child relationships. Negative control — convert only the root and
      re-indent the descendants verbatim, and the `heading → paragraph → list` shape loses a
      level (examples.md B3)
- [x] 3.6 Unit test: an item converted into a list scope and then outdented back to a heading
      scope restores the original heading and its rank (design D2). Negative control — drop the
      `#` run on conversion and the rank is gone

## 4. Refusal instead of a native fall-through

- [x] 4.1 `computePasteVerdict` vetoes on a rejection rather than returning `PASS` (design D5)
- [x] 4.2 Unit test: a payload with an atom below a paragraph vetoes, with the existing
      `insertion-not-expressible` cue. Negative control — today's fall-through passes it
      through and the buffer is corrupted
- [x] 4.3 Unit test: nothing that D1 now converts reaches the veto — a heading payload into a
      list scope is accepted at every depth
- [x] 4.4 Unit test: an outdent that returns a converted item to a heading scope re-parses
      cleanly and the result is a heading node (design D2's reverse trip, pinned as behaviour
      rather than left to chance)

## 5. Absorption

- [x] 5.1 Unit test: a heading payload spliced among siblings at a heading level takes the
      following content into its section, and the result re-parses to that tree (design D3 —
      pinned as stated behaviour, so a later change cannot alter it silently)
- [x] 5.2 Unit test: absorption stops at the destination scope's end — a sibling heading of the
      enclosing level is never taken in
- [x] 5.3 Closure tests: every accepted paste re-parses to the operation's declared tree, for
      both arms and at every depth

## 6. End to end

- [x] 6.1 E2E paste scenarios matching `examples.md` frames B1/B2, C1, D1/D2 and E1/E2, in the
      existing clipboard group (which `run-e2e.mjs` forces to one worker — the OS clipboard is
      shared). Added to spec `62`, which is already in that group. Verified by CI's matrix: the
      harness cannot fetch Obsidian from the container these were written in
- [x] 6.2 E2E: undo restores the pre-paste buffer byte-identically in one step, for a converted
      paste and for an absorbing one
- [ ] 6.3 Real-vault manual pass on the reporter's own shapes, plus the drag work's drop path
      if it has landed by then
- [ ] 6.4 Record the findings in `docs/research/open-questions`, as the entry that settles the
      heading arm left open since Q2 follow-up #4

## 6b. Review round (independent review, 2026-09-16)

- [x] 6b.1 Replace the tautological `insertSubtrees` closure assertion with a payload-survival
      property that can fail. Negative control — it failed on its sixth generated case, against
      the boundary defect below
- [x] 6b.2 Separate a list item from every first child a continuation line swallows (`hr`,
      `quote`, `callout` alongside the `paragraph` and `html` the rule already named)
- [x] 6b.3 Separate an `html` block from whatever follows it — an HTML block ends at a blank
      line, not at its closing tag. Pre-existing, reached by any operation placing one before a
      sibling; surfaced by 6b.1
- [x] 6b.4 Take the destination heading level from the scope's heading SIBLINGS, not from its
      parent, so a level-skipped scope cannot let a pasted section swallow them (design D3)
- [x] 6b.5 Move that rule into `rules.ts` beside `encodingKindAtDestination`, which is where
      design D6 says it belongs; drop the dead `rootKind` parameter and the unreachable clamp
- [x] 6b.6 Neutralize the `at-h6-bound` cue, now reachable from a paste rather than an indent
- [x] 6b.7 Tests for the two requirements that had none: setext in the HEADING arm, and the
      three insert paths compared as trees rather than as substrings across three documents
- [ ] 6b.8 Follow-up change for the two parked mechanisms this one widens the reach of — atoms
      losing their kind past column 3, and a converted heading splitting an ordered run. Both
      measured in `docs/research/paste-across-encoding-regimes` (P5, P6)

## 7. Land

- [ ] 7.1 `openspec validate paste-lands-where-it-is-pointed --strict`
