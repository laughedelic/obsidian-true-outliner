# e2e-harness — design

## Context

Verification of editor-core and outline-grammar is a manual checklist
(`openspec/changes/editor-core/verification.md`) run by hand against a dev
vault. Everything on it exercises behavior that only exists in a live
Obsidian instance: command palette gating, `data.json` persistence,
CM6 keymap dispatch, Notice cues, restart survival, on-disk bytes. Unit
tests (vitest) already cover the pure core; the gap is the integration
surface.

Two candidate tools were evaluated:

- **wdio-obsidian-service** (WebdriverIO service, purpose-built for Obsidian
  plugin e2e): downloads/caches Obsidian versions, launches the app against a
  **sandboxed copy** of a given vault with the plugin installed, exposes
  `browser.executeObsidian(({app, obsidian}) => …)` to run code inside the
  app with the full Obsidian API, `browser.executeObsidianCommand(id)`,
  `browser.reloadObsidian()` for restart tests, and `obsidianPage` helpers
  (openFile, resetVault, enable/disablePlugin). Standard WebdriverIO
  `browser.keys()` covers Tab/Shift+Tab/Enter/Shift+Enter/Alt+arrows.
  Supports headless CI (xvfb on Linux runners) and mobile emulation.
- **Playwright for Electron**: generic `_electron.launch()`; we would have to
  hand-roll Obsidian download/pinning, vault sandboxing, plugin installation,
  an in-app code bridge, and restart orchestration. Playwright's Electron
  support is also officially "experimental" and periodically breaks on the
  Electron versions Obsidian ships.

## Goals / Non-Goals

**Goals:**

- Automate every automatable item of `verification.md` as e2e specs that run
  with one command (`npm run test:e2e`) on a developer machine.
- Never touch the checked-in `test-vault/` — all runs use a sandboxed copy.
- Assert at the right layers: editor buffer (CM6/editor API), plugin data
  (`data.json`), and raw file bytes on disk.
- Keep the harness invisible to the plugin bundle and the vitest suite.
- Leave the harness CI-ready (cache dir, headless-capable config) without
  adding CI wiring in this change.

**Non-Goals:**

- Mobile smoke testing (wdio-obsidian-service can emulate/drive mobile, but
  it stays manual/optional for now).
- Visual assertions (Notice styling, cursor blink); we assert Notice *text*
  via DOM, not appearance.
- Replacing the vitest unit/property suites — they remain the primary tests
  for the pure core.
- CI workflow files (a follow-up once the local harness is stable).

## Decisions

### D1: wdio-obsidian-service over Playwright-for-Electron

Every hard requirement — sandboxed vault launch, command-by-id, real
keystrokes, in-app code execution, app restart — is a first-class feature of
wdio-obsidian-service and a hand-rolled subsystem under Playwright. The
service also pins/caches Obsidian versions (`browserVersion` + `.obsidian-
cache/`), which Playwright has no answer for. WebdriverIO/mocha is a second
test framework in the repo (vs vitest), which is the main cost; accepted
because the alternative is owning an Electron launcher for a closed-source
app.

### D2: Harness layout — top-level `e2e/`, own tsconfig, mocha specs

```
e2e/
  wdio.conf.mts        # service config: vault, plugin, versions, cache
  tsconfig.json        # extends root, types: wdio + mocha, no emit
  helpers.ts           # buffer/disk/data.json readers, key chords, notices
  specs/
    outline-mode.e2e.ts
    structural-commands.e2e.ts
    keyboard-grammar.e2e.ts
    shell.e2e.ts
    persistence.e2e.ts
```

Root `tsconfig.json` excludes `e2e/` (wdio globals would pollute the plugin
typecheck); esbuild only bundles `src/`, so the bundle is untouched.
`vitest` config already scopes to `tests/`. New scripts: `test:e2e` (runs
`vault:install` first so the sandbox gets a fresh `main.js`).

### D3: One vault fixture, reset between suites

`wdio:obsidianOptions.vault: "test-vault"` with `plugins: ["."]` (manifest +
built `main.js` from repo root). Suites call `obsidianPage.resetVault()` in
`before`/`beforeEach` to restore pristine files without a reboot; restart
scenarios use `browser.reloadObsidian()` (state-preserving) and assert mode
survival, then a fresh-vault reload to re-isolate. Scratch notes that tests
create (e.g. for rename/delete) live under a `Scratch/` folder created at
test time so resets are cheap to reason about.

### D4: Assertion layers

- **Buffer**: `browser.executeObsidian(({app, obsidian}) =>
  app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor.getValue())`.
- **Disk bytes**: tests know the sandbox path via
  `obsidianPage.getVaultPath()`; helpers read files with Node `fs` **in the
  test process** and compare exact bytes (also mtime for the "toggle does not
  touch the file" checks). Before any disk assertion the test forces a save
  via `executeObsidian` (`view.save()`) — Obsidian's autosave is debounced
  and would race.
- **Plugin data**: read `<sandbox-vault>/.obsidian/plugins/true-outliner/
  data.json` from disk (after a save-settling wait) for path-registry
  assertions (rename follows, delete prunes).
- **Notices**: assert on `.notice` DOM text via wdio selectors; rejection
  cues map to `REJECTION_MESSAGES` (imported into specs from
  `src/plugin/messages.ts` so texts never drift).
- **Command gating**: `executeObsidian` checks
  `app.commands.listCommands()` / attempts `editorCheckCallback` visibility
  rather than screenshotting the palette.

### D5: Keystrokes and undo

Grammar keys are sent as real key events (`browser.keys(key)` /
`browser.keys([Key.Shift, Key.Tab])`) so the CM6 `Prec.highest` keymap and
its outline-mode gating are exercised end-to-end. Undo atomicity is asserted
by sending Cmd/Ctrl+Z once and comparing the buffer to the exact pre-op text
(platform-appropriate modifier chosen in helpers). Structural commands are
invoked via `browser.executeObsidianCommand("true-outliner:<id>")` — no
temporary hotkey binding needed, unlike the manual protocol.

### D6: verification.md becomes an index, not a script

Automated items are rewritten as pointers to their e2e spec (`e2e/specs/…`);
the file keeps a short "manual residue" section (mobile smoke, anything
visual). Future changes add e2e specs instead of checklist items.

### D7: Version matrix kept minimal

`browserVersion: "latest"` with `installerVersion: "earliest"` (the
service's recommended compatibility spread) as the single local target.
`minAppVersion` from `manifest.json` is the floor if a matrix is added in
CI later. Downloads cache in `.obsidian-cache/` (gitignored).

## Risks / Trade-offs

- **[Autosave races disk assertions]** → helpers always force `view.save()`
  and await the write before reading bytes; never assert on mtime without a
  forced save boundary.
- **[Keystroke focus flakiness]** (keys land outside the editor) → helpers
  focus the editor and set cursor via `executeObsidian` before every key
  sequence; assert cursor position after, not just text.
- **[Second test framework / new heavy dev deps]** → contained in `e2e/`;
  wdio never imports plugin runtime code except pure constants
  (`messages.ts`); unit tests remain the fast path.
- **[First run downloads Obsidian]** (~100 MB, needs network) → cached in
  `.obsidian-cache/`; documented in README; not part of `npm test`.
- **[Obsidian UI changes break DOM selectors]** → only Notices use DOM
  selectors; everything else goes through the stable plugin/Obsidian API via
  `executeObsidian`.
- **[Coexistence test needs a second plugin]** → ship a minimal stub plugin
  fixture (`e2e/fixtures/obsidian-outliner-stub/` with matching id) rather
  than downloading the real obsidian-outliner; the warning logic only reads
  `community-plugins.json` ids.

## Open Questions

- None blocking. CI wiring (GitHub Actions + xvfb + cache) is deferred to a
  follow-up change.
