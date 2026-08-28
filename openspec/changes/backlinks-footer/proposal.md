## Why

Obsidian's core backlinks show a matched *line*. Everything an outliner needs to make a
reference useful — where the referencing node sits in its note's tree, and what hangs off it
— is absent, and no plugin in the ecosystem supplies it without monkey-patching core panes.
The plugin already owns a lossless block tree for every note and a pure decoration layer over
it; structured backlinks is the first feature that turns that model outward, showing *other*
notes' structure inside this one.

This is the layer named in the README's vision and deferred as post-v1 in
`docs/research/04-open-questions.md` Q10. The design round that precedes it is recorded in
`docs/research/16-structured-backlinks.md` (D1–D17), which this change implements the core of.

## What Changes

- **A backlink index.** A reverse map built from each file's `CachedMetadata`, kept fresh on
  the metadata and rename events, plus a per-file cache of parsed source trees keyed on
  path + mtime. Nothing here reads private API; `getBacklinksForFile` is not public and is not
  used.
- **Pruned tree projection in the mapping core.** A pure function over `OutlineNode`: keep the
  root-paths that reach a matching node plus each match's own children, then squash
  single-child runs into lineage chains — recursively, so every sub-branch squashes on its own
  (D3, D4). Lives beside `select-extend.ts`/`escalate.ts` and is unit-testable with no editor.
- **An in-document footer** below the note in the editing view, rendering each referencing
  note as a card: lineage line, the referencing node, one level of children with deeper
  subtrees behind the outline's own fold chevron (D6, D7).
- **Reuse of the existing decoration layer, not a second renderer.** The footer derives its
  chrome from the same `decorate(doc): LineDecorationFact[]` the editor uses, fed the projected
  tree. Depth, kind, marker, guide columns and atom/list-item handling come from one place.
- **A spike series** (`docs/research/17-*`) run before the footer is built, following the
  ground rules of the decoration-experiments series: isolated prototypes, a shared fixture
  corpus, a mandatory real-vault pass, verdicts recorded before moving on.
- Read-only. No editing of referencing blocks, no writes to other files (D2).
- Not in this change: filter chips, sort, volume caps, the incompleteness cue, settings, the
  core-backlinks coexistence toggle. Those are `backlinks-controls`.
- Not in this change: the sidebar pane, node-scoped references, unlinked mentions (D1, D13, D16).

## Capabilities

### New Capabilities

- `tree-projection`: the pure pruning-and-squashing algebra over `OutlineDoc` — which nodes a
  projection keeps, how lineage chains form and where they split, and the guarantees the result
  carries (document order, no synthesised nodes, idempotence).
- `backlink-index`: what counts as a reference to a note (link, anchor, embed, property), how
  the reverse index is built and invalidated from public metadata APIs, and the freshness and
  cost guarantees it offers its consumers.
- `backlinks-footer`: the in-document footer surface — when it renders, what a group and a row
  are, how lineage and descendants are presented, what a click does, and how it behaves while
  results are still resolving.

### Modified Capabilities

- `outline-decorations`: the decoration facts are currently produced for, and consumed by, the
  editor alone. This change makes `decorate()` a shared source of truth with a second consumer
  outside the CM6 line DOM, which changes what the capability guarantees about its output's
  independence from the editor surface.

## Impact

- **New**: projection module in `src/` (mapping core, pure); backlink index and footer modules
  under `src/plugin/`; a research doc for the spike series.
- **Modified**: `src/plugin/main.ts` registration; `styles.css` — every decoration selector is
  currently scoped `.markdown-source-view.mod-cm6 .cm-content > .cm-line.to-decor-*`, and the
  footer's rows are not `.cm-line`s, so the chrome needs splitting into surface-neutral tokens
  plus surface-specific scoping.
- **Risk, and the reason for the spike series**: the footer is a CM6 block widget at
  `doc.length` inside an editor already governed by `content-space-caret`,
  `progressive-select-all`, `caret-placement-policy` and the transaction filter. If those
  cannot coexist, the surface decision (D1) reopens — which is why the spike runs first and
  can veto the rest of the change.
- **Public APIs only**: `getFileCache`, `parseLinktext`, `getFirstLinkpathDest`,
  `cachedRead`, `MarkdownRenderer.render`, `openLinkText`, `registerHoverLinkSource`,
  `registerEditorExtension`. No monkey-patching, no `any`-casts into internals.
