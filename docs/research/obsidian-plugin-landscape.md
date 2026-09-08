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

### [workflowy-style-outline](https://github.com/springrain1/workflowy-style-outline) (springrain1) — the Option B case study

*(Added 2026-07-13 — reviewed after the architecture decisions; it independently attempts our
"mode toggle + md↔outline conversion" idea via the custom-view route, so it doubles as a field
test of the road we didn't take.)*

**What it is.** A Workflowy-style block editor for markdown notes (v2.9.1, ~10k lines,
squash-committed as a "fix all Obsidian review issues" clean drop; README additionally
advertises license-gated features not present in this snapshot). Rich feature set: per-note
toggle to an outline view, zoom + breadcrumbs, multi-selection, drag-and-drop (Alt+drag creates
block references with auto-generated native `^block-id`s), slash/tag/link suggestion menus,
todo states, mobile toolbar.

**How it works** (verified in source):

- `WorkflowyView extends FileView` — a **from-scratch block editor**: each node is a raw
  `textarea` (edit layer) over a `contenteditable`/`MarkdownRenderer` display layer. Not CM6.
- Explicit per-note toggle via command/file menu calling **`leaf.setViewState({type: ...})` on
  the active leaf — public API, no monkey-patching**. (Automatic association is simply not
  offered; a leaf left in outline view is restored by workspace persistence.)
- `OutlineParser` does bidirectional md↔tree conversion; file I/O is manual
  `vault.read`/`vault.modify` plus a hand-rolled "anti-race-condition save queue".
- A five-module "isolation architecture" (view-state manager, command proxy, event delegator,
  runtime validator with periodic health checks) exists solely to keep the parallel editor
  from interfering with native Obsidian.

**What its costs demonstrate** (each one a predicted consequence of the custom-view route):

- **The conversion is lossy and normalizing — the anti-example for our isomorphism
  requirement.** The line-regex parser: forces tab indentation and `- ` markers on rewrite
  (ordered lists are parsed but re-serialized as bullets), globs *all* consecutive non-list
  content (headings, paragraphs, fences, tables) into single opaque blob nodes, misparses
  list-looking lines inside code fences, and `.trim()`s away blank-line structure. Toggling a
  note in and out of outline view can rewrite the file.
- **Rebuilding the editor means rebuilding the platform**: the README's proudest features —
  save queue, IME-flicker prevention, incremental mobile DOM patcher, undo manager — are all
  re-implementations of things CM6/Obsidian provide for free inside the markdown view.
- **Non-list content is second-class**: rendered blobs, not first-class nodes — the exact
  compromise our universal mapping (headings/paragraphs as real nodes) is designed to avoid.
- Guideline frictions typical of the approach: manual `vault.modify` of the open file,
  deprecated `workspace.activeLeaf` usage.

**What's genuinely worth learning from it:**

1. **Explicit toggle needs no hacks** — `setViewState` to a registered view type on user action
   is clean public API; only *automatic* md→custom-view association requires the Kanban
   monkey-patch. (Feasibility doc updated accordingly.)
2. **Alt+drag → block reference with on-demand `^block-id`** is a lovely interaction that fits
   our Q3 decision exactly.
3. **Aggregated multi-file outline view** (their "Daily Notes Plus": several notes composed
   into one editable outline with lazy mount/unmount) is a compelling future layer — and
   easier for us, since our nodes stay in the real editor.
4. Their per-block suggestion menus (slash, `#`, `[[`) confirm users expect Obsidian's
   full input affordances *inside* outline nodes — which the editor-centric path keeps for free.

**Its directory scorecard** (inspected 2026-07-13 on
[community.obsidian.md](https://community.obsidian.md/plugins/workflowy-style-outline)) is the
first real-world sample of what the automated review measures — Health "Excellent" (activity
metrics) but Review **"Risks" with 1,088 flagged issues**, decomposing into:

- **~86% is one CSS lint rule**: ~890 × "avoid `!important`" (their from-scratch UI ships a
  huge stylesheet fighting Obsidian's), plus "avoid `:has`" (performance).
- **The official eslint-plugin-obsidianmd ruleset**: deprecated `activeLeaf` (7×), default
  hotkeys (10×), `document` instead of `activeDocument` (24×), `instanceof` instead of
  `.instanceOf()` (6×), deprecated `execCommand`/`substr`/`setWarning`, README/manifest name
  mismatch — plus strict-TypeScript hits (44 × `any`, unsafe assignments, unhandled promises).
- **Supply-chain/build items**: no committed lockfile → *build verification, malware,
  obfuscation and network scans all "not available"*; missing GitHub artifact attestations;
  release-manifest mismatch; empty release notes.
- **Capability disclosures** (not violations, but shown to users): network request calls,
  clipboard access, `atob`/`btoa` base64 ("may be used to obscure strings").

Notably **absent**: any check for monkey-patching or private-API access — those surface in
manual review, not the scans. The scorecard lesson: "Review: Risks" here is mostly lint-grade
hygiene, which means a green scorecard is cheaply *designable-in from day 1* (see the
feasibility doc's checklist) — and conversely that a red badge on a technically-interesting
plugin still poisons user trust on the directory page.

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
