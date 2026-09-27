# Paste fallback misfires

Why a paste written in the document's unit (#226) fell back to the clipboard's own characters on
blocks it could have converged, and what is left for the fallback once it no longer does. Found
while reading #244, whose example reached the fallback this way.

## Two misfires

`reindentSubtree` writes a block in the document's unit, reads it back on its own, and keeps the
block's own characters where the read-back parses as a different tree
([`paste-indent-convergence.md`](paste-indent-convergence.md)). Two defects sent blocks there that
converged correctly or could have:

- **The read-back dropped the root's own gap.** It cleared the root's `trailingGap` to leave out
  the blank line after the block, but a node's trailing gap is the blank line after its own lines,
  before its first child. `- p` / blank / `  para` read back as `- p` / `  para`, one item of two
  lines, and every block with a blank line between its root and its first child fell back. The
  block's final gap is what `stripFinalGap` clears.
- **A child spelled apart from its parent was carried by the root's prefix.** `rewriteOwnLine`
  kept a child's offset only where the child's line opened with its parent's own indentation.
  `⏵text` under `··- n`, at `n`'s content column, took the root's prefix swap instead: `··` went
  in front of the tab, the tab absorbed it, `text` fell short of `n`'s new content column, and the
  read-back sent the block to the fallback. The offset is now kept in columns, in spaces, for any
  line at or past its node's indentation; only a line short of it, a lazy continuation, is still
  carried with the root.

## Measured

Through `insertSubtrees` on `main` at `2c9dba2`, with the probes in
[`prototypes/paste-fallback-misfires/`](prototypes/paste-fallback-misfires/README.md). A run breaks
the tree when the pasted `- p` no longer re-parses as the tree the payload had.

| Payload indentation | Runs | Fallback on `main` | Fallback after both fixes | Tree broken on `main` | After both fixes | With #270 on top |
| --- | --- | --- | --- | --- | --- | --- |
| Spaces and tabs | 38 370 | 5 236 | 647 | 462 | 139 | 0 |
| Spaces only | 43 420 | 5 965 | 140 | 0 | 0 | 0 |

No run that converges on `main` falls back after the fixes. Every broken run is one that reached
the fallback; no converged run breaks the tree.

## What the fallback is still for

What still reaches it is the shape #226 built it for: a line that is text only because it sits four
or more columns into its container, and would open a block at the column the document's unit puts
it. The shortest, pasted after `  1. b` in `- a` / `  1. b`:

- `- p` / `⏵1. m` / `⏵··> q`: `> q` is six columns in, four past `- p`'s content column, so it is a
  paragraph. Written in the unit it lands at `- p`'s new content column and opens a quote.
- On `main`, the fallback writes `··⏵··> q`; the tab absorbs the two spaces in front of it, `> q`
  lands two columns past the content column, and opens a quote all the same.

That is #244's defect in a shape that needs the fallback. The 139 broken runs above are all of it.
