# The Outliner Landscape

## What an outliner is (and is not)

An [outliner](https://en.wikipedia.org/wiki/Outliner) is a text editor whose document model is a
**tree of nodes**, not a sequence of lines. Content is organized by hierarchical relationship
rather than linear flow. The classic taxonomy:

- **One-pane (intrinsic)** outliners — structure and content in one view; sections collapse and
  expand in place. This is the model of Workflowy, Roam, Logseq, Tana, and this project.
- **Two-pane (extrinsic)** outliners — a structure tree in one pane, node content in another
  (classic examples: OmniOutliner-style tools, many "TOC sidebar" designs).

**Not the same thing:** Obsidian's "Outline" core plugin (heading TOC sidebar) is a *view of*
a linear document. We are concerned with the document *being* an outline and the *editing
experience* of it — the opposite end of the spectrum.

## The defining behaviors of a "true outliner"

This is the checklist that separates a real outliner from "a text editor that's good at lists."
Compiled from Workflowy/Roam/Logseq/Tana/Dynalist behavior and from long-standing community
requests (e.g. the Obsidian forum's
["Outliner mode (similar to Logseq, Roam, Dynalist)"](https://forum.obsidian.md/t/outliner-mode-similar-to-logseq-roam-dynalist/13769)
thread, where users describe list editing in Obsidian as *"fragile"* — "requires the cursor to
be in just the right place and copying, moving things around often breaks things").

### 1. Node identity and atomicity

Every visible bullet is a **node** (block) with an identity. Operations act on nodes, never on
raw text lines. A node carries its subtree with it through every operation.

### 2. Structure is enforced, not suggested

The document **cannot be malformed**. There is no keystroke, selection, paste, or deletion that
produces broken indentation, orphaned children, or "text floating next to the outline."
This is the single biggest gap in every existing Obsidian plugin — with flat markdown
underneath, a sloppy select-and-delete shreds the tree.

### 3. The editing grammar

The near-universal key grammar across Workflowy/Roam/Logseq/Tana:

| Input | Behavior |
| --- | --- |
| `Enter` | New sibling below (new first child if node has visible children — app-dependent); splits the node if cursor is mid-text |
| `Shift+Enter` | Soft line break *inside* the node (multiline node) |
| `Tab` / `Shift+Tab` | Indent / outdent the node (with subtree), **regardless of cursor position in the line**; no-op (not text-tab) when structurally impossible |
| `Backspace` at start of node | Merge into previous node / delete empty node — never leaves orphans; children handled by promotion or merge rules |
| `Enter` on empty indented node | Outdent (progressive escape), rather than creating empty siblings |
| Move up/down (`Alt/Cmd+Shift+↑/↓`) | Swap node (with subtree) with sibling; crossing a parent boundary re-parents predictably |
| `Cmd+↑/↓` or chevron | Collapse / expand |

### 4. The selection model (the acid test)

- Text selection *within* a node behaves like a normal editor.
- The moment a selection crosses a node boundary, it **escalates to node selection**: whole
  nodes (with their subtrees) are selected, visually as blocks — never a ragged half-line span.
- `Esc` (or repeated `Cmd+A`) escalates: text → node → node+subtree → all siblings → whole outline.
- Cut/copy of a node selection carries structure; paste re-anchors the subtree at the target
  with indentation normalized to the destination depth.
- Delete of a node selection removes whole nodes; the tree is valid afterwards, always.

This is where "flat text + cursor tricks" visibly falls apart, and it is the user's primary
stated pain with obsidian-outliner.

### 5. Fold / collapse

- Any node with children collapses; indicator on the bullet (and child count on hover, à la Workflowy).
- Collapsed state **persists** across sessions (where it's stored is a key design decision — see lessons below).
- Navigation and search interact sanely with folds (folded matches auto-reveal).

### 6. Zoom (hoisting)

- Any node can become the temporary root of the view ("zoom in" / "hoist" / Logseq "focus").
- Breadcrumbs show the ancestor path; clicking a crumb zooms to it.
- Zoom is a *view* state, not a document mutation. (Workflowy takes this to the extreme: the
  entire product is one infinite outline you're always zoomed into some part of.)

### 7. Drag and drop

Grab the bullet handle, drag the node (with subtree); drop indicators show the target position
*and depth*. Dropping can re-parent.

### 8. References, mirrors, and bi-directional outlining

The "networked thought" layer built on top of node identity:

- **Block references** — link to a node from elsewhere; `((...))` in Roam/Logseq,
  `[[note#^block-id]]` natively in Obsidian.
- **Block embeds / mirrors** — a node rendered (or even *edited*) in another location;
  Roam/Workflowy mirrors, Tana "search nodes," Logseq embeds.
- **Structured backlinks** ("bi-directional outlining") — the backlinks view for a page/node
  shows each referencing *block in its tree context*: ancestor breadcrumb above, children below,
  editable in place in the best implementations (Roam, Logseq). This is dramatically more useful
  than Obsidian's flat line-match backlinks pane, and it's a stated goal of this project.
  [Orca Note](https://orca-studio.com/orcanote/) markets itself precisely on being an
  "advanced fine-grained bi-directional outliner."

### 9. The rest of the table stakes

- **Undo/redo** restores structure *and* focus/selection/fold state coherently.
- **Performance**: every keystroke instant on multi-thousand-node documents.
- **Keyboard-first completeness** — every mouse affordance has a keybinding.
- **Rich inline content** — inline markdown (bold/links/tags/checkboxes) inside nodes;
  multiline nodes; per-node "document-like" content (code blocks, quotes) as an advanced case.
- **Search/filter** that shows matches with their ancestor context.

## The reference apps

### Workflowy — the gold standard for interaction

One infinite zoomable outline; minimal formatting; nearly flawless keyboard and selection
mechanics; mirrors added later. Its lesson: **interaction polish beats feature count**. Every
outliner is still judged against Workflowy's editing feel.

### Roam Research — refined block grammar

Popularized block references, block embeds, daily notes, and structured backlinks. Its outliner
mechanics (selection escalation, block manipulation shortcuts) remain among the tightest.
Cloud-only, proprietary, and a fading force — but the interaction patterns are canon.

### Logseq — the existence proof *and* the cautionary tale

Logseq proved a true outliner can sit on top of **plain markdown files** — and paid dearly for
the details:

- **In-file metadata pollution**: `id:: 6a1f...` properties injected into the markdown when a
  block is referenced, `collapsed:: true` written on fold, `:LOGBOOK:` drawers, forced `-`
  bullet on every line. Files round-trip poorly with other tools
  ([community property-syntax discussion](https://discuss.logseq.com/t/an-idea-for-a-more-standard-markdown-property-syntax/20073));
  an entire Obsidian plugin ([Logseq Formater](https://community.obsidian.md/plugins/logseq-formater))
  exists just to clean Logseq artifacts out of shared vaults.
- **Whitespace/indentation instability** across versions (e.g.
  [markdown export mangling indentation](https://github.com/logseq/logseq/issues/9805)).
- **The rewrite**: years spent on the "DB version," culminating in the April 2026
  [split into two products](https://logseq.io/page/b2ad9ce1-9cb7-4436-8083-54cb4516d324/df4dc09d-0a12-4c87-904e-22a9bf4c350a):
  **Logseq OG** (file-based, maintenance-only: security + Electron updates) and **Logseq DB**
  (database-first, the future, currently beta). I.e., the flagship markdown outliner team
  concluded that markdown-as-database, *as they had built it*, was a dead end.

**Lessons for us**: (a) keep the markdown clean — metadata belongs out-of-band or in native
Obsidian syntax; (b) don't rewrite user files gratuitously; (c) scope discipline — Logseq
drowned trying to be an outliner *and* a database *and* a task manager *and* a sync service.

### outl — the modern minimal answer

[outl](https://outl.app/) (open source, Rust, 2025–26): "plain markdown is the source of truth",
**"the CRDT lives in a sidecar, not in your files"** — sync IDs live in a `.outl` sidecar so the
`.md` stays clean ("delete outl tomorrow, your notes still read the same in any text editor").
Wiki-links/backlinks out of the box, daily journal, vim-style navigation, P2P sync
(Kleppmann-style tree CRDT), MCP server. Its lesson: **the sidecar pattern** reconciles stable
node identity with clean markdown. Young project; multi-surface (TUI/desktop/iOS).

### Tana — structure on top of the outline

Every node can carry a **supertag** (a type with fields), turning the outline into a queryable
graph. In March 2026 Tana [split into two products](https://outliner.tana.inc/articles/tana-current-march-2026):
**Tana Outliner** continues for outline devotees while "new Tana" pivots to team/AI/meetings.
Lesson: the outliner core has a loyal audience distinct from the "AI workspace" market; also,
supertags show where an outline+metadata model can go later (out of scope for our MVP).

### Orca Note — fine-grained bi-directional outlining

Local-first, block-based, "advanced fine-grained bi-directional outliner," super tags, block-level
backlinks, plugin API + CLI, free tier limited to 1,000 blocks. Closed-source, small team.
Relevant mostly as a benchmark for the backlinks-with-structure experience.

### Dynalist (honorable mention)

Workflowy competitor by the makers of Obsidian; effectively frozen since Obsidian took off.
Its polish level and its neglect are both instructive: Obsidian's makers know outliners
intimately — and chose a free-form editor for Obsidian. The gap is real and deliberate;
filling it is plugin territory.

## The architectural axis every app sits on

| Source of truth | Apps | Consequence |
| --- | --- | --- |
| **Markdown files** | Logseq OG, outl, (Obsidian itself) | Interop, longevity, user trust; hard: node identity, metadata, performance at scale |
| **Database** | Roam, Tana, Orca, Logseq DB | Easy node identity/refs/queries; hard: lock-in, export fidelity, user trust |

An Obsidian plugin doesn't get to choose: **markdown files in the vault are the source of
truth**, non-negotiable. That makes Logseq's mistakes and outl's sidecar idea our most relevant
prior art, and it frames the central design problem: *how much outliner metadata (node IDs,
collapse state) lives where — in the file (native syntax only?), in plugin data, or in a sidecar?*

## The TUI prototype (`tui-outliner-multiline`)

The author's SpecKit-based TUI experiment. What transfers to this project:

- **Behavior inventories worth mining**: complete acceptance-scenario catalogs for navigation,
  create/edit, structural ops (incl. cross-parent move semantics), fold, zoom
  (focus-after-zoom rules, breadcrumb rules, "left on top node zooms up one level"), and an
  exceptionally careful **undo/redo focus-restoration spec** (undo restores *where focus was
  before the operation*; delete-undo focuses the restored node; focus must never land on an
  invisible root).
- **Engineering patterns that held up**: pure tree-operation functions separated from UI;
  immutable tree updates enabling snapshot undo; precomputed visible-node lists; performance
  budgets validated by benchmark tests (sub-ms navigation at 500+ nodes).
- **Multiline nodes** as first-class (`Shift+Enter`), and read-only outline mode.

What does *not* transfer (TUI bias):

- The **modal nav/edit split** (vim-style `i`/`a`/`o`/`Esc`, single-focused-node model).
  Obsidian is direct-manipulation: cursor lives in text, editing is always on. The outliner
  grammar must be modeless (with a *transient* node-selection state, not a mode).
- JSON file format, single-file model, terminal key constraints, manual scroll management.
