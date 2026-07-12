# e2e-harness — tasks

## 1. Harness scaffolding

- [ ] 1.1 Add dev deps (`wdio-obsidian-service`, `@wdio/cli`,
      `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/globals`,
      `expect-webdriverio` as needed); add `test:e2e` script that runs
      `build:plugin` first; gitignore `.obsidian-cache/`
- [ ] 1.2 Create `e2e/wdio.conf.mts` (vault `test-vault`, `plugins: ["."]`,
      `browserVersion: "latest"` / `installerVersion: "earliest"`, cache dir,
      mocha framework, sane timeouts) and `e2e/tsconfig.json`; exclude `e2e/`
      from the root typecheck and confirm esbuild/vitest don't pick it up
- [ ] 1.3 Write `e2e/helpers.ts`: read buffer, force-save + read disk
      bytes/mtime, read plugin `data.json`, wait-for-notice(text), set cursor
      / focus editor, platform undo chord, command-availability probe
- [ ] 1.4 Smoke spec: Obsidian boots, plugin loaded, a vault note opens and
      buffer matches disk — proves the pipeline before real suites

## 2. Scenario suites

- [ ] 2.1 `outline-mode.e2e.ts`: toggle by command id (notice, bytes+mtime
      unchanged), toggle via mode registry after restart (`reloadObsidian`),
      rename follows / delete prunes in `data.json`, structural commands
      gated off non-outline notes
- [ ] 2.2 `structural-commands.e2e.ts`: indent/outdent paragraph round-trip
      with cursor + single-step undo, heading demote/promote with link
      resolution, skip-level outdent, moves (heading swap, ordered
      renumber), all seven rejection cues inert
- [ ] 2.3 `keyboard-grammar.e2e.ts`: off-mode stock behavior, toggle applies
      to next keypress, Tab/Shift+Tab/Alt+arrows, Enter splits (mid-item,
      item end, paragraph end, heading), Shift+Enter continuation as one
      node, atom interiors stock, undo/rejection invariants per key
- [ ] 2.4 `shell.e2e.ts`: clean unload removes commands; coexistence warning
      via stub conflicting plugin fixture, once-only across restart

## 3. Protocol rewrite & verification

- [ ] 3.1 Rewrite `openspec/changes/editor-core/verification.md`: map each
      automated item to its e2e spec; keep manual residue (mobile smoke,
      visual cues) as a short checklist
- [ ] 3.2 Full green run of `npm run test:e2e` locally; confirm `test-vault/`
      untouched (`git status`), `npm test` and `npm run build` unaffected;
      document the harness (README section: first-run download, cache, how
      to add a spec)
