# Obsidian API Feasibility

The core question: **can a true-outliner experience be built with public plugin APIs only —
no private APIs, no monkey-patching, a clean automated-review scorecard?**

Short answer: **yes for the editor-centric architecture; no (today) for a Kanban-style
custom-view takeover of `.md` files.** Details below.

## The constraint set ("perfect scorecard")

As of 2026 Obsidian runs a [Community directory with automated review](https://obsidian.md/blog/future-of-plugins/):
every plugin *version* is scanned for security and code quality, and each plugin page shows a
**safety scorecard** (with planned disclosure of network/filesystem/clipboard access). Manual
review continues for popular plugins. Compliance is checkable locally via the official
[`obsidianmd/eslint-plugin`](https://github.com/obsidianmd/eslint-plugin).

**What the scorecard empirically measures** (decomposed from a real red one — see the
workflowy-style-outline case study in the plugin-landscape doc). Two independent badges:
*Health* (activity: readme/license hygiene, commit/release cadence, issue responsiveness,
adoption) and *Review* (automated scans of each release). The Review scans are, concretely:
(1) capability detection surfaced as user-facing disclosures — vault read/write, network
calls, clipboard, base64 usage; (2) dependency vulnerability scan; (3) malware/obfuscation/
network-behavior scans gated on **build verification, which requires a committed lockfile**;
(4) the obsidianmd + strict-TypeScript eslint rules; (5) CSS lints (`!important`, `:has`);
(6) release hygiene (GitHub artifact attestations, release notes, manifest/release
consistency). Monkey-patching/private-API use is *not* among the automated checks — it
remains a manual-review and fragility concern, not a scorecard line item.

**Green-scorecard checklist for this project (day 1):** eslint-plugin-obsidianmd + strict
typescript-eslint in CI; zero `!important`/`:has` (style via Obsidian CSS variables and
specificity); committed lockfile + GitHub artifact attestations + real release notes in the
release workflow; no network/clipboard capability at all (vault-only footprint → near-empty
disclosure panel); no deprecated APIs (`activeLeaf`, `execCommand`, …).

Relevant hard rules from the [Developer policies](https://docs.obsidian.md/Developer+policies)
and [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines):

- No telemetry, no ads, no self-updating, no code obfuscation.
- Security: no `innerHTML`/`outerHTML` with user data — build DOM via `createEl()` etc.
- Vault API over Adapter; `Editor` API for active-note edits; `Vault.process()` for background
  edits; `processFrontMatter()` for YAML; `normalizePath()`; no `workspace.activeLeaf` access;
  register everything for auto-cleanup; no default hotkeys; sentence case UI; no Node/Electron
  APIs if mobile is supported.

Note: the policies do not *explicitly* ban private-API use — but monkey-patching internals is
exactly what the code-quality scan and reviewers look for, it's the community's #1 breakage
source, and the project's own bar ("no private APIs or hacks") rules it out regardless.

## What Obsidian already gives us (public, documented)

This list is the pleasant surprise of the research — the platform provides more outliner
primitives than any of the reference apps had to start from:

1. **The entire CodeMirror 6 extension surface is official API.**
   `Plugin.registerEditorExtension()` accepts arbitrary CM6 extensions: `StateField`,
   `ViewPlugin`, `keymap` (with `Prec.highest`), **`transactionFilter` / `transactionExtender`**
   (veto or rewrite any document/selection change → this is the enforcement mechanism),
   `Decoration.replace/widget/line` (hide syntax, draw node chrome, block widgets),
   `atomicRanges` (make bullet markers cursor-atomic), fold service, drop handlers.
   obsidian-outliner, obsidian-zoom and pro-outliner jointly prove Enter/Tab grammar, stick-to-
   content cursors, subtree hiding (zoom), selection limiting, selection expansion, drag-and-
   drop, mirrors, and breadcrumb headers all work through this surface.
2. **Core parses list structure for the whole vault already.** `CachedMetadata.listItems` gives
   every list item's span and **`parent` pointer** (plus task state) for every markdown file,
   kept fresh by the metadata cache — a vault-wide outline index for free. Combined with
   `resolvedLinks` (also public), this is everything needed for structured backlinks *without
   touching private search internals*.
3. **Block identity is native.** `^block-id` IDs, `[[note#^id]]` links, `![[note#^id]]` embeds
   are core Obsidian markdown — indexed (`CachedMetadata.blocks`), rendered, hover-previewed
   and search-integrated by core. A true outliner can adopt them as its node-reference syntax
   and inherit the whole ecosystem's compatibility, instead of inventing `id::` pollution
   (Logseq's mistake) or `((refs))`.
4. **Folding, Live Preview, `foldInfo`** — native list folding in the editor;
   `MarkdownView`/`editor:toggle-fold`; Live Preview already demonstrates syntax-hiding UX.
5. **Workspace/view APIs** — `registerView` for our own panes (structured backlinks, breadcrumb
   bar via `addStatusBarItem`/view header, etc.), `ItemView`, `MarkdownRenderer.render` for
   rendering node content in our panes.
6. **Events + `Vault.process`** for cross-file operations (mirror sync, refactors) done safely.

## Architecture options

### Option A — Editor-centric: CM6 extensions inside the standard markdown view ("recommended")

The markdown view stays; the plugin makes it *behave* like an outliner for outline documents:

- **Enforcement**: a `transactionFilter` normalizes every transaction — deletions crossing node
  boundaries become structural deletions; pastes are re-indented to valid depth; a line can
  never lose its bullet while in outline mode; selection changes escalate to node selection when
  crossing boundaries (pro-outliner already ships a v1 of this).
- **Grammar**: high-precedence keymaps for Enter/Shift+Enter/Tab/moves (proven).
- **Node UX**: decorations for bullets/handles/fold chevrons; block-select highlight via line
  decorations; zoom via replace-decorations + breadcrumbs (proven by obsidian-zoom).
- **Scope control**: extensions are registered globally but no-op unless the file is an outline
  document (frontmatter flag / folder / global mode — open question), checked via metadataCache.

*Pros*: 100% public API; perfect-scorecard compatible; mobile works; degrades gracefully (files
are plain markdown lists everywhere else); interops with the whole ecosystem (backlinks, graph,
search, sync, other plugins). *Cons*: we inherit markdown-view constraints — the DOM is CM6's
line-based DOM, so some pixel-perfect block UI (e.g., Notion-style hover menus per block) takes
more creativity; "hard" enforcement is a filter over a text buffer, which demands a rigorous,
well-tested invariant layer (this is exactly the pure tree-ops + property-test discipline from
the TUI prototype).

### Option B — Custom view: parse md → own block editor (Kanban/Excalidraw pattern)

A `TextFileView` renders the outline as a fully custom (e.g., per-node contenteditable/CM)
block UI; the file stays markdown on disk.

The blocker: **there is no public mechanism to open `.md` files in a custom view.**
Kanban does it by monkey-patching `WorkspaceLeaf.setViewState` (confirmed in source: intercepts
`state.type === 'markdown'`, checks for its frontmatter key, rewrites to its view type) — a
private-API hack, fragile, and contrary to this project's bar. A
[2025 forum thread](https://forum.obsidian.md/t/custom-viewer-ui-for-certain-markdown-files/108104)
asking for an official alternative got no answer from the team. Alternatives all lose something
essential: a custom extension (`.outline`) forfeits metadataCache/links/graph/mobile-editor
interop; "open via command" per file is UX friction and re-breaks on every workspace restore.

*Nuance discovered later (2026-07-13, from the
[workflowy-style-outline](https://github.com/springrain1/workflowy-style-outline) case study —
see the plugin-landscape doc)*: the monkey-patch is only needed for **automatic** association.
An **explicit, user-invoked toggle** — a command/menu item calling
`leaf.setViewState({type: OUR_VIEW})` on the active leaf — is plain public API, and workspace
persistence keeps a toggled leaf in that view across restarts. So a scorecard-clean custom view
is *reachable*; what remains against Option B is everything else that project demonstrates:
rebuilding the editor (per-block textareas, IME/mobile/undo/save-queue re-implementations,
an "isolation layer" to avoid breaking native Obsidian) and, in their case, a lossy
md↔outline conversion — the anti-example for our isomorphism requirement.

*Verdict*: keep as a possible far-future layer (the explicit-toggle variant lowers the API
barrier but not the engineering cost); not a foundation compatible with today's goals.

### Option C — Hybrid (A + owned side surfaces)

Option A for editing, plus our own `registerView` panes where we fully control rendering:
**structured backlinks pane** (tree context from `listItems`, editable via `Vault.process` or
embedded editors), zoom breadcrumb header, optional outline-wide search/filter view. All public.
This captures most of what Option B wanted anyway, without the takeover problem.

## Feasibility scorecard per target feature

| Target behavior | Public-API path | Confidence |
| --- | --- | --- |
| Enter/Tab/move/merge grammar | CM6 keymaps (proven in prod) | High |
| Structure enforcement | `transactionFilter` invariant layer | High (novel engineering, proven primitives) |
| Node selection model | transactionFilter + decorations (pro-outliner v1 exists) | High |
| Fold + persistence | native folds; storage decision open (plugin data vs in-file) | High |
| Zoom + breadcrumbs | replace-decorations (proven: obsidian-zoom) | High |
| Drag & drop | CM6 drop + widgets (proven: obsidian-outliner) | High |
| Multiline nodes | md continuation lines + grammar keymaps | Medium-high (careful spec needed) |
| Block refs/embeds | native `^id` / `![[#^id]]` | High (core does the heavy lifting) |
| Mirrors (synced blocks) | native embeds first; true editable mirrors later | Medium |
| Structured backlinks pane (read) | own view + `resolvedLinks` + `listItems` | High |
| Editable backlinks | + `Vault.process`/embedded editor per block | Medium |
| Mobile | all of the above is CM6/DOM | High (test discipline) |
| Perfect scorecard | eslint-plugin from day 1; no `any`-casts into internals | High under Option A |

Two honesty notes: (a) `getBacklinksForFile` is **not** public — the public path is
`resolvedLinks` + own reverse index (the [backlink-cache](https://github.com/mnaoumov/obsidian-backlink-cache)
plugin shows the pattern); (b) even obsidian-outliner reaches for `(editor as any).cm` — we can
avoid it almost everywhere by living inside registered extensions (a `ViewPlugin` receives its
`EditorView` directly), which should be an explicit engineering rule.

## Addendum: the universal isomorphic outline view (post-alignment)

The 2026-07-12 alignment (see [04-open-questions.md](04-open-questions.md), Q2) widened the
document model from "lists" to the **full markdown block tree** — headings, paragraphs, code
fences, quotes, tables *and* list items are all nodes; the outline is a toggleable editor UI
over any note, with a lossless (isomorphic) round-trip. Feasibility notes for that vision:

- **The parse already exists.** `CachedMetadata.sections` (typed top-level blocks with
  positions), `headings` (text + level + position) and `listItems` (span + parent pointer)
  together describe exactly this block tree for every file in the vault, maintained by core.
  The editor side can parse incrementally from the CM6 document (and/or the bundled
  `@codemirror/language` syntax tree) for keystroke-latency accuracy; the cache serves
  cross-file features.
- **The CM6 architecture is unchanged.** Enforcement (`transactionFilter`), grammar (keymaps),
  node chrome (decorations), zoom (replace-decorations) apply to heading/paragraph nodes the
  same way they apply to list items. Obsidian's own fold system already treats *both* headings
  and list indents as foldable trees — precedent inside the core editor itself.
- **The new hard problem is the mapping algebra, not the APIs.** Headings encode depth by
  level, lists by indentation, paragraphs by adjacency — three different depth encodings in one
  tree. Operations must be closed over "trees expressible as natural markdown" (e.g.
  paragraph-under-paragraph has no markdown form → the op must convert, reject, or remap;
  h6 bounds heading depth). This is a spec/design problem — precisely what the OpenSpec
  explore/design phase is for — not an API gap.
- **Prior art**: org-mode is the closest living system (heading tree + plain lists with
  subtree promote/demote/move); no Obsidian plugin attempts the unified mapping. Obsidian's
  own "fold anything" + `sections` cache suggest the platform was shaped by adjacent thinking.

## Bottom line

The desired experience is achievable **within the rules** via Option A/C. The differentiating
work is not exotic API access — it's (1) a rigorously specified and tested **invariant/
enforcement layer** over CM6 transactions, (2) a coherent **node-selection model**, and (3) a
**structured backlinks pane** built on the vault-wide list index. The reference precedents
(outliner, zoom, pro-outliner, influx) collectively de-risk nearly every primitive; no existing
plugin has assembled them into one enforced, coherent product.
