# Tasks

## 1. Gate every binding on the nested-editor check

- [x] 1.1 Route `makeHandler` through `outlinePathOf(modes, view)`, deleting its inline
      `editorInfoField`/`isOutline` check.
- [x] 1.2 Route `makeSelectAllHandler` through the same gate — the defect was NOT in the
      report and had its own measured symptom (a cell reading `- word` selecting `word`).
- [x] 1.3 Audit `grammarExtension` for any remaining binding that resolves the file itself,
      and record the invariant in `outlinePathOf`'s doc comment together with all three
      measured symptoms so the next handler author sees why the gate exists.

## 2. Move up/down: keymap binding to command default hotkey

- [x] 2.1 Remove `Alt-ArrowUp`/`Alt-ArrowDown` from `grammarExtension`, leaving a comment at
      the registration site explaining that move is deliberately absent.
- [x] 2.2 Keep `planKey`'s move cases — the planner is the shared placement path and a
      future configurable keymap must not have to reimplement it.
- [x] 2.3 Give `addStructuralCommand` an optional `hotkeys` parameter, spread conditionally
      for `exactOptionalPropertyTypes`, and ship `Mod+Shift+ArrowUp`/`Mod+Shift+ArrowDown`
      on the move commands.
- [x] 2.4 Disable `obsidianmd/commands/no-default-hotkeys` for `src/plugin/main.ts` alone in
      `eslint.config.js`, with the rationale, because the ruleset's own
      `eslint-comments/no-restricted-disable` forbids an inline disable.
- [x] 2.5 Drop the `move-node-up`/`move-node-down` entries from
      `test-vault/.obsidian/hotkeys.json` so e2e exercises the shipped default.

## 3. Tests, each negative-controlled

- [x] 3.1 Structural key in a nested cell declines (`30-keyboard-grammar`). Uses Tab, which
      is routed into a nested cell's third-party keymap on every build tested; asserts
      absence via `recordedNoticeTexts()` after an explicit `dismissNotices()`, because a
      short-lived notice can fall between two WebDriver polls and turn a
      notice-absent assertion into a false pass.
- [x] 3.2 Mod-A in a nested cell is native (`64-progressive-select-all`). This is the
      load-bearing test of the pair. The cell text is `- word` rather than `word` so that
      the ladder's content rung DIFFERS from stock — with plain `word` the assertion cannot
      distinguish the two and cannot fail.
- [x] 3.3 Mod+Shift+ArrowUp/Down move a node, in both directions, each from a position where
      a working binding would succeed.
- [x] 3.4 The move command acts on the host node from inside a table cell, pinning the half
      of the design decision that is easy to regress silently.
- [x] 3.5 Negative-control each: restore the gate / the old binding and confirm each test
      fails. This repo has shipped tests that could not fail
      (`docs/research/04` Q28), and two of the tests above were caught this way before
      landing.

## 4. Specs and docs

- [x] 4.1 Update the four live specs the behaviour change touches, and add the previously
      unspecified nested-editor requirement to `outline-keyboard-grammar` and
      `progressive-select-all`.
- [x] 4.2 Reconcile with `caret-placement-policy`, which landed first and wrote text
      against the removed binding: retarget its Alt+Arrow heading scenario to the command,
      and fix the stale comment in `src/caret-policy.ts`.
- [x] 4.3 Record the finding in `docs/research/13-selection-follow-ups.md`.
