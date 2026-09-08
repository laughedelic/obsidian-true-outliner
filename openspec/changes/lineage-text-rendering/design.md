## Context

D18 in docs/research/18 settled what a footer row's content looks like: the chrome carries
structure, and a row's content is inline markdown only. It was written about reference rows and
implemented for reference rows, and the two surfaces that quote an ancestor CHAIN were never
brought under it — the backlinks footer's lineage rows and zoom's breadcrumb trail both reach
the DOM through `appendText`.

docs/research/24 measures what that produces, per node kind, on both surfaces, in a live
Obsidian. The five defects it records all come from one structural fact: `LineageSegment` is
`{ text: string }`, so a lineage segment cannot be handed to `renderContent` even in principle,
and the two answers to "what does this node say" — `contentOf` per kind, `nodeLabel` first-line
— have drifted apart with only `stripBlockPrefix` in common.

## Goals / Non-Goals

**Goals:**

- One implementation of "what does this node say", called by every surface that quotes one.
- The existing inline-content rule applies to lineage rows, not only to reference rows.
- A crumb and a footer lineage segment naming the same node say the same thing.
- Nothing block-shaped, media included, can enter a row.

**Non-Goals:**

- Changing WHICH nodes appear in a chain, or how a chain collapses. That is D3–D5 and untouched.
- Changing what a crumb or a segment DOES when activated. Each surface owns its own action, and
  `lineage-row.ts` exists partly to keep that split.
- Reading-mode or embedded rendering of the footer.
- Backlink filtering, which matches source-note names and never row content.

## Decisions

### D1. What a lineage row keeps — open, with two candidates

Deliberately unresolved. Both candidates render through Obsidian's own parser; they differ only
in what they keep from its output, so the mechanism is settled and only the policy is not.

`docs/research/prototypes/lineage-rendering.html` draws one corpus — emphasis, code spans,
external links, wikilinks with and without aliases, tags, highlights, strikethrough, an image
embed, math, escaped asterisks, task and ordered ancestors, and the three block-syntax leaks —
under both candidates plus today's behaviour and a plain-text variant, on both surfaces.

**Option A — flattened.** Emphasis, code spans, highlights, strikethrough and tags render;
links and embeds collapse to their own text. A crumb is a `role="link"` whose entire purpose is
re-rooting the view on that ancestor, and a rendered link inside it is a second destination
competing with the first — one the footer's existing `closest('a, button')` guard resolves in
the inner link's favour, so the crumb quietly stops doing what it advertises. Images are the
same problem in a blunter form: a one-line breadcrumb is not a place an image can go. Cost: a
third rendering mode to specify, test and explain, alongside the `code` and `text` modes the
requirement already names.

**Option B — live.** A lineage row renders exactly as a reference row does. Consistency is the
complaint being answered, both rows are quotations of node text, and any difference between
them has to earn itself. Cost: the nested-link collision above is accepted rather than avoided,
and it is real — a chain of five ancestors can hold five competing destinations.

Whichever is chosen applies to BOTH surfaces. A crumb and a footer segment naming the same node
saying different things is the defect this change exists to remove, and reintroducing it along
a different axis would be worse than either option.

`plain` — text only — is measured in the prototype and not proposed. It answers the reports but
throws away the emphasis a reader uses to recognise an ancestor, and it costs no less than the
other two: reaching correct plain text still means parsing.

### D2. One parse; the policy is a serialiser over its output

A regex inline-stripper is a second markdown parser, and it gets escapes, nested emphasis and
bracket-bearing code spans wrong. Every option above therefore runs
`MarkdownRenderer.render` once and decides what to keep from the result — plain text is
`textContent` of a real parse, flattening is unwrapping the elements a crumb must not contain.

This is also why D1 can stay open past implementation of everything else: the mechanism is the
same under either answer, and the policy is one function over a rendered fragment.

### D3. The per-kind content rule moves to `node-text.ts`

`contentOf` in `footer-model.ts` answers "what does this node say" per kind — callout title
minus its `[!type]`, the table cell, the fence's line, prose joined. `nodeLabel` in
`node-text.ts` answers the same question with `stripBlockPrefix` alone. The second is what zoom
calls, which is why a callout crumb still reads `[!tip] Field notes`.

`node-text.ts` already exists for exactly this reason — its header records that
`stripBlockPrefix` moved there when a second caller appeared — so the rest of the rule follows
the same path. `nodeLabel` becomes a caller: per-kind content, first line only, kind-label
fallback, ellipsis when there is more.

Not the reverse direction. Moving `nodeLabel` into `footer-model.ts` would make zoom depend on
the footer's view model for its breadcrumbs, which is the coupling `node-text.ts` was created to
avoid.

### D4. `LineageSegment` carries a render mode

`text: string` becomes `markdown: string` plus the existing `RowRender`, the same pair a node
row's content already carries. Without this there is no field for D1's answer to live in, and
`lineage-row.ts` has no choice but `appendText`.

The `code` and `text` modes reach a segment too: a fenced-code ancestor's crumb is monospace,
and an HTML-block ancestor's is plain text, for the reasons the requirement already gives
(Obsidian does not resolve wikilinks inside an HTML block, so rendering one would only pretend
to).

### D5. The renderer is injected into `lineage-row.ts`

`lineage-row.ts` is DOM-only by design — it renders a row's look and knows nothing about what a
segment does when activated, because the two surfaces disagree about that. Importing
`MarkdownRenderer` and a `Component` there would give it an Obsidian dependency and a lifecycle
it has no way to own.

So the renderer arrives as an option, beside the `marker`, `glyph` and `separatorGlyph` hooks
already there. The footer passes its existing one. `ZoomTrailWidget` creates a `Component` in
`toDOM` and unloads it in `destroy`, which is the lifecycle CM6 already gives a widget — not the
plugin's own `Component`, which would hold every trail ever built until unload.

### D6. Rendering is async; the row is built synchronously

`MarkdownRenderer.render` resolves after the row exists. The footer already handles this by
giving rendered content its own span and filling it when the promise settles, and the trail
widget does the same: `toDOM` returns a complete row whose segment texts fill in immediately
after. A crumb that is briefly empty is not acceptable, so the fallback while the promise is
pending is the segment's plain text — which the parse already produces.

### D7. Media is constrained in CSS, not removed in the model

An image that reaches a row under option B is bounded by the row's own line height rather than
stripped out. The model says what a node says; how much room a row gives it is the stylesheet's
question, and the same constraint then covers reference rows, which have the defect today.
