# Seams across a re-indent

A seam is the boundary between two adjacent nodes, and what stands in it — a blank line, or
nothing — decides whether the re-parse reads two nodes there or one. `normalizeBoundaries`
(`src/ops.ts`) picks that separator, and it picks it from `node.kind`. Where an operation has
re-indented a node on the way in, `node.kind` is the kind the node USED TO BE: the tree still
holds a `quote`, and the column the quote is now written at makes the same bytes a paragraph.
A separator chosen for the first is a separator chosen for a node the document will not contain.

Measured against `main` at `11648bd`, for [#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158).

## The order the two steps run in

`finalize` (`src/ops.ts`) normalizes boundaries on the TREE and then encodes it:

```
normalizeBoundaries(surgery)  ->  encode  ->  parse
        ^                                       ^
   the node is still a quote            the same lines are a paragraph
```

Between the two, nothing re-reads the lines. `needsBlankBetween(quote, paragraph)` is correct
about a quote — a `>` line does not claim the paragraph below it, so no separator is needed —
and by parse time the `>` line is at column 4, where `QUOTE_RE`'s `^ {0,3}` no longer reaches
it. It is a paragraph, and a paragraph claims the next line as a continuation. Two nodes go in
and one comes out.

The kinds this can happen to are the ones whose opening line is margin-anchored: `QUOTE_RE`,
`CALLOUT_RE`, `HR_RE`, `HTML_OPEN_RE` and `ATX_RE` all begin `^ {0,3}`. `code` and `table` have
no such limit and are never demoted. Measured, one node per parse:

| column | `---` | `***` | `> q` | `> [!note] c` | `<div>` |
| --- | --- | --- | --- | --- | --- |
| 0–3 | `hr` | `hr` | `quote` | `callout` | `html` |
| 4+ | `paragraph` | `paragraph` | `paragraph` | `paragraph` | `paragraph` |

A tab is four columns from the left margin, so a single tab is already past it.

## The frames

Case 1, the node loss. A payload whose last root is a quote, landing in a heading scope whose
content is tab-indented. `‸` is the insertion point; the carets the results leave were not
measured.

```
 clipboard    before       main           this change
┆- item      ┆## H2       ┆## H2         ┆## H2
┆> quote     ┆‸⏵   body   ┆⏵   item      ┆⏵   item
                          ┆⏵   > quote   ┆
                          ┆⏵   body      ┆⏵   > quote
                                         ┆
                                         ┆⏵   body
```

`main` reads back as one paragraph carrying three lines: both payload nodes and the section's
own paragraph are gone from the outline. The separator the seam needs is the one a paragraph
needs, because a paragraph is what each of those lines is at column 4.

Case 2, the same rule running the other way. A payload ending in an HTML block, landing at a
list item's child column:

```
 clipboard    before         main           this change
┆## H        ┆- one         ┆- one         ┆- one
┆<div>       ┆‸  - two      ┆  - ## H      ┆  - ## H
┆x           ┆    - three   ┆              ┆
┆</div>                     ┆    <div>     ┆    <div>
                            ┆    x         ┆    x
                            ┆    </div>    ┆    </div>
                            ┆              ┆  - two
                            ┆  - two       ┆    - three
                            ┆    - three
```

An HTML block ends at a blank line rather than at its closing tag, so a seam below one always
takes a separator — that is what `main` writes here. At column 4 there is no HTML block: the
three lines are a paragraph, and `  - two` opens a list item, which ends a paragraph on its own.
The blank line is separating nothing. Both encodings render identically under `commonmark`
0.31.2, and both re-parse to the same four nodes; the change is that one of them is minimal.

## The differential

580 (destination, anchor, position, payload) combinations through `insertSubtrees` — ten
destinations covering tab-indented and four-space-indented heading scopes, list scopes two and
three levels deep, and mixed documents, crossed with ten payloads covering every margin-anchored
kind plus `code`, `table`, a setext heading and a plain section. The probe is
`prototypes/seam-differential/`.

| | `main` | this change |
| --- | --- | --- |
| rows | 580 | 580 |
| rows losing a payload node | 8 | **0** |
| verdicts changed | — | 0 |
| encodings differing | — | 15 |

Of the 15 differing encodings, 8 are the node loss above — a separator added where the re-parse
needed one. The other 7 are case 2's shape, a separator removed where nothing needed it. None
of the 580 preserves fewer nodes than `main` did.

## What this does not close

The KIND loss is untouched, and #158 stays open on it. A `quote`, a `callout`, an `hr` or an
`html` block re-indented to a list item's child column is still read back as a paragraph, so
the outline shows a paragraph where the document showed a rule. Every node survives now; one
of them survives as something else.

Closing that half is a question about the parser rather than about seams, and the measurement
that frames it was not in the issue. CommonMark measures a block's indentation RELATIVE to its
container, so the four columns that make a line indented code at the root are the list item's
own content column one level in. Measured with `commonmark` 0.31.2:

| buffer | `commonmark` | `parse` |
| --- | --- | --- |
| `- one` / `  - two` / `` / `    ---` | `<hr />` inside the item | `paragraph` |
| `- one` / `  - two` / `` / `    > q` | `<blockquote>` inside the item | `paragraph` |
| `    ---` at the root | indented code | `paragraph` |
| `\t> q` at the root | indented code | `paragraph` |

So the "no free fix" reading in #158 — that widening the anchors would diverge from Obsidian —
holds at the ROOT and is inverted inside a list item, which is the direction a re-indent
actually travels. Our `^ {0,3}` is absolute where CommonMark's is relative, and `segment`
(`src/parse.ts`) has no container stack to measure against: it reads blocks flat and lets
`listAttachesTo` build the nesting afterwards. Giving it one reaches every kind, every
operation and the corpus, which is why it is not folded in here. The root rows are a second
divergence of their own, already filed as
[#138](https://github.com/laughedelic/obsidian-true-outliner/issues/138).
