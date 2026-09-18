# A non-list line's own source indentation

What the editor does with the leading whitespace of a line the outline has already positioned,
measured before `source-indentation-collapses` was designed. The defect it closes is
`decoration-follow-ups`' "A non-list-item child of a list item is indented twice" (issue #117);
the entry named the mechanism and left the geometry unmeasured, and the geometry is what decides
the shape of the fix.

All figures below are from Obsidian 1.13.7 on Linux, the bundled theme, `--to-decor-unit` 32px
and `--to-marker-gutter` 14px, so a depth-1 line's text column is 46px. Positions are
`coordsAtPos` x values relative to the content's own left edge — where the caret draws, not
where a box happens to sit.

## The two regimes, measured

`10-editor.css` gives every non-list-item line `padding-left: depth × unit + gutter` (a block
line) or the same as `margin-left` (an atom), and leaves list items to native list rendering
retargeted onto the same grid. On the fixture below — every kind the report names, written
blank-separated under one item, so each parses as a CHILD rather than a continuation — the box
lands correctly and the text does not.

````markdown
- alpha

  child paragraph

  ```js
  fenced
      deeper
  ```

  | a | b |
  | - | - |
  | 1 | 2 |

  > quote child
````

| Line | Box | Text before | Text after |
|---|---|---|---|
| `  child paragraph` | 46 | 72.17 | 46 |
| `\tchild paragraph` (same file in tabs) | 46 | 82 | 46 |
| ``  ```js `` (the fence's own first line) | 46 | 76.86 | 46 |
| `  fenced` | 46 | 62.86 | 46 |
| `  \| a \| b \|` | 46 | 72.17 | 46 |
| `  > quote child` | 46 | 72.17 | 46 |
| `   three-space child` (under a heading) | 46 | 61.27 | 46 |

The box is where the depth rules put it in every row. What the reader sees as a second column is
the leading whitespace rendering as characters on top of it — and its width is the file's, not
the tree's: 26.17px for two spaces, 36px for one tab, 15.27px for three spaces under a heading.

Reading mode renders none of that whitespace. Markdown reads it as structure, the same structure
the depth already states, which is why collapsing it is not a discipline break: what the
additive rules add to is the line's own box, and this removes no content, only a second
statement of the depth.

## Which runs restate a depth, and which state one

Only a run written under a LIST ITEM does. A child of an item is written to the item's own
content column, and the depth rules then state that column a second time — the two columns in
the table above. Everywhere else the ancestor carries the depth and the whitespace carries
nothing: under a heading, three spaces are insignificant to Markdown and the issue itself reads
that shape as already correct, and at the top level the run is the only thing telling a reader
that a four-space line is an indented code block, which this project's parser deliberately
reads as a paragraph.

Measured on the row above: the three-space child of a heading is the one shape the collapse
leaves at 61.27px, by design rather than by omission. A first version of this change collapsed
every non-list run and flattened all five lines of the `space-indented-paragraph` decoration
fixture onto one column, the four-space line included — recorded here because the fixture's
recorded DOM baseline was the only thing that noticed.

## What holds the run, and what states its width

The run is not one element, and which element holds it depends on the shape and on the reader's
own "Show indentation guides" setting. Measured on the same fixture, with the classes Obsidian
emits:

| Shape | Element holding the run | Width | Stated as |
|---|---|---|---|
| Two spaces under a list item | `.cm-hmd-list-indent` wrapping a `.cm-indent-spacing` | 26.17 | `padding-left` on the inner span, inline |
| A tab under a list item | a bare `.cm-indent` | 36 | `min-width`, from `--list-indent` |
| Three spaces under a heading | `.cm-indent-spacing` | 15.27 | the glyphs themselves |
| Inside a fence | `.cm-hmd-codeblock`, sometimes over a `.cm-indent` | varies | a mix of both |

Two findings decided the mechanism:

- **Nothing selectable covers exactly the node's own indentation.** Inside a fence the whitespace
  can share a highlighting token with the code after it, and with the guide setting off the
  quantiser does not run at all. A CM6 decoration covers exactly the characters, whatever Obsidian
  made of them.
- **Obsidian's own span has to be overridden too.** It sizes the span from the DOCUMENT rather
  than from the DOM, so its stated width outlives the characters a decoration takes out —
  measured, 62px of `.cm-indent` on a line whose whole run was replaced away. `width`, `min-width`,
  `padding` and `margin` together, since `.cm-indent-spacing` carries its width as `padding-left`
  on a `border-box` element, where a zero width leaves the padding standing.

## The node's own indentation, and the surplus

The two are not the same characters and must not take the same treatment — the finding that cost
this change four mechanisms. `indentCh` (`own-indent.ts`) is the node's OWN indentation: measured
from its first line, in columns so a tab is taken whole, and only where a LIST ITEM is among the
node's ancestors. What a line carries past it is its own, and states the one thing a deeper line
says.

Both earlier renderings lost the distinction the fact layer had from the start:

- **The wrapper rule took the whole span.** Obsidian quantises the run into one span holding the
  node's indentation and the surplus together, so zeroing it to hide the first discarded the rest:
  measured, `      second deeper` at 46px, the same column as the flush line above it, all four
  surplus spaces gone.
- **The replacement was widened to the whole run**, to give the surplus positions distinct x
  values — which they did not have while the wrapper was still zeroed. Every position in six
  characters then rendered at one x, which reads as a caret standing still while the document
  changes under it.

Hiding the node's own indentation ALONE needs no width stated anywhere: the surplus renders as
itself, in its own font. That is what fixed the two shapes a stated width could not. Measured, with
`--to-space-advance` 5.08px in the prose font and a 46px column:

| Line | Hidden | Surplus | Text lands at |
|---|---|---|---|
| `  first line` | 2 | — | 46.0 |
| `      second deeper` | 2 | 4 spaces | 66.3 = 46 + 4 × 5.08 |
| `  fenced` | 2 | — | 62 = the fence's box at 46, plus its code padding |
| `      deeper` inside that fence | 2 | 4 spaces | 95.7 = 62 + 4 × 8.43, a space in the CODE font |
| `\tchild paragraph` | 1 (a tab) | — | 46.0 |

A stated width got the last two wrong by construction: one space advance is measured in the prose
font and a fence's is not, and a tab renders to a tab stop rather than to a count of advances. The
earlier version skipped a tab outright for that reason; this one has nothing to skip.

## A code block's own internal padding

Obsidian pads a code line away from its own tinted box and withholds that padding from a fence
written inside a list: measured, `padding-inline-start` 16px at the top level against 0 there.
Before the collapse, the fence's own source indentation stood in for it; collapsed, the code sat
flush against the box's left edge, which the manual pass reported. `70-source-indent.css` states
the same `--size-4-4` Obsidian's own rule resolves to, so an indented block takes the padding its
unindented neighbour has rather than one this layer invents.

The fence's box still begins on its depth's column. What sits one padding in is its CONTENT,
which is what a box means.

## What an undrawn run does to the caret

Obsidian draws the NATIVE caret — measured, there is no `.cm-cursor` element in the editor — so
every mechanism that took the run's width had to answer where the caret stands. Four did, in
order, and each answer is why the next exists:

| Mechanism | What the caret did |
|---|---|
| Zero-width mark, `overflow: hidden` | Vanished on every line with a hidden run, and on every line Shift+Enter opens. Measured by walking the ancestors of `domAtPos(head)`: `.cm-hmd-list-indent \| hidden \| w=0`. |
| Zero-width mark, overflowing | Visible, but the run's own glyphs painted over the line's first word and the caret hopped inside it under repeated presses. |
| `Decoration.replace` over the whole run | Nothing to paint, but six positions rendering at one x: a press per character with the caret apparently still. Atomic instead made Backspace take all six in one press. |
| Mark with `display: none`, over the node's own indentation only | Nothing painted, nothing reserved. The surplus keeps its own characters and its own motion. |

The last one still has two edges, and both are measured:

- **The boundary between the hidden run and the text.** A replacement is padded by CM6 with its
  own `cm-widgetBuffer` elements — an `<img>` either side of an empty span — and the native caret
  drawn against one of those is a different height than the caret drawn against text, which the
  manual pass saw as the caret growing there. An undisplayed mark leaves no box, so the caret at
  the boundary stands against the line's own first character: measured, `beside=SPAN.cm-indent`
  rather than an `img`.
- **A line that is indentation and nothing else**, which Shift+Enter opens. Undisplayed, it leaves
  the line with no rendered content at all: measured, `coordsAtPos` returns null and the caret is
  gone until a character is typed. Such a line takes the REPLACEMENT instead, whose buffer element
  the caret can stand against — measured at the line's own column, 46px. The height the buffer
  costs needs a boundary with text, and this line has none.

## Where the caret stops, and what a press deletes

Hiding characters is not enough on its own: a press that walks through them looks dead, since
every position among them renders at one x. `caret.ts` therefore floors motion and placement at
the node's own indentation, exactly as it already does at a list marker — both are characters that
state the tree's shape rather than the reader's text, and outline mode draws neither.
`EditorView.atomicRanges` carries the same rule to every gesture that does not come through the
plugin's own keys.

The floor has to hold in the predicate, both resolvers and the motion planner together. With it in
motion alone, a left-then-right round trip stopped returning where it started — caught by
`caret.test.ts`'s own property, not by a shape anyone thought to write down.

Measured on `- alpha` / `` / `  first line` / `      second deeper`, walking left from the text
start of the deeper line: 84.5, 74.7, 66.3, 61.3, 56.2, 51.1, 46.0, then the previous line's end.
Four steps of one space each through the surplus, one step over the hidden run, no press that
appears to do nothing. Rightward returns to 46.0 — the text start, never in front of it — and Home
lands there too.

DELETION is stock and deliberately untouched. Obsidian's own editor removes a whole indent unit
inside leading whitespace, so Backspace in a four-space surplus takes two of them; at the text
start the same press takes the node's own indentation whole, which is the edit it stands for. The
earlier atomic-over-the-whole-run version made that press take all six characters at once, a block
leaving its parent where stock removes an indent unit.

## Obsidian's own indent aid, off a list

The manual pass also reported stray line segments through the content. They are Obsidian's own
indentation aid, which it draws from four columns of leading whitespace and again from eight, on
any line — not only on a list line, where `lists-on-the-outline-grid` had already suppressed it.
The columns it uses are the file's, not the tree's, and on a line whose run this layer collapses
the span the aid hangs off has no width left, so the segment starts inside the text it was meant
to sit left of.

Measured on `- alpha` / `` / `⇥child paragraph` / `` / `␣␣␣␣␣␣␣␣eight spaces deep`:
`--indentation-guide-width` resolved to 1px on both indented lines with outline mode on, against
0px on the list line beside them. The suppression now names every line the mode decorates, which
is the rule `10-editor.css` already carried, scoped where it should have been.

## What was left alone

- **List items.** Their run is sized, not hidden (`--to-list-hang`), and their geometry is
  unchanged by this pass: a nested item's marker stays one unit right of its parent's and a
  continuation line stays under its item's text.
- **The parse.** Which levels exist is Markdown's business and was already decided by the time
  this layer runs. Nothing here changes a byte of the document. The same manual pass found that
  a block start deeper than three columns — a tab-indented quote, or any quote two items deep in
  a two-space file — parses as a paragraph; that is `parse.ts`'s own defect, recorded as
  `open-questions` Q38.
- **A table written inside a list item**, which Obsidian does not render as a table in that
  position at all, with this plugin's decorations on or off (Q38).
