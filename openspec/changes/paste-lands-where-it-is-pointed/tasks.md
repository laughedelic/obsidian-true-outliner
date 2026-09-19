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
- [x] 2.2 Confirm in a real instance that Obsidian renders `- ## Notes` with heading styling
      at depth, in outline mode and out of it — measured: yes in both reading mode and Live
      Preview, the item's TEXT at the real `h2`'s size and weight. Recorded in
      `docs/research/paste-across-encoding-regimes` (see 6c.6 for the pass that got it wrong)
- [x] 2.3 Measure whether Obsidian's metadata cache indexes a heading inside a list item —
      i.e. whether a `[[note#Notes]]` anchor still resolves after a conversion (design D2's
      one unmeasured claim). Measured: it does NOT index it, so the anchor has no target.
      Recorded in `docs/research/paste-across-encoding-regimes`

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
      shared). Added to spec `62`, which is already in that group. Green in CI's matrix and,
      since the Obsidian cache was repaired, in a local run of the whole spec too (51 passing)
- [x] 6.2 E2E: undo restores the pre-paste buffer byte-identically in one step, for a converted
      paste and for an absorbing one
- [x] 6.3 Real-vault manual pass on the reporter's own shapes, plus the drag work's drop path
      if it has landed by then. Four reports, driven against `test-vault/Journal/2026-07-10.md`
      and written up in `docs/research/paste-across-encoding-regimes` (M1–M3). The drop path has
      not landed
- [ ] 6.4 Record the findings in `docs/research/open-questions`, as the entry that settles the
      heading arm left open since Q2 follow-up #4

## 6c. Manual pass (real vault, 2026-09-18)

- [x] 6c.1 Every structural node in a list scope becomes a list item, not only the ones with
      children — M1, where two siblings of one copied section landed as a paragraph and a list
      item. Negative control: the regression test fails on the old `hasChildren` reading
- [x] 6c.2 Read the paste anchor from the caret's COLUMN as well as its line, so a paste on the
      blank line under a node lands as its first child rather than past its whole subtree — M2,
      design D8. Negative control: both regression tests fail with the anchor forced back to
      `after`
- [x] 6c.3 E2E for both, through the real buffer: the M2 frame byte-for-byte, and the M1 peers
      frame
- [x] 6c.4 M3, the trailing gap lines: not reproducible through the verdict layer (~800
      combinations), reproducible immediately through the real gesture — Enter then Ctrl+V. The
      gap the caret sat in now collapses to one blank line with the insertion (design D9).
      Negative control: the regression test fails without the collapse
- [x] 6c.5 M4, a caret ON a heading pasting at the end of its section. The same rule as 6c.2,
      stated once for the whole anchor: the boundary immediately after the anchor's own lines
- [x] 6c.6 Re-measure the Live Preview rendering of `- ## Notes`, reading the text SPAN rather
      than the line box. It renders at the real `h2`'s size and weight; the first pass was wrong
      and is withdrawn. The probe now records both so a re-run cannot repeat it
- [x] 6c.7 E2E for the Enter-then-paste gap collapse and the caret-on-a-heading anchor, through
      the real buffer
- [x] 6c.9 M5, the caret jumping to the end of the absorbed section. `endOfInsertedRun` took the
      inserted block's SUBTREE end, which stops being the payload the moment a pasted heading
      absorbs the anchor's following siblings — the attachment rule can put them below the
      payload's own last node. It counts the payload's own nodes now. Negative control: over-count
      the walk and the caret lands on the absorbed paragraph again
- [x] 6c.8 `outline-zoom`'s G1 caught by CI: a paste at the zoom root's content start no longer
      splices BESIDE the root when that root has children, so the gesture the scenario names stops
      meeting its own condition. The ground is unchanged — restated from a CHILDLESS root, whose
      own line still names its next-sibling slot, with the new in-scope case pinned beside it.
      Delta added under `specs/outline-zoom/`

## 6d. Review round (independent review, 2026-09-19)

- [x] 6d.1 Separate a RUN from a following block of the same family — a quote or callout from a
      quote or callout, a table from a table. A caret paste on a node's own line now lands the
      payload's last block against the destination's FIRST CHILD, and that seam destroyed a
      callout on an ordinary Ctrl+V. Stated as the two families rather than the five measured
      pairs, beside `html`'s existing arm
- [x] 6d.2 Give `arbTree` the kinds that merge. The payload-survival property was the right
      property over a corpus that could not express the defect: the generator emits only
      `paragraph`, `list-item` and `code`, so two runs were never adjacent. Negative control: with
      the kinds added and the rule not yet fixed, the property fails on a `quote` counterexample
- [x] 6d.3 Compare COLUMNS to columns in `pasteAnchor`. `childBaseCol` answers in columns and
      `LinePos.ch` counts characters, so in a tab-indented vault — a supported configuration —
      `\t- one`'s child column of 6 was unreachable on a two-character gap line and every caret
      took the sibling reading. Negative control in the test
- [x] 6d.4 Collapse only a gap the payload actually FILLS. The shallow reading lands past the
      anchor's whole subtree, and the collapse was keyed on "the caret was in a gap" rather than
      on what the insertion reaches, rewriting bytes two lines above untouched content
- [x] 6d.5 Correct P5's "the node survives": true below a list item, false in a heading scope,
      where the atom's kind loss makes it a paragraph and the paragraph claims the next line
- [x] 6d.6 Re-word the retained mid-paragraph scenario, which stated the old anchor and is false
      for a paragraph WITH children, and replace the assertion in the conversion test that
      compared a literal against itself

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
- [x] 6b.8 The two pre-existing mechanisms this one widens the reach of are filed as issues, not
      carried as a follow-up change — AGENTS.md's "A follow-up is an issue" replaced the parking
      lots while this branch was open. Re-validated against `main` at `ca828aa` first: P5 is
      [#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158), P6 is
      [#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159). Validating P5
      turned up the mechanism behind its node-loss half, which the entry did not have

## 7. Land

- [ ] 7.1 `openspec validate paste-lands-where-it-is-pointed --strict`
