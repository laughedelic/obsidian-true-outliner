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
- **Nothing block-shaped enters a row**, images included — closing the `<img>` case the
  requirement already forbids in words.

**What a lineage row KEEPS is deliberately left open** as design D1, with two candidates and an
interactive comparison of all four options built against one corpus
(`docs/research/prototypes/lineage-rendering.html`). The two candidates differ in whether a
crumb may contain a live link, and that trades a real consistency argument against a real
competing-destination argument. Choosing it by reasoning is what produced the current
inconsistency.

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
- `styles.css` — the constraint on media inside a row.
- `tests/footer-model.test.ts`, `tests/zoom.test.ts`, `e2e/specs/73-footer-render.e2e.ts`,
  `e2e/specs/80-outline-zoom.e2e.ts`.
