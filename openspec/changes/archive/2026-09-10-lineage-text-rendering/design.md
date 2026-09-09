## Context

D18 in docs/research/18 settled what a footer row's content looks like: the chrome carries
structure, and a row's content is inline markdown only. It was written about reference rows and
implemented for reference rows, and the two surfaces that quote an ancestor CHAIN were never
brought under it — the backlinks footer's lineage rows and zoom's breadcrumb trail both reach
the DOM through `appendText`.

docs/research/27 measures what that produces, per node kind, on both surfaces, in a live
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
- **Hover.** The colour shifts toward the text colour; no underline appears or changes. The
  segment's hover is the same shift, and it is the ONLY hover signal on the row — an underline
  there would be the one mark a link already owns, worn by a whole segment, which makes an
  ancestor look like a link and a link inside it indistinguishable from the segment carrying
  it. Underlines mean "link" on this row and nothing else.

A tag renders as a word with a little more ink than the row around it, filling on hover. Not as
a chip: a pill is a second object in a line that is one. Its colour is a step from the ROW's own
colour toward the text colour rather than a fixed token, because the footer's lineage is faint
and the trail's is muted — a token chosen for one leaves the tag invisible on the other.

A highlight is NOT muted, and that reverses what this decision first said. Muting it was tried
twice and broke twice, both times for the same reason: `--text-highlight-bg` already carries its
own alpha (`rgba(255, 208, 0, 0.4)` by default), so mixing it toward transparent compounds — 40%
resolved to 0.16 and read as no highlight at all — and a theme that leaves the token undefined
makes the whole `color-mix` invalid, which cancels the background outright. The prototype that
set the number used an OPAQUE swatch and had neither failure available to it.

So the footer draws the highlight itself, from a fixed low tint rather than from the theme.

`--text-highlight-bg` cannot be the source. Measured across four installed themes it is four
different things — undefined (so `<mark>` falls back to the browser's opaque `rgb(255,255,0)`),
fully transparent (Things, Cupertino: a highlight that renders as ordinary text, which is
exactly the "completely cancelled" reported from manual use), opaque and LIGHT (Catppuccin,
where light ink on it measures 1.14:1), and translucent yellow (the default and AnuPpuccin,
where it works). Nothing built on it behaves the same in all four, which is why this rule was
reported broken twice from two different themes. No theme styles `<mark>` inside our rows
either — bare, all four give black on yellow — so there is nothing here to defer to.

A fixed tint keeps the composited ground close to the row's own background, which is the ground
the theme already guarantees its own text colour against. A chain takes 40% of it and lifts its
ink besides, since a chain's text is faint enough that even a small tint erases it: measured at
full strength and unlifted, `--text-faint` over the default highlight is **1.01:1**, the floor.
Both numbers are set by a sweep rather than by taste, across five themes in both schemes. A
reference row needs the tint at **0.3** to clear **4.5:1**, the ratio WCAG asks of normal-size
text — at 0.4 it sat at 3.73:1, which is what an earlier pass shipped. At the chain's 40% of
that tint its ink has to travel **80%** of the way to the theme's normal text: 3.49:1 at 60%,
4.82:1 at 80%. Worst case across all ten combinations is **4.82:1** in a chain and **4.94:1** in
a reference row.

The 20% of the row's own colour left in the chain's ink is what keeps a highlighted run reading
as part of the chain rather than as the mention it leads to; a reference row uses the theme's
normal text and is brighter for it.

Two more rules come from the same measurements, and both generalise past the theme that
exposed them:

- **Emphasis in a chain carries weight, never colour.** Several themes draw `<strong>` in an
  accent — Catppuccin blue, Things pink — which is the accent problem arriving through a channel
  this design did not open, in the row whose whole job is to be quiet.
- **Nothing inside a row outgrows the row.** A size token is not guaranteed to be relative:
  Catppuccin sets `--tag-size` to an absolute `16px`, which made a tag larger than the reference
  row holding it. Sizes taken from tokens are capped against the row's own scale, keeping a
  theme's intent where it asks for something smaller.

A chain also reads at less than full size — a rule tried and removed before this change, on the
grounds that colour alone said "context" and a size compounded with the row's own. What changed
is what a chain CONTAINS: it now renders bold, links, code spans and tags, and carries weight
colour alone no longer offsets. Everything inside it scales with the chain rather than with the
row, so a tag in a chain is smaller than a tag in the reference below it rather than larger.

Zoom's trail is excluded from that size, and only from that. It is a header for the view rather
than context inside a card, and `outline-zoom` puts it level with the note it heads.

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

**The nested-target collision is accepted, and D8 is what bounds it.** A crumb is a
`role="link"`, and a live link inside it is a second destination. The cursor tells the reader
which one they are about to get before they click; D8 makes the click itself go to only one of
them. An earlier draft of this decision claimed the footer's existing `closest('a, button')`
guard already covered it — it does not, and D8 records why.

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

### D6. Rendering is async; the segment starts empty and fills, and that is free

`MarkdownRenderer.render` resolves after the row exists, and a CM6
`WidgetType.toDOM` must return synchronously. The footer already lives with this: rendered
content gets its own span, filled when the promise settles.

An earlier draft said the pending fallback was "the segment's plain text — which the parse
already produces". That is not available. D4 replaces `text` with `markdown` plus `render`, and
the only thing that turns markdown into plain text correctly is the parse itself, which is the
asynchronous step being waited on (D2). Deriving it synchronously would mean the regex stripper
D2 rules out, and showing the raw `markdown` in the meantime would flash exactly the source
characters this change exists to remove.

So the question was whether the empty-then-fill frame is short enough and rare enough to leave
alone, or whether the model has to carry a plain-text field cached at build time. Measured
rather than argued, Obsidian 1.13.7:

| | |
| --- | --- |
| One inline string through `MarkdownRenderer.render`, 30 samples | median **0.3ms**, p90 **0.7ms**, max **3.8ms** |
| Frames sampled with the trail mounted, crumb text empty | **0 of 40** |
| Trail widget rebuilds over 20 keystrokes inside the zoomed subtree | **0**, same DOM node throughout |

A render settles inside a single frame, an order of magnitude under one, so the empty state is
never painted; and the widget key (D9) means typing does not re-enter this path at all. **The
segment starts empty and fills on settle.** A cached plain-text field would be a cache for a gap
that does not exist, paid for by parsing in a view model that deliberately does no DOM work.

The measurement is worth keeping because it is the assumption that would break first: a future
segment carrying something heavier than one line of inline markdown — a transclusion, say —
would not settle in a frame, and the empty state would start showing.

### D7. A chain drops media; a reference row constrains it

Two different answers, because the two rows are different shapes.

In a **chain**, media does not render at all (D1): the serialiser keeps the alt text. A chain is
one line of dim context, and there is no size at which an image belongs in it.

In a **reference row**, media renders and the stylesheet bounds it. That row is a quotation of
the node, and an embed is part of what the node says — the defect there is only that it sets the
row's height, which is the stylesheet's question rather than the model's. Removing it in the
model would take a quotation's content away to fix a layout problem.

### D8. The activation guard belongs to the shared primitive, not to one surface

Once a segment can contain a link, a click on that link must follow the link and must NOT also
activate the segment around it. Nothing in the current code does that for both surfaces.

`renderLineageContent` dispatches `onActivate` unconditionally on click, and again on `Enter`,
with no look at the event target. The only guard that exists is in `BacklinksFooter.open` — a
ROW-level handler on the footer's own surface — so it never runs for zoom at all:
`ZoomTrailWidget`'s callback re-roots the view on whatever segment was passed to it. Today that
is harmless, because a segment holds only text. Under D1 it means clicking a link inside a crumb
follows the link AND re-roots the view, and pressing Enter on a focused inner link does the same.

The guard therefore moves into `lineage-row.ts`, beside the dispatch it guards, where both
surfaces get it from one implementation. It covers both events: `click` checks the target, and
`keydown` must too, since a rendered `<a>` is focusable and its own Enter bubbles to the
segment.

The footer's row-level guard stays where it is. It answers a different question — whether a
click anywhere in a ROW should open the source note — and a segment is not the only thing a
footer row contains.

### D9. The trail widget's key covers every field that changes its DOM

`ZoomTrailWidget.eq()` compares a key built from segment TEXT alone. Under D4 a segment also
carries `render`, and the marker already depends on `kind`, `task` and `ordinal` — none of which
are in the key. Two states that differ only in those fields compare equal, so CM6 keeps the old
DOM: toggling a task ancestor's checkbox leaves the old marker, and a node whose kind changes
keeps the old glyph. The `render` field makes it worse, since the same text can go from plain to
rendered.

The key becomes every render-relevant field of every segment. Node IDs stay OUT of it, and that
exclusion is not an oversight — `zoom-trail.ts` already records why: `model.ts`'s global counter
hands out fresh IDs on every reparse, so keying on them would rebuild the widget on every
keystroke, and the activation handler resolves an ancestor by its POSITION for the same reason.

This is a pre-existing defect that D4 widens rather than creates, which is why it is stated here
rather than left to the implementation to notice.
