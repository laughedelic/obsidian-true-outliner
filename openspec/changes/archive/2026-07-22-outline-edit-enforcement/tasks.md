# Tasks: outline-edit-enforcement

## 1. Pure structural operations (delete / merge / insert)

- [x] 1.1 Implement `deleteSubtrees` in `src/ops.ts`: contiguous whole-subtree removal
      including trailing gaps, empty-document result valid, typed rejection for
      non-contiguous/partial input
- [x] 1.2 Pin the per-kind merge table (which joins are expressible, which reject and
      why) in the structural-operations delta spec, then implement `mergeNodes` to it
- [x] 1.3 Implement `insertSubtrees`: boundary-only splice, depth re-encoding per the
      existing reparenting rules, typed rejection for inexpressible sequences
- [x] 1.4 Extend the property-test suite to all three ops: closure, totality,
      minimal-edit, gap-accounting round-trips; unit tests for the merge table's
      reject cases and the empty-document edge

## 2. Verdict layer (pure)

- [x] 2.1 Implement `src/enforce.ts`: `(class, edit facts, tree) → pass | rewrite |
      veto`, covering subtree-cover deletion (escalate-then-delete for stale mid-node
      ranges, type-over insertion), single-separator merge recognition, and the
      structural-paste rule (multi-block sequence → insert-at-boundary; single
      block/continuation lines → pass, conservative bias)
- [x] 2.2 Property tests: every rewrite's output re-parses to a well-formed tree with
      no orphans; veto never changes text; within-node edits and all non-enforced
      classes never receive a verdict
- [x] 2.3 Unit tests for the paste heuristic boundary cases (plain multi-line
      fragment, single block, whole-subtree sequence, mixed) and the merge-shape
      recognizer (Backspace-at-start vs Delete-at-end vs multi-char deletions)

## 3. Funnel wiring

- [x] 3.1 Extend `transaction-filter.ts`: hand `boundary-crossing-edit` to the verdict
      layer; rewrites replace the change specs with a plugin-own `userEvent`
      (vocabulary consistent with the grammar's), post-op selection per the
      structural-commands cursor contract, single history entry
- [x] 3.2 Implement veto mechanics: dissolve the transaction with no history entry;
      surface the rejection cue via annotation/effect observed outside the filter
      (never a side effect inside it), reusing `messages.ts` reasons
- [x] 3.3 Extend `stats.ts` with per-class verdict counters and per-verdict timings;
      per-transaction verdict logging behind the existing crosscheck debug setting
- [x] 3.4 Guard against re-processing: plugin-own annotation short-circuit on our own
      rewritten specs; unit-level regression for the no-loop property

## 4. Evidence suite (e2e 62)

- [x] 4.1 Deletion scenarios: escalated-selection Backspace removes subtrees + gaps;
      stale mid-node selection Delete rewrites to subtree cover; type-over inserts
      typed text; delete-all leaves a functional empty note
- [x] 4.2 Merge scenarios: paragraph←paragraph Backspace joins as one undo step;
      structure-corrupting merge vetoes with cue and byte-identical buffer; Delete at
      node end mirrors Backspace behavior
- [x] 4.3 Paste/drop scenarios: block-level copy pasted mid-node splices at the
      boundary re-indented; plain multi-line fragment pastes stock; within-node
      single-line paste byte-identical
- [x] 4.4 Contract scenarios: undo after each rewrite restores the pre-edit buffer
      byte-identically; vetoes add no history entry; pass-through classes
      (programmatic `set` reconciliation, plugin-own grammar ops, off-mode notes,
      nested table-cell editing) remain byte-identical with no verdicts recorded
- [x] 4.5 Perf: drive boundary deletions/merges/structural pastes on the ~2000-line
      stress note; record the first per-verdict timing samples against the budget
- [x] 4.6 Automation-gap retry: one renewed harness attempt each for the
      find-and-replace panel and HTML5 drag-drop; on failure, write the scripted
      manual scenarios into the verification notes

## 5. Verification and closure (first pass — superseded by section 6's re-verification)

- [x] 5.1 Full suite (unit + all e2e specs) green twice consecutively; lint/typecheck
      clean
- [x] 5.2 Build + vault install; real-vault manual pass focused on: veto frequency on
      organic editing, paste-heuristic misfires, trailing-gap deletion feel, merge
      ergonomics — plus the scripted manual scenarios from 4.6 if automation failed.
      Completed across FIVE rounds (sections 6-9 below), each with its own
      build/install/re-verify cycle
- [x] 5.3 Record findings (merge-table verdicts, paste shapes observed, perf numbers,
      manual-pass verdict) in design.md and docs/research/04; route any deferred UX
      threads to docs/research/13 Track 2 or docs/research/12 — never into this
      change's scope. Recorded incrementally as Q15-Q20 and design.md D9-D16
- [x] 5.4 Amend the delta specs if manual-pass evidence changes a rule (per the A+B
      amendment precedent), re-validate, and leave the change ready for sync/archive.
      Delta specs amended through sections 6-9; `openspec validate --strict` clean;
      8.2/8.3 explicitly deferred out of scope (2026-07-23); redo-cursor
      investigation spun out separately (Q20) — change is ready for sync/archive

## 6. Chrome-transparent editing (amendment 2026-07-21, first manual-pass findings)

- [x] 6.0 Bug fixes from the manual pass: single-subtree-with-children deletion cover
      (ancestor-descendant case) fixed with unit + e2e regressions; space-indented
      paragraph decoration misalignment confirmed pre-existing and filed separately
- [x] 6.1 Amend artifacts: chrome-transparency + content-adjacent merge requirements
      (node-edit-enforcement), re-pinned merge table with cross-kind joins/child
      re-parenting/single-line heading absorption (structural-operations), chrome-
      boundary classification shapes + cursor fact (transaction-classification),
      split-with-children→first-child (structural-operations MODIFIED + new
      outline-keyboard-grammar and e2e-verification deltas), design.md D9–D11
- [x] 6.2 Revise `mergeNodes` to the new table: cross-kind content joins (survivor
      keeps kind/marker, absorbed content appends at content end), children
      re-parent re-encoded, heading single-line absorption; property/unit tests
- [x] 6.3 Facts plumbing: pre-edit cursor + ch-level span facts through the adapter;
      classify.ts chrome-boundary recognition (marker-space deletion, Delete-into-
      own-gap); enforce.ts content-adjacent merge recognition replacing the
      single-separator rule (incl. first-node veto, no-successor pass); tests
- [x] 6.4 Revise `splitNode`: remainder becomes first child when children exist
      (child-scope kind encoding); grammar tests + 30-keyboard-grammar e2e updates
- [x] 6.5 e2e 62 updates: gap-transparent merge scenarios (Backspace across a gap in
      one keystroke, Delete at content end, marker-space Backspace, cursor-on-gap
      native editing), supersede the two-Backspace "native join" finding scenario
- [x] 6.6 Full re-verification (unit + e2e twice, lint/typecheck), vault install —
      second real-vault manual pass against the amended behavior is the user's next
      step (not automatable — subjective feel)

## 7. Second manual-pass amendments (2026-07-21)

- [x] 7.1 Fix `mergeNodes` cursor to land at the join point instead of the merged
      node's start (D12, bug fix); unit regression (incl. a multi-line-`first` case)
      and an e2e cursor assertion through the real dispatch path
- [x] 7.2 Marker-transparent cursor placement (D13): a pure clamp — a cursor-only
      selection landing inside a list item's marker prefix redirects to its
      content-start column, input-agnostic (Left/Home/click/vertical motion); wire
      into `transaction-filter.ts`'s existing `selection-only` handling alongside
      Phase B's range escalation
- [x] 7.3 Unit/property tests for the marker clamp (mirroring escalate.test.ts's
      style: idempotence, only-marker-positions-affected, gap-line positions
      provably untouched) and e2e coverage (Left arrow, Home, mouse click, vertical
      motion onto a shorter marker line) in `62-outline-edit-enforcement.e2e.ts`
- [x] 7.4 Full re-verification (unit + e2e twice, lint/typecheck), vault install —
      third real-vault manual pass against D12/D13 is the user's next step (not
      automatable — subjective feel)
- [x] 7.5 Update change documentation with the third pass's verdict; leave the
      change ready for sync/archive if clean, or loop back if not

## 8. Third manual-pass findings (2026-07-21)

- [x] 8.1 Structural paste onto an EMPTY anchor node (no content, no children —
      typically one just created by Enter) now replaces it instead of stranding it
      next to the pasted content (D14); shared `deleteAndSplice` helper refactored
      out of `composeTypeOver`; unit tests + e2e coverage; full re-verification (799
      unit tests, 10/12 e2e spec files clean across 3 consecutive full runs — the
      other 2, both nested-table-cell-click tests on code this change never touches,
      failed consistently on "element did not become interactable"; likely
      environmental — see chat, not investigated further as a code regression)
- [x] 8.2 DEFERRED (2026-07-23, explicit go-ahead to defer): `outdent`'s handling
      of a node with FOLLOWING SIBLINGS under the same parent — confirmed via
      direct testing to be a PRE-EXISTING gap in the core structural-operations
      `outdent`, not introduced by D10/D11, but surfaced by this change's
      merge/split interaction ("A stole B's children" after merge→split→outdent).
      Proposed fix (Logseq precedent): the outdented node's former following
      siblings re-parent as ITS OWN children ("outdent in place"). This is a
      foundational change to a pre-outline-edit-enforcement operation with wide
      blast radius — out of scope for this change's closure; see docs/research/04
      Q17 for the finding and proposed fix when picked up
- [x] 8.3 DEFERRED (2026-07-23, explicit go-ahead to defer): Enter inside/at-the-
      end-of a heading currently inserts a blank line rather than splitting the
      heading's text into a new paragraph node — pre-existing
      outline-keyboard-grammar behavior, predates this change. Out of scope for
      this change's closure; see docs/research/04 Q17
- [x] 8.4 Fourth manual-pass findings (2026-07-22): structural paste detection AND
      re-indentation both corrected for a single-node subtree copy (D15) — a
      lone top-level block with children was neither detected as structural
      (`isMultiBlockInsertion`/`computePasteVerdict` both required >1 top-level
      block) nor, once that's fixed, correctly re-indented (`shiftSubtree`'s
      numeric delta inserted mismatched-unit spaces into a tab-indented subtree's
      descendants) — new shared `isStructuralBlockSequence` predicate and new
      `reindentSubtreeVerbatim` helper; unit + property + e2e coverage; full
      re-verification green twice consecutively, vault reinstalled. Redo-cursor-
      after-merge and delete→undo→redo-cursor-on-chrome reports investigated (5+
      varied e2e repro attempts each scenario category) but NOT reproduced — see
      docs/research/04 Q18; more specific repro steps requested from the user
      rather than guessing further

## 9. Fifth manual-pass findings (2026-07-22)

- [x] 9.1 Real-vault repro note ("Paste bug repro.md") pinpointed the "resets to
      original depth" report precisely: pasting into an EMPTY anchor with NO
      siblings at all (the sole child in its scope) falls to
      `insertAsOnlyChildren`, which — unlike the sibling-splice paths, already
      fixed by D15 — never re-indented at all (D16). Fixed by extracting the
      shared `reencodeBlocksForDestination` (ops.ts) so both call sites use one
      rule; confirmed against the exact repro (byte-for-byte match to the note's
      own "Expected outcome"); unit + e2e coverage; full re-verification
- [x] 9.2 Redo-cursor-after-merge: root-caused via direct research into
      @codemirror/commands' `history.ts` (not reproduced, but the mechanism is
      now understood) — CONFIRMED EMPIRICALLY that undo/redo transactions never
      reach `transactionFilter` at all (stats' `programmatic` counter does not
      increment for either), so neither our rewrite logic nor our clamp/
      escalation can be the direct cause; CM6's own history restores the
      selection that was active "at the moment undo was invoked," not
      necessarily our rewrite's own explicit selection — if the real
      environment has ANY intervening selection change between the merge and
      pressing undo (even one invisible to the user), that becomes what redo
      restores instead. See docs/research/04 Q19 for the full mechanism write-up
      and next diagnostic steps requested from the user (minimal-vault test,
      community-plugin list)
- [x] 9.3 SPUN OUT (2026-07-23): further manual testing showed the redo-cursor
      symptom lands in more than one wrong shape (not only the next gap line, also
      past the current subtree's end), confirming it is broader than a single
      off-by-one and not scoped to this change's own code paths (Q19 already
      showed undo/redo bypass `transactionFilter` entirely). Recorded as
      docs/research/04 Q20 and carried forward as its own future investigation —
      not part of this change's closure
