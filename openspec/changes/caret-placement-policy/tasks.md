## 1. Baseline and measurement

- [x] 1.1 Run the full unit suite and record which tests assert a caret position at all,
      so later steps can tell a deliberate expectation change from an accidental one.

      Baseline: 406 tests / 17 files, green. Every `.cursor` assertion in the suite:

      | Site | What it pins | Changed by this work? |
      |---|---|---|
      | `edit-ops.test.ts:57` | delete-every-node → `{0,0}` | No — the empty case stays "scope start" |
      | `edit-ops.test.ts:116,126,136` | merge join points | No — `exact` anchors |
      | `split.test.ts` ×11 | split points | No — `exact` anchors |
      | `split.test.ts:219` | consumes `merged.value.cursor` as an INPUT position | No, but it is an ANCHOR use — task 2.2 |
      | `enforce.test.ts:142` | type-over lands after inserted text | No — `exact` |
      | `plugin.test.ts:173` | indent on a list item → `{2,2}` | No — `contentBoundaryCh` also gives 2 |
      | `history-caret.test.ts:83` | builds the re-assertion from the op cursor | Rewritten in 5.2 |

      Two findings that shape later steps. **No test asserts a deletion caret except the
      empty-document case**, so the convention change in step 6 lands almost unguarded —
      1.2's characterization tests are not optional. And **no test asserts a heading caret
      after a structural op**, confirming design.md's risk note that `ch 3` was never
      pinned.
- [x] 1.2 Pin today's behaviour as characterization tests before changing it: the deletion
      caret for the middle/last/first/nested-predecessor cases, and the heading caret after
      a move (`{line, ch 3}` for `## Alpha`). These are the expectations steps 5 and 6 will
      deliberately flip; they exist so the flip is visible in the diff.
- [x] 1.3 Measure the SUBJECT-landing question design.md leaves open: move a table with
      Alt+ArrowUp in a real vault (or e2e) and record whether the caret enters the table,
      whether the nested cell editor mounts, and whether a second Alt+ArrowUp still works.
      Record the finding in `docs/research/13`; do not act on it in this change.

      **The prediction was wrong, and the answer relocates the question.** The plugin's
      two entry points disagree: Alt+ArrowUp on a table is rejected with our own "Nothing
      above to move past.", while a hotkey bound to the exposed "Move node up/down"
      COMMAND moves the table correctly (confirmed in real-vault use). The command path is
      immune because `runOp` reads `editor.getValue()` through Obsidian's public `Editor`
      API, which resolves to the host note wherever focus sits. Cause of the keymap
      half — `makeHandler` (`keymap.ts`) gates only on
      `modes.isOutline(path)` and never calls `outlinePathOf`, which carries the
      `isNestedEditor` check; `editorInfoField` resolves to the same outer note inside a
      cell, so `planKey` runs against the CELL's document. Confirmed:
      `activeElement.closest('.cm-embed-block')` is non-null and the focused text is `"a"`,
      one cell. Written up in `docs/research/13` and spawned as its own task; NOT fixed here.

      D5's subject-landing question is therefore REACHABLE after all — through the command
      path, which moves a table and routes it to the policy as a `subject` placement. The
      guard still deliberately does not cover subject landings, but on their merits (the
      user acted on that node) rather than because the case cannot occur. Corrected after
      PR review caught the overreach.
- [x] 1.4 Confirm the focus-capturing set: check whether any atom kind other than `table`
      mounts a nested `EditorView` in Live Preview, using the DOM-ancestry check
      `nested-editor.ts` documents. The set in code follows this measurement.

      Swept all six atom kinds. Only `table` mounts a nested editor or takes focus —
      `code`, `callout`, `quote`, `html` and `hr` all report zero `.cm-embed-block`. The
      design's stated set `{ table }` stands with no widening. Also measured: placing the
      caret on a table rewrites its source padding (`| a | b |` → `| a   | b   |`), so a
      table fixture is not byte-stable across a caret placement.

## 2. Split the structural anchor from the caret (no behaviour change)

- [x] 2.1 Rename `OpOutput.cursor` to `OpOutput.anchor` in `src/ops.ts`, with the module
      comment stating it is where the operation's subject (or surviving neighbour) landed,
      not a caret.
- [x] 2.2 Update every reader: `src/enforce.ts` (`deleteAndSplice`'s survivor lookup,
      `endOfInsertedRun`, the merge join-point computation), `src/plugin/grammar.ts`,
      `src/plugin/main.ts`, and the tests that reference the field.
- [x] 2.3 Run the full suite with NO expectation edits. Any failure here means the rename
      changed a value somewhere and the split is wrong — fix the split, not the test.

## 3. The pure policy module

- [x] 3.1 Add `src/caret-policy.ts` with `planCaret(op, facts)` per design.md D1: the four
      cases (`derived`, `subject`, `exact`, `deletion`), returning the caret. No
      CodeMirror imports. (`record` was dropped from the return after review: it could not
      be equivalent to the live decision, which compares whole selections — see
      `caret-policy.ts`'s note.)
- [x] 3.2 Implement the `subject` case using `caret.ts`'s `nodeContentStart` (design.md
      D4), so a heading's caret is column 0. Leave `ops.ts`'s `contentColumnCh` and its
      four other callers untouched.
- [x] 3.3 Implement the `deletion` case per design.md D3: `previousNodeInOrder` of the
      topmost removed node in the BEFORE document, at its content end; then the following
      node's content start; then the scope start.
- [x] 3.4 Implement the focus-capturing guard per design.md D5, with the kind set as a
      stated module-level input defaulting to what task 1.4 measured, and the candidate
      ladder in the stated order.
- [x] 3.5 Unit-test each branch, each deletion fallback, and each rung of the atom ladder,
      including the residual case where every candidate is capturing.
- [x] 3.6 Property-test the deletion case's positional claim: for generated trees, the
      predecessor's content end computed in the BEFORE document equals its content end in
      the AFTER document. This is the assumption that lets the policy answer positionally
      across a re-parse.

## 4. Route every dispatch site through the policy (no behaviour change yet)

- [x] 4.1 `src/plugin/grammar.ts`: `planFromOp` calls `planCaret` instead of implementing
      the mapped-with-fallback rule; keep the caller-supplied `mapCursorFrom` as the
      `mapped` fact.
- [x] 4.2 `src/plugin/main.ts`: strip `resultCursor`'s own placement rule and have it call
      `planCaret`. The two-transaction structure stays (design.md D7).

      The function itself remains, as the adapter that builds the policy's facts and
      converts back to Obsidian's `{line, ch}` — an earlier wording here and in design.md
      said it was "deleted", which review corrected.
- [x] 4.3 `src/plugin/transaction-filter.ts`: `buildRewriteSpec`'s cursor comes from the
      policy. Leave `escalateSelection` and `resolveForeignCursors` alone — they answer
      `content-space-caret`'s question, not this one (design.md D8).
- [x] 4.4 `src/enforce.ts`: the verdict's cursor comes from the policy for the deletion,
      merge and paste paths; the layer computes no caret of its own.
- [x] 4.5 Temporarily hold the old deletion and content-start behaviour (feed the policy
      the current rules) so this step lands green with no expectation edits, proving the
      routing is behaviour-preserving before any convention changes.

      **Done differently, and better.** No hold-back code was written. The same evidence
      came from 1.2's characterization tests, which annotate per case whether it is
      expected to move: after routing, exactly the 7 cases marked "WILL CHANGE" failed and
      all 431 others passed, including the 3 explicitly marked "does NOT change". Each new
      value matched the design's predicted table. That isolates wiring from convention
      without adding temporary code paths to the module the change exists to simplify.

      One real finding from it: the table characterization case was a WEAK FIXTURE. After
      deleting the paragraph, the table was the only node left, so the atom guard correctly
      hit its documented residual rather than stepping outside. Replaced with a fixture
      that has somewhere to go, plus a separate residual case.

## 5. Per-dispatch recording

- [x] 5.1 `src/plugin/history-caret.ts`: decide recording by comparing
      `tr.startState.selection.map(tr.changes, 1)` against `tr.newSelection`, gated by
      `isPluginOwnUserEvent` plus the existing outline-mode and nested-editor checks.
- [x] 5.2 Remove `SEMANTIC_CURSOR_USER_EVENTS` and `hasSemanticCursor` from
      `src/classify.ts`, and update `tests/classify.test.ts` and `tests/history-caret.test.ts`
      to test the new predicate directly — including a set-membership assertion that would
      fail if the derived rule stopped covering an operation the old list covered.
- [x] 5.3 Add the CM6-level equality test from design.md D9.3: `mapCursorForward(...)`
      equals `tr.changes.mapPos(head, 1)` over generated documents and operations, against
      a real `EditorState`. Recording correctness depends on it and it is currently only
      prose.
- [x] 5.4 Add the closing test for the known gap: an indent whose addressability fallback
      fires is recorded, and redo restores the fallback position rather than the
      non-addressable mapped one. Negative-control it — revert 5.1 and confirm it fails.

## 6. Adopt the deletion convention

- [x] 6.1 Switch the policy's `deletion` case on, replacing the held-over behaviour from
      task 4.5. `deleteSubtreeGroups` keeps its ANCHOR preference order.

      Amended after review: the preference order (following sibling, preceding, ancestor)
      is preserved, but candidates removed by a LATER group are now skipped — the naive
      choice named exactly such a node, and the anchor degraded to line 0.
- [x] 6.2 Update the characterization tests from 1.2 to the new expectations, and add the
      "deletion and merge agree at the same seam" test the spec calls for.
- [x] 6.3 Update e2e cursor expectations in `20-structural-commands`,
      `62-outline-edit-enforcement` and `64-structural-history-cursor`.
- [x] 6.4 Verify the type-over/paste splice target is unchanged, which is what the
      anchor/caret split exists to protect — run the paste and type-over scenarios in
      `62-outline-edit-enforcement` and confirm no diff.

## 7. Adopt the content-start unification and the atom guard

- [x] 7.1 Switch the `subject` case to `nodeContentStart`, update the heading expectations
      from 1.2, and add the `- # title` case.
- [x] 7.2 Switch the focus-capturing guard on and add the table regression: deleting the
      node after a table leaves the caret outside the table.
- [x] 7.3 Add the e2e assertion that undo works after that deletion — the user-visible
      consequence this change exists to fix, and the one an outcome-only unit test cannot
      see.

      Asserts the MECHANISM: the caret is outside the table, NO nested cell editor is
      mounted, and undo restores the buffer byte-for-byte. Needed one harness discovery —
      opening a note whose first block is a table leaves focus inside the widget's nested
      editor, which swallows the keystroke, so the test clicks ordinary content first to
      release it, the same hand-off a user makes.
- [x] 7.4 Confirm a user gesture into a table is still unaffected
      (`65-content-space-caret` scenarios stay green).

## 8. The addressability property and the invariant net

- [x] 8.1 Add the property test from design.md D9.2: over generated trees and operation
      sequences, every caret this plugin dispatches is addressable, and no bystander
      landing is inside a focus-capturing node.
- [x] 8.2 Negative-control it — disable the guard, confirm it fails for the right reason.
      Do not trust it before that.
- [x] 8.3 Where an outcome alone cannot show the policy ran, assert the mechanism using the
      existing `stats`/`motionCounts` channels rather than the resulting position.

## 9. Documentation and close-out

- [x] 9.1 Update `docs/research/13`: close the two parked entries this change subsumes (the
      next/previous alternation, and deleting after a table stranding undo) with what
      shipped, and file whatever task 1.3 measured.
- [x] 9.2 Update `docs/research/04` Q29's follow-on with the per-dispatch recording rule and
      what it closed, so the next reader finds the current mechanism rather than the
      superseded one.
- [x] 9.3 Update the module comments that carry the old rule: `history-caret.ts`'s scope
      section, `grammar.ts`'s `TxPlan.selection` comment, and `classify.ts`'s removed set.
- [ ] 9.4 Real-vault pass over the changed gestures: delete a middle node, delete a last
      node, delete next to a table, move a heading, indent with a block cover selected —
      each followed by undo and redo.
- [ ] 9.5 Run `openspec sync-specs` (or archive) so the main specs carry the amended
      requirements, and confirm no capability still states a placement rule of its own.
