## Context

First Obsidian-facing code. Constraints from the decision log: editor-centric (CM6
extensions in the standard markdown view via `registerEditorExtension`), 100% public APIs,
no `(editor as any).cm` escapes — live inside registered extensions where the `EditorView`
is handed to us; clean files (mode state in plugin data, never frontmatter); mobile-safe
APIs with desktop-only testing for now. The mapping core provides `parse/encode`, the four
ops with typed rejections, and minimal line-edit lists designed to become CM6 transactions.

## Goals / Non-Goals

**Goals:**

- A loadable, scorecard-clean plugin exposing outline mode + the four structural commands.
- Op dispatch path proven end-to-end: cursor → node → mapping-core op → minimal edits →
  one CM6 transaction → one undo step, cursor following the moved node.
- Real-vault feedback loop on the provisional mapping rules.

**Non-Goals:**

- No enforcement filter, node selection, decorations, folding, zoom, or Enter grammar yet.
- No mobile UX work (APIs stay mobile-safe; testing is desktop).
- No performance work beyond "fine on normal notes" (incremental parsing comes with the
  enforcement layer, which needs per-transaction trees anyway).

## Decisions

### D1. Commands, not default keymaps, for v1 dispatch

Obsidian guidelines prohibit default hotkeys; Tab/Shift+Tab specifically collide with
core indent behavior in lists. This change ships the four ops as commands (users bind
keys; docs suggest Tab/S-Tab). The high-precedence CM6 keymap that makes Tab feel native
belongs to the enforcement-layer change, where outline-mode keyboard behavior is designed
as a whole (Enter, Backspace, selection). Keeps this change small and honest.

### D2. Node resolution: parse-on-demand from the editor buffer

Commands parse the current buffer (mapping core, verbatim-span parser) and resolve the
node whose line span contains the cursor's head line. No cached tree state to invalidate;
at command frequency this is milliseconds even on large notes. The metadata-cache
cross-check (design guard from mapping-core) runs behind a debug setting and logs
disagreements with `CachedMetadata.sections` for conversion into corpus fixtures.

### D3. Edits dispatch as one transaction via `Editor.transaction`

The minimal edit list maps to Obsidian's `Editor.transaction({ changes })` (public API,
works on both platforms) rather than raw CM6 dispatch — commands don't need an
`EditorView` at all, keeping the no-private-API rule trivially satisfied. Line-range
edits convert to offset ranges against the same buffer snapshot that was parsed.
Selection: after applying, the cursor moves to the moved node's first content column in
the result (computed from the result tree, not guessed).

### D4. Mode state: plugin data keyed by path, updated on rename/delete

`saveData`/`loadData` store `{ outlinePaths: string[] }` (a set of files with outline
mode on). `vault.on('rename')` migrates keys; `'delete'` prunes. Per Q2.6 in the decision
log. Mode is *consulted* by commands (and later by the enforcement extension) — in this
change its only behavioral effect is enabling the commands' `checkCallback`, which is
exactly the seam the later layers plug into.

### D5. Rejection feedback via `Notice`

Typed rejections map to short human sentences ("Can't indent past heading level 6").
A 1.5s `Notice` is the v1 cue — public, mobile-safe, replaceable by a subtler in-editor
flash when the decoration layer exists. Reason strings live in one table for reuse.

### D6. Build: esbuild bundling `src/plugin/main.ts` → `main.js`

Standard community-plugin toolchain (esbuild, `obsidian` + `@codemirror/*` as externals).
The mapping core stays a plain TS library import — one repo, one bundle, no workspace
split. Vitest continues to cover the library; plugin glue gets thin unit tests where
Obsidian types allow (edit-list → offset-change conversion, mode registry) with the
`obsidian` module mocked.

## Risks / Trade-offs

- [Tab-less commands feel clunky compared to obsidian-outliner] → explicitly temporary;
  the enforcement change owns keyboard UX. Docs set expectations.
- [Parse-per-command on huge notes] → measure with the debug setting; incremental parsing
  is already planned for the enforcement layer.
- [Dialect drift vs Obsidian's parser surfaces in real vaults] → that's partly the point:
  the cross-check logging turns drift into corpus fixtures instead of silent corruption —
  and ops always re-encode from what *we* parsed, so a misparse shows up as a wrong-looking
  edit, never as unrelated text loss (verbatim spans).
- [Plugin data keyed by path goes stale via external renames while the vault is closed] →
  acceptable v1 loss: mode silently defaults to off for a moved file.

## Open Questions

- Whether the outline-mode toggle deserves a status-bar / editor-header indicator in this
  change or waits for the chrome layer (lean: minimal ribbon-less command + editor menu
  entry now, visual state with the decorations change).
