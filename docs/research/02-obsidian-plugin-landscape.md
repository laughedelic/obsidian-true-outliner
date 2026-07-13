# Obsidian Plugin Landscape

What exists today, how each plugin works internally, and where the gaps are.
(Internals verified against source via DeepWiki, July 2026.)

## Editing-side plugins

### [obsidian-outliner](https://github.com/vslinko/obsidian-outliner) (vslinko)

The incumbent, and the baseline to improve upon.

**How it works.** A features/services architecture on top of official APIs:
`registerEditorExtension` with CodeMirror 6 keymaps at `Prec.highest` (Enter, Tab), an
`EditorState.transactionExtender` that keeps the cursor inside list content and out of folded
regions ("stick cursor"), CM6 extensions for drag-and-drop and vertical indent lines, and its
own markdown list parser + operation engine (`Parser`, `OperationPerformer`) working through a
`MyEditor` wrapper. Mostly clean API usage; the exceptions are `(editor as any).cm` to reach the
CM6 `EditorView` (ubiquitous community pattern, not in public typings) and
`window.CodeMirrorAdapter.Vim` for vim `o`/`O` support.

**What it delivers**: move-with-children, indent/outdent, folding shortcuts, smarter
Enter/Tab, Ctrl+A escalation (item → whole list), drag-and-drop, indent guides, list styling.

**Where it falls short of a true outliner** (the motivating gaps for this project):

- **No structure enforcement.** It's "a flat text with cursor tricks bolted on top" — nothing
  stops a newline from starting flat paragraph text next to the outline; nothing validates the
  tree.
- **No node-level selection model.** Selections are raw text spans; the README itself lists
  *"manipulation with multiple lines"* as not supported. A careless select-and-delete still
  shreds structure and leaves broken indentation.
- No zoom (delegated to the companion plugin), no node identity, no references/mirrors,
  no structured backlinks — it is purely a list-editing enhancer.
- 95 open issues; maintained but conservative in scope (v4.10.2, June 2026).

### [obsidian-zoom](https://github.com/vslinko/obsidian-zoom) (vslinko)

Zoom into a list subtree. **How it works**: a CM6 `StateField` dispatching effects that create
`Decoration.replace({block: true})` decorations hiding everything outside the zoomed range, a
`transactionFilter` limiting selection to the visible range, and a breadcrumbs header. Public
APIs only. Requires "Fold heading"/"Fold indent" enabled. Proves **zoom/hoisting is achievable
with pure public-API CM6** in the standard markdown view.

### [obsidian-pro-outliner](https://github.com/mrkhachaturov/obsidian-pro-outliner) (mrkhachaturov)

A 2025 unification-fork of outliner + zoom (MIT, credits vslinko) that pushes furthest toward
the true-outliner UX and is therefore an important precedent:

- Zoom with **compact breadcrumbs** and zoom-out-one-level;
- **Mirrors** — Tana-style synced copies of blocks across notes (one-way sync, dashed-bullet
  indicator, break-link command; only top-level items mirrorable, nested items fall back to
  block links);
- **Workflowy-style selection expansion** — selections crossing bullets auto-expand to whole
  items with children.

Young (v1.0.6, Dec 2025, 21 stars), but demonstrates that node selection, mirrors, and
breadcrumbed zoom are all buildable inside the markdown view.

### [bullet](https://github.com/kdnk/obsidian-bullet) (kdnk)

Active fork of obsidian-outliner (v5.5.9, ~monthly releases) with vim-mode integration and
cursor-positioning tweaks. Scorecard on the community directory: Health "Excellent."
No fundamental additions over the parent — same flat-text limitations.

### draggable-list-items

Subsumed: obsidian-outliner (and pro-outliner) ship drag-and-drop natively.

## Backlinks-side plugins ("bi-directional outlining")

### [influx](https://github.com/jensmtg/influx)

Renders backlinks at the bottom of a note as contextual excerpts **organized by the referencing
note's bullet hierarchy** — the closest thing to Logseq's structured backlinks in Obsidian.
Originally stale/abandoned; picked up by a new maintainer (@semanticdata) and currently
maintained. Renders its own panel (doesn't patch the core pane). Read-only excerpts; no
in-place editing of the referencing blocks.

### [better-search-views](https://github.com/ivan-lednev/better-search-views)

Outliner-style context (ancestor breadcrumbs + child items, rendered markdown) injected into
core search, backlinks, and embedded queries. **How**: `monkey-around` patches on Obsidian
internals — `Component.addChild`, the search result DOM's `addResult`, and
`renderContentMatches` — with SolidJS rendering into the patched DOM. The README warns it "may
break after an update," and that is exactly what happens periodically. It is the demonstration
of *both* the demand for structured backlinks *and* the cost of the private-API route.

### [coalesce](https://github.com/bfloydd/coalesce)

Newer attempt (inspired by Roam/Logseq): replaces in-document backlinks with a fuller
configurable view (aliases, filters, daily-notes orientation). Own view, public APIs, active.
Still read-only context display.

### Takeaway for the backlinks goal

Everyone who patches core panes breaks; everyone who renders their own view survives. Obsidian
core already parses every file's list hierarchy into `ListItemCache` (see feasibility doc), so a
**first-party-quality structured backlinks pane is buildable on public APIs** — and none of the
existing attempts offer *editable* backlink blocks (Roam/Logseq's killer feature), which is an
open opportunity.

## Gap analysis — what no plugin (or combination) provides today

1. **Enforced tree invariants** — a document that *cannot* be structurally corrupted while the
   plugin is active (the "true outliner" core).
2. **Node-level selection as the primary model** (pro-outliner's expansion is a partial step).
3. **A coherent single product** — today the UX is scattered across outliner + zoom + influx +
   styling snippets, each with its own settings, gaps, and conflicts.
4. **Editable structured backlinks** (transclusion-grade).
5. **First-class multiline nodes** with predictable Enter/Shift+Enter grammar.
6. **Fold-state persistence** with a deliberate storage story (Obsidian folds are ephemeral
   view state; Logseq's `collapsed::` pollution is the anti-pattern to avoid).
7. **Clean-scorecard engineering** — several incumbents rely on `any`-casts, globals, or
   monkey-patching; none was built with the 2026 automated-review scorecard as a design
   constraint.
