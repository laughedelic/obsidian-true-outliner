## Why

A pasted subtree keeps the clipboard's own indentation for every level below its roots. Reported
as [#216](https://github.com/laughedelic/obsidian-true-outliner/issues/216), `p1`, from everyday
use: web pages, other apps and LLM answers indent with two or four spaces, and a copy from a tab
vault carries tabs, so almost any paste from outside a note leaves it indented two ways.
`┆` marks a column edge, `┃` the caret, `⏵` a tab. The caret policy is unchanged and puts the
caret at the end of the pasted run.

```
 clipboard    before        main           this change
┆- a         ┆- top        ┆- top          ┆- top
┆  - b       ┆⏵   - sib┃   ┆⏵   - sib      ┆⏵   - sib
┆    - c                   ┆⏵   - a        ┆⏵   - a
                           ┆⏵     - b      ┆⏵   ⏵   - b
                           ┆⏵       - c┃   ┆⏵   ⏵   ⏵   - c┃
```

`reindentSubtreeVerbatim` (`src/ops.ts`) swaps the pasted root's leading whitespace for the
destination's and carries every descendant's whitespace past that prefix verbatim. That was the
paste design's D15, and it assumes the clipboard came from the same document. A paste at the
root has no prefix to swap and carries everything as it arrived.

`docs/research/paste-indent-convergence.md` carries the frames, which lines keep their offset
and why, and a 1 774-row differential against `main`.

## What Changes

- Every block that keeps its kind is re-indented from depth. The root takes the destination's
  indentation, and a list item under a list item takes its parent's new indentation plus one of
  the document's units, padded to the parent's content column where the unit falls short. That
  is what an indent writes there.
- A node's own lines below its first, and a child that is not a list item, keep their offset
  from the node, after its new indentation. They keep the clipboard's characters where those are
  spaces, or tabs going into a tab document. Otherwise the offset is written in spaces. A line
  that does not open with its node's indentation moves with the block by the root's prefix swap,
  as `main` moves it.
- An atom's lines move as a unit by its first line's prefix through #203's guarded swap, so
  whitespace inside code is not converted.
- A heading converted into a list writes its section's levels in the same unit, not at the
  item's content column in spaces.
- `inferIndentUnit` reads the step from a bullet item to its first indented child ahead of the
  first indented item's whitespace. Under `1.` that whitespace is the content column, and it read
  a two-space document as three.
- `moveSubtreesTo` reads the unit from the document before the removal, so a run that held the
  document's only nested items keeps the document's unit.
- A block whose kind converts on the way writes its children in the same unit. A list pasted
  after a paragraph becomes a paragraph with a list in the document's unit, and a paragraph
  with a list pasted into a list becomes an item whose list is laid out as any item's.
- A note with no node yet gives a paste jurisdiction over its blank lines past any frontmatter,
  so the first paste into an empty note, or below a template's frontmatter, converges too.

## Non-Goals

- **Indent and outdent's conversions.** They convert through the same branches of
  `reencodeForDestination`, which this change leaves as they are; that is
  [#215](https://github.com/laughedelic/obsidian-true-outliner/issues/215).
- **Blank lines above the first node of a note that has nodes.** They are preamble, and a paste
  there stays Obsidian's.
- **A document already indented two ways.** The unit is one answer per document, the one an
  indent there takes.
- **The caret.** Where a paste leaves the caret is `caret-placement-policy`'s, and unchanged.

## Impact

- Affected specs: `structural-operations` (the requirement "Subtree insertion at a boundary"
  replaces its verbatim clause with the document's unit).
- Affected code: `src/ops.ts` (`reindentSubtree`, `reindentSubtreeInUnit`, `convertInUnit`,
  `reencodeIntoListScope`, `inferIndentUnit`, `moveSubtreesTo`), `src/reencode.ts`
  (`rewriteOwnLine`, `reprefixAtomLines`), `src/locate.ts` (`isEmptyBodyLine`),
  `src/classify.ts` and `src/enforce.ts` (the empty-body paste), `tests/edit-ops.test.ts`, `tests/enforce.test.ts`,
  `e2e/specs/31-tab-indented-vault.e2e.ts`.
