## Why

The mapping core is a proven library with no user-facing surface. This change turns it into
a working Obsidian plugin: the outline mode toggle and the first structural editing commands
inside the standard markdown view. It is the moment the architecture decisions (editor-
centric, 100% public API, clean-scorecard) meet reality — and the first artifact a human can
actually try in a vault, which is what the two provisional mapping rules need next after
property testing: real-use feedback.

## What Changes

- Obsidian plugin shell: `manifest.json`, entry point, esbuild bundling, mobile-safe
  (`isDesktopOnly: false`, no Node/Electron APIs), `eslint-plugin-obsidianmd` recommended
  config enabled now that a manifest exists.
- **Outline mode toggle**: a per-note UI mode (command + editor action), remembered in the
  plugin data store keyed by file path; never writes to the note. Toggling changes editor
  behavior only — file bytes are untouched.
- **Structural commands in outline mode**: indent, outdent, move up, move down — bound as
  commands (no default hotkeys, per guidelines; Tab/Shift+Tab suggested in docs) that
  resolve the node at the cursor via the mapping core and dispatch its minimal edit list as
  a single CM6 transaction (one undo step, cursor preserved on the moved node).
- **Rejection feedback**: rejected ops (h1/h6 bounds, top level, inexpressible targets)
  produce a gentle, non-modal cue (brief Notice) and leave the document untouched.
- Document sync: the plugin parses the active document per keystroke-relevant change
  (debounced/incremental enough for typical notes) so commands always operate on a fresh
  tree; cross-checks against `CachedMetadata.sections` land in corpus fixtures when they
  disagree (dialect-drift guard from the mapping-core design).
- Coexistence guard: one-time warning Notice when obsidian-outliner or obsidian-zoom is
  enabled alongside.

Explicitly out of scope (later layers): enforcement `transactionFilter` (node selection /
typing grammar), fold/zoom, decorations and node chrome, drag-and-drop, backlinks panes,
Enter/Shift+Enter grammar.

## Capabilities

### New Capabilities

- `outline-mode`: the per-note outline mode — toggle surface, persistence in plugin data,
  activation state, and the guarantee that mode changes never modify file content.
- `editor-structural-commands`: the four structural commands in the editor — node
  resolution at cursor, op dispatch as single transactions via minimal edits, undo
  grouping, cursor/selection preservation, and rejection feedback.
- `plugin-shell`: plugin lifecycle and platform conformance — load/unload cleanup,
  mobile-safe API surface, settings/data persistence plumbing, coexistence warning,
  scorecard-clean lint gate.

### Modified Capabilities

(none — the two mapping specs are consumed as-is via the library API)

## Impact

- New code: `src/plugin/` (plugin entry, mode registry, command handlers, CM6 glue);
  build config (esbuild) producing `main.js`; `manifest.json`, `versions.json`.
- New dependencies: `obsidian` (dev/peer types), `esbuild`; CM6 packages come via
  Obsidian's bundled `@codemirror/*` (externals, not bundled).
- Existing mapping core (`src/`) is consumed unchanged; any parser disagreement found via
  the metadata-cache cross-check becomes new corpus fixtures there.
- Testing: library-level unit tests for command glue where possible; manual test protocol
  in a dev vault for editor behavior (automated editor e2e is out of scope this change).
