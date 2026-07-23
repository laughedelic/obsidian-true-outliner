## 1. Investigate

- [x] 1.1 Confirm the root cause: `ops.ts`'s `inferIndentUnit` hardcodes `'  '` as its
      final fallback, reached whenever a structural op materializes brand-new
      indentation with no existing evidence in the document.
- [x] 1.2 Determine whether Obsidian's "Indent using tabs" setting is reachable from a
      public API. Confirmed `Vault.getConfig`/`setConfig` are NOT in the public
      `obsidian.d.ts` surface (violates this project's "100% public API" bar).
- [x] 1.3 Empirically verify, against a real Obsidian instance (via the e2e harness's
      `executeObsidian`), that CM6's public `@codemirror/language` `indentUnit` facet
      tracks the "Indent using tabs" setting live — `useTab: false` → space string
      (width = `tabSize`), `useTab: true` → `"\t"`.

## 2. Thread the fallback through ops.ts / enforce.ts

- [x] 2.1 `ops.ts`: `inferIndentUnit(doc, fallback = '  ')`, `destinationIndent(doc,
      parent, siblings, fallbackIndentUnit?)`.
- [x] 2.2 Thread `fallbackIndentUnit?` through `indent`, `outdent`, `splitNode`,
      `reencodeBlocksForDestination`, `insertSubtrees`.
- [x] 2.3 `enforce.ts`: thread `fallbackIndentUnit` through `computeVerdict`,
      `computeDeletionVerdict`, `composeTypeOver`, `deleteAndSplice`,
      `insertAsOnlyChildren`, `computePasteVerdict`.

## 3. Wire the live setting at the CM6 boundary

- [x] 3.1 Add `@codemirror/language` as a devDependency (already externalized in
      `esbuild.config.mjs`; types only, no runtime bytes).
- [x] 3.2 `src/plugin/grammar.ts`: `planKey` gains the optional trailing parameter,
      threaded to its `indent`/`outdent`/`splitNode` calls.
- [x] 3.3 `src/plugin/keymap.ts`: read `view.state.facet(indentUnit)`, pass to
      `planKey` for Tab/Shift-Tab.
- [x] 3.4 `src/plugin/transaction-filter.ts`: read `tr.startState.facet(indentUnit)`,
      pass to `computeVerdict` for the paste/type-over/merge-splice rewrite path.
- [x] 3.5 `src/plugin/main.ts`: document (not fix) the command-palette gap — no public
      API exposes the live facet from `Editor`/`MarkdownView`.

## 4. Test

- [x] 4.1 `tests/ops.test.ts`: new "fallback indent unit" describe block — unchanged
      default, tab fallback, space-width fallback, existing-document-inference still
      wins over the fallback, and `splitNode`'s content-adjacent split honors it too.
- [x] 4.2 `tests/closure.test.ts`/full unit suite: confirm no regression (816/816 pass).
- [x] 4.3 `e2e/helpers.ts`: add test-setup-only `setIndentUsingTabs(useTab)` helper.
- [x] 4.4 `e2e/specs/30-keyboard-grammar.e2e.ts`: new test toggling the real setting
      and asserting Tab output for both `true` and `false`.
- [x] 4.5 Run the full e2e suite (12 spec files, 130+ tests) — confirm no regression.
- [x] 4.6 Run typecheck (`tsc --noEmit`) and lint (`npm run lint`) — clean.

## 5. Addendum: `mergeNodes` tab-indentation bug (found via manual testing)

- [x] 5.1 Reproduce `test-vault/tab indent merge bug repro.md` and confirm it's
      pre-existing (reproduces identically on `main`, unrelated to the fallback-unit
      threading above — the document has plenty of existing tab evidence).
- [x] 5.2 Root-cause: `mergeNodes`'s `childShift = childBaseCol(first) -
      childBaseCol(second)` assumes strict marker-width alignment; tab-indented
      documents commonly indent children a full tab past the marker instead, and the
      resulting wrong delta corrupts tabs into mixed tab+space indentation.
- [x] 5.3 Fix: measure the shift from each side's actual existing child indentation
      (a real surviving sibling child) instead of the assumed formula, falling back to
      `childBaseCol` only when there's no child to measure.
- [x] 5.4 `tests/edit-ops.test.ts`: regression tests for the exact repro (childless
      target absorbing a tab-indented list item) and the `secondIsFirstChild` branch
      (target already has its own tab-indented sibling child to reference).
- [x] 5.5 `e2e/specs/62-outline-edit-enforcement.e2e.ts`: real-Obsidian regression test
      for the exact repro (Backspace-driven merge).
- [x] 5.6 Add `test-vault/tab indent merge bug repro.md` as a tracked fixture (matching
      the existing `Paste bug repro.md` convention).
- [x] 5.7 Full unit suite, typecheck, lint, and relevant e2e specs re-run clean.

## 6. Sync specs

- [x] 6.1 Run `openspec sync-specs` (or the equivalent skill) to merge this change's
      `structural-operations` delta spec into `openspec/specs/structural-operations/spec.md`.
