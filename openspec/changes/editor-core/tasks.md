## 1. Plugin scaffold

- [x] 1.1 Add `manifest.json` (`isDesktopOnly: false`), `versions.json`, esbuild config
  bundling `src/plugin/main.ts` → `main.js` with `obsidian`/`@codemirror/*` externals;
  npm scripts (`dev`, `build:plugin`); install `obsidian` types + esbuild
- [x] 1.2 Enable `eslint-plugin-obsidianmd` recommended config (manifest now exists);
  lint gate green across library + plugin code
- [x] 1.3 Plugin entry with lifecycle hygiene: everything registered via `Plugin`
  register APIs; loadable in a dev vault

## 2. Outline mode

- [x] 2.1 Mode registry: plugin-data persistence (`{ outlinePaths }`), rename migration,
  delete pruning; unit-tested with a mocked `obsidian` module
- [x] 2.2 Toggle command + editor menu entry (checkCallback on markdown views); verify
  toggling never touches file bytes/mtime
- [x] 2.3 Coexistence check: one-time-per-vault warning notice when obsidian-outliner or
  obsidian-zoom is enabled

## 3. Structural commands

- [x] 3.1 Node resolution: parse active buffer, locate node by cursor line; unit tests
  over line→node mapping including multiline nodes, gaps, and preamble lines
- [x] 3.2 Edit dispatch: minimal edit list → offset ranges → single `Editor.transaction`;
  unit-test the conversion (line ranges to offsets against a buffer snapshot)
- [x] 3.3 The four commands (indent/outdent/move up/move down) gated on outline mode, no
  default hotkeys; cursor placement on the moved node's first content column from the
  result tree
- [x] 3.4 Rejection feedback: reason→message table + transient Notice; document/selection
  and undo history untouched on rejection
- [x] 3.5 Debug setting: metadata-cache cross-check logging (`CachedMetadata.sections`
  vs our parse) to harvest dialect-drift corpus fixtures

## 4. Verification

- [ ] 4.1 Manual dev-vault protocol: run through every spec scenario (toggle persistence
  across restart, rename migration, one-undo-step ops, cursor placement, all rejection
  cues, clean unload) and record results in the change
- [ ] 4.2 Feed findings back: any parser disagreement → corpus fixture in mapping-core
  tests; any provisional-rule friction → docs/research/04-open-questions.md
