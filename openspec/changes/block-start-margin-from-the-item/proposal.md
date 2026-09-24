## Why

A quote, a callout, a thematic break or an HTML block written inside a list item is read as a
paragraph once its line sits four or more columns in — at the first level of nesting in a
tab-indented vault, the second in a two-space one. Reported as
[#136](https://github.com/laughedelic/obsidian-true-outliner/issues/136) from the reading side and
as the open half of [#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158) from
the operations: a paste or a re-indent that carries an atom to a list item's child column hands
back a paragraph, and the outline shows a paragraph where the document shows a rule.

```
 #136, a tab vault      #158 case 1, after the paste
┆- alpha               ┆- one
┆                      ┆  - two
┆⏵   > quote child      ┆  - ## H
                       ┆
                       ┆    ---
```

CommonMark reads a blockquote inside the item on the left and a rule inside the `## H` item on
the right; `parse` reads a paragraph in both. Its four margin-anchored patterns measure
`^ {0,3}` from column 0, where CommonMark measures it from the content column of the list item
holding the line. `docs/research/block-start-margin` carries the measurements: of 570 in-item
shapes, 184 agree with `commonmark` on `main` and 456 with the change, and none moves away from
it.

## What Changes

- `segment` (`src/parse.ts`) keeps the content columns of the list items open at each line and
  tests `QUOTE_RE`, `CALLOUT_RE`, `HR_RE` and `HTML_OPEN_RE` against the line as the innermost
  one sees it: the item's content column taken off its indentation. The raw line is what the
  block keeps. The same margin applies where a block start is tested from inside another block —
  a list item's continuation loop, a paragraph's interruption test, and a quote's own run, which
  also ends at a line indented short of the margin.
- `kindAsWritten` and `tailAsWritten` take that margin, and `normalizeBoundaries` (`src/ops.ts`)
  passes each list of siblings the content column of the list item that holds them, so a seam is
  still judged on the kind the re-parse will read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tree-mapping`: a block start inside a list item is measured from the item's content
  column.
- `structural-operations`: the boundary rule's opening margin is the same relative margin.

## Non-Goals

- **Headings.** `ATX_RE` and the setext underline keep measuring from column 0. A heading in our
  tree opens a section and closes every open list; a heading inside a list item is not indexed as
  a heading by Obsidian's metadata cache (`docs/research/paste-across-encoding-regimes`). Reading
  one there is a grammar decision, not a parser fix.
- **The root.** Four columns at the root are indented code to CommonMark and a paragraph to us:
  [#138](https://github.com/laughedelic/obsidian-true-outliner/issues/138), `open-questions` Q35.
  The 30 insertion rows that still lose an atom's kind are all there.
- **An `hr` or HTML block directly under an item's marker line**, with no blank line: still a
  continuation of the item to us, where CommonMark interrupts. That is the latent list-item half
  of [#197](https://github.com/laughedelic/obsidian-true-outliner/issues/197).
- **#198**, a paragraph dedented to where its text opens a block. It is the same margin read in
  the other direction and lands on the same function, so it can follow this, but it is a
  promotion rather than a correction of the margin.
