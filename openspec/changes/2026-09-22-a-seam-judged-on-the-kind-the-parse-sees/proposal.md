## Why

A paste whose payload ends in a `quote`, a `callout`, an `hr` or an `html` block, landing in a
scope whose content is indented past column 3, loses a node. Reported as
[#158](https://github.com/laughedelic/obsidian-true-outliner/issues/158), p0, and reproduced
against `main` at `11648bd` through `insertSubtrees`. `‸` is the insertion point; the carets the
results leave were not measured.

```
 clipboard    before       main           this change
┆- item      ┆## H2       ┆## H2         ┆## H2
┆> quote     ┆‸⏵   body   ┆⏵   item      ┆⏵   item
                          ┆⏵   > quote   ┆
                          ┆⏵   body      ┆⏵   > quote
                                         ┆
                                         ┆⏵   body
```

`main`'s four lines read back as a heading and ONE paragraph carrying three: both payload nodes
and the section's own paragraph are gone from the outline.

`finalize` (src/ops.ts) normalizes boundaries on the tree and then encodes it, and nothing
re-reads the lines in between. At normalize time the node is still a `quote`, and
`needsBlankBetween` is right about a quote — a `>` line does not claim the paragraph below it.
By parse time the same line sits at column 4, where `QUOTE_RE`'s `^ {0,3}` no longer reaches it:
it is a paragraph, and a paragraph claims the next line as a continuation. The boundary rule and
the parser disagree about what the node is, because the re-indent happened between them.

The same disagreement runs the other way and writes a separator nothing needs: below an `html`
block the seam always takes one, because an HTML block ends at a blank line rather than at its
closing tag — but at column 4 there is no HTML block, and the list item that follows opens its
own block regardless.

`docs/research/seams-across-a-re-indent.md` carries the frames, the column table for every
margin-anchored kind, and a differential against `main` over 696 (destination, anchor, position,
payload) combinations: `main` loses a payload node in 8 of them and this reading in none, no
verdict changes, and the 27 remaining differences are separators removed — 7 below a demoted
`html` block, 20 around a rule that is a list item where it lands.

## What Changes

- `parse.ts` states the margin its own anchors carry (`OPENING_MARGIN`) and answers what a node's
  lines PARSE AS where they now sit (`kindAsWritten`). `hr`, `quote`, `callout`, `html` and a
  heading are recognised only within three columns of the left margin. What the line becomes past
  it is read off the line: `LIST_ITEM_RE` has no margin, so `- - -` and `* * *` open a LIST ITEM
  at column 4 where `---` opens nothing and is a paragraph. A setext heading is judged on its
  underline, which is the line carrying the anchor.
- `needsBlankBetween` and the first-child continuation check in `normalizeBoundaries` (src/ops.ts)
  ask `kindAsWritten` instead of reading `node.kind`. No rule in either changes; what changes is
  which node each rule is applied to.

## Non-Goals

- **[#158]'s other half, the KIND loss.** An atom re-indented past the margin is still read back
  as a paragraph, so the outline still shows a paragraph where the document showed a rule. Every
  node survives now; one of them survives as something else, and the issue stays open on that.
  The research note adds the measurement the issue asked for and did not have: CommonMark
  measures indentation RELATIVE to a block's container, so `    ---` under `  - two` is a
  thematic break to `commonmark` 0.31.2 and a paragraph to us. Closing it means giving `segment`
  a container stack — a parser change reaching every kind, every operation and the corpus, not a
  rider on a seam fix.
- **No new rule about what merges.** The five families `needsBlankBetween` names — paragraph,
  list-item, html, the quote/callout run, the table run — are unchanged, and so is
  `swallowedAsContinuation`'s list.

[#158]: https://github.com/laughedelic/obsidian-true-outliner/issues/158

## Impact

- Affected specs: `structural-operations` (a new requirement on boundary separation).
- Affected code: `src/parse.ts` (`OPENING_MARGIN`, `kindAsWritten`), `src/ops.ts`
  (`needsBlankBetween`, `normalizeBoundaries`), `tests/edit-ops.test.ts`.
