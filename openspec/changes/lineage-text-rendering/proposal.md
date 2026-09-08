## Why

Two surfaces quote an ancestor chain — the backlinks footer's lineage rows and zoom's breadcrumb
trail — and both put the node's raw markdown source into the DOM. A crumb reads
`**Q3 planning** — *draft*`, and a footer lineage row reads
`see [the RFC](https://example.com/rfc-42)`, two pixels above a reference row that renders the
same syntax properly.

`backlinks-footer` already states the rule these surfaces are missing: "A row's content SHALL be
inline content only: links, emphasis, code spans, tags and math." That requirement is
implemented in `renderContent`, which only ever sees node rows. Nothing routes a lineage segment
through it, and nothing can: `LineageSegment` carries `text: string` — a bare string with no
render mode — so `lineage-row.ts` does the only thing a bare string permits, `appendText`.

Measurement (docs/research/24) found three further defects behind the two reported symptoms:

- **The trail leaks block syntax the footer strips.** `nodeLabel` calls `stripBlockPrefix`
  alone, so a callout crumb reads `[!tip] Field notes`, a table crumb `| owner | status |`, and
  a code-block crumb ` ```js `. The footer routes each of those kinds through its own stripper.
- **The two surfaces disagree about truncation.** `nodeLabel` marks a multi-line node with `…`;
  the footer's lineage segment does not. One shared rendering primitive, two rules.
- **An image embed renders at natural size inside a footer reference row**, with no CSS
  constraint on it — reproduction rather than notation, which is what D18 exists to rule out.

The root cause of all five is one split: "what does this node say" has two independent
implementations, `contentOf` in `footer-model.ts` (per kind) and `nodeLabel` in `node-text.ts`
(first line only). Zoom uses the second and inherited none of the first's rules.

## What Changes

- **One answer to "what does this node say."** The per-kind content rule moves out of
  `footer-model.ts` into `node-text.ts` beside `nodeLabel`, which becomes a caller of it. The
  trail gains the footer's callout, table and code stripping as a consequence rather than as a
  second implementation.
- **A lineage segment carries a render mode, not a bare string**, the same shape a node row's
  content already has — which is what gives the existing rule somewhere to apply.
- **`lineage-row.ts` renders segment text through the same path a node row uses**, with the
  renderer injected so the module stays DOM-only and free of the footer's `MarkdownRenderer` and
  `Component` plumbing.
- **Truncation becomes one rule**, applied wherever a chain element is quoted.
- **Nothing block-shaped enters a row.** Media is dropped to its alt text in a chain and bounded
  by the stylesheet in a reference row, closing the `<img>` case the requirement already forbids
  in words.

**What a lineage row keeps** is design D1, settled against the interactive comparison in
`docs/research/prototypes/lineage-rendering.html` and against Logseq, which solves the same
problem on the same two surfaces. A chain renders live — links and tags stay separately
activatable — and takes **no colour accent**, because in a dim context row the accent was the
loudest thing on the line. An underline present at rest, the platform's `alias` cursor for an
external link, and a hover that thickens the underline carry the affordance instead. A tag
takes a step of ink from the row's own colour and fills on hover. Media does not render in a
chain at all: a crumb is one line, and the alt text is what the node says.

## Capabilities

### Modified Capabilities

- `backlinks-footer`: the inline-content requirement is extended to say it governs EVERY row
  that quotes node text, lineage rows included, and to state the image case explicitly.
- `outline-zoom`: the crumb-label requirement gains the per-kind stripping rule and the same
  inline-content rule, so a crumb and a footer lineage segment naming the same node say the same
  thing.

## Impact

- `src/node-text.ts` — gains the per-kind content rule; `nodeLabel` becomes a caller.
- `src/plugin/footer-model.ts` — `contentOf` moves out; `LineageSegment` gains a render mode.
- `src/plugin/lineage-row.ts` — `appendText` becomes an injected renderer.
- `src/plugin/backlinks-footer.ts` — supplies its renderer; `renderContent` becomes shared.
- `src/plugin/zoom-trail.ts` — supplies a renderer, owning a `Component` across `toDOM` /
  `destroy`.
- `styles.css` — the subdued link, tag and cursor treatment for a lineage row, and the bound on
  media inside a reference row.
- `tests/footer-model.test.ts`, `tests/zoom.test.ts`, `e2e/specs/73-footer-render.e2e.ts`,
  `e2e/specs/80-outline-zoom.e2e.ts`.
