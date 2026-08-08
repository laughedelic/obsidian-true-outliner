# Experiment: position indicators (current node + ancestor trail)

Findings behind the `hierarchy-position-indicators` change: an accent on the node the caret
sits in, and an accented trail along that node's ancestor chain. The change's design.md rests
on two bets about DOM we do not own; this doc records what the live probe found, since both
answers changed what got built.

Probe setup: the e2e harness (Obsidian 1.13.4, installer 1.5.8, bundled theme, default vault
settings — `showIndentGuide: true`), a note of `# Section` / paragraph / a four-level nested
list, outline mode on, measurements taken with the caret parked on the heading (every list
marker in its rendered form) and again with the caret on the deepest list line.

## Finding 1: a list item's bullet element survives the caret sitting on its line

The design flagged this as the change's sharpest hazard. `docs/research/13` established that a
list marker's round bullet comes from a `.list-bullet` span present only in the marker's
*hidden* form, and that revealing the raw markup swaps it for plain `"- "` text — so the one
line the current-marker accent most wants to reach might not have a bullet at all.

**The hazard does not apply to a plain caret.** With the caret directly on the deepest list
line (`cm-active` present on it), the line's own markup is unchanged:

```html
<span class="cm-hmd-list-indent cm-hmd-list-indent-3">…</span>
<span class="cm-formatting cm-formatting-list cm-formatting-list-ul cm-list-1"
 ><span class="list-bullet">-</span> </span>
<span class="cm-list-1">four</span>
```

`.list-bullet` is still there, and its `::after` still carries the visible dot
(`background-color: rgb(102, 102, 102)`). Doc 13's swap belongs to the *block-selection*
reveal path, which is a different state — and one where position indicators are suppressed
anyway (design decision 2). So the current-marker accent targets `.list-bullet::after`
directly, with no dual-form handling: the fallback the spec allows for is not needed here.

The spec's "whichever form is currently mounted" wording stays as written — it costs nothing
and keeps the contract honest if a future Obsidian reveals more aggressively.

## Finding 2: `.cm-indent` spans are paintable, but their native guide column is not the parent
bullet's column

(Finding 3 below revises this one: the spans do not correspond to list levels at all. This
section's measurements stand; the conclusion drawn from them at the time does not.)

`.cm-indent` spans are emitted inside a `.cm-hmd-list-indent` wrapper, and their widths *are*
native rendered widths — which looked, from this fixture alone, like it meant a list-level accent
could be positioned with no measurement of Obsidian's list metrics. This fixture used 4-space
indentation throughout; finding 3 shows that is what made the mapping look one-to-one.

Measured columns, relative to `.cm-content` (list under a depth-0 heading, so every list line
also carries our own `supplementalDepth × unit` margin):

| list level (1-based) | `.cm-indent` spans | span lefts        | bullet left |
| -------------------- | ------------------ | ----------------- | ----------- |
| 1                    | 0                  | —                 | 60          |
| 2                    | 1                  | 48                | 96          |
| 3                    | 2                  | 48, 84            | 132         |
| 4                    | 3                  | 48, 84, 120       | 168         |

Every span is 36px wide, so span `k` occupies `[48 + 36k, 84 + 36k]` and level `m`'s bullet
sits at `24 + 36m`.

Two consequences:

- **The spans are paintable.** Injecting `border-left: 2px solid red` plus a non-empty
  `content` on `.cm-indent::before` renders — no specificity fight, no containment problem.
  The native `::before` is already `position: absolute` with a zero-width-space `content`, so
  the hook is real rather than something we have to construct.
- **Obsidian's own guide column is not where a trail segment wants to draw.** The native `::before`
  computes to `left: 36px` — the span's *right* edge, i.e. `84 + 36k` absolutely — while the
  ancestor bullet that a trail segment should descend from sits at `60 + 36k`. The offset
  between them is constant (`12px` here: the bullet's own offset inside its level's slot), but
  it is a theme-dependent metric, not a constant to hardcode — the same trap `nativeMarginBasePx`
  and the table widget's native padding already taught this codebase to measure rather than
  assume.

Also worth recording: with `showIndentGuide: true`, the bundled theme's `.cm-indent::before`
computes to `border-left: 0px rgba(0, 0, 0, 0)` — the native indent guide draws nothing here.
So an accent on these spans cannot be described as "highlighting the native guide"; it is our
own line, merely positioned by native geometry.

## Finding 3: there is no per-level list step to draw against (second probe)

The deferred plan below originally assumed the `.cm-indent` spans could carry a per-level accent,
since span `k` would be list level `k`. A second probe, measuring several indentation styles,
shows that assumption is wrong twice over.

Bullet columns and `.cm-indent` counts, measured on three-level lists:

| markdown indentation | bullet columns | `.cm-indent` spans per line |
| -------------------- | -------------- | --------------------------- |
| 4 spaces             | 12, 48, 84     | 0, 1, 2                     |
| tab                  | 12, 48, 84     | 0, 1, 2                     |
| 2 spaces             | 12, 20, 48     | 0, **0**, 1                 |

Two consequences, both fatal to the cheap approaches:

- **`.cm-indent` count is not the list level.** With 2-space indentation a genuine level-2 item
  emits *zero* spans — Obsidian renders the literal whitespace and only produces a span once it
  reaches a full unit. So "style the k-th span" does not mean "style the k-th ancestor", and any
  `nth-child` scheme silently targets the wrong level exactly where indentation is narrow.
- **There is no constant step to measure.** 4-space nesting steps by 36px per level; 2-space
  nesting steps by 8px then 28px. The columns track the rendered width of whatever whitespace the
  file actually contains, which can differ per level within a single list. So publishing a
  measured `origin`/`step` pair as CSS variables — the approach that would have let our existing
  gradient draw at native columns with two live measurements — cannot be correct in general
  either.

What remains is per-item measurement: read each list item's own already-rendered bullet position
(`view.coordsAtPos`/element rects) and draw from that. That is precisely obsidian-outliner's
technique, and precisely what Experiment 2a did before 2b replaced it with the measurement-free
gradient — so closing this means running a *second* rendering mechanism alongside the first, not
extending the first.

## Finding 4: an ordered list item's marker is a different element

`.list-bullet` covers bulleted items only. An ordered item renders `<span class="list-number">1. </span>`
— literal text taking `color`, where a bullet's dot is a `::after` background. The first version of
the marker accent targeted only `.list-bullet`, so it silently did nothing on every numbered list,
and "no accent" is indistinguishable from "not the current node" by eye. Found by probing the DOM,
not by a test. Both elements are now targeted, with an e2e case pinning the ordered one.

## Finding 5: a marker sits at its line's CONTENT-box top, not at half the row

The `path` style's arriving segment covered the upper 50% of its row, which read inconsistently:
on a heading it stopped just above the marker, on a paragraph it ran past it. Measuring both says
the two use entirely different anchors.

| row kind  | `padding-top` | icon center from row top | 50% of row |
| --------- | ------------- | ------------------------ | ---------- |
| paragraph | 0px           | 6.8px                    | 12.0px     |
| heading   | 16px          | 22.8px                   | 22.0px     |

A marker's TOP edge sits exactly at its line's content-box top — measured across paragraph,
quote, code fence, and H1–H4, `iconTop === padding-top` in every case. So its center is
`padding-top + iconSize / 2`, while 50% is half a row that *includes* that padding. The two agree
nowhere; they merely happen to come close on a padded heading, which is why the paragraph case
looked like the wrong one.

Fixed with no measurement at runtime: the guide overlay inherits its line's own `padding-top`
(a pseudo-element inherits from the element that originates it), and the arriving layer alone
draws from the `content-box` origin at exactly half an icon tall. Every other layer names
`padding-box` and keeps its full-row height, so guide continuity through that same padding is
untouched. Verified live: the painted stop now lands on the icon's center to within 0.0px on both
padded and unpadded rows.

The e2e that pins this reads the layer's resolved `background-origin` and the pseudo-element's OWN
`padding-top`, not the line's. An earlier version derived the stop from the line's padding and
therefore passed with the inheritance removed — a false-confidence test of exactly the kind the
postmortem warns about, caught by mutating the fix and seeing nothing fail.

## What this means for the change

- The current-marker accent (finding 1) and the `guides` trail need nothing from any of this:
  guides in this model are owned exclusively by non-list ancestors, so the `guides` style is
  complete without touching a single native list element.
- The `path` style's segments through **non-list** levels ride on our own guide columns, which
  the decoration layer already computes exactly.
- Segments through **list** levels are the part that needs finding 2's geometry, plus a live
  measurement of the bullet-inside-slot offset. They are deliberately NOT built — see "Deferred"
  below. Their ancestors' BULLETS are accented regardless (finding 1 makes that free), so the
  levels stay legible even where no line can be drawn.

## What shipped, and how the two styles compare

Both styles were rendered side by side on a note with two heading levels, a nested list, and a
sibling section, with the caret in the third-level heading.

**`guides`** (the default) accents each ancestor's guide along its whole length. It reads
immediately and needs no explanation — but it is also literally a long line: a top-level
ancestor's guide spans the entire document, including every sibling subtree *below* the caret,
because those are still inside that ancestor. In a long note that is a lot of accented pixels
for a fairly small amount of information. The trade-off the design predicted is real, and it is
the reason the second style exists rather than being a refinement of the first.

**`path`** accents only the part of each ancestor's guide that leads to the caret, and accents
every ancestor's marker along the way. Nothing is accented above the root, below the caret, or in
any sibling subtree — the accented pixels are exactly the route. It is a stronger visual with less
ink, and it answers "how did I get here" rather than "what am I inside of".

Neither reads as noisy at three levels. `guides` stays the default because it is the more legible
of the two at a glance.

### The elbows are gone (first real-note review)

`path` originally drew the Logseq shape literally, with a horizontal `linear-gradient` layer at
each level change. Reviewing it in a real note killed it, for a reason the geometry made
inevitable: **a marker is centered ON its own guide column** (Experiment 5a's placement), so an
elbow arriving at level `d+1` ran straight through the very icon it was reaching for, and the
segment ends picked up visible offsets against it. It read as lines crossing icons, not as a path.

What replaced it costs less and reaches further: **accent every ancestor's marker**, and draw
nothing horizontal at all. The marker becomes the junction — the eye follows segment → marker →
segment with no line crossing anything. Three consequences worth recording:

- It reuses two mechanisms that already worked (the vertical segments, and the current-marker
  accent pointed at the ancestor chain) instead of adding a third that fought them.
- It is the only part of the style that survives inside a list, where no segment can be drawn at
  all. In a pure list, `path` is now *entirely* accented bullets — and that is the case the whole
  style is most useful for.
- The style is named `path`, not `thread`: it is no longer the threading shape, and calling it
  one would have made every doc here misleading.

Implementation note worth keeping: a `path` segment covering half a row does NOT replace the
plain guide underneath it — only a full-height accent does. Replacing it in the half-row case
punched a visible gap into a guide the trail was only supposed to be highlighting; the fix is
one condition in `guideBackground`, and `54-position-indicators.e2e.ts` pins it.

## The flat `opacity: 0.6` had to go

The guide overlay carried `opacity: 0.6` on the `::after` itself. Since the accents share that
same pseudo-element (there is no second one available — `::before` is taken by Obsidian's native
blockquote bar and by our own selection chrome), that opacity would have dimmed the accent along
with the base guides. The dimming moved into the guide's own color instead
(`color-mix(in srgb, var(--text-faint) 60%, transparent)`), which composites identically here —
a single, non-overlapping layer over the page — and leaves the accent at full strength.

## Theme behavior

Light and dark of the bundled theme were both checked live: the accent resolves through
`--to-decor-accent` → `--text-accent`, so it tracks the theme in each, and stays distinguishable
from the unaccented marker in both. A snippet overriding `--to-decor-accent` retunes it with no
geometry change at all (both are asserted in `54-position-indicators.e2e.ts`).

**Not done:** the community-theme sweep (Minimal, Catppuccin). The layer writes no geometry
whatsoever — only colors and background layers, verified by auditing every new rule and by an
e2e that measures every line's position and every marker's rect across all six setting
combinations — so the class of theme bug doc 12 records for base indentation (a `max-width`-sized
box that does not recompute) has no way to reach this layer. A visual contrast check under a
third-party theme is still worth doing if one is ever installed for another reason.

## Deferred: drawing segments along native list columns

When the ancestor chain runs through list nesting, the `path` style today descends at the nearest
non-list ancestor's own column and stops at the current node's row. It does not step in per list
level. That is the spec's permitted omission, not a bug — nothing renders at a wrong column — and
since every list ancestor's own bullet IS accented, the levels are still legible; what is missing
is only the lines between them.

Finding 3 rules out both of the cheap approaches — the `.cm-indent` spans do not correspond to
list levels, and there is no constant step to publish as a CSS variable. What is left is a
genuinely different mechanism from the one this layer uses:

1. Measure each list item's own already-rendered bullet position per view
   (`view.coordsAtPos`/element rects), rather than computing a column from a formula.
2. Draw absolutely-positioned overlay elements at those measured coordinates — obsidian-outliner's
   technique, and Experiment 2a's, which Experiment 2b deliberately replaced with the
   measurement-free gradient this layer is built on.
3. Keep both mechanisms alive side by side, with a rule for which owns which levels, and re-run
   the measurement on every relevant reflow (font change, window resize, fold, theme switch) —
   the maintenance cost 2b was chosen to avoid.

So this is a second rendering mechanism, not an extension of the current one, and it lands
squarely on the parking lot's "native list decoration experiments" entry rather than being a
follow-up to this change. Note that the *markers* at those levels are already accented — what is
missing is only the connecting lines between them, which is a much smaller gap than it was before
the ancestor-marker rework.
