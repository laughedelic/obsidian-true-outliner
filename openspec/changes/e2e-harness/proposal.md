# e2e-harness

## Why

The editor-core and outline-grammar changes are verified today by a manual
protocol (`openspec/changes/editor-core/verification.md`) run by hand in a dev
vault — slow, error-prone, and re-run in full after every behavioral change.
The behaviors under test (keyboard grammar, command dispatch, persistence
across restarts, on-disk byte fidelity) can only be observed in a real
Obsidian instance, so unit tests cannot replace the protocol; an automated
end-to-end harness can.

## What Changes

- Add a WebdriverIO + `wdio-obsidian-service` e2e harness that downloads and
  launches a real (sandboxed) Obsidian instance with a throwaway copy of
  `test-vault/` and the built plugin installed.
- Automate the checklists in `verification.md` as e2e specs: outline-mode
  toggle/persistence/rename/delete, structural commands with rejection cues
  and undo, keyboard grammar (Tab/Shift+Tab, Enter, Shift+Enter, Alt+arrows),
  shell behaviors (clean unload, coexistence warning), including app-restart
  persistence and on-disk byte assertions.
- Keep the harness fully outside the plugin bundle: a separate `e2e/`
  directory with its own tsconfig; new dev-only dependencies; new npm scripts
  (`test:e2e`).
- Rewrite `verification.md`'s role: automated items point at their e2e specs;
  only genuinely manual items (mobile smoke, visual cues) remain as a short
  manual residue list.

## Capabilities

### New Capabilities

- `e2e-verification`: the automated end-to-end verification harness — how it
  launches Obsidian, what invariants each scenario suite must assert (mode
  persistence, byte fidelity on disk, undo atomicity, rejection inertness,
  grammar keystrokes), and how it maps onto the manual protocol.

### Modified Capabilities

None — the harness tests existing capabilities (`outline-mode`,
`structural-operations`, `outline-keyboard-grammar`) without changing their
requirements.

## Impact

- New dev dependencies: `wdio-obsidian-service`, `@wdio/cli`,
  `@wdio/local-runner`, `@wdio/mocha-framework`, `obsidian-launcher` (managed
  transitively). No runtime/bundle impact — plugin `main.js` is unchanged.
- New top-level `e2e/` directory (wdio config + specs + helpers), excluded
  from the esbuild bundle and from the vitest run.
- `package.json`: `test:e2e` script; `.gitignore`: Obsidian download cache
  (`.obsidian-cache/`).
- `test-vault/` becomes the canonical e2e fixture; tests always run against a
  sandboxed copy, never mutate the checked-in vault.
- CI-friendly by design (wdio-obsidian-service supports headless CI runs),
  but wired for local runs first.
