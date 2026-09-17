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

## The one residue: code inside an indented fence

A fence's own indentation is collapsed on every one of its lines, and a line indented deeper than
the fence keeps the surplus — but Obsidian quantises a code line's whole leading run, so the
surplus renders one quantum wide rather than its own. Measured on `      deeper` inside a fence
indented by two: the run renders 48.36px (a 31.5px `.cm-indent` holding four spaces, of which the
first two are marked and collapse to nothing inside it, plus a 16.86px literal remainder) where
the four surviving spaces alone measure about 33.7px. The code is therefore indented relative to
its fence, correctly, and by up to one quantum too much.

The alternative was measured and is worse both ways: zeroing the quantised span takes the code's
own indentation with it (all six spaces went), and excluding a fence from the collapse entirely
leaves the whole block double-indented, which is the reported defect. The exclusion in
`70-source-indent.css` is therefore of a fence's INTERIOR lines only — its first and last carry
the same wrapper every other kind does, around nothing but the fence marker, and measured 14px
past the column when they were excluded with the rest.

## What was left alone

- **List items.** Their run is sized, not collapsed (`--to-list-hang`), and their geometry is
  unchanged by this pass: a nested item's marker stays one unit right of its parent's and a
  continuation line stays under its item's text.
- **The parse.** Which levels exist is Markdown's business and was already decided by the time
  this layer runs. Nothing here changes a byte of the document.
