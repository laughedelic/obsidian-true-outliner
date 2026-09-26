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

What the line becomes past the margin is not always a paragraph, and has to be read off the line.
`LIST_ITEM_RE` carries no margin, so the rule spellings whose first two characters are a marker
and a space open a LIST ITEM where the others open nothing:

| column | `---` | `***` | `___` | `- - -` | `* * *` |
| --- | --- | --- | --- | --- | --- |
| 0–3 | `hr` | `hr` | `hr` | `hr` | `hr` |
| 4+ | `paragraph` | `paragraph` | `paragraph` | `list-item` | `list-item` |

A list item claims nothing at a seam, so reading one of these as a paragraph writes a blank line
for a node that is not there — the same mistake as the one above, one layer down. Nothing else can
arise: a fence and a table row have no margin either, so a node whose first line matches one of
them is a `code` or a `table` and is never demoted at all.

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

The destination is one Obsidian does not render as an outline. `\tbody` under a heading sits
four columns in at the root, which CommonMark reads as indented code, and Obsidian renders every
line of both columns above as code — `> quote` included. Our parse reads the same lines as the
heading's paragraph children, the divergence
[#138](https://github.com/laughedelic/obsidian-true-outliner/issues/138) records. So the loss is
in the outline this plugin builds — one row where there were three, folded, moved and indented
as one — and not in the rendering. It is also the only destination where #158's node loss
occurs: of the 12 rows of the differential below that lose a node on `main`, the 10 that lose it
to a demotion all land in a heading scope indented by a tab or by four spaces. The other 2 land
in an ordinary list, and lose it to a table claiming a line with a pipe (case 4's second half).

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

Case 3, the same reading applied to the demotion itself. A payload ending in a rule spelled
`- - -`, landing where `---` would have become a paragraph:

```
 clipboard    before       first reading    this change
┆- item      ┆## H2       ┆## H2           ┆## H2
┆- - -       ┆‸⏵   body   ┆⏵   item        ┆⏵   item
                          ┆                ┆⏵   - - -
                          ┆⏵   - - -       ┆⏵   body
                          ┆
                          ┆⏵   body
```

No node is lost in either column — `\t- - -` is a list item, and `\tbody` at column 4 does not
reach its content column 6 — so the first reading's two blank lines separate nothing. The
differential's payload set had only the unspaced spelling, and the first unit test walked
`    ---` and `\t***`, which are exactly the spellings where the paragraph answer is right; the
divergence came out of a sweep comparing `kindAsWritten` against `parse` over every rule spelling
and whitespace shape.

Case 4, the seam BELOW a demoted node. An `html` block runs to a blank line whatever its lines
hold, so at column 0 `<div>` over a table is one block; past the margin each line opens what it
opens at its own column, and the same bytes are a paragraph and then a TABLE. The seam below the
node is that table's, not the opening line's. Found by review (Copilot, on the second
checkpoint), through a real caret paste:

```
 clipboard    before        first reading    this change
┆<div>       ┆## H2        ┆## H2           ┆## H2
┆| a |       ┆‸⏵   | b |   ┆⏵   <div>       ┆⏵   <div>
┆| - |       ┆⏵   | - |    ┆⏵   | a |       ┆⏵   | a |
                           ┆⏵   | - |       ┆⏵   | - |
                           ┆⏵   | b |       ┆
                           ┆⏵   | - |       ┆⏵   | b |
                                            ┆⏵   | - |
```

The first reading judged the whole node by its opening line, a paragraph, and a paragraph needs
no separator before a table — so the existing table took the pasted rows. `main` separates here,
because an `html` leaf separates from everything; the first reading was the regression. The seam
below a node is now asked of `parse` over the node's own lines (`tailAsWritten`), since the parse
is what decides where one block of them ends and the next begins.

Reading the tail correctly exposed one more rule: a table's loop claims every following line that
carries a `|`, whatever it opens, and the table branch separated a table only from another table.
With the tail read as a table, a line like `- see [[a|b]]` below it would have become a row.
The branch now follows its loop — any node whose first line has a pipe — which also closes the
pre-existing half of [#197](https://github.com/laughedelic/obsidian-true-outliner/issues/197).

## The differential

924 (destination, anchor, position, payload) combinations through `insertSubtrees` — twelve
destinations covering tab-indented and four-space-indented heading scopes, list scopes two and
three levels deep, mixed documents, a table and a line carrying a pipe, crossed with fourteen
payloads covering every margin-anchored kind, both rule spellings, an `html` block holding a
table, a payload ending in a table, `code`, `table`, a setext heading and a plain section. The
probe is `prototypes/seam-differential/`.

A row is wrong when the payload arrives as FEWER nodes than it carried, or when a node the
destination already held does not come back with exactly its own lines. The second check is the
one case 4 needed: a demoted `html` block that splits into two nodes and loses one of them to a
merge nets out in a bare count.

| | `main` | this change |
| --- | --- | --- |
| rows | 924 | 924 |
| rows where the payload arrives short | 12 | **0** |
| rows where an existing node changes | 8 | **0** |
| rows where the payload arrives as MORE nodes | 12 | 12 |
| verdicts changed | — | 0 |
| encodings differing | — | 49 |

The 12 that arrive as more are the same rows on both sides: an `html` block holding a table,
demoted, re-parses as a paragraph and a table. That is #158's kind half, which this change does
not touch — no node is lost, one becomes two. Of the 49 differing encodings, 12 add a separator
where the re-parse needed one and 37 remove one where nothing did. No row is wrong here that was
right on `main`.

## Seams that are still wrong, and were before

A second measurement, taken during the review round: every bare seam between two sibling roots
through `finalize` directly, rather than through `insertSubtrees` — nineteen node samples, each
at columns 0, 2 and 4, on both sides. A pair is wrong when either side does not come back as
exactly the blocks its own lines form alone. The probe is
`prototypes/seam-differential/seam-sweep.test.ts.txt`.

| | pairs | pairs wrong |
| --- | --- | --- |
| `main` | 3 249 | 296 |
| this change | 3 249 | 63 |

The 63 fall into three groups, each re-run through the caret-paste path (`computeVerdict`) to
find out whether a gesture reaches it:

| group | pairs | through a paste | where it lives |
| --- | --- | --- | --- |
| a paragraph dedented to where its text opens a block | 54 | yes | [#198](https://github.com/laughedelic/obsidian-true-outliner/issues/198) |
| a list item's sibling seam names two of the five kinds its continuation claims | 5 | no | [#197](https://github.com/laughedelic/obsidian-true-outliner/issues/197), its latent half; closed by [#246](https://github.com/laughedelic/obsidian-true-outliner/pull/246), where the seam asks the continuation loop's own predicate |
| `---` / `---` at the document start | 4 | — | settled in `paste-across-encoding-regimes`: Obsidian reads it the same way |

A fourth group — a table claiming the next line that carries a `|`, 18 pairs on `main` — is
closed here (case 4). Two of the 54 are pairs `main` got right by accident: a promoted `<!--`
paragraph before a `- - -` rule at column 4, which `main` separated for the rule's sake and this
change correctly reads as a list item. No paste found here reaches them, and #198's fix closes
them with the rest.

That the property suite saw none of this — nor #158 itself — is
[#199](https://github.com/laughedelic/obsidian-true-outliner/issues/199).

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
