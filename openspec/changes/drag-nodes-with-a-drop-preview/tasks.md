## 1. The operation in the algebra

- [ ] 1.1 Add `moveSubtreesTo(doc, groups, destination)` to `src/ops.ts`, expressed once over the
      existing removal, insertion and re-encoding machinery (design D9) — verify it returns the
      same `OpResult<OpOutput>` shape as `indent` and `moveGroupsUp` and compiles with
      `npm run build`
- [ ] 1.2 Reject a destination inside the operand's own subtrees, a destination that no longer
      exists, and the two the insertion rule refuses after the layer below — a payload-root atom
      into a paragraph's children, and a heading run whose deepest heading would re-level past the
      last level markdown has — verify in `tests/ops.test.ts` by asserting each reason and a
      byte-identical document; negative control: dropping the inside-the-operand guard makes the
      first produce a document that no longer parses to the same node count
- [ ] 1.3 Cover the absorption a moved heading inherits from the insertion rule — the anchor's
      following siblings joining the moved heading's section, bounded by the destination scope's
      end — verify in `tests/ops.test.ts` against the re-parsed tree; negative control: bounding
      absorption at the anchor instead of at the scope leaves a following sibling outside the
      section and fails
- [ ] 1.4 Unit tests for the gap arithmetic on both sides — a run leaving from between two
      siblings and arriving between two others — in `tests/ops.test.ts`; negative control:
      carrying the anchor's trailing gap on the removal side as well as the insertion side
      doubles a blank line and fails the arrival assertion
- [ ] 1.5 Unit tests for ordered renumbering on both sides, a run moved out of one ordered run and
      into the middle of another; negative control: skipping the renumber on the SOURCE side
      leaves a gap in the old run's numbering and fails
- [ ] 1.6 Unit tests for re-encoding at the destination across depth and across regime, asserting
      internal relative nesting is preserved; negative control: passing the original blocks to the
      insertion instead of the re-encoded ones leaves the run at its source depth and fails
- [ ] 1.7 A round-trip property in `tests/ops.test.ts`: a run moved to another destination in the
      same scope and moved back yields the original document byte for byte; negative control: a
      deliberate off-by-one in the destination index breaks it on the generated corpus
- [ ] 1.8 Closure tests in `tests/closure.test.ts`: the result of every generated move re-parses to
      a well-formed tree with the same node ids present; negative control: allowing a destination
      inside the operand makes the closure check report lost nodes
- [ ] 1.9 A move whose destination is the run's current place produces no document change — verify
      by a unit test asserting an empty changeset rather than a no-op rewrite

## 2. Resolving a destination from a pointer position

- [ ] 2.1 Implement the seam-and-depth resolution as a pure function over the parsed document, the
      operand and a pointer position (design D6) — verify with unit tests over a fixture whose
      seams have known intervals, including the six-destination shape the mockup draws
- [ ] 2.2 Bound the interval by the flanking rows, excluding depths shallower than the row below
      and deeper than one level inside the row above; negative control: dropping the lower bound
      offers a depth that would make the following row a descendant, which the test asserts is
      absent
- [ ] 2.3 Exclude depths inside folded content, taking the deep bound from the deepest VISIBLE
      trailing descendant — verify with a unit test over a folded fixture; negative control:
      reading the deep bound from the unfolded tree offers hidden levels and fails
- [ ] 2.4 Filter the candidate set by calling the shared re-encode step per candidate and keeping
      what it accepts (design D6) — verify with a unit test that one seam inside a deep heading
      scope offers its shallower columns and refuses its deeper ones for a heading-rooted operand;
      negative control: a hand-written kind check, which cannot see a depth-dependent refusal at
      all, offers every column of that seam and fails
- [ ] 2.5 Exclude every seam and depth inside the operand's own subtrees — verify by a unit test
      over an operand in the middle of its own parent
- [ ] 2.6 Snap the horizontal position to the nearest legal column using the guide gesture's own
      tolerance — verify a pointer a third of a unit past a column resolves to it and one past
      that does not
- [ ] 2.7 Bound the resolution by the zoom scope, so no destination outside it is ever produced —
      verify with a unit test over a zoomed fixture; negative control: resolving against the
      unzoomed tree offers a destination the scope would reject

## 3. The press, and the drag it can become

- [ ] 3.1 Move the mark press's zoom from `pointerdown` to release in `src/plugin/zoom-click.ts`,
      keeping the press claimed on arrival (design D2) — verify the existing mark-click scenarios
      in `e2e/specs/80-outline-zoom.e2e.ts` still pass unchanged
- [ ] 3.2 Add the drag threshold and the state it carries, in the same listener rather than a
      second one — verify a press that moves past the threshold produces no zoom and a press that
      does not still zooms
- [ ] 3.3 Capture the pointer on the editor root for the drag's duration and release it on every
      exit path, including `lostpointercapture` (design D4) — verify moves outside the editor's
      own box still reach the handler, which is the measurement that motivated it
      (docs/research/node-drag-and-drop section 5)
- [ ] 3.4 Resolve the operand by `selection-structural-ops`'s rule, collapsing the selection to the
      pressed node's cover when the press lands outside the current cover — verify with unit tests
      over the selection shapes and an e2e case for each branch
- [ ] 3.5 Make a task's checkbox a drag source, and verify its own click still toggles — the two
      halves measured in docs/research/node-drag-and-drop section 4; negative control: swallowing
      the checkbox's click along with the press stops the toggle and fails
- [ ] 3.6 Cancel paths: Escape, a release with no destination, lost capture, a document change
      under the drag, and view teardown — verify each leaves the buffer byte-identical with no
      undo entry
- [ ] 3.7 Decline inside nested editors, outside outline mode, and on chrome marks the trail and
      the footer draw — verify by e2e cases mirroring the ones `outline-zoom` already has for the
      same three

## 4. The preview

- [ ] 4.1 Carry the resolved destination as editor state through a `StateEffect` and `StateField`,
      dispatched only when the destination changes (design D10) — verify by a unit test over the
      field's updates that an unchanged destination dispatches nothing
- [ ] 4.2 Draw the indicator at the seam with its left end on the destination depth's own column,
      taken from `chrome-line.ts`'s column expression — verify in e2e by comparing the indicator's
      resolved left edge against a marker's column at the same depth, as a RELATION not an
      absolute; negative control: positioning from a list bullet's box puts it a few px out on
      list destinations only, which the cross-kind assertion catches
- [ ] 4.3 Draw the mark the run will have after re-encoding at that column, from the same
      resolution the release uses (design D7) — verify a heading section dragged into a list
      previews a list mark; negative control: drawing the operand's current kind previews a
      heading glyph and fails
- [ ] 4.4 Mark the region an absorbing drop would take in, ending where the absorption ends, and
      distinguishably from the lifted run and the destination accent — verify against a heading
      drop whose section reaches three following siblings but not a fourth; negative control:
      taking the region from the anchor alone marks nothing and fails. Settle the treatment against
      the mockup first, per design D8's open question
- [ ] 4.5 Accent the destination parent with the accent the caret trail already publishes, without
      changing its weight — verify by reading the resolved colour and width, as
      `hierarchy-position-indicators`'s own coverage does
- [ ] 4.6 Render the operand's rows as lifted, in place, composing with the block-selection chrome
      they already carry — verify the rows' resolved positions are unchanged mid-drag
- [ ] 4.7 Add a new part under `styles/` for the preview and the lifted treatment, per the
      one-part-per-feature rule — verify `npm run build:plugin` emits it into `styles.css` in
      cascade order and no shared part was edited
- [ ] 4.8 Clear every trace on every drag end — verify by asserting the absence of each class and
      of the field's content after Escape, after a drop, and after a cancel

## 5. Touch, autoscroll, and the edges

- [ ] 5.1 Start a touch drag on a dwell rather than on movement alone (design D12) — verify in the
      mobile-emulation run as far as it can be driven, and record what it could not drive
- [ ] 5.2 Autoscroll while the pointer is held within the band at the scroller's edges, at a rate
      taken from the distance past the edge (design D13) — verify a destination initially off
      screen becomes reachable without releasing, and that a cancelled autoscrolled drag leaves
      the buffer byte-identical
- [ ] 5.3 Verify the latency of a preview dispatch against the existing budget on a stress note,
      recording the figures — the gate pass did not time this
      (docs/research/node-drag-and-drop section 8)

## 6. End-to-end coverage

- [ ] 6.1 Add `e2e/specs/81-node-dragging.e2e.ts` driven by a REAL pointer, per the capability's
      own verification requirement — verify with `npm run test:e2e:narrow -- 81-node-dragging`
- [ ] 6.2 Add `e2e/dragging.ts` beside it for the feature's own helpers (pick up a mark, move to a
      seam and column, release, read the destination the preview resolved), leaving
      `e2e/helpers.ts` untouched — per the helpers-beside-their-specs rule
- [ ] 6.3 Give the spec its own CI group in `scripts/spec-groups.mjs`, as `94-fold-guide-click`
      has: it drives a real OS-level cursor under a shared Xvfb display, which is the same
      contention that file already documents — verify `node scripts/spec-groups.mjs --list-groups`
      names it
- [ ] 6.4 Cover one drop per destination class — as a child of the row above, as a sibling at each
      intervening level, as a sibling of the row below — asserting the resulting buffer; negative
      control: resolving the depth from the seam alone collapses them all to one and fails every
      case but one
- [ ] 6.5 Cover a multi-root cover dragged as a unit, and the selection it leaves behind
- [ ] 6.6 Cover the cases that must NOT move anything: a press that does not pass the threshold, a
      modified press, a drop with no destination, Escape mid-drag, an off-mode note
- [ ] 6.7 Cover an absorbing drop end to end: the preview's marked region, and the buffer after
      the release showing the absorbed siblings inside the moved heading's section
- [ ] 6.8 Cover the fold cases: no hidden depths offered, and a drop into a folded node opening it
- [ ] 6.9 Cover the zoom case: every destination inside the scope, and no drag that leaves it
- [ ] 6.10 Run the desktop and mobile suites for the touched groups and record what the mobile run
      could not drive — `npm run test:e2e -- --group dragging` and the mobile equivalent

## 7. Manual pass and record

- [ ] 7.1 Real-vault pass on desktop: drag across long distances with autoscroll, into and out of
      folded subtrees, across encoding regimes, and with several roots — record what the preview
      said against what landed
- [ ] 7.2 Real-device pass on a phone via the beta build: the long press, the drag, the preview at
      the mobile unit, and the cancel — record it, since the harness cannot drive it
- [ ] 7.3 Fold the pass's findings into docs/research/node-drag-and-drop's open-questions section,
      and close the affordance-budget entry in docs/research/decoration-follow-ups against what
      this change settled and what it left open

## 8. Land

- [ ] 8.1 Re-check every statement this change makes about the insertion rule against the layer
      below as it finally merged — its six open tasks can still move the conversion — and correct
      anything that drifted; verify `openspec validate --strict` on both changes
- [ ] 8.2 `npm run lint`, `npm test` and `npm run build` clean
- [ ] 8.3 Sync the delta specs into the main specs and archive the change on this branch, per the
      change lifecycle
- [ ] 8.4 `openspec validate drag-nodes-with-a-drop-preview --strict`
