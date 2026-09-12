# Two spaces after a bullet: where a list item's content column actually is

Measured 12 September 2026 against `ebac7e7`, Obsidian 1.13 under the e2e harness, plus the
list rules of the markdown mode Obsidian's Live Preview runs, read out of the application
bundle and exercised directly.

The report from real-vault use: a bullet followed by two spaces — invisible in Live Preview —
breaks the rendering of the item's children, which show raw dashes and raw checkboxes.

## The reproduction

```
-  a
  -  b

    - c
    - [ ] d
```

`c` and `d` render as literal text — no bullet, no checkbox — with the plugin on and with it
off. Obsidian's own reader does this; our decoration on those lines only adds list chrome to
lines that are not a list. Replace `  -  b` with `  - b` and every line renders as a list.

## Obsidian's reading

Live Preview does not take list structure from the CodeMirror 6 syntax tree; it decorates the
tokens of a stream mode, and that mode:

- sets an item's content column to its indentation plus the length of the marker AND the whole
  whitespace run after it — `-  a` is column 3, `  -  b` is column 5;
- pops its list stack while a line's indentation is below the top's content column, and once
  the stack is empty measures further lines against their absolute indentation;
- turns a list line whose indentation then measures four or more, following a blank line, into
  an indented code block.

So `  -  b` (indentation 2) is not a child of `-  a` (column 3) but a sibling; `    - c`
(indentation 4) is below `b`'s column 5, the stack empties, and 4 columns after a blank line is
a code block. CommonMark reads the same content column for one to four spaces.

## Our reading, and our writing

The parser accepts any whitespace run after a marker and then sets the content column to the
marker's end plus one, whatever the run held:

| line | our content column | Obsidian's |
| --- | --- | --- |
| `- a` | 2 | 2 |
| `-  a` | 2 | 3 |
| `1.  a` | 3 | 4 |
| `  -  b` | 4 | 5 |

The re-encoder's `markerWidth`, which every structural operation uses to place a child, counts
the same single space. Measured: indenting `- second` under `-  parent` writes `  - second`,
which our re-parse accepts as a child and Obsidian reads as a sibling. From there the shape
above is one Enter and one Tab away. The rule that widens a too-narrow indent to the parent's
content column (`reachContentColumn`) cannot catch it, because it asks the same `markerWidth`.

The parser's own tree for the reported document is not itself wrong-looking: `-  a` and
`  - b` parse as parent and child, guides draw them as parent and child, and only Obsidian's
rendering of the lines disagrees — which is why the cause was hard to see from inside the
outline.

## What follows

The content column is the column after the marker's whole whitespace run, measured with tabs
advancing to the next stop, in the parser and in `markerWidth` alike; a marker alone on its
line keeps the one space a child would need. A child of `-  a` is then written at three columns
and read as a child by both readers, and `  - b` under `-  a` is read as the sibling Obsidian
already sees it as.

CommonMark folds a run of five or more spaces back to one, treating the rest as an indented code
block inside the item; Obsidian's mode has no such fold. The rule here follows Obsidian, since
its rendering is what the report is about, and the two agree on every run of one to four.
