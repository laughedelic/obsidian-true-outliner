# Lineage text: what the two ancestor-chain surfaces actually render

D18 (in [18-structured-backlinks.md](18-structured-backlinks.md)) settled how a footer row's
content becomes DOM: **the chrome carries structure, and a row's content is inline markdown
only**. That decision was implemented for reference rows and never reached the two surfaces
that quote an ancestor *chain* — the backlinks footer's lineage rows and zoom's breadcrumb
trail. Both put the node's raw source into the DOM.

Reported from real-vault use on 2026-09-08: a trail crumb showing `**some text**` with its
asterisks, and footer lineage showing external-link syntax that made the line unreadable. This
note records what a measurement pass found, which is more than the two reports.

**Measured 8 September 2026**, Obsidian 1.13.7 (installer 1.5.8, macOS). Two passes: a unit dump
of `buildRows` and `nodeLabel` over a synthetic note covering every node kind, and two throwaway
e2e specs reading the live DOM out of a running Obsidian.

## What each surface does today

| Surface | Path | Inline markdown | Block syntax |
| --- | --- | --- | --- |
| Footer node row — prose, heading, quote, list, table, callout | `MarkdownRenderer.render` | **rendered** | stripped per kind |
| Footer property row | `MarkdownRenderer.render` | **rendered** | n/a |
| Footer node row — code | `<code>` text | verbatim, by D18 | n/a |
| Footer node row — html | `setText` | tags stripped, wikilinks reduced to text, by D18 | n/a |
| **Footer lineage segment** | `appendText` | **verbatim** | stripped (`stripBlockPrefix`) |
| **Zoom trail crumb** | `appendText` | **verbatim** | **`stripBlockPrefix` only** |

Live DOM, one footer lineage row (SVG markers elided):

```html
<span class="to-backlinks-seg" role="link">work **bold** [ext](https://example.com) *em*</span>
<span class="to-backlinks-seg" role="link">Aurora ~~old~~ ==hot== ![shot](https://example.com/a.png)</span>
```

Directly beneath it, in the same card, the reference row that chain leads to:

```html
<span>leaf mentions <a class="internal-link">Aurora Dashboard</a>
      with <img alt="shot" src="https://example.com/a.png">
      and <a class="external-link">ext</a></span>
```

The reference row renders; the lineage above it does not. That contrast is why the defect reads
as a defect rather than as a deliberately quieter treatment — the two rows sit two pixels apart
and disagree about what a node's text is.

## Three findings the reports did not name

### The trail leaks block syntax the footer strips

`nodeLabel` calls `stripBlockPrefix` alone, while the footer routes each kind through
`calloutTextOf`, `tableTextOf` or `codeLineOf`. A trail crumb therefore keeps what a footer row
drops:

| Ancestor source | Footer row | Trail crumb |
| --- | --- | --- |
| `> [!tip] Field notes` | `Field notes` | `[!tip] Field notes` |
| `\| owner \| status \|` | `owner` | `\| owner \| status \|` |
| ` ```js ` | the fence's first real line | ` ```js ` |

A callout can hold children, so a callout ancestor is a crumb a real vault produces.

### The two surfaces disagree about truncation

`nodeLabel` appends `…` when a node has more lines than the one shown; the footer's lineage
segment does not. Same shared rendering primitive (`lineage-row.ts`), two rules, because the
text arrives already-stringified from two different places.

### An image embed renders at natural size inside a footer row

`![shot](…)` in a referencing node produces `<img>` in the row, and `styles.css` sets no
constraint on it. That is reproduction rather than notation — the thing D18 exists to rule
out — and it is the case that decides how much of "render the markdown" a one-line breadcrumb
can afford.

## Why the rule did not reach these surfaces

D18 is implemented in `renderContent` in `backlinks-footer.ts`, which only ever sees node rows.
Nothing routes a lineage segment through it, and nothing could: `LineageSegment` carries
`text: string` — a bare string with no render mode — so there is no field for the rule to live
in. `lineage-row.ts` then does the only thing a bare string permits, `appendText`.

Underneath that sits a second split. "What does this node say" has two independent
implementations: `contentOf` in `footer-model.ts`, which is per-kind, and `nodeLabel` in
`node-text.ts`, which is first-line-only. Zoom uses the second, which is how it inherited none
of the first's rules. `node-text.ts`'s own header already anticipated this — it exists because
`stripBlockPrefix` needed a second caller — but only the prefix rule moved, not the per-kind
table above it.

## The four candidate policies

All four go through the same parse. This matters: "strip it" is not a cheaper alternative to
"render it", because a regex inline-stripper is a second markdown parser and gets escapes,
nested emphasis and bracket-bearing code spans wrong. Taking `textContent` from a real parse is
the only correct way to reach plain text. One mechanism; the policy is a knob on its output.

| Policy | What survives | Cost |
| --- | --- | --- |
| `verbatim` | everything, as characters | what ships today |
| `plain` | text only | emphasis and structure a reader uses to recognise an ancestor are gone |
| `flattened` | emphasis, code spans, marks, tags; links and embeds collapse to their text | one click target per crumb; nothing block-shaped can enter a row |
| `live` | everything, rendered | a crumb gains a second, competing destination; images enter a one-line row |

The interactive comparison is [prototypes/lineage-rendering.html](prototypes/lineage-rendering.html),
which draws one corpus — emphasis, code spans, external links, wikilinks with and without
aliases, tags, highlights, strikethrough, an image embed, math, escaped asterisks, task and
ordered ancestors, and the three block-syntax leaks — under all four policies, per surface. It
opens in today's state so the defect is the first thing visible. Its inline parser is a
stand-in for `MarkdownRenderer`, written so the policies are comparable.

## What the comparison is for

The open decision is what lineage keeps, and it is genuinely a product call rather than an
implementation one. The argument each way, stated so the prototype can be read against it:

**For `flattened`.** A crumb is a `role="link"` whose whole purpose is re-rooting the view on
that ancestor. A rendered link inside it is a second destination competing with the first, and
the footer's existing `closest('a, button')` guard resolves that collision by letting the inner
link win — so the crumb quietly stops doing the one thing it advertises. Images have the same
problem in a blunter form: a one-line breadcrumb is not a place a 400px image can go.

**For `live`.** Consistency is the complaint being answered. A lineage row and the reference row
beneath it are both quotations of node text, and any difference between them has to earn itself.
`flattened` is a third rendering mode to specify, test and explain, on top of the two D18
already names.

Neither argument is settled by reasoning about it, which is what the prototype is for.

## Unaffected

Backlink filtering matches source-note NAMES, never row content (`footer-filter.ts`), so no
policy here changes what the search box finds.
