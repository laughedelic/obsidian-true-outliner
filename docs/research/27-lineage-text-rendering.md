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

### The trail's naming rule had drifted from the footer's — latently

`nodeLabel` called `stripBlockPrefix` alone, while the footer routed each kind through
`calloutTextOf`, `tableTextOf` or `codeLineOf`. Called on the same node the two disagreed:

| Ancestor source | Footer row | `nodeLabel` |
| --- | --- | --- |
| `> [!tip] Field notes` | `Field notes` | `[!tip] Field notes` |
| `\| owner \| status \|` | `owner` | `\| owner \| status \|` |
| ` ```js ` | the fence's first real line | ` ```js ` |

**Not reachable through either surface today, and that is worth stating plainly** rather than
leaving the table to imply otherwise. A crumb and a footer lineage segment are both ANCESTORS,
and in this model an atom kind never has children: `parse` gives a callout its inner lines as its
own lines, and a list following a fence or a table is that block's sibling, not its child
(measured). So a callout, table or code block cannot be an ancestor, and none of the divergence
above can appear on screen.

What the drift was, then, is a second implementation of one rule, agreeing with the first only
by not being reachable — which is the state a change to the tree model would have ended without
warning. Unifying them is the fix whether or not the symptom was visible; claiming a visible
symptom would not be.

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

## The candidate policies

All go through the same parse. This matters: "strip it" is not a cheaper alternative to
"render it", because a regex inline-stripper is a second markdown parser and gets escapes,
nested emphasis and bracket-bearing code spans wrong. Taking `textContent` from a real parse is
the only correct way to reach plain text, and dropping media means removing elements from a real
fragment. One mechanism; the policy is a serialiser over its output.

| Policy | What survives | Verdict |
| --- | --- | --- |
| `verbatim` | everything, as characters | what ships today |
| `plain` | text only | rejected — loses the emphasis a reader uses to recognise an ancestor, at no saving |
| `flattened` | emphasis, code spans, marks, tags; links and embeds collapse to their text | rejected — an ancestor's links are part of what it says |
| `subdued` | everything live, drawn without colour accent; no media | **chosen** |
| `live` | everything, rendered with the theme's accents | rejected — the accent out-shouts the reference the chain leads to |

[prototypes/lineage-rendering.html](prototypes/lineage-rendering.html) draws one corpus —
emphasis, code spans, external links, wikilinks with and without aliases, tags, highlights,
strikethrough, an image embed, math, escaped asterisks, task and ordered ancestors, and the
three block-syntax leaks — under all five, on both surfaces. Its inline parser is a stand-in for
`MarkdownRenderer`, written so the policies are comparable.

## What settled it

Logseq renders both of these surfaces — its zoom breadcrumb and its linked references — and
takes essentially the `live` route with the colour removed. That is the resolution neither of
the two candidates we had reached, and it dissolves the argument between them.

The disagreement was over whether a crumb may contain a live link. `flattened` said no, because
a crumb is a `role="link"` and an inner link is a second destination competing with the first.
`live` said yes, because an ancestor's links are part of what that ancestor says, and both rows
are quotations. Both are right, and the collision they argue about is a *legibility* problem
rather than a structural one: nothing about a themed link inside a dim chain tells the reader
which of the two targets is under the pointer. Give that its own channel and the objection goes.

So the treatment is:

| | |
| --- | --- |
| **Colour** | none. Links and tags take the row's own colour, which is what keeps a chain reading as context |
| **Link, at rest** | underlined, so it is findable without hovering to discover it |
| **Hover** | colour shifts, nothing underlines. The segment's hover is the same shift and the row's only hover signal — an underline there is the mark a link owns, and a segment wearing it reads as one big link |
| **Cursor** | `alias` (the platform's curled arrow, "this leaves here") on an external link; `pointer` on an internal one and on the crumb itself |
| **Tag** | a step of ink from the ROW's colour toward the text colour, filling on hover. Not a chip — a pill is a second object in a line that is one |
| **Highlight** | muted toward transparent, hue kept. At full strength it is the loudest mark on a dim line — the accent problem again, in the one channel that is only colour |
| **Media** | not rendered in a chain at all; the segment keeps the alt text |

The tag colour is `color-mix` on `currentColor` rather than a token, and that is not a
refinement. Measured in the prototype: the footer's lineage sits at `--text-faint` and the
trail's at `--text-muted`, so a fixed token picked for one leaves the tag invisible against the
other. Relative to the row, both resolve — footer `rgb(141,148,159)` → tag `rgb(89,94,103)`,
trail `rgb(91,100,112)` → tag `rgb(62,68,77)`.

A reference row keeps its highlight at full strength: it is a quotation, not context. The
prototype's highlight example now carries one in both rows, one line apart, so the two
intensities can be read against each other rather than described.

Media is the other thing a chain does not inherit from a reference row. A reference row keeps its
embed, bounded by the stylesheet, because that row is a quotation and the embed is part of what
the node says; a chain is one line of context, and there is no size at which an image belongs in
it. Alt text rather than nothing, because a segment emptied of its only content is blank and
therefore unclickable — the failure the empty-label fallback already exists to prevent.

## Unaffected

Backlink filtering matches source-note NAMES, never row content (`footer-filter.ts`), so no
policy here changes what the search box finds.
