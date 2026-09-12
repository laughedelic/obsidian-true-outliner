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

| line     | our content column | Obsidian's |
| -------- | ------------------ | ---------- |
| `- a`    | 2                  | 2          |
| `-  a`   | 2                  | 3          |
| `1.  a`  | 3                  | 4          |
| `  -  b` | 4                  | 5          |

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

An item that starts blank is the other case CommonMark names: a marker followed by nothing, or
by whitespace only, has its content column one past the marker. Review of the first version
caught that we measured the trailing run as if text followed it, so `-  ` over `  - b` read `b`
as a sibling of an empty item whose column had widened to three; the empty item now takes the
one-space column whatever trails it.

What the parser still does not model is the indented code block Obsidian reads once its list
stack has emptied: in the reproduction above, `    - c` after the blank line is `a`'s child to us
(indented past `a`'s column of three) and a code block to Obsidian. Modelling that is a parser
capability of its own, recorded as `docs/research/open-questions` Q35; this change makes the
run that causes it visible and removable, which is what the report needed.

## Seeing the run, and removing it

The column moved on a line that shows nothing: Live Preview draws `-  a` exactly as `- a`, a
bullet and then the text, whatever the run's width. A mark decoration over the run past its
first space (`SURPLUS_MARKER_SPACE_CLASS`) makes it visible; measured on `- a`, `-  b`, `1.  c`,
`- [ ]  d` and `-   e`, the first line carries no mark and each of the others one span of
non-zero width, the three-space span wider than the one-space, on desktop and under mobile
emulation alike. The span needs `white-space: pre`: whitespace-only, it otherwise collapses at a
wrap point.

Where the mark sits was measured next. The marker-sizing rules size a bullet and its first
space to the gutter, and were gated on a marker followed by exactly one space, so that a wider
run did not push the item's text off its siblings' column. On `-  two` that left the formatting
span at its 14px minimum with 10.2px of content: the bullet's box at 0 with no width, the
marker's space at 0–5.1, the marked surplus at 5.1–10.2, and the text at 14 — the highlight
inside the gutter's slack, between a bullet and text that had not moved. On `-    four` the span
grew to 20.4 and the mark reached the text; on `1.  ord` and `- [ ]  task` the mark was adjacent
to the text as well. Gating the sizing on a marker followed by a space, surplus or not, puts the
bullet and its space in the gutter on every such line, the mark at the one-space text column,
and the text at the mark's end: measured, `-  b`'s and `-    e`'s marks begin where `- a`'s text
begins, and each text begins at its mark's right edge. A tab after the marker stays outside the
gate and on its own stop.

A press on the mark removes the run, dispatched as a `delete` user event from a capture-phase
`pointerdown` with the trailing mouse events swallowed (the shape `zoom-click.ts` records the
reasons for). Measured: a pointer press at the centre of `-    e`'s mark leaves `- e` with the
caret at column 2 and no mark, and one undo restores the line.

Removing the run by hand was not possible in outline mode. The caret's boundary
(`contentBoundaryCh`) spans the whole run, so no column inside it is addressable — a caret set
at column 1 of `-  b` reads back at 3 — and Backspace at column 3 was classified as the
marker-space merge intent (`crossesViaChromeDeletion` shape 1): `- a\n-  b` became `- ab`, the
space never deleted. The classifier now recognizes that shape only when the run is the one
character the marker needs; wider, the keypress is a within-node edit and the native deletion
runs: measured, Backspace at column 3 of `-  b` leaves `- b` with the caret at 2, and a second
Backspace there merges as before. The enforcement layer is not consulted for a within-node
edit, so its merge recognition is unchanged.

Where Cmd-Left and Mod-Backspace land was the other question. CodeMirror binds Cmd-Left to
`cursorLineBoundaryLeft`, which dispatches a `select` transaction to the row's start; the
placement filter resolves that to the content start past the run. Measured by dispatching the
same transaction, since the key is bound on macOS only and the harness runs on Linux: the caret
lands at column 3 on `-  b`. Mod-Backspace (`delete-to-content-start`) plans to the same
boundary and, at it, defers to the Backspace path — so from anywhere in the text, Mod-Backspace
lands at column 3 and one more Backspace removes the surplus. No new binding was needed.

A structural operation that rewrites the item's own first line writes the run as one space
(`normalizeMarkerRun`), shifting the item's continuation lines and children by the column
change: indenting `-  second` with its child under `- parent` writes `  - second` and
`    - child`, which Obsidian marks as levels 2 and 3. An operation that leaves the line alone
leaves the run alone — a child indented under `-  parent` still reaches column 3 and the parent
keeps its two spaces, marked.
