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
