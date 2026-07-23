# True Outliner

True outliner experience for Obsidian

> [!WARNING]
> **Work in progress.** This is an early-stage, research-heavy project, not a usable plugin yet. It's public because the work happens in the open, not because it's ready for users. There's no release, no install instructions, and no support yet, check back later. If you want to support the project or have opinions on the direction, please open a [discussion](https://github.com/laughedelic/obsidian-true-outliner/discussions).

## Vision

- Outliner apps (Workflowy, Roam, Logseq, Tana) share one invariant: the document is a **tree of nodes**, and every operation (typing, selecting, deleting, moving, pasting) respects **node boundaries**. The structure can't be malformed.
- Obsidian's markdown lists don't have that invariant.
  - Existing outliner plugins bolt keyboard tricks onto flat text, so the structure is one careless selection away from breaking.
  - This is fragile: the cursor has to be in just the right place, and copying or moving things around often breaks the file.
- True Outliner aims to bring the enforced-tree invariant to Obsidian without leaving markdown behind.
  - Any note is an outline: every note already has a block structure (headings, paragraphs, list items), and that structure maps losslessly onto a node tree.
  - The plugin lets you view and edit that tree directly, with the same guarantees as a dedicated outliner.
  - The file on disk stays plain, readable markdown, so it still works with every other tool, plugin, and sync method Obsidian offers.

## Goals

- Structural integrity: no operation can produce broken indentation, orphaned children, or text floating outside the tree. This is enforced, not best-effort.
- Lossless, isomorphic markdown mapping: the block tree and its markdown encoding are two views of the same thing.
  - Parsing and re-encoding a file round-trips byte-for-byte.
  - Every structural edit resolves to a well-defined, minimal diff, never hidden state, never a lossy rewrite of the whole file.
- Any note, not a special mode: the outliner isn't a separate note type or a vault takeover, it's a way of looking at and editing the notes you already have.
- Public APIs only: built on Obsidian's documented editor and plugin APIs, no monkey-patching private internals, so it stays compatible and passes the community plugin safety bar honestly.
- Clean files: no required front matter, IDs, or metadata just to make the outliner work. What the outliner needs to track (like fold state) lives in plugin data, not in your notes.

## Approach

- The design splits into two layers:
  - A pure mapping core: markdown parsing, encoding, and structural operations (indent, outdent, move, etc.) as a standalone library with no editor or Obsidian dependency. Correctness here (round-tripping, op closure, minimal edits) is verified independently of any UI.
  - An editor integration: a CodeMirror 6 extension inside Obsidian's standard markdown view that renders and drives that model, giving the outliner experience without replacing the file format or the editor.
- The mapping algebra has two structural regimes:
  - Headings behave like org-mode promote/demote: indent/outdent shifts heading level.
  - Everything else reparents relative to siblings, with markdown encoding recomputed from context.
  - Either way, an operation produces a well-formed tree, or it's rejected with a clear, typed reason, never a partial or ambiguous result.
- The research and design decisions behind these choices are written up in [docs/research/](docs/research/).
