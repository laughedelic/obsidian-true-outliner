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

### D1. A lineage row renders live, and takes no colour accent from it

Settled against `docs/research/prototypes/lineage-rendering.html` and against Logseq, which
solves the same problem on the same two surfaces.

A lineage row's content renders as inline markdown in full. Links stay live and separately
activatable, and so do tags — a chain is made of real nodes, and their links are real links.
What changes is that **none of it takes a colour accent**. In a lineage row the accent was the
loudest thing on the line: a chain is dim on purpose, and a theme-coloured link inside it
out-shouts the reference the chain leads to.

Three channels carry the affordance instead, none of which spends colour:

- **An underline, present at rest.** A link that only reveals itself under the pointer is a link
  the reader has to go looking for. It is drawn in the row's own colour.
- **The cursor.** An external link takes the platform's `alias` cursor — the curled arrow that
  already means "this leaves here" — and an internal one takes `pointer`, the same as the crumb
  around it. This is the channel that distinguishes the two destinations at zero cost in ink.
- **Hover.** The underline thickens; the colour does not move. A link dimmed relative to the
  words beside it would be an affordance hiding from the pointer.

A tag renders as a word with a little more ink than the row around it, filling on hover. Not as
a chip: a pill is a second object in a line that is one. Its colour is a step from the ROW's own
colour toward the text colour rather than a fixed token, because the footer's lineage is faint
and the trail's is muted — a token chosen for one leaves the tag invisible on the other.

**Media does not render in a chain.** A crumb is one line, and an image is not text. Its alt
text is what the node says, so the segment keeps that; dropping it outright can leave a crumb
blank and therefore unclickable, which is the failure the empty-label fallback exists to
prevent. This is the one thing a chain does not inherit from a reference row, and it is a
property of the row's shape rather than a second rendering policy.

**Rejected, recorded.** `flattened` — links collapsed to their text — was the alternative and
loses more than the nested-target collision costs: an ancestor's links are part of what that
ancestor says, and a chain that quietly removes them misquotes it. `plain` answers the reports
and throws away the emphasis a reader uses to recognise an ancestor, at no saving, since
reaching correct plain text still means parsing.

**The nested-target collision is accepted and bounded.** A crumb is a `role="link"`, and a live
link inside it is a second destination. The footer's existing `closest('a, button')` guard
already resolves this the right way — the inner link wins where the pointer is actually on it,
the crumb wins everywhere else — and the cursor tells the reader which one they are about to
get before they click. What made this a real risk under an unstyled render was that nothing
distinguished the two; the cursor is that distinction.

### D2. One parse; the policy is a serialiser over its output

Every candidate in D1, the rejected ones included, runs `MarkdownRenderer.render` once and
decides what to keep from the result. A regex inline-stripper would be a second markdown parser,
and it gets escapes, nested emphasis and bracket-bearing code spans wrong — reaching correct
plain text means `textContent` of a real parse, and dropping media means removing elements from
a real fragment.

So D1's answer is one function over a rendered fragment, and the same mechanism serves both
surfaces. What a chain keeps is a policy, not a parser.

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

### D7. A chain drops media; a reference row constrains it

Two different answers, because the two rows are different shapes.

In a **chain**, media does not render at all (D1): the serialiser keeps the alt text. A chain is
one line of dim context, and there is no size at which an image belongs in it.

In a **reference row**, media renders and the stylesheet bounds it. That row is a quotation of
the node, and an embed is part of what the node says — the defect there is only that it sets the
row's height, which is the stylesheet's question rather than the model's. Removing it in the
model would take a quotation's content away to fix a layout problem.
