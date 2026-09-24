# Block starts measured from the list item that holds them

What `parse` reads a `quote`, a `callout`, an `hr` or an `html` block as when the line sits inside
a list item, how far that is from what CommonMark reads, and what measuring the opening margin
from the item's content column rather than from column 0 changes — in the parser, in the seams
every operation writes, and across the corpus. The defect is #136, and the open half of #158
(the KIND loss; its node loss closed with `seams-across-a-re-indent`).

## The mechanism

`QUOTE_RE`, `CALLOUT_RE`, `HR_RE` and `HTML_OPEN_RE` (`src/parse.ts`) anchor at `^ {0,3}` on the
raw line. CommonMark measures that allowance from the CONTENT COLUMN of the container holding the
line, so the four columns that make a line indented code at the root are a list item's own child
column one level in. `segment` reads blocks flat and lets `parse` derive nesting afterwards, so
at the point these patterns run there is no container column to measure from.

Two shapes, both Markdown source, `┆` the left edge of the column and `⏵` a tab:

```
 #136, a tab vault      #158 case 1, after the paste
┆- alpha               ┆- one
┆                      ┆  - two
┆⏵   > quote child      ┆  - ## H
                       ┆
                       ┆    ---
```

`commonmark` 0.31.2 reads a blockquote inside the item on the left and an `<hr />` inside the
`## H` item on the right. `parse` on `main` reads a paragraph in both.

## What the prototype does

`segment` keeps the stack of content columns of the list items still open at each line — the
same stack `parse` pops when it attaches blocks — and applies the four margin-anchored patterns
to the line as that innermost item sees it: the item's content column taken off the indentation.
The raw line is what the block keeps, so the round trip is untouched. The same margin reaches the
three places a block start is tested from inside another block: a list item's continuation loop
(a `>` line at the item's child column is a quote child, as it already was at column 2), a
paragraph's interruption test, and a quote's own run, which also stops at a line indented short
of the margin.

The seam rules in `src/ops.ts` read `kindAsWritten` and `tailAsWritten` from `parse.ts`, and both
take the same margin: `normalizeBoundaries` passes each list of siblings the content column of
the list item that holds them. Without it the seams go on judging a quote at a child column as
the paragraph `main` read it as, and the payload-survival property in `tests/edit-ops.test.ts`
finds the disagreement within 20 runs.

The prototype is `prototypes/block-start-margin/implementation.patch.txt`.

## Headings are left out, on purpose

`ATX_RE` and the setext underline keep measuring from column 0. A heading in our tree opens a
SECTION: it closes every open list and owns what follows it. A heading inside a list item is not
one, to Obsidian either — `paste-across-encoding-regimes` measured that the metadata cache does
not index `- ## Notes` as a heading, though both editing surfaces style it as one. Reading
`\t# heading child` under `- alpha` as a heading would move everything after it into a new
section, which is a grammar decision rather than a parser fix. The paragraph interruption test
keeps a `-` or `=` rule under a paragraph reading from column 0 for the same reason: at the
margin it would be a setext underline, and so a heading.

## Measured: one line, every column

`prototypes/block-start-margin/`: five openers (`> q`, `> [!note] c`, `***`, `- - -`, `<div>`) ×
six containers (the root; `- a`; `1. a`; depth 2 at content column 4; a tab-indented child at
column 6; depth 3 at column 6) × with and without a blank line × offsets 0-5 from the content
column × spaces or tabs: 610 documents. Each is read by `commonmark`, by `parse` on `main`, and by
`parse` with the patch; a reading agrees when the probed line opens the same kind, with
`commonmark`'s indented code counted as our paragraph (`open-questions` Q35).

| container | shapes | agree on `main` | agree with the patch |
| --- | --- | --- | --- |
| the root | 40 | 36 | 36 |
| inside a list item | 570 | 184 | 456 |

272 readings change, every one of them toward `commonmark`'s; none moves away from it. By kind:

| opener | `main` → patch | shapes |
| --- | --- | --- |
| `> q`, `> [!note] c` | paragraph → quote, callout | 68 |
| `> q`, `> [!note] c` | continuation of the item → quote, callout | 68 |
| `***`, `<div>` | paragraph → hr, html | 68 |
| `- - -` | list item → hr | 68 |

The 114 in-item shapes that still disagree are all outside what this changes, and none changed; the root's 4 are `- - -` at column 4, the same #138 row:

| shape | shapes | where |
| --- | --- | --- |
| an `hr` or `<div>` directly under an item's marker line, no blank | 74 | a continuation to us; CommonMark interrupts. The latent list-item half of #197 |
| `- - -` four or more columns past a margin | 40 | a list item to us; indented code, or a lazy continuation with no blank, to CommonMark. #138 and Q35 |

## Measured: the corpus

Every `.md` under `tests/corpus/` and `test-vault/`, 39 files, parsed on `main` and with the
patch and compared node by node on kind, first line and child count: **0 files differ**. No
quote, rule or HTML block in either sits past column 3 inside a list item today.

## Measured: through the operations

The 924-combination insertion differential from `seams-across-a-re-indent`, with one column
added — atoms the payload carried that the result no longer holds as atoms of the same kind:

| | rows accepted | rows losing a node | rows losing an atom's kind |
| --- | --- | --- | --- |
| `main` | 912 | 0 | 132 |
| the patch | 912 | 0 | 30 |

No verdict changes. The 30 that remain are all in the three destinations whose body sits at
column 4 under a heading (`## H2` / `⏵   body`), which is the root divergence of #138 — CommonMark
reads that body as indented code, so there is no kind to keep. 28 encodings change, and all 28
differ only in blank lines: an atom that survives as an atom now takes the separator its kind
asks for, where `main` wrote the paragraph it had become flush.

The 3 249-pair bare-seam sweep reads 63 wrong pairs on `main` and 63 with the patch, the same
pairs. Its oracle had to learn the margin first: it read each side's lines alone, at the root,
so a `<div>` at column 4 under `- item` was expected to split into a paragraph and a list item.
With the patch that line is an HTML block inside the item, which `commonmark` confirms, and the
unamended oracle counts the 12 such pairs as losses. The amended probe parses the right-hand node
below a stand-in item with the same content column.

## Not measured

What Obsidian RENDERS for these shapes. `open-questions` Q38 records that Live Preview itself
mis-renders a tab-indented quote (`HyperMD-quote-lazy`), independently of our parse; the
decorations will now treat such a line as a quote, and whether that reads better or worse in
outline mode wants a look in a real instance before this lands.
