# Lazy continuation at the seams operations write

Our parser models no lazy continuation (`block-start-margin`: "we model no lazy continuation
anywhere"), and the seam rules in `src/ops.ts` separate two blocks only where OUR parse would
otherwise merge them. Every other reader of the note does continue lazily: a line written directly
under a quote, a callout or a list item joins that block. So an operation that writes such a seam
flush produces a note the outline shows as two nodes and every other view shows as one.

Found in the manual pass of #264. A paragraph pasted into a heading's children as `> quote` then
sits flush above the section's existing paragraph:

```
## H
first

> quote
below
```

The outline shows `> quote` and `below` as two nodes. Reading mode and Live Preview draw `below`
inside the quote. `main` wrote a blank line there only by accident, judging the promoted quote as
the paragraph the clipboard held. It writes real quotes and list items flush in the same place,
and a drag does the same to a list item (#261, the drag case).

## Measured: Obsidian

Obsidian 1.13.7 through the e2e harness, outline mode off (`prototypes/lazy-continuation/obsidian-lazy.e2e.ts.txt`).
Each note is the block, the next line, a blank line, and `tail`. Reading mode is judged on whether
the next line's text lands inside the `blockquote`, callout or `li` that holds the block's own text.
Live Preview is judged on the next line's classes. "lazy" is `HyperMD-quote-lazy`, "own" is a quote
line of its own, and "–" is a line with no block classes.

Flush, as reading mode / Live Preview:

| next line | after a quote | after a callout | after a list item |
| --- | --- | --- | --- |
| paragraph | inside / lazy | inside / lazy | inside / – |
| `a \| b` | inside / lazy | inside / lazy | inside / – |
| table | inside / lazy | inside / lazy | inside / – |
| `<span>…` | inside / – | inside / – | inside / – |
| `<div>…` | – / – | – / – | inside / – |
| `<!-- … -->` | – / lazy | – / lazy | – / – |
| setext pair | – / lazy | – / lazy | inside / – |
| `> quote` | inside / own | inside / own | inside / own |
| `2. x` | inside / – | inside / – | – / – |
| paragraph at column 2 | inside / lazy | inside / lazy | inside / – |
| `---`, `***` | – / lazy on the line after | – / lazy on the line after | – / – |
| `# heading` | – / – | – / – | – / – |
| fence | – / – | – / – | – / – |
| `- x`, `1. x` | – / – | – / – | – / – |

The three list-item leaves measured (`- item`, `1. item`, and `  - item` under `- a`) read alike
in every row. A paragraph at column 2 under a bullet sits at its content column, so there it is a
real continuation, not a lazy one.

With one blank line between, nothing is inside in reading mode in any row, and Live Preview draws
every next line on its own. The only Live Preview class left is `> quote`'s own quote.

Two readings of one note disagree within Obsidian. Reading mode continues a list item lazily, and
Live Preview draws the same line with no list classes, flush at the margin. A reader switching
views sees the line move.

## Measured: CommonMark

`commonmark` 0.31.2 (`prototypes/lazy-continuation/commonmark-lazy.mjs.txt`), judged on the AST:
whether the next line's text sits inside the quote or list item that holds the block's text. Flush:

| next line | quote | callout | quote ending `>` | list item | nested item | item, child paragraph | item in a quote |
| --- | --- | --- | --- | --- | --- | --- | --- |
| paragraph, `a \| b`, `<span>`, table, setext pair | inside | inside | – | inside | inside | inside | inside |
| `> quote` | inside | inside | inside | – | – | – | inside |
| `<div>`, `# heading`, `---`, `- x`, `1. x`, `2. x`, fence | – | – | – | – | – | – | – |

CommonMark continues a paragraph line lazily and nothing else. A quote whose last line is an empty
`>` has no paragraph open, so nothing continues it. Reading mode goes further than CommonMark: it
also continues a list item with `<div>` and `> quote`, and a quote with `2. x`.

## Measured: the corpus

Every `.md` under `tests/corpus/` and `test-vault/` (`prototypes/lazy-continuation/corpus-seams.test.ts.txt`):
40 files and 320 sibling seams. Exactly 1 seam is flush below a quote, callout or list item with
something other than a heading, a fence or a list item after it: `  > quoted` over `  ^x7` in
`tests/corpus/09-block-ids.md`, a block-id line. Such a line has to stay flush to mean what it
means, so it is not a seam to separate.

## What follows

A blank line settles every row: with one, all readers agree on every pair measured. A blank line
also leaves our own tree as it was, with one exception: a lone block-id line. `Lead.` / blank /
`^id3` / `> q` reads `^id3` as a node of its own, since it sits flush above a block. With a blank
line below it instead, it attaches to `Lead.`, and the references to it move with it. `para` / `- a`, `# H` / `text`, `- a` / `  - b`, `- a` / `- b` and a
fence / `text` each parse to the same tree with and without one.

It does change one thing: whether a list is TIGHT or LOOSE. A list is loose when a blank line
separates two of its items, or two blocks inside one item. That includes an item's text and a code
block, quote or nested list under it, and such a block and the next item.

## Measured: loose lists

The same documents in `commonmark` and in reading mode (`prototypes/lazy-continuation/loose-lists.e2e.ts.txt`).
In reading mode, the positions are the items' measured tops in the default theme.

| document | CommonMark | reading mode markup | reading mode item tops |
| --- | --- | --- | --- |
| `- a` / `- b` / `- c` | tight | items hold bare text | 154, 181, 207 |
| `- a` / blank / `- b` / blank / `- c` | loose | each item's text in a `<p>` | 154, 181, 207 |
| `- a` / 2 blanks / `- b` / 3 blanks / `- c` | loose | each item's text in a `<p>` | 154, 181, 207 |
| `- a` / `- b` / fence under `b` / `- c` | tight | bare text | 154, 181, 255 |
| the same with a blank line above and below the fence | loose | each item's text in a `<p>` | 154, 181, 255 |
| `- a` / `  > q` / `- b` | tight | bare text | 154, 237 |
| the same with a blank line above the quote | loose | each item's text in a `<p>` | 154, 237 |

Reading mode builds the loose list CommonMark describes, and the default theme draws it tight: those
`<p>` elements have no margin, so every item lands where it would in a tight list. Looseness is in
the document's structure, and the default theme hides it. A theme, a CSS snippet, Publish, an export
or another application can show it, and Live Preview and the outline show the blank lines themselves.

markdownlint's MD031, "Fenced code blocks should be surrounded by blank lines", applies inside list
items by default. Its `list_items` option turns that off, which its documentation says "helps when
creating tight lists that contain code fences". It meets the same trade-off from the other side.

Keeping a list's looseness therefore leaves one shape ambiguous. A quote and a paragraph are both
children of an item in a tight list, and the paragraph is written directly under the quote: reading
mode continues it into the quote. Separating them would make the whole list loose.
