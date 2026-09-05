# Zoom's hiding mechanism: the block-replace bet, measured before the design was built on it

`outline-zoom`'s design rests on hiding everything outside a subtree with two block-level
replace decorations (its D2). That is the shape of bet
[06](06-outline-decorations-postmortem.md) was written about — a visual mechanism assumed to
work, with the design built on top of it, and the assumption verified last. This time the
mechanism was verified first, and the change's task 1 was a gate: a negative verdict here would
have stopped it.

**Measured 3 September 2026**, Obsidian 1.13.7 (installer 1.5.8, macOS), against a throwaway
`zoom-spike.ts` registered ALONGSIDE the three established decoration sources and the backlinks
footer — composition was the question, not whether the primitive works alone. Driven from
`89-zoom-spike.e2e.ts`; screenshots in `.obsidian-cache/zoom-spike-screenshots/`.

## Verdict: the mechanism holds. One design claim did not.

Hiding, chrome, widgets and the panel all behave as D2 and D10 assumed. What failed is D2's
secondary claim that confinement would mostly come for free, and D12's first candidate fix for
the footer. Both are recorded below with what replaces them.

## What was measured

### Hiding works, and the boundary arithmetic is right

A span of four lines in the middle of a fourteen-line note rendered exactly those four lines;
content height fell from 770px to 589px. The lines outside are absent from the DOM, not hidden
in place — there is no leftover line box for them.

The artefact to look for was a stray empty line where a replacement ends. There is none, with
either range present or absent:

| Span | Rendered | Note |
| --- | --- | --- |
| lines 2–5 of 14 | `Mid`, ``, `- item`, `  - nested item` | both ranges present |
| line 0 only | `Top` | head range correctly omitted |
| lines 6–9, note with frontmatter | `Mid`, ``, `- item`, `  - nested item` | frontmatter hidden |

The formulation that produces this: the head range runs from offset 0 to the **start** of the
first visible line, and the tail range from the **end** of the last visible line to the document
end. Each therefore swallows the newline that would otherwise be left behind. Neither range is
emitted when empty — a zero-length block replacement is not a no-op, it is a block widget of
nothing.

> **Both sentences above are wrong, and the errors were found only after the feature shipped in a
> branch.** See [The boundary arithmetic was not right](#the-boundary-arithmetic-was-not-right-what-this-section-missed-and-why)
> at the end of this note. The stray-empty-line table stands; what it fails to catch is what the
> boundary costs the neighbouring line, which this section explicitly did not measure.

### Widget-rendered atoms are fine, inside and outside

A span containing only a callout rendered `callout: 1, cmLine: 0`; a span containing only a
table rendered `table: 1, cmLine: 0`. Atoms outside the span disappeared with everything else.

`cmLine: 0` is the correct render, not a failure: Obsidian replaces those lines wholesale, so
there is no `.cm-line` to count. The first run of this spike reported `[]` from a `.cm-line`
probe and looked like a total failure of the widget case. **The instrument was wrong, not the
mechanism** — worth remembering, because the same probe is the obvious one to reach for in the
real e2e spec.

### Visible lines keep their chrome exactly

A list item inside the span, measured unzoomed and again with everything else hidden:

```
cls="cm-line to-decor-list to-decor-marker-1sp to-decor-guides HyperMD-list-line HyperMD-list-line-1"
alignedLeft=446  marker=false  markerLeft=null  guides=true
```

Identical in both states — class list, shared column, guides. The block replacements compose
with the established decoration sources rather than displacing them.

Two harness constraints surfaced while measuring this, and both will bite the real e2e spec:

- With the caret **on** a line, Live Preview renders the raw source as a `.cm-line` *and* keeps
  the widget, so `getLineElementInfo` refuses the ambiguity. Park the caret elsewhere.
- A block decoration anchored at the **end of the last visible line** is attributed to that line
  by `posAtDOM`, so the span's own edges are not measurable through that helper at all. Measure a
  non-boundary line.

### `showPanel` renders in the markdown view (D10)

With the spike active: `.cm-panels` present, the panel's own element mounted at the top of the
editor, 24px tall, its text intact. With it inactive, neither exists. The breadcrumb panel has a
mechanism.

### The footer: D12's first candidate is impossible, the second works

| Trailing range | Footer present |
| --- | --- |
| none (span reaches the last line) | yes |
| to `doc.length` | **no** |
| to the final line's start | **no** |
| to `doc.length`, footer re-anchored to the visible end | **yes** |

The footer disappearing was predicted (D12) and is confirmed. What was not predicted is that
**shortening the range cannot fix it**. A document that ends with a newline has an empty final
line whose start *is* `doc.length`, so "stop at the last line's start" and "stop at the document
end" are the same position, and there is no position strictly inside the trailing range that
leaves an anchor at `doc.length` outside it.

So D12's option A is not a worse fix, it is not a fix. Option B — anchoring the widget at the end
of the visible range while zoomed — was measured as a mechanism question with a stand-in block
widget at that position, and it renders (screenshot `mixed-hidden.png`, "spike footer probe"
below the zoomed content). **That is the fix task 4.3 implements.**

### Confinement is NOT free — D2 was wrong about this

D2 claimed block replacement "takes the lines out of the layout and out of cursor motion, which
is most of the confinement guarantee for free". The first half is true. The second is false.

With lines 4–5 the only visible span:

| Gesture | Result | Verdict |
| --- | --- | --- |
| `ArrowDown` on the last visible line | caret → line 7 | **hidden line** |
| `ArrowUp` on the first visible line | caret → line 2 | **hidden line** |
| `Mod-A` ×3 | anchor (0,0) → head (13,0) | **the whole document** |

One honest qualification: outline mode's own motion handlers and select-all ladder are what
moved the caret here, and they know nothing about a scope. This measures "our own layers are
unconfined", not "CM6 is unconfined" — the two cannot be separated in this harness, because the
spike gates on outline mode and so do those handlers. Either way the conclusion for the change is
the same, and it is the one section 8 needed: **every confinement site is real work**, and none
of it can be assumed away.

Also measured, and unremarkable: the scroller stayed at `top: 0` with a coherent height after
hiding, so the scroll-position open question needs no explicit `scrollIntoView` for the ordinary
case.

## What the spike deliberately did not do

No anchor, no re-resolution, no scope, no re-basing. The span was whatever the e2e spec set.

`mixed-hidden.png` shows the consequence of the missing half plainly: the visible content keeps
the indentation and guide columns of its **unzoomed** depth, so `## Mid` and its list sit pushed
right with guide bars standing in for the ancestors that are no longer on screen. That is D9's
re-basing, and the screenshot is the argument for why it is part of the feature rather than
polish.

## Consequences for the change

1. **D2's mechanism: proceed.** Hiding, composition and boundary arithmetic all hold.
2. **D2's confinement claim: struck.** Section 8 is fully required; nothing is free.
3. **D12: settled on option B.** Option A is impossible for any document ending in a newline.
4. **D10: confirmed.** `showPanel` works here.
5. **D9: unchanged, and visibly necessary.**
6. Two harness facts for the real spec: park the caret before measuring a line, and never measure
   the span's boundary lines through `getLineElementInfo`.

## The boundary arithmetic was not right: what this section missed, and why

**Measured 5 September 2026**, same Obsidian, driven from a throwaway `99-zoom-probe.e2e.ts`
against the real feature rather than a spike. Reported as three symptoms — the zoom root had no
marker, a list root was indented and its bullet drawn small, and the trail's own mark sat off the
column every other top-level mark sits on.

### What the ranges were doing to the lines beside them

The zoom root rendered as a bare `.cm-line`. Not our chrome missing — *every* line decoration
missing, Obsidian's own included:

| | class list |
| --- | --- |
| unzoomed `- one` | `cm-line to-decor-list to-decor-marker-1sp to-decor-guides HyperMD-list-line HyperMD-list-line-1` |
| zoomed to `- one`, before | `cm-line` |
| zoomed to `- one`, after | `cm-line to-decor-list to-decor-marker-1sp HyperMD-list-line HyperMD-list-line-1` |

With `HyperMD-list-line` gone, Obsidian's own list rendering goes with it: the bullet run measured
23.4px of raw `- ` text instead of the styled 14px, and the line lost the `text-indent` /
`padding-inline-start` pair that hangs a bullet off its own column. Both reported symptoms are that
one class list.

The cause is decoration sort order. `Decoration.line` sorts at `-2e8`, **before** the position it
marks; `Decoration.replace({block: true})` defaults to an inclusive end, which sorts at `+2e8`.
The head range ended exactly ON the first visible line's start, so every point decoration anchored
there fell inside the replacement and was dropped.

The tail edge had the mirror defect and a worse consequence — it swallowed the whole line, not just
its chrome. Zooming to `# A` in `# A / (blank) / body / (blank) / # B` rendered three lines where
the cover has four: the cover's trailing gap, which D3 includes on purpose, was inside the range.

**The fix is one rule for both edges: a range spans exactly the lines it removes**, first hidden
line's start through last hidden line's end. The line break beside it is consumed as the block's
own boundary, so the no-stray-line results in the table above still hold.

### Two candidate fixes that do not work

- **`Decoration.replace({block: true, inclusiveEnd: false})`.** Sorts the end at `-6e8` instead, so
  a line decoration at that position survives. Measured: it rescues OUR line decorations and not
  Obsidian's — the root came back as `cm-line to-decor-list to-decor-marker-1sp` with no
  `HyperMD-list-line` — and it lets the tail range's last line escape as a stray empty line.
- **Filtering out zero-length ranges**, which this note recommended. A blank line has no character
  to cover, only a line; the head range for a document whose first line is blank IS zero-length,
  and a zero-length block replacement there **does** hide it. With the range filtered the blank
  line renders. Negative control run both ways. The claim is right at the document's END, where the
  same shape instead means there is nothing left to hide — but the reason is the position, not the
  length.

### The instrument, again

This note already records that `getLineElementInfo` refuses a line rendered by two elements, and
that a block decoration at a span's edge is attributed to that line by `posAtDOM` — so "measure a
non-boundary line". That advice is sound for the helper and it is exactly why the defect survived:
**the boundary lines are the ones the defect was on.** A helper that asks for the `.cm-line`
specifically measures them fine, and `80-outline-zoom` now carries one.

### The trail was being patched as if it were a line

Separate defect, same probe. `decorations.ts` patches every block-level child of `.cm-content`
from the document line `posAtDOM` attributes it to. That is right for a widget that RENDERS its
line and wrong for one that merely neighbours it: the trail took the zoom root's kind gutter, depth
guide and marker, so its row sat at 390 with its mark at 381.5 under a heading root and at 376/367.5
under a list one, against a top-level marker centred on 376 in both. It now carries
`to-decor-own-chrome` and takes only the theme's base line margin.
