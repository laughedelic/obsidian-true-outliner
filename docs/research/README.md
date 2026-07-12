# Research: A True Outliner for Obsidian

Initial research for the **obsidian-true-outliner** project — an Obsidian plugin that turns
the editor into a true outliner experience (Logseq / Workflowy / Roam-class), built cleanly
on public plugin APIs.

Research date: July 2026.

## Documents

| Doc | Contents |
| --- | --- |
| [01-outliner-landscape.md](01-outliner-landscape.md) | What a "true outliner" is: the reference apps, the catalog of defining behaviors, lessons (good and bad) from each app |
| [02-obsidian-plugin-landscape.md](02-obsidian-plugin-landscape.md) | Existing Obsidian plugins in this space, how they work, and the gap analysis |
| [03-obsidian-api-feasibility.md](03-obsidian-api-feasibility.md) | Can the experience be built on public APIs only? Architecture options, guidelines/scorecard constraints, verdict |
| [04-open-questions.md](04-open-questions.md) | Decisions that need alignment before any planning/spec work |

## TL;DR

- A **true outliner** is defined by one invariant: *the document is a tree of nodes, and every
  operation — typing, selecting, deleting, moving, pasting — respects node boundaries*. Existing
  Obsidian plugins (obsidian-outliner et al.) bolt keyboard tricks onto flat text; the invariant
  is never enforced, so the structure is always one careless selection away from breaking.
- The reference apps split on one architectural axis: **markdown files as source of truth**
  (Logseq OG, outl) vs **database as source of truth** (Roam, Tana, Orca, new Logseq).
  Logseq's multi-year rewrite and its 2026 split into two products is the cautionary tale for
  the file-based approach done with too much in-file metadata; **outl's sidecar-CRDT design**
  is the cleanest known answer (markdown stays clean, IDs live out-of-band).
- Obsidian gives us more native building blocks than expected: the **metadata cache already
  parses list hierarchy** (`ListItemCache` with parent links) for every file in the vault,
  **block IDs (`^abc123`), block links and block embeds are native**, folding is native, and
  the whole CodeMirror 6 extension surface is an official, documented API
  (`registerEditorExtension`).
- **Feasibility verdict: yes, with one architectural fork in the road.** An *editor-centric*
  approach (CM6 extensions inside the standard markdown view) can deliver the large majority of
  the target UX with 100% public APIs — proven piecemeal by obsidian-outliner, obsidian-zoom,
  and obsidian-pro-outliner (which already ships zoom + breadcrumbs, Tana-style mirrors, and
  Workflowy-style selection expansion on public APIs). A *custom-view* approach (Kanban-style)
  gives total UX control but today requires monkey-patching `WorkspaceLeaf.setViewState`
  (private internals) or abandoning `.md` (losing links/backlinks/graph) — both at odds with
  the "perfect scorecard, no hacks" goal.
- Obsidian's 2026 **Community directory with automated safety scorecards** (plus the official
  `obsidianmd/eslint-plugin`) makes "perfect scorecard" a concrete, checkable target rather
  than an aspiration.

## Decisions so far (2026-07-12 alignment)

1. **Architecture**: editor-centric — CM6 extensions in the standard markdown view + own side
   panes; 100% public API.
2. **Scope**: the **universal isomorphic outline view** — any markdown note maps onto a block
   tree (headings / paragraphs / lists / other blocks as nodes) and can be toggled into the
   outliner editing experience and back, losslessly. Not a list-only mode, not a vault takeover.
3. **Metadata**: native `^block-id` only on demand; collapse state in plugin data; clean files.
4. **v1**: small solid core (grammar + node selection + enforced invariants), architecture open
   for fold persistence, zoom, structured backlinks, refs/mirrors as later layers.

Remaining open questions: [04-open-questions.md](04-open-questions.md).

## Where this project starts from

- `../../openspec/` — OpenSpec (spec-driven development) scaffold, already initialized.
- `~/Code/tui-outliner-multiline` — the author's TUI outliner prototype (SpecKit-based).
  Its specs are a useful inspiration for behavior inventories (navigation, structural ops,
  zoom focus rules, undo/redo focus restoration, multiline nodes), with the caveat that its
  modal (vim-like nav/edit split) interaction model is TUI-specific and does **not** transfer
  to Obsidian, which is a direct-manipulation, always-editing environment.
