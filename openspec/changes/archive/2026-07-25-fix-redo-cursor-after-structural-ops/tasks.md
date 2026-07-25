## 1. Failing coverage first

- [x] 1.1 Add a unit/integration test that builds a real CodeMirror state with the
      history extension, dispatches a structural-shaped transaction (whole-region
      replacement + explicit cursor), then undoes and redoes with NO intervening
      selection transaction, and asserts the redo cursor equals the operation's own
      cursor. Cover all three shapes from design.md's table (simple merge, merge with
      re-parented children, indent with children).
      → `tests/history-cursor.test.ts`. Needed `@codemirror/commands` as a devDependency
      (already an esbuild external, so the bundle is unaffected).
- [x] 1.2 Assert the negative control in the same test file: with the recording
      mechanism absent, the redo cursor lands at the end of the rewritten region. This
      is what stops the test from silently self-masking (design.md's Risks) — it must
      be able to fail for the right reason.
      → Pins the exact wrong position (`change.from + insert.length`) per shape, not
      just "somewhere else".
- [x] 1.3 Confirm the negative control genuinely reproduces the bug before writing the
      fix. **Deviation from the original wording**: 1.1's positive tests exercise the
      MECHANISM (the test calls the re-assertion itself), so they do not fail against
      unfixed product code — they pass as soon as the mechanism exists. What 1.3
      actually establishes is that all three scenarios hit the mapping branch and
      reproduce the reported landing exactly. Verifying that the PLUGIN performs the
      re-assertion is a separate concern, covered by the trigger tests (2.4) and e2e (4).

## 2. Core mechanism

- [x] 2.1 Add the cursor re-assertion `userEvent` to `PLUGIN_OWN_USER_EVENTS` in
      `src/classify.ts`, with a comment explaining why it must classify `plugin-own`
      (D4: escalation/clamping would move the cursor being recorded).
      → `CURSOR_REASSERT_USER_EVENT = 'select.structural'` is declared in `classify.ts`
      itself, not beside the mechanism: that module owns the userEvent taxonomy and must
      stay CM6-import-free, so the dependency points inward.
- [x] 2.2 Implement the recording mechanism. **Deviation from D3**: implemented as a
      `ViewPlugin` (`src/plugin/history-cursor.ts`) rather than a bare
      `EditorView.updateListener`. D3's actual constraint — side effects outside the
      transaction filter — is honored either way, but `EditorView.destroyed` is private,
      so a bare listener has no supported way to know its view is gone before a deferred
      dispatch fires. A `ViewPlugin` gets a public `destroy()` hook. Registered in
      `main.ts` alongside the other editor extensions.
- [x] 2.3 Guard the re-assertion: skips when the view's state has moved on (captured
      state identity), skips when destroyed, and cannot loop — the re-assertion is
      selection-only and the trigger requires `docChanged`.
- [x] 2.4 Verify both dispatch sites are covered by the shared mechanism without
      site-specific code (D2). → `needsCursorRecording` triggers off `classify.ts`'s
      `isPluginOwnUserEvent`, the same set that drives classification; unit tests assert
      all six structural events fire and that ordinary editing, undo/redo, and
      Shift+Enter's generic `input` do not.
- [x] 2.5 Confirm the mechanism tests pass and the negative control still demonstrates
      the old behavior. → 17/17 in `tests/history-cursor.test.ts`.

## 3. Invariant checks

- [x] 3.1 Assert one structural operation is still exactly one undo step (Q11), for
      both a grammar op and an enforcement rewrite. → Per shape: the first undo restores
      the original document, and a second undo has nothing further to revert.
- [x] 3.2 Assert undo still restores the pre-operation cursor and document exactly.
- [x] 3.3 Assert the re-assertion is invisible: no document change, cursor unmoved,
      and idempotent under repetition.
- [x] 3.4 Run the full unit/property suite and confirm no regression. → 306/306 across
      14 files; `tsc --noEmit` and `eslint` both clean.

## 4. End-to-end verification

- [x] 4.1 Add an e2e scenario driving REAL keystrokes in Obsidian: structural op →
      undo → redo → type a single character, asserting the character lands at the
      operation's own cursor. → `e2e/specs/64-structural-history-cursor.e2e.ts`.
- [x] 4.2 Cover both dispatch sites in e2e: a Tab/indent case (grammar) and a
      Backspace-merge case (enforcement rewrite).
- [x] 4.3 Ensure the e2e scenarios issue no cursor-touching helper call between the
      operation and the undo. → Verified by instrumenting `EditorView.update` in the
      live app: exactly three transactions occur (op, undo, redo), nothing in between.
- [x] 4.4 Run the e2e suite and confirm green. → 64's four scenarios pass. Two
      pre-existing failures elsewhere (`53-decoration-contracts`,
      `60-transaction-classification`, both nested-table-cell-editor tests) were
      confirmed unrelated: they reproduce identically with this change's extension
      unregistered.
- [x] 4.5 **Unplanned but essential — verify the e2e tests can actually FAIL.** They
      cannot, today. With the extension unregistered the two redo scenarios still
      passed, which triggered a bisect: the wrong-cursor behavior is an upstream
      regression introduced in `@codemirror/commands` **6.10.2**, and the harness's
      Obsidian (1.12.7, newest available) bundles an older CM6. Recorded in design.md;
      the e2e file's own header now says plainly that a green run there is not evidence
      the bug is fixed, and the unit test is the guard. Had this check been skipped,
      the change would have shipped with exactly the false confidence that let this bug
      survive three prior reports.

## 5. Manual real-vault pass

- [x] 5.1 Verify in the dev vault: merge → immediate undo → redo → type a letter; and
      Tab on a node with children → same. → Confirmed working by the user on Obsidian
      1.13.3 (Catalyst beta).
- [x] 5.2 **Found by the user during 5.1: `undo → redo → undo` still jumps**, on both
      merge and Tab. Root-caused (not an implementation slip — the mechanism structurally
      cannot reach the second undo, see design.md D5), reproduced standalone, pinned by
      tests, and documented as an accepted limitation. The proper fix is scoped as its
      own change, `minimal-changesets-for-structural-ops`.
- [x] 5.3 Re-run the manual pass against the current build: confirm the first redo is
      correct for outdent, move up/down, Enter split, and structural paste, and that no
      latency or cursor flicker was introduced on ordinary editing. (The
      `undo → redo → undo` jump is expected to remain — that is the documented gap.)
      → Confirmed by the user: the change is fully implemented and manually tested.

## 6. Documentation

- [x] 6.1 Correct Q19 in `docs/research/04-open-questions.md`. → Flagged in place with a
      pointer to the new Q21 rather than rewritten, so the record of what was believed
      (and how it misdirected Q20) survives.
- [x] 6.2 Resolve Q20 and write Q21: root cause, the CM6 6.10.2 version boundary, BOTH
      maskers (stray selection transactions and the harness/manual version skew), what
      was fixed, and the accepted limitation.
- [x] 6.3 Record the out-of-scope cursor-placement finding — folded into the follow-up
      change's rationale, since minimal ChangeSets subsume it.
- [x] 6.4 Cross-reference the standalone-reproduction technique, plus the harder-won
      lesson: verify a regression test can fail before trusting it.

## 7. Harness version alignment

- [x] 7.1 Prefer the current Obsidian beta in both wdio configs via
      `obsidianBetaAvailable()`, falling back to `latest` with no credentials/cache, so
      automated and manual testing stop running different CM6 versions. Documented in
      the config, including the 2FA-preserving `obsidian-launcher download` route.
- [x] 7.2 Pre-download the beta locally (`npx obsidian-launcher download app -v
      latest-beta`) and re-run the e2e suite on it, to confirm the 64-* redo scenarios
      genuinely fail without the fix and pass with it on a CM6 >= 6.10.2. **Needs the
      user's Catalyst credentials — cannot be done for them.** → Run by the user; the
      suite passes on the beta, so the fix is confirmed against a CM6 >= 6.10.2 rather
      than only against the stable channel's older core.

## 8. Follow-up

- [x] 8.1 Open `minimal-changesets-for-structural-ops` with the full rationale, the
      verified minimal-change table, the blast radius, and the prototype diff script.
