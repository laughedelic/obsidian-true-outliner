# A paste converges on the document's indent unit

A pasted subtree kept the clipboard's own indentation for every level below its roots. Reported
as [#216](https://github.com/laughedelic/obsidian-true-outliner/issues/216), `p1`, from everyday
use, and measured here against `main` at `ca1bc0a`.

`┆` marks a column edge, `⏵` a tab.

```
 clipboard    before        main           this change
┆- a         ┆- top        ┆- top          ┆- top
┆  - b       ┆⏵   - sib    ┆⏵   - sib      ┆⏵   - sib
┆    - c                   ┆⏵   - a        ┆⏵   - a
                           ┆⏵     - b      ┆⏵   ⏵   - b
                           ┆⏵       - c    ┆⏵   ⏵   ⏵   - c
```

The tree is the same in both. Only the characters differ.

## Where the clipboard's characters came from

`reencodeBlocksForDestination` (`src/ops.ts`) sends every block that keeps its kind through one
whole-subtree re-indent. That re-indent swapped the block root's own leading whitespace for the
destination's on every line that opened with it, and kept everything after that prefix. The
paste design's D15 chose it so that a tab-indented subtree copied within the vault would keep
its tabs. That holds when the clipboard came from the same document. A clipboard from a web
page, another app or an LLM answer indents with two or four spaces, and sometimes mixes them.
Its levels then carried those spaces into a tab document, or its tabs into a space document,
where the swap also put a space in front of every tab: `  ⏵- b`. A paste at the root has an
empty prefix to swap, so it carried the payload over exactly as it arrived.

## The reading: write each level from its depth

By the time the payload is re-encoded, its tree is known. So each level's indentation can be
written from depth rather than copied. A list item under a list item takes what an indent would
give it there: its parent's new indentation plus one of the document's units, padded with spaces
to the parent's content column where the unit falls short of it (`reachContentColumn`, as indent
already does under `10.`). The unit comes from the source indent uses, `inferIndentUnit`, which
falls back to the editor's **Indent using tabs**.

Two kinds of line keep their offset instead of taking a unit:

- **A node's own lines below its first, and a child that is not a list item.** A continuation, or
  a paragraph or block under a list item, sits at its item's content column. That column is a
  marker's width past the item, not a unit past it. The offset is kept after the new
  indentation, which gives #154's `⏵··bar` shape in a tab document. The clipboard's characters
  after the prefix are kept where they are spaces, or tabs going into a tab document, and land
  on the same column. A space unit gets the offset in spaces. A line that does not open with its
  node's indentation, such as a lazy continuation or one written in another unit, is carried as
  it was, as `main` carries it. A child that is not a list item is written at its parent's
  content column instead of at its offset whenever the offset would reach the content column of
  the re-laid item before it: that item has moved, and the parse would read the child as the
  item's own.
- **An atom's lines.** Whitespace inside a code block, a quote or a table is content. An atom
  moves as a unit by its first line's prefix through `reprefixLine`, the guarded swap #203 added
  for indent. So a Go snippet's tabs stay tabs.

A paragraph's child list also keeps its offset. It attaches by adjacency at any column
(`listAttachesTo`), and the destination rule for it is the paragraph's own indentation.

## A block that would read as another tree keeps its own characters

Laying nested items out afresh moves them relative to every line that keeps its offset. A line
that was text only because it sat four or more columns into its container, such as a lazy
`> q3` under a deep item or a continuation that starts with `|` or a number, opens a block once
the item above it moves left. The review round's fuzzer found these shapes one at a time, so
the rule is stated once, against the parse: each converged block is read back on its own,
re-rooted at column zero, and compared with the block as it arrived. Where the two trees
differ, the block is written as `main` writes it: its own characters past its root's prefix.

## The unit, read under a bullet

`inferIndentUnit` read the first indented list item's whitespace. A two-space document that
opens with a numbered list has that item under `1.`, at three spaces: `1. one` / `   - a`. Three
spaces there is the content column, not the unit. Writing every level from depth with that unit
put each bullet's child one column deeper than the document writes it, so a subtree copied from
the document came back in different bytes. The unit is now the step from a BULLET item to its
first indented child, because a bullet's marker is narrower than any unit. The first indented
item's whitespace remains the answer where no bullet has a nested child. The indent-unit
differential of #203 (`prototypes/indent-unit-differential/`, 690 rows) is unchanged by this:
none of its shapes opens with a nested item under a number.

## A move reads the unit before the removal

`moveSubtreesTo` re-encodes the run against the tree after the removal. A run that held the
document's only nested items then left a document with no evidence of its unit, and the editor's
setting answered for a document that had already chosen one. It now reads the unit from the
document as it was before the removal, and falls back to the editor's setting only when neither
tree has evidence. The drop preview already read the tree before the removal
(`drop-destinations.ts`, `writtenFirst`), so the preview and the result now agree on the
indentation they write.

## Measured

A differential over three things (the probe is in
[`prototypes/paste-indent-convergence/`](prototypes/paste-indent-convergence/)), each with a tab,
a two-space and a four-space fallback unit:

- a copy of every node's own subtree, pasted back after it,
- every node moved to be the first child of every list item outside it,
- the issue's matrix of one tree in five spellings into seven destinations.

It ran over sixteen targeted shapes and the eight corpus files, 1 774 rows.

| | rows |
| --- | --- |
| verdict changed | 0 |
| parsed tree shape changed | 0 |
| text changed | 120 |
| …a copy pasted back after itself | 9 of 396 |
| …a move | 75 of 1 329 |
| …the spelling matrix | 36 of 49 |
| a space in front of a tab, anywhere in the result | 15 on `main`, 0 here |

In the matrix, each destination took five different results from the five spellings on `main`,
and takes one here.

The nine self-paste rows come from two documents that are themselves indented two ways. In one,
a `⏵- c` sits under a two-space `  - b` and is written back in spaces. In the other, a paragraph
in `05-edge-zoo.md` continues with a space in front of a tab, and is written back at the same
column in spaces. Every other copy pasted back after itself is byte-identical, including those
from a tab document, a four-space document, and a two-space document under `1.` and `10.`.

The move rows are the same convergence, reached through a move:

- A run that held its document's only nested items keeps the document's unit instead of taking
  the editor's (`03-mixed.md`, `07-flat-list-note.md`, and four targeted shapes).
- A heading converted into a list writes its section in the unit rather than at its content
  column in spaces (`03-mixed.md`, `05-edge-zoo.md`).
- A run moved under a bullet in the numbered-first shape lands at that bullet's content column
  (`     - c` / `       - x`) rather than one column past it.

`tests/edit-ops.test.ts` states the invariants directly:

- every spelling lands in the same bytes at five destinations,
- a copy of every list item in five documents comes back byte-identical,
- a continuation, a fenced block, a numbered parent and a converted heading each land as
  described above,
- a move keeps the document's unit,
- an indent reads the unit under a bullet.

### Against random documents

The review round's fuzzer (`prototypes/paste-indent-convergence/fuzz.ts.txt`) generates random
documents and payloads in tabs, one to four spaces and mixed units. Its markers are `-`, `*`,
`1.`, `10.`, `100.` and `2)`, with runs of one to three spaces or a tab. Its lines include
continuation and lazy lines, with fences, quotes and tables as children. It compares the tree
each result re-parses to with the tree intended, the payload's own shape spliced in at the
destination. Over 20 000 cases each:

| | `main` keeps the tree and this change does not | the reverse |
| --- | --- | --- |
| `insertSubtrees`, every shape | 4 | 272 |
| `insertSubtrees`, no tab marker runs or headings | 3 | 217 |
| `moveSubtreesTo` | 0 | 59 |
| `indent` | 0 | 0 |

Before the read-back and the two rules above it, the first row was 351 against about 170.
Writing a converted block's children in the unit (below) took the right-hand column from 148,
80 and 27 to the figures shown, and the left from 2 and 1 to 4 and 3. Each residual row is a
payload several levels deep in mixed tabs and spaces, with lazy lines. Read back on its own, it
parses to the same tree either way. What differs is the destination's own next line, a
continuation the pasted run's last item now reaches.

## A converted block's children

A list pasted where only a paragraph can stand converts its root to a paragraph, and a paragraph
with a list pasted into a list converts its root to an item. The conversion goes through
`reencodeForDestination`, whose conversion branches move the children by the column the marker
shifted them, in spaces. After a paragraph in a tab vault, a tab clipboard landed as `a` /
`  - b` / `⏵  - c`, and a clipboard in any other unit landed in that unit.

The paste path now writes the converted block's own lines through `reencodeForDestination`, and
lays out its children as `layChildren` lays out any item's. A converted node's content column
has changed, so a child's offset from it describes nothing. Under a paragraph, the children
take the paragraph's own indentation, which is where `chooseIndent` puts a paragraph's list.
Under an item, a list item goes one unit past the item and anything else goes to its content
column. The read-back applies here too, compared with the conversion as `main` writes it.
Indent and outdent convert through the same branches, and they are unchanged here:
[#215](https://github.com/laughedelic/obsidian-true-outliner/issues/215) stays open for them.

## An empty note

Every line of a note with no node parses into the preamble, and the preamble is outside the
outline's jurisdiction. So a paste into an empty note, or below a template's frontmatter, went
to Obsidian untouched and kept the clipboard's indentation, the one place a first paste could
not converge. `isEmptyBodyLine` (`src/locate.ts`) gives a note with no node jurisdiction over
its blank lines past the frontmatter. A structural paste there writes the payload as the root's
children through the same re-encode. Blank lines above the caret stay above it, and those below
it become the run's trailing gap. The frontmatter stays out of reach, and plain text still goes
to Obsidian.

## What this does not reach

- **Indent and outdent's conversions** keep moving a converted node's children by a width in
  spaces ([#215](https://github.com/laughedelic/obsidian-true-outliner/issues/215)).
- **Blank lines above a note's first node**, when the note has nodes, are still preamble, and a
  paste there goes to Obsidian.
- **A document indented two ways.** The unit is one answer per document. A paste into a document
  whose lists already disagree converges on whichever unit `inferIndentUnit` reads, as an indent
  there does.
