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

## Measured: the seam oracle

`tests/seam-oracle.ts` (`created-seams-are-separated`, design D11) generates notes as text, from blocks joined by
none, one or two blank lines, so seams written flush under a quote, a callout or a list item are among them. It
applies every structural operation to every applicable node, and pairs of adjacent siblings for the group forms,
then judges each seam of what the operation wrote. The edit site is `src/edit-site.ts`'s. A seam is CONTINUED
when a CommonMark 0.31.2 block other than a list holds both its lines, or when one of reading mode's three extra
rows applies (the tables above). A list holding both is two lists CommonMark joins across blank lines, which no
separator settles.

Seed 1, 400 notes of up to 8 blocks (`SEAM_ORACLE_NOTES=400`), with the edit-site pass off and on:

| figure | today | with the pass |
| --- | --- | --- |
| operations applied / accepted | 28,107 / 19,280 | 28,107 / 19,280 |
| seams at the edit site outside a list | 28,591 | 28,591 |
| … written flush | 9,820 | 184 |
| … continued by some reader | 3,956 | 0 |
| … continued, but exempt: a lone id above, four columns in | 10 | 4 |
| … flush where no reader continues | 5,854 | 180 |
| seams away from the edit site whose blank lines changed | 519 | 0 |
| … that the parse required | 4 | 0 |
| lists whose items all stayed and whose tightness changed | 297 | 291 |
| block ids whose host changed between two unchanged blocks | 145 | 125 |
| indented code an operation created | 0 | 0 |

What each says:
- **3,956 continued seams are the defect,** and the pass leaves none. Paste writes most of them, then moves,
  splits, group moves, deletes and merges.
- **The pass writes 9,636 lines, 5,674 of them where no reader continues:** 59% of what it writes. That is what
  the narrower rule (design D11) would not write. The narrower rule was declined on this figure: the lines it would save are
  cosmetic, and it needs a per-reader table.
- **Every seam that changed away from the edit site today is a move's** (515 of 515 kept examples; the rest are
  the parse's). A reorder keeps blank lines with the positions of its scope, so a block moved to the top hands
  each position's gap to whatever block now sits there:
  ```
   before            move ## h3 to the top
  ┆| t1 | b |      ┆## h3
  ┆| --- | --- |   ┆
  ┆                ┆
  ┆                ┆<div>d4</div>
  ┆> q2            ┆
  ┆## h3           ┆
  ┆                ┆| t1 | b |
  ┆                ┆| --- | --- |
  ┆<div>d4</div>   ┆> q2
  ```
  The table and the quote never moved apart, and lost their two blank lines. The pass restores every such seam.
- **Tightness and ids change today,** by indent, group moves, moves, merges, pastes and deletes: an indent that
  puts a quote under an item has the parse separate it (#255), and a move can leave a lone id under a different
  block. The pass adds to neither, and the restored seams remove some.
- **The generator writes no #255 shape,** a quote or callout written flush as an item's first child, so that
  exclusion is not exercised here.

## Measured: the pass's cost

On the 2000-line stress note `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts` builds (400 sections and a
list), a `deleteSubtrees` of one section's paragraph, 200 runs after 20 of warm-up, in vitest on the cloud VM:

| | per operation |
| --- | --- |
| without the pass | 1.27 ms |
| with the pass, first version | 3.5 ms |
| with the pass | 1.57 ms |

The first version failed the enforcement budget in the real app (4.1 ms and 3.7 ms against 3). It spent its time
building every block's outline view and re-nesting every heading on both trees. Two shortcuts took it out, and
neither changes what the pass decides:
- a block whose lines the surgery kept by reference, at the same margin, has the view it had;
- a tree whose headings already sit where their levels put them, which every parsed tree does, is not re-nested.

## Measured: what the pass does to the node-loss probes

The three probes of `docs/research/prototypes/seam-differential/`, run on the rebased change (`main` at `a52c495`):

| probe | on the layer below | with the pass |
| --- | --- | --- |
| insertion differential, rows short of a node | 0 of 924 | 0 of 924 |
| bare-seam sweep, pairs wrong | 4 of 3249 | 4 of 3249 |
| drag sweep, moves a node short | 0 of 933 | 0 of 933 |

The 4 pairs the sweep leaves are the `---` / `---` ones settled in `paste-across-encoding-regimes`. The pass adds
a blank line and never removes a node.

Both drawn cases added with the change (`paste-a-quote-above-a-paragraph`, `enter-mid-paragraph-above-a-quote`) run
in the real app on desktop: they fail on the layer below and pass with the pass.
