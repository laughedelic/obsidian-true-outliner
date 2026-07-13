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
  draws a leader marker at the start of every **paragraph** node's first line — the one
  node kind with no native visual leader at all. List items keep Obsidian's native
  bullet/number unchanged; headings keep their native `#`/typography; atoms (code, table,
  callout, quote, HTML, hr) already read as distinct blocks via their own chrome. Only
  paragraphs are invisible as tree nodes today, and flat (paragraph-only) documents are
  exactly where the dev-vault finding showed the gap.
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

- New code: `src/plugin/decorations.ts` (pure depth/marker computation from an
  `OutlineDoc`, unit-testable without CM6) + a thin `ViewPlugin`/ `StateField` adapter
  registered in `main.ts` alongside `grammarExtension`, reusing the existing `ModeSource`
  gate.
- No changes to the mapping core (`src/parse.ts`, `src/ops.ts`, `src/model.ts`) — this is
  a read-only projection of the existing tree, not a new operation.
- No new dependencies — `@codemirror/view`'s `Decoration`/`ViewPlugin` APIs are already
  available (same package the keyboard grammar imports).
- Testing: unit tests for the pure marker/depth computation (mapping-core-style, no CM6);
  e2e coverage extends `e2e/specs/` with a visual/DOM-inspection suite (query rendered
  decoration elements rather than screenshots) per the existing wdio-obsidian-service
  harness.
