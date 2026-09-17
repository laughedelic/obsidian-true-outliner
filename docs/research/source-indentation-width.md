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

Three findings decided the mechanism:

- **Nothing selectable covers exactly the node's own indentation.** Inside a fence the whitespace
  can share a highlighting token with the code after it, and with the guide setting off the
  quantiser does not run at all. A CM6 `Decoration.mark` covers exactly the characters, whatever
  Obsidian made of them.
- **A mark alone is not enough.** CM6 nests Obsidian's own span OUTSIDE the mark, and that span's
  width is stated, so a zero-width mark inside it collapses nothing: measured with the mark
  applied and no rule on the wrapper, 62px for two spaces and 82px for a tab, against the 46px
  column. The wrapper has to be zeroed too, and by `width`, `min-width`, `padding` and `margin`
  together — `.cm-indent-spacing` carries its width as `padding-left` on a `border-box` element,
  where a zero width leaves the padding standing.
- **A zero width is the only robust one.** A stated width would be paid once per piece wherever
  CM6 splits the mark; zero survives the split. What the whitespace used to measure is supplied
  by the depth rules instead, which is the same trade `lists-on-the-outline-grid` made for a list
  item's own run — except that a list item's run is SIZED to its hang rather than collapsed,
  because it carries the native marker.

## What may be collapsed WITH the mark, and what may not

The wrapper rule is keyed on whether the mark covers the whole leading run, not on the kind of
line. Obsidian's span holds the run as it quantised it — the node's own indentation and anything
past it together — so zeroing it on a line that carries more discards the surplus the mark
deliberately left standing.

Measured on `- alpha` / `` / `  first line` / `      second deeper`, with the rule keyed on the
line's kind instead: the deeper line rendered at 46px, the same column as the flush line above it,
all four surplus spaces gone. The same mechanism was first found inside a fence, where it took all
six spaces of `      deeper`; keying on the mark's own coverage covers both, and a fence needs no
exception of its own.

## The surplus, stated rather than quantised

A line carrying more than its node's own indentation keeps the difference, and what that
difference MEASURES is stated here rather than left to Obsidian. Its quantiser sizes the whole
run — the node's own indentation included — so leaving it to state the surplus renders a width
that has no relation to the characters that survive. Measured on the manual pass's own shapes,
with the wrapper left standing:

| Line | Surplus | Rendered | Should be |
|---|---|---|---|
| `      second deeper` under `  first line` | 4 spaces | 62.2px | 20.4px |
| `      deeper` inside a fence indented by two | 4 spaces | 48.4px | 20.4px |

The layer knows the surplus in characters, so it states the width as
`count × var(--to-space-advance)` — the space advance `MarginCompensation` already measures live
for the marker rules, a space having no CSS unit of its own — publishes it as
`--to-indent-surplus` on the line, and collapses every one of Obsidian's indent spans on that
line rather than only the one holding the mark. Both rows then render at 20.4px, the width of
four spaces.

A surplus holding a TAB is the one shape left out: a tab renders to a tab stop rather than to a
count of advances, so its width is not ours to state. There the wrapper stands and the
quantisation residue with it.

## A code block's own internal padding

Obsidian pads a code line away from its own tinted box and withholds that padding from a fence
written inside a list: measured, `padding-inline-start` 16px at the top level against 0 there.
Before the collapse, the fence's own source indentation stood in for it; collapsed, the code sat
flush against the box's left edge, which the manual pass reported. `70-source-indent.css` states
the same `--size-4-4` Obsidian's own rule resolves to, so an indented block takes the padding its
unindented neighbour has rather than one this layer invents.

The fence's box still begins on its depth's column. What sits one padding in is its CONTENT,
which is what a box means.

## What a zero-width run does to the caret

Obsidian draws the NATIVE caret — measured, there is no `.cm-cursor` element in the editor — so a
collapsed run must not CLIP. The first version carried `overflow: hidden`, copied from the list
item's own whitespace wrapper where the box has a width to keep its content inside, and the caret
vanished wherever its position fell inside one: on every line whose run was collapsed, and on
every line Shift+Enter opens, which is the item's own indentation and nothing else. It came back
only once a character was typed past the run. Measured by walking the ancestors of
`domAtPos(head)`: `.cm-hmd-list-indent | hidden | w=0`, on a line start, inside the run, and on
the Shift+Enter line alike.

Two things follow, and the change carries both. A run overflows rather than clips, whitespace
having no ink to spill; and a line whose content is ONLY whitespace is not marked at all, since
there is no text for a run to push right and nowhere else for the caret to stand.

What remains is that the characters stay addressable: `contentBoundaryCh` returns 0 for every
non-list kind (`caret.ts`, D7), so Home, the arrows and a click can all land inside a run that now
renders at no width. Home on `  child paragraph` no longer appears to move the caret, and typing
there writes at column 0, which takes the paragraph out of its item.

Recorded rather than closed. Making the run non-addressable is a change to the caret's own
contract — `content-space-caret`'s boundary rule, one capability over — and every shape that spec
pins is a list item, whose run this change does not touch.

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

- **List items.** Their run is sized, not collapsed (`--to-list-hang`), and their geometry is
  unchanged by this pass: a nested item's marker stays one unit right of its parent's and a
  continuation line stays under its item's text.
- **The parse.** Which levels exist is Markdown's business and was already decided by the time
  this layer runs. Nothing here changes a byte of the document. The same manual pass found that
  a block start deeper than three columns — a tab-indented quote, or any quote two items deep in
  a two-space file — parses as a paragraph; that is `parse.ts`'s own defect, recorded as
  `open-questions` Q38.
- **A table written inside a list item**, which Obsidian does not render as a table in that
  position at all, with this plugin's decorations on or off (Q38).
