## 1. The operation in the algebra

- [x] 1.1 Add `moveSubtreesTo(doc, groups, destination)` to `src/ops.ts`, expressed once over the
      existing removal, insertion and re-encoding machinery (design D9) — verify it returns the
      same `OpResult<OpOutput>` shape as `indent` and `moveGroupsUp` and compiles with
      `npm run build`
- [x] 1.2 Reject a destination inside the operand's own subtrees, a destination that no longer
      exists, and the two the insertion rule refuses after the layer below — a payload-root atom
      into a paragraph's children, and a heading run whose deepest heading would re-level past the
      last level markdown has — verify in `tests/ops.test.ts` by asserting each reason and a
      byte-identical document; negative control: dropping the inside-the-operand guard changes
      the first case's reason from the guard's own to `node-not-found`, since the removal runs
      first and takes the anchor with it — the assertion is on the REASON, and a test that only
      asserted "rejected" would pass either way
- [x] 1.3 Close the atom-parent gap in the shared re-encode step, beside the guards the layer
      below already moved there: measured on this branch, it accepts a payload under a `code`,
      `table` or `quote` parent, though an atom is a leaf and `indent` refuses one as a target —
      verify with unit tests per atom kind asserting a rejection; negative control: with the
      guard absent, a list item is accepted as a code fence's child and the result re-parses to a
      different tree than it was built as
- [x] 1.4 Cover the absorption a moved heading inherits from the insertion rule — the anchor's
      following siblings joining the moved heading's section, bounded by the destination scope's
      end — verify in `tests/ops.test.ts` against the re-parsed tree; negative control: bounding
      absorption at the anchor instead of at the scope leaves a following sibling outside the
      section and fails
- [x] 1.5 Unit tests for the gap arithmetic on both sides — a run leaving from between two
      siblings and arriving between two others — in `tests/ops.test.ts`; negative control:
      carrying the anchor's trailing gap on the removal side as well as the insertion side
      doubles a blank line and fails the arrival assertion
- [x] 1.6 Unit tests for ordered renumbering on both sides, a run moved out of one ordered run and
      into the middle of another; negative control: resolving the destination index against the
      post-removal document rather than the pre-removal one puts the run one position off when the
      source sits above the destination in the same parent — the renumber itself is not a knob
      this change owns, since `deleteSubtreeGroups` already calls `renumberOrderedAgainst`
- [x] 1.7 Unit tests for re-encoding at the destination across depth and across regime, asserting
      internal relative nesting is preserved; negative control: resolving the destination's
      sibling context from the PRE-removal document, so the re-encode reads a sibling that the
      move itself took away, mis-levels a heading run landing where its own former sibling stood
      — the re-encode is internal to the insertion, so there is no caller-side variant to omit
- [x] 1.8 A round-trip property in `tests/ops.test.ts`, scoped to operands that ABSORB NOTHING —
      non-heading roots, and heading roots landing where the next sibling is a heading of the same
      level: moved to another destination in the same scope and moved back, the document is byte
      for byte the original; negative control: a deliberate off-by-one in the destination index
      breaks it on the generated corpus. Plus an explicit test of the ASYMMETRY for the absorbing
      case, since the property is false there by construction — measured on this branch, moving
      `## Move me` after `para A` takes `para B` into its section, so the return trip's anchor is
      inside the run it would move
- [x] 1.9 A closure property in `tests/closure.test.ts` asserting that every node the run carried
      is still a node after the move — the form the layer below arrived at after finding its first
      closure assertion could not fail, because `finalize` returns `parse(encode(surgery))` and
      re-checking that round trip is blind to a surgery the re-parse reads differently; negative
      control: with the atom-parent guard of 1.3 removed, a run landing under a code fence loses
      nodes on the re-parse and the property fails
- [x] 1.10 A move whose destination is the run's current place produces no document change — verify
      by a unit test asserting an empty changeset rather than a no-op rewrite; negative control:
      resolving the destination before comparing it with the run's current place emits a
      remove-and-reinsert that rewrites identical bytes, which the changeset assertion catches

## 2. Resolving a destination from a pointer position

- [x] 2.1 Implement the seam-and-depth resolution as a pure function over the parsed document, the
      operand and a pointer position (design D6) — verify with unit tests over a fixture whose
      seams have known intervals, including the six-destination shape the mockup draws; negative
      control: computing the interval from the operand's own depth rather than from the flanking
      nodes gives one destination per seam and fails every multi-depth case
- [x] 2.2 Bound the interval by the flanking rows, excluding depths shallower than the row below
      and deeper than one level inside the row above; negative control: dropping the lower bound
      offers a depth that would make the following row a descendant, which the test asserts is
      absent
- [x] 2.3 Exclude depths inside folded content, taking the deep bound from the deepest VISIBLE
      trailing descendant — verify with a unit test over a folded fixture; negative control:
      reading the deep bound from the unfolded tree offers hidden levels and fails
- [x] 2.4 Filter the candidate set by calling the shared re-encode step per candidate and keeping
      what it accepts (design D6) — verify with a unit test that one seam inside a deep heading
      scope offers its shallower columns and refuses its deeper ones for a heading-rooted operand;
      negative control: a hand-written kind check, which cannot see a depth-dependent refusal at
      all, offers every column of that seam and fails
- [x] 2.5 Exclude every seam and depth inside the operand's own subtrees — verify by a unit test
      over an operand in the middle of its own parent; negative control: excluding only the
      operand's ROOT rows still offers the seams between its descendants, which the test names
- [x] 2.6 Partition the horizontal axis across the seam's legal columns, clamped at both ends, so
      every position resolves to exactly one candidate — verify by sweeping the axis from far left
      of the shallowest column to far right of the deepest and asserting no position resolves to
      none; negative control: `guideHit`'s own band, which an earlier draft borrowed, leaves
      7.33px between every pair of columns resolving to nothing at the default unit and returns
      nothing at all right of the line's text start, so the sweep fails in both regions
- [x] 2.7 Take seams from NODE boundaries, not from rendered rows — verify no seam is offered
      inside a table, a fenced code block or a paragraph broken over several lines, nor on either
      side of a trailing gap line; negative control: resolving from `.cm-line` elements offers a
      seam between a table's header and its body, which the test names
- [x] 2.8 Offer the document's first and last seams, with the preamble excluded — verify a run can
      be dropped at the top level after the last node and before the first, and that no
      destination places it inside or above frontmatter; negative control: deriving the shallow
      bound from "the node below" alone leaves the last seam with no bound and no destination
- [x] 2.9 Bound the resolution by the zoom scope, so no destination outside it is ever produced —
      verify with a unit test over a zoomed fixture; negative control: resolving against the
      unzoomed tree offers a destination the scope would reject

## 3. The press, and the drag it can become

- [x] 3.1 Move the mark press's zoom from `pointerdown` to `pointerup`, keeping the press claimed
      on arrival (design D2), and add the `pointerup` that `clickMark` in
      `e2e/specs/80-outline-zoom.e2e.ts` does not currently dispatch — without it every mark-click
      scenario stops zooming, on the mobile suite too, which depends on that same helper. Verify
      those scenarios pass with the helper's new dispatch and their own assertions unchanged;
      negative control: the helper WITHOUT the added `pointerup` fails every one of them, which is
      how this was found
- [x] 3.2 Add the drag threshold and the state it carries, in the same listener rather than a
      second one — verify a press that moves past the threshold produces no zoom and a press that
      does not still zooms; negative control: resolving the drag at the first move rather than at
      a threshold turns a hand tremor into a drag, which a one-pixel move asserts
- [x] 3.3 Capture the pointer on the editor root for the drag's duration and release it on every
      exit path, including `lostpointercapture` (design D4) — verify moves outside the editor's
      own box still reach the handler, which is the measurement that motivated it
      (docs/research/node-drag-and-drop section 5); negative control: listening on the editor root
      without capture loses the moves once the pointer leaves its box, which the test drives by
      moving out over the app chrome
- [x] 3.4 Resolve the operand by `selection-structural-ops`'s rule, collapsing the selection to the
      pressed node's cover at the THRESHOLD rather than at the press (design D9a) — a cover is the
      block-selection interaction mode, and a sub-threshold press is a zoom that has no business
      entering it. Verify with unit tests over the selection shapes and an e2e case for each
      branch; negative control: collapsing at the press puts a plain mark click into block
      selection on its way to zooming, which the e2e case reads off the suppressed native
      highlight
- [ ] 3.4a Resolve seams AFTER the mode has settled, since a row that stops rendering raw can
      change height — verify the destination resolved on the first move after the threshold
      matches the one resolved on the second, with no shift; negative control: resolving on the
      same frame as the collapse reads pre-mode row geometry and the two disagree by a row
- [x] 3.5 Make a task's checkbox a drag source, and verify its own click still toggles — the two
      halves measured in docs/research/node-drag-and-drop section 4; negative control: swallowing
      the checkbox's click along with the press stops the toggle and fails
- [ ] 3.6 Cancel paths: Escape, a release with no destination, lost capture, a document change
      under the drag, and view teardown — verify each leaves the buffer byte-identical, adds no
      undo entry, and restores the selection as it was BEFORE 3.4's collapse; negative control:
      restoring the post-collapse selection leaves the pressed node's cover selected after a
      cancel, which the test names
- [ ] 3.7 Decline inside nested editors, outside outline mode, and on chrome marks the trail and
      the footer draw — verify by e2e cases mirroring the ones `outline-zoom` already has for the
      same three; negative control: matching a mark by selector alone picks up the trail's own
      mark, which the zoom-out crumb case then fails on

- [x] 3.8 Enter the shared command funnel rather than dispatching beside it, so the drop gets the
      single transaction, undo grouping, caret policy, fold carry and rejection cue the other two
      entry points get — noting the gesture holds a view where they hold an `Editor`
      (`selection-structural-ops` delta) — verify a drop and the equivalent command produce an
      identical document and selection; negative control: dispatching the changeset directly
      produces the same buffer with a different resulting selection, which the comparison catches

## 4. The preview

- [x] 4.1 Carry the resolved destination as editor state through a `StateEffect` and `StateField`,
      dispatched only when the destination changes (design D10) — verify by a unit test over the
      field's updates that an unchanged destination dispatches nothing; negative control:
      dispatching per move instead emits one transaction per pointer sample, which a counter in
      the test reads directly
- [x] 4.2 Draw the indicator at the seam with its left end on the destination depth's own column,
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
      `hierarchy-position-indicators`'s own coverage does; negative control: accenting by weight
      instead of by colour changes the guide's resolved width, which the assertion compares
- [ ] 4.6 Render the operand's rows as lifted, in place, composing with the block-selection chrome
      they already carry — verify the rows' resolved positions are unchanged mid-drag; negative
      control: replacing the cover's chrome with the lifted treatment rather than composing leaves
      a multi-root operand with no cover edge, which the chrome assertion catches
- [ ] 4.7 Add a new part under `styles/` for the preview and the lifted treatment, per the
      one-part-per-feature rule — verify `npm run build:plugin` emits it into `styles.css` in
      cascade order and no shared part was edited
- [ ] 4.8 Clear every trace on every drag end — verify by asserting the absence of each class and
      of the field's content after Escape, after a drop, and after a cancel; negative control:
      clearing on drop alone leaves the lifted class behind after an Escape, which that case names

## 5. Touch, autoscroll, and the edges

- [ ] 5.1 Start a touch drag on a dwell rather than on movement alone (design D12) — verify in the
      mobile-emulation run as far as it can be driven, and record what it could not drive
- [ ] 5.2 Autoscroll while the pointer is held within the band at the scroller's edges, at a rate
      taken from the distance past the edge (design D13) — verify a destination initially off
      screen becomes reachable without releasing, and that a cancelled autoscrolled drag leaves
      the buffer byte-identical; negative control: scrolling by a fixed step regardless of
      distance past the edge makes the rate independent of the pointer, which the test reads from
      two different overshoots
- [ ] 5.3 Verify the latency of a preview dispatch against the existing budget on a stress note,
      recording the figures — the gate pass did not time this
      (docs/research/node-drag-and-drop section 8); negative control: removing 4.1's
      dispatch-on-change guard puts one transaction per pointer sample through the same note,
      which is the shape the budget is meant to catch

## 6. End-to-end coverage

- [ ] 6.1 Add `e2e/specs/81-node-dragging.e2e.ts` driven by a REAL pointer, per the capability's
      own verification requirement — verify with `npm run test:e2e:narrow -- 81-node-dragging`
- [ ] 6.2 Add `e2e/dragging.ts` beside it for the feature's own helpers, leaving `e2e/helpers.ts`
      untouched per the helpers-beside-their-specs rule. It carries an IN-PAGE RECORDER: a held
      button does not survive the end of its driving call (measured — the press is auto-released
      when `performActions` returns), so mid-drag state cannot be read by stopping. The recorder
      samples the resolved destination and the preview's state on each `pointermove`, the whole
      drag runs in one call, and the assertions read the recording afterwards
- [ ] 6.2a Drive Escape mid-drag as a key source and a pointer source ticking together in ONE
      call, asserting against the recorder — verify the cancel is observed while the button is
      still down; negative control: the same Escape sent as a separate call arrives after the
      auto-release and cancels nothing, which is what the measurement showed
- [ ] 6.3 Give the spec its own CI group in `scripts/spec-groups.mjs`, as `94-fold-guide-click`
      has: it drives a real OS-level cursor under a shared Xvfb display, which is the same
      contention that file already documents — verify `node scripts/spec-groups.mjs --list-groups`
      names it
- [ ] 6.4 Cover one drop per destination class — as a child of the row above, as a sibling at each
      intervening level, as a sibling of the row below — asserting the resulting buffer; negative
      control: resolving the depth from the seam alone collapses them all to one and fails every
      case but one
- [ ] 6.5 Cover a multi-root cover dragged as a unit, and the selection it leaves behind; negative
      control: dragging only the pressed root leaves the others in place, which the buffer names
- [ ] 6.6 Cover the cases that must NOT move anything: a press that does not pass the threshold, a
      modified press, a drop with no destination, Escape mid-drag, an off-mode note; negative
      control: each case asserts the buffer AND the undo depth, since a write that is immediately
      reverted leaves the buffer identical and the history one entry longer
- [ ] 6.7 Cover an absorbing drop end to end: the preview's marked region, and the buffer after
      the release showing the absorbed siblings inside the moved heading's section; negative
      control: a fixture whose following sibling is a heading of the same level absorbs nothing,
      so a preview marking a region there is marking one that will not happen
- [ ] 6.8 Cover the fold cases: no hidden depths offered, a drop into a folded node opening it, and
      the run landing as its LAST child; negative control: landing it first puts the run above
      content the reader could not see, which the resulting buffer names
- [ ] 6.9 Cover the zoom case: every destination inside the scope, and no drag that leaves it;
      negative control: resolving against the unzoomed tree offers a destination outside the
      scope, which the sweep across the seam finds
- [ ] 6.10 Run the desktop and mobile suites for the touched groups and record what the mobile run
      could not drive — `npm run test:e2e -- --group dragging` and the mobile equivalent

## 7. Manual pass and record

- [ ] 7.1 Real-vault pass on desktop: drag across long distances with autoscroll, into and out of
      folded subtrees, across encoding regimes, and with several roots — record what the preview
      said against what landed
- [ ] 7.2 Real-device pass on a phone via the beta build: the long press, the drag, the preview at
      the mobile unit, and the cancel — record it, since the harness cannot drive it
- [ ] 7.3 Fold the pass's findings into docs/research/node-drag-and-drop's open-questions section.
      The affordance-budget entry in docs/research/decoration-follow-ups is settled in half by this
      change — the handle question is answered, the task's ZOOM is not — and the parking lots are
      closed to new entries, so that residue MOVES OUT to an issue as this change touches it,
      with the user's go-ahead, rather than being edited in place. Its measurements stay in the
      note; the issue carries the diagnosis and what closing it would involve

## 8. Land

- [ ] 8.1 Re-check every statement this change makes about the insertion rule against the layer
      below as it finally merged — its six open tasks can still move the conversion — and correct
      anything that drifted; verify `openspec validate --strict` on both changes
- [ ] 8.2 `npm run lint`, `npm test` and `npm run build` clean
- [ ] 8.3 Sync the delta specs into the main specs and archive the change on this branch, per the
      change lifecycle
- [ ] 8.4 `openspec validate drag-nodes-with-a-drop-preview --strict`
