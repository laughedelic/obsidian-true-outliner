## Why

Outline mode currently has no visual signal of its own: list items already show native
bullets, but heading and paragraph nodes — the whole point of the universal block-tree
model — render exactly like stock markdown. The first dev-vault verification round found
this is now the practical bottleneck: "with no bullets/indent chrome, outline mode is
hard to verify by eye in flat documents" (`docs/research/04-open-questions.md`), and flat
(paragraph-heavy) documents are precisely where the mapping algebra's paragraph-adjacency
rule needs to be seen to be trusted. Every structural op already works correctly; nobody
can see the tree they're editing.

## What Changes

- **Node chrome decorations**: a CM6 decoration layer, active only in outline mode (same
  per-keypress/per-render gating pattern as the keyboard grammar's `ModeSource`), that
  draws a kind-specific leader marker at the start of a node's first line. List items keep
  Obsidian's native bullet/number unchanged — their native marker already does this job.
  As implemented, every other kind (heading, paragraph, and each atom kind) gets its own
  distinct marker, gated by a user-configurable visibility setting, rather than being
  limited to paragraphs alone as first proposed here; see `design.md`'s D5 for how
  real-content review during implementation widened this from the original paragraph-only
  scope. Flat (paragraph-only) documents, the original dev-vault finding's motivating case,
  are covered as a special case of this broader mechanism.
- **Indentation guides by tree depth**: a vertical guide per ancestor level, computed from
  the node's position in the parsed tree — not from raw markdown indentation — so heading
  levels, list indentation, and paragraph adjacency (three different depth encodings) all
  read as one consistent visual hierarchy.
- Purely a rendering layer: `Decoration`/`ViewPlugin` only, via `registerEditorExtension`.
  Never edits the buffer, never changes `CachedMetadata`, no new file content, no new
  plugin-data state. Recomputes from the same `parse()` the grammar and commands already
  use, on the document changes CM6 reports (no separate polling/debounce mechanism).
- Outside outline mode, or on non-outline-mode files, decorations render nothing — the
  document looks byte-for-byte stock Obsidian, matching the existing "off-mode is stock"
  guarantee from `outline-mode` and `outline-keyboard-grammar`.
- Explicitly out of scope (later layers, per `docs/research/04-open-questions.md` Q4):
  fold chevrons and fold state/persistence, zoom/breadcrumbs, drag handles, node-selection
  highlight (needs the enforcement/selection layer first), any interactivity on the
  decorations themselves (click-to-select, click-to-fold) — this change is read-only
  chrome, not a new interaction surface.

## Capabilities

### New Capabilities
- `outline-decorations`: the CM6 decoration layer — which nodes get a marker, how tree
  depth maps to indentation guides across the three encodings (heading level, list
  indent, paragraph adjacency), the mode-gating and stock-when-off guarantee, and the
  non-mutating/no-reflow contract (decorations never alter document text, cursor
  position, or undo history).

### Modified Capabilities
(none — this consumes `document-tree-mapping`'s `parse()` as-is and follows the existing
mode-gating pattern from `outline-mode` / `outline-keyboard-grammar` without changing
either spec's requirements)

## Impact

- New code, as built: `src/plugin/decorate.ts` (pure depth/guide/marker-fact computation
  from an `OutlineDoc`, unit-testable without CM6) + `src/plugin/decorations.ts` (three
  `ViewPlugin`s — not `StateField`s, since the nested-editor guard needs `view`/DOM access a
  `StateField` doesn't have; see `design.md`'s "Nested-editor gating") registered in
  `main.ts` alongside `grammarExtension`, extending `ModeSource` into `DecorationSource`
  (adds `markerVisibility`).
- No changes to the mapping core (`src/parse.ts`, `src/ops.ts`, `src/model.ts`) — this is
  a read-only projection of the existing tree, not a new operation.
- No new dependencies — `@codemirror/view`'s `Decoration`/`ViewPlugin` APIs are already
  available (same package the keyboard grammar imports).
- Testing, as built: unit tests for the pure depth/guide/marker-fact computation
  (`tests/decorate.test.ts`, mapping-core-style, no CM6); e2e coverage in `e2e/specs/`
  combines full-corpus screenshots (both bundled themes) with DOM/computed-style assertions
  (`50-decorations.e2e.ts`, `51-guides-gradient.e2e.ts`, `52-block-markers-icons.e2e.ts`) —
  both proved necessary in practice, not an either/or: the experiment docs record several
  bugs a screenshot glance missed and a rect/computed-style assertion caught, and others the
  reverse, per the existing wdio-obsidian-service
  harness.
