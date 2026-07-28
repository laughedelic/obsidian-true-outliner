## 1. Minimal change-set narrowing (`minimal-change-dispatch`)

- [x] 1.1 In `src/plugin/dispatch.ts`, replace `editToChange` (one `Edit` → one
      `EditorChange`) with a function returning `EditorChange[]` per `Edit`,
      implementing the two-branch algorithm from design.md D2: trim matching whole
      lines from both ends of the edit's line range, then either per-line
      character-prefix/suffix trim (line count unchanged) or a single whole-region
      character-prefix/suffix trim over the trimmed middle joined with `\n` (line count
      changed). Preserve the existing EOF/no-trailing-newline handling for the
      line-count-changed branch; the line-count-unchanged branch never needs it (see
      design.md Risks).
- [x] 1.2 Update `editsToChanges` to flat-map the per-`Edit` expansion instead of
      mapping 1:1, keeping the emitted changes in ascending, non-overlapping document
      order.
- [x] 1.3 Extend `tests/plugin.test.ts`'s existing property test (the one that already
      compares `applyChanges(editsToChanges(...))` against `applyEdits`/`encode`) to
      also exercise ops with different pre/post line counts (merge/split/delete via
      `splitNode`/whatever ops are reachable through `arbTree()`-driven sequences), not
      only indent/outdent/moveUp/moveDown, so both narrowing branches are covered by
      the byte-identical-document property.
- [x] 1.4 Add focused unit assertions (not just the property test) pinning the three
      worked shapes from the proposal's table: merge → one deletion range, indent (with
      a child) → two single-character insertions at two positions, outdent → two
      single-character deletions — asserting the exact `EditorChange[]` shape, not just
      the resulting text. (The indent case's second line uses `shiftLine`'s own
      numeric-delta spacing rather than a literal second tab — pinned against the
      actual observed behavior rather than the proposal's illustrative fixture; still
      exactly one minimal change per changed line, which is the property under test.)

## 2. Indent/outdent derive their cursor from the pre-operation caret

*Drafted as "stop stating an explicit cursor", i.e. omit `selection` and let CM6 map the
caret by its own default. Implementation disproved that (design.md D4): CM6's live
default is assoc -1 while history's redo restore hardcodes assoc 1, and the two disagree
exactly at a change boundary, which is where Tab usually puts the caret. The tasks below
record what was actually done — compute that assoc-1 mapping ourselves and state it.*

- [x] 2.1 In `src/plugin/grammar.ts`, give `planFromOp` a `mapCursorFrom` parameter and
      use `dispatch.ts`'s `mapCursorForward` for indent/outdent, while move-up/move-down/
      split keep the op's own `OpOutput.cursor` (design.md D4). `TxPlan.selection` stays
      required — briefly made optional during the abandoned implicit-mapping attempt.
- [x] 2.2 In `src/plugin/keymap.ts`'s `makeHandler`, dispatch that mapped selection
      explicitly in the same transaction as the changes, so a live dispatch and its
      eventual redo compute the identical position.
- [x] 2.3 In `src/plugin/main.ts`'s `runOp`, apply the same rule to the
      `indent-node`/`outdent-node` palette commands via the shared `resultCursor` helper,
      including the fallback to the op's own cursor when the mapped position would not be
      caret-addressable. The cursor stays in its own `setCursor` transaction, separate
      from the change — combining them merges consecutive palette commands into one undo
      step (measured; pinned in `tests/minimal-change-history.test.ts`).
- [x] 2.4 Add a unit test (in `tests/plugin.test.ts` or grammar-focused tests) asserting
      that indenting/outdenting with the cursor mid-text (not at content start) lands
      the cursor at the same relative column after the op, not at the node's content
      start. (Also found and installed the missing `@codemirror/commands` dependency —
      declared in package.json but absent from node_modules — needed to drive
      `tests/grammar.test.ts`'s new real-`EditorState` default-mapping assertions and
      task 4.2's upcoming history test.)

## 3. Narrow the redo-cursor re-assertion mechanism to cursor-choosing operations

- [x] 3.1 Delete `src/plugin/history-cursor.ts` (the `CursorRecorder` ViewPlugin,
      `needsCursorRecording`, `structuralCursorRecorder`).
- [x] 3.2 In `src/plugin/main.ts`, remove the `structuralCursorRecorder` import and its
      `registerEditorExtension(...)` call and the comment introducing it.
- [x] 3.3 In `src/classify.ts`, remove `CURSOR_REASSERT_USER_EVENT` and its entry (and
      the comment explaining it) from `PLUGIN_OWN_USER_EVENTS`. Also cleaned the now-
      stale `isPluginOwnUserEvent` docstring, which referenced the deleted recorder.
- [x] 3.4 Grep the tree for any remaining reference to `history-cursor`,
      `CURSOR_REASSERT_USER_EVENT`, `structuralCursorRecorder`, or
      `needsCursorRecording` outside test files being replaced in section 4, and remove
      or update it. (Only remaining hits are in `tests/history-cursor.test.ts` and
      `e2e/specs/64-structural-history-cursor.e2e.ts`, both handled in section 4;
      `tsc --noEmit` confirms no other source file references the removed mechanism.)
- [x] 3.5 Reinstate the mechanism, SCOPED, after a review found that removing it outright
      over-generalised from indent/outdent: redo after a MOVE landed the caret on the
      sibling that swapped into the moved node's old lines, at every depth, and that
      position is addressable so nothing downstream could detect it (design.md D5a,
      docs/research/04 Q29 follow-on). `SemanticCursorRecorder` in
      `src/plugin/history-caret.ts` re-asserts the cursor for the operations that CHOOSE
      one — keyed off `classify.ts`'s new `SEMANTIC_CURSOR_USER_EVENTS`, which is
      `PLUGIN_OWN_USER_EVENTS` minus indent/outdent, so the two sets cannot drift. It
      needs no `userEvent` of its own this time: dispatching with `filter: false` keeps
      the enforcement funnel out of it, which is what the retired
      `CURSOR_REASSERT_USER_EVENT` entry had existed to do.

## 4. Replace known-limitation tests with depth-correctness tests

- [x] 4.1 Delete `tests/history-cursor.test.ts` in full — its fixtures hand-author the
      whole-region change specs being eliminated, to exercise a mechanism that no
      longer exists.
- [x] 4.2 Add a new unit test file (`tests/minimal-change-history.test.ts`) exercising
      real `EditorState` + `@codemirror/commands` `history()`, dispatching indent/outdent
      through the real (now-minimal) `editsToChanges`, and asserting the cursor is
      correct after a generated sequence of undo/redo cycles at depth greater than one —
      property-tested over `arbTree()` (design.md D6). Also uncovered and pinned a real,
      narrower residual: CM6 collapses a cursor at/inside a *deleted* span, so a second
      undo after outdent can land one character off when the cursor was in the removed
      marker — CM6-inherent, unfixable by anything this plugin dispatches (see design.md
      Risks and the property test's `collapsesInto` exclusion + the dedicated pinned
      "known residual" describe block in the same file). Indent (pure insertion) is
      unaffected at any depth.
- [x] 4.3 In `e2e/specs/64-structural-history-cursor.e2e.ts`, removed the last scenario
      ("the cursor re-assertion classifies plugin-own, not selection-only" — it observed
      a transaction that no longer exists) and updated the file's docstring: no longer a
      "forward guard" conditional on the harness's bundled CM6 version — correctness is
      now root-cause (minimal change sets + explicit assoc-1 mapping), not
      version-dependent. Kept the file name (`64-structural-history-cursor`) since the
      capability it guards, not the mechanism, is what the name refers to.
- [x] 4.4 Confirmed `e2e/specs/60-transaction-classification.e2e.ts` has no scenario tied
      to the removed re-assertion transaction; no change needed there beyond the spec
      delta already covers.

## 5. Documentation

- [x] 5.1 Updated `docs/research/04-open-questions.md` Q21's status line and added an
      "Update" section recording the actual outcome: mostly closed, with the narrower
      residual (outdent, cursor inside the removed marker) found during implementation
      and cross-referenced to `content-space-caret`.

## 6. Verification

- [x] 6.1 Ran the full unit test suite (`npm test`) and `npm run build`/`npm run
      build:e2e` (`tsc --noEmit`): 331 tests pass, both typecheck clean. Confirmed the
      byte-identical-document property test (extended for merge/split/delete), the new
      depth-correctness + known-residual tests, and the pinned worked-shape assertions
      all pass.
- [x] 6.2 E2E suite green on CI, desktop and mobile-emulation both (`e2e-test`,
      `e2e-test-mobile`). Two failures on the first run were stale assertions pinning the
      OLD cursor convention (indent/outdent resetting to content start) — the behaviour
      this change deliberately replaces with column preservation — updated in
      `20-structural-commands.e2e.ts` and `30-keyboard-grammar.e2e.ts` rather than
      worked around. No regression from narrower change sets reaching the enforcement
      layer's `changedLineSpans`/`deletesLineBoundary` facts, as predicted by
      construction (they read incoming transactions, never our own dispatch) and now
      confirmed live.
- [x] 6.3a Real-vault pass after rebasing onto `content-space-caret` found the caret
      parked on a gap line after undo→redo of a block deletion. Root-caused to
      `filter: false` — CodeMirror dispatches history transactions with transaction
      filtering disabled, so the enforcement funnel provably never observes an undo or a
      redo (docs/research/04 Q29, design.md D5a).
      The FIRST fix was a view-level caret RESOLVER running the restored caret through
      `resolvePlacement`. It closed the reported symptom but guaranteed only that the
      caret was addressable, not that it was right — review then found redo after a MOVE
      landing on the sibling that swapped into the moved node's old lines, a position
      that is perfectly legal and so invisible to any addressability check.
      The FINAL fix reinstates the re-assertion recorder, scoped to the operations that
      choose their own cursor (`SemanticCursorRecorder`, keyed off
      `SEMANTIC_CURSOR_USER_EVENTS`); indent/outdent need nothing, since their cursor is
      the mapping history recomputes. The interim resolver was then dropped — with the
      recorder back it had nothing left to do, measured across delete, move, merge and
      split. Covered by `tests/history-caret.test.ts` (move regression, negative control
      pinning the wrong node) and `tests/classify.test.ts` (recorder taxonomy,
      negative-controlled in both directions).
- [x] 6.3 Real-vault manual pass done on current Obsidian, in three rounds after
      rebasing onto `content-space-caret`. Decorations, Obsidian's own diffing/sync and
      other installed plugins showed no problems with the narrower observed change
      ranges — the proposal's stated blast-radius risk did not materialize. What the
      pass DID find was caret placement, in three rounds, all fixed and covered:
      1. Undo/redo parking the caret on a gap line after a block deletion — root-caused
         to `filter: false` (history bypasses the enforcement funnel entirely) and fixed
         by `src/plugin/history-caret.ts`. Q29, design.md D5a, `tests/history-caret.test.ts`.
      2. A bare modifier keypress defeating the block-selection blur, restoring both the
         caret and the raw-markdown reveal — `decorations.ts`'s `onDocumentKeyDown` had
         to refocus before knowing whether a key could act. Fixed by skipping
         modifier-only keys; recorded in docs/research/13.
      3. Tab on a block-selected paragraph dispatching a caret onto a gap line — the
         mapped position is the selection HEAD, a caret only when the selection is
         empty. Fixed in `grammar.ts`'s `planFromOp` by using the mapped position only
         when it is caret-addressable. Q29 follow-on.
      Two issues surfaced by the pass were deliberately NOT fixed here, both tracing to
      `ops.ts`'s delete-cursor convention (untouched by this change, reproducing on
      `main`): the caret alternating between the next and previous node after a delete,
      and deleting a node after a table stranding undo inside the table's nested editor.
      Both parked in docs/research/13 with measurements and a candidate fix.
