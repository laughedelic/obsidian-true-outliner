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
| [05-org-mode-comparison.md](05-org-mode-comparison.md) | Where our mapping algebra aligns with / diverges from org-mode, the closest living reference system |
| [06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md) | Postmortem on the failed `outline-decorations` visual-chrome attempt: what was tried, why the CSS-override strategy kept breaking, and why the testing approach gave false confidence |
| [07-decoration-experiments-plan.md](07-decoration-experiments-plan.md) | **Hub** for the decoration-experiments series (informed by prior-art research: obsidian-outliner, Logseq, Silverbullet): ground rules, shared fixture corpus, final results table with verdicts, the two never-triggered experiments, and the map to the per-experiment docs below |
| [08-experiment-1-additive-indentation.md](08-experiment-1-additive-indentation.md) | Experiment 1: additive-only indentation — design, results, 3 real-vault bugs. **Kept**; the foundation for everything after |
| [09-experiment-2-guide-lines.md](09-experiment-2-guide-lines.md) | Experiment 2: guide lines — 2a (pixel-measured overlay) vs. 2b (CSS stacked-gradient) head to head. **2b chosen** |
| [10-experiment-5-block-markers.md](10-experiment-5-block-markers.md) | Experiment 5: per-kind block markers — 5a (SVG icons, DOM mechanism) vs. 5b (CSS shapes → uniform dot) head to head. **5a chosen**; includes the comparison verdict and the 5a hardening checklist |
| [11-decoration-lessons.md](11-decoration-lessons.md) | Accumulated cross-experiment findings (CSS cascade/box model, CodeMirror 6, Obsidian internals, verification discipline) — read before touching decorations or CM6 extensions |
| [12-decoration-follow-ups.md](12-decoration-follow-ups.md) | **Parking lot** for decoration work deliberately deferred: diagnosed gaps, mechanisms that work but have better shapes known, and design ideas. Items land here with enough diagnosis that picking one up later needs no re-discovery |
| [13-selection-follow-ups.md](13-selection-follow-ups.md) | The same, for selection: what `selection-as-subtree-set`, `node-selection-extension` and `selection-aware-structural-ops` left open — modal block selection, cherry-picking, and moving a node into its parent's sibling |
| [14-experiment-position-indicators.md](14-experiment-position-indicators.md) | Experiment: showing where the cursor sits in the outline — guide and marker highlighting, the axes they split on, and what real use settled |
| [15-enter-and-shift-enter-catalogue.md](15-enter-and-shift-enter-catalogue.md) | Measured catalogue of Enter / Shift+Enter across 49 cursor positions, the ten defects it found, and what the `enter-and-shift-enter-grammar` change did with each. A **pre-change** record: read the specs for current behavior |
| [16-native-list-decoration.md](16-native-list-decoration.md) | How Obsidian actually computes list geometry in Live Preview (public CSS variables, the `.cm-indent` quantizer, the cached hanging-indent measurement), what a measurement pass validated about retargeting it onto our own decoration grid, and the phased plan for bringing list decoration up to the level of the other kinds |
| [17-list-paragraph-mapping.md](17-list-paragraph-mapping.md) | **Open question** (Q34): should a list following a paragraph be that paragraph's child? The attachment rule's cost measured, the four candidate readings, what other formats and outliners do, why the indentation encoding is ruled out, and how to pick the question up |
| [18-structured-backlinks.md](18-structured-backlinks.md) | The structured-backlinks layer (README vision, Q10): prior art across Roam/Logseq/Tana/Orca and the three Obsidian attempts, what the public API does and does not permit (core backlinks have **no** public surface at all), and the seventeen design decisions taken against the interactive prototype — plus what is still open |
| [19-backlinks-footer-spikes.md](19-backlinks-footer-spikes.md) | **Hub** for the backlinks-footer spike series: ground rules (inherited from 07), the shared fixture corpus and what each fixture is diagnostic for, and the results table — including S1, which may veto the footer surface outright |
| [20-surfaces-and-embedding.md](20-surfaces-and-embedding.md) | Where the outline can be drawn and what each way costs: why the editor's chrome was not readily reusable, the seam between the two renderers, the public `getSectionInfo` route to reading mode, and the embedded-real-editor technique — **recorded, not proposed** — with the eight non-public touchpoints it needs and the README promise that decides it |
| [21-marker-text-gap.md](21-marker-text-gap.md) | The one measurement pass behind `--to-marker-gutter`: what each qualifying mark's ink actually reaches, why a multi-digit ordered number is excluded, the floor the one-space sizing rules already imposed on the stated gap, the argument for the gap that was chosen, and the three stale-value defects the derivation exposed |

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

## Decisions so far (2026-07-12, two alignment rounds)

1. **Architecture**: editor-centric — CM6 extensions in the standard markdown view + own side
   panes; 100% public API.
2. **Scope**: the **universal isomorphic outline view** — any markdown note maps onto a block
   tree (headings / paragraphs / lists / other blocks as nodes) and can be toggled into the
   outliner editing experience and back, losslessly. Not a list-only mode, not a vault takeover.
3. **Metadata**: native `^block-id` only on demand; collapse state in plugin data; clean files.
4. **v1**: small solid core (grammar + node selection + enforced invariants) implementing the
   **universal tree model from day 1** — smaller in features, not in model; fold persistence,
   zoom, structured backlinks, refs/mirrors as later layers.
5. **Mapping algebra**: every structural op writes the minimal markdown encoding of the new
   tree, or is rejected with gentle feedback when no encoding exists — never hidden state,
   never lossy conversion. Two regimes: **headings** = org-mode promote/demote (Tab/S-Tab is
   level ± 1, subtree shifts, tree re-derives from levels, reject only at h1/h6 bounds);
   **everything else** = reparent (child-of-previous-sibling / brother→uncle) with encoding
   recomputed from the new context (nearest-sibling type — so paragraphs round-trip and
   nested-list docs never flatten). A list after a paragraph is that paragraph's children
   (provisional); leaf blocks are atoms. Org-mode alignment/divergence:
   [05-org-mode-comparison.md](05-org-mode-comparison.md).
6. **Everything else**: build fresh (existing plugins as references only); interop/degradation
   guarantees are hard invariants; mobile-safe from day 1, desktop-tested for v1.0; vim out of
   scope v1; tasks are plain content v1; CM6-native undo v1; toggle state in plugin data.

All pre-planning questions are decided; Q10 (backlinks placement) was deferred as post-v1 and is
now answered in [18-structured-backlinks.md](18-structured-backlinks.md) — an in-document footer
first, sidebar pane later. Decision log: [04-open-questions.md](04-open-questions.md).

## Where this project starts from

- `../../openspec/` — OpenSpec (spec-driven development) scaffold, already initialized.
- `~/Code/tui-outliner-multiline` — the author's TUI outliner prototype (SpecKit-based).
  Its specs are a useful inspiration for behavior inventories (navigation, structural ops,
  zoom focus rules, undo/redo focus restoration, multiline nodes), with the caveat that its
  modal (vim-like nav/edit split) interaction model is TUI-specific and does **not** transfer
  to Obsidian, which is a direct-manipulation, always-editing environment.
