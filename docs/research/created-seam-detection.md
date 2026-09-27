# Telling which seams an operation created

`created-seams-are-separated` writes one blank line at every seam an operation creates outside a list
(`lazy-continuation-at-seams` has the why). That rule needs an answer to one question: which seams did
this operation create? Five answers were proposed and reviewed before one was kept. This note records
each answer, what the reviews found against it, and why it was dropped or kept, so the comparison can be
re-run from another angle.

Glyphs in the drawings: `┆` is a column's left edge, and `▒` is a block-selected line. Carets are not drawn.

## What every answer had to satisfy

These were settled before the question arose, and every approach below is held to them:

- **One blank line at a created seam outside a list.** It applies to every created seam, not only those some
  reader continues lazily.
- **Inside a list, the list decides.** A blank line there makes a tight list loose in every reader but ours,
  reading mode's markup included (`lazy-continuation-at-seams`, "Measured: loose lists").
- **A seam the user wrote is not touched,** however flush.
- **A seam is never widened.** Only an empty seam gains a line.
- **A block id stays on its block.** A lone id line stays flush above the block below it, since a blank line
  there re-attaches it to the block above.
- **A pasted payload's own seams are created.** Its text is new to the note.
- **An Enter place is separated on both sides.** A Shift+Enter place is adjacent.

The two readings the rule must not confuse:

```
 a seam the user wrote      a seam an operation created
┆> q                        ┆## H
┆body                       ┆first      <- pasted
                            ┆
                            ┆> quote    <- pasted
                            ┆below
```

Both are a quote written flush above a paragraph. The left one stays as written. The right one has to be
separated, since reading mode draws `below` inside the pasted quote.

## 0. Today: separate only where our parse needs it

`needsBlankBetween` separates two blocks only where our own parse would merge them. Our parse models no
lazy continuation, so every seam above is left flush, the created one included. This is the defect the
change exists to fix.

## 1. By kind: separate only what some reader continues

Keep the minimal rule, and add the rows of `lazy-continuation-at-seams`'s tables: separate a quote, a
callout or a list item from a following paragraph, table, pipe line and so on.

**Dropped before review.** The table is per reader, and reading mode already continues more than CommonMark
does: it continues a `<div>` or a quote into a list item. A writer built on it has to track every reader's
behaviour as it changes. The decision was to separate every created seam instead. It still needs the
question this note is about.

## 2. By node-id pairs

A seam is a pair of node ids: the block above it and the block below it. A seam is created when that pair
was not adjacent in the document before the operation. Node ids survive a surgery, and a new node gets a
fresh one.

**What the review found:**
- **A split, a merge and a drafted sibling heading give a block a new id without moving the seam below it.**
  Enter mid-text in a paragraph written flush above `# H` would separate `# H` from the lower half:
  ```
   before         2's result
  ┆para text     ┆para
  ┆# H           ┆
                 ┆text
                 ┆
                 ┆# H
  ```
  The same happens to a merge's survivor, and to the heading Shift+Enter drafts.
- **A type-over loosened a tight list.** It runs a deletion and an insertion through two `finalize` calls.
  The deletion separated the seam it left, and the insertion then carried that blank line into the list.
- **An exemption for "two list items" did not keep lists tight.** A blank line above or below a code block
  inside an item loosens the whole list, although neither side of that seam is a list item.
- **A lone id line gained a blank line below it** and re-attached to the block above.
- **Two more gaps:** abandoning an unwrapped place left two blank lines, and a move that gained a blank line
  was no longer dispatched as a move.

## 3. Node-id pairs, with lineage and a kind clause

Revisions of 2:
- **Lineage.** An op that replaces a block names the old block whose seam the new one takes over. That covers
  a split's lower half, a merge's survivor and a drafted heading.
- **A kind clause.** A seam is also created when either block's kind as written changes, as when an indent
  turns a paragraph above `> q` into a list item.
- **The list's own separation.** A created seam inside a list takes that separation.

**What two reviews found:**
- **Lineage for a type-over cannot be built.** The replaced blocks are gone from the document the insertion
  starts from. Substituting on the seam's upper side only, as a merge needs, can never reach the seam above
  a type-over's first block.
- **The kind clause broke the drafted heading.** A drafted heading's lineage is the last block of the
  original's section, which is almost never a heading. So the seam below the new heading counted as created
  every time.
- **"The list's own separation" was read from the result.** In a small list the op creates every item seam,
  so pasting into a loose `- a` / blank / `- b` read "none" and tightened it.
- **The insertion's carry already loosens a tight list at its edge,** which is #272.
- **The outdent-dissolve place was missed.** Enter on an empty item under a paragraph writes the place
  directly under the list, where the typed text reads as a lazy continuation.

Each fix exposed the next op that rewrites a block in its own way.

## 4. By line diff

Drop identity. Align the note's lines before and after the operation, and call a seam created where text
was inserted. The seams at the edges of text rewritten in place stay the user's, unless the kind at the
edge changed.

It reads splits, merges and type-overs well:

```
 before         4's result
┆# H           ┆# H
┆para text     ┆para
┆> q           ┆
               ┆text
               ┆> q
```

**What the review found:**
- **The alignment dispatch uses never matches a moved line.** It anchors on lines unique to both sides and
  keeps them in order, so a moved block reads as removed in one place and inserted in another. Every seam
  inside a moved run then counts as created:
  ```
   before     4's result
  ┆# A       ┆# A
  ┆> q       ┆# B
  ┆body      ┆x
  ┆# B       ┆> q
  ┆x         ┆
             ┆body
  ```
  Where the mover has more lines than the block it passes, the passed block reads as the one that moved,
  and its seams are separated though nothing touched it.
- **The kind clause fired on joins no reader continues.** ⌫ at the content start of `- a` under `para`
  merges them, and the edge block changes from a list item to a paragraph. So `paraa` / blank / `- b` gains
  a blank line.
- **Some insertions read as replacements.** A drafted heading carrying a title's remainder reads that way,
  so it was left flush.
- **A lone id dropped between a lead paragraph and its list** read as an insertion edge and was separated,
  which contradicts `misplaced-block-ids`.
- **A block can move into a list item's context** without its lines or its kind changing.
- **A blank line above a block indented four columns past its margin** turns it into indented code in
  CommonMark.
- **Every op would encode the whole note twice.**

## 5. By marking: each operation separates the seams it creates

Every op already knows where it writes a new boundary, which is how the heading-first-child convention works
today ("applied by the operation that creates the boundary"). The rule becomes a list, one entry per op:

| operation | seams it separates (outside a list, only if empty) |
| --- | --- |
| insert, paste, drop, move to another scope | the run's two outer seams; the seams inside a pasted payload |
| delete, move out | the seam that joins the blocks around the removed run |
| split | the new seam between the halves |
| Enter place | both sides of the place |
| merge, indent, outdent, type-over's outer seams | none, unless the op changes the kind of the block at that seam |
| same-scope reorder, id drop | none |

Nothing is inferred, so no op's own way of rewriting a block can be misread. The review cases 2 to 4 failed
on are each answered by the table:
- a split's and a merge's outer seams are not marked
- a moved run's inner seams are not marked
- a type-over's outer seams are not marked
- a lone id's drop marks nothing

**What the review found.** Most findings were places where the spec text still contradicted the table:
- a reorder that gained a blank line
- a list's first item made at a heading's content start
- places inside lists stated without the list's exception
- a four-column limit that overrode the parse
- two paste paths and the group outdent that the marks never reached

Two were real gaps in the table: joins that change a block's kind.
- **A merge.** ⌫ at the content start of `para` merges it into `- a` above it. The merged block is a list
  item now, so a `> q` or a table written directly below it reads as the item's text.
- **A type-over.** `> z` pasted onto an empty `- ` under `- a` takes the empty item's tight seam. That seam
  was inside the list and now is not.

Both are closed by one addition: **an op that changes a block's kind marks that block's outer seams.** Each
op knows both kinds at the point it writes the block, so this is the kind check 3 and 4 inferred, now stated
by the op. It also closes 5's first draft gap, an indent or outdent that converts a block next to a flush
quote.

**Accepted gaps.** Each keeps its content, and how often each occurs in real notes is unmeasured:
- **A block that comes into a list item's context without its lines or kind changing,** after a delete above it.
- **A same-scope reorder,** which keeps its rule that blank lines stay with the positions.
- **A single block pasted natively,** which never reaches an operation.
- **A cut and paste versus a move.** A move keeps a run's inner seams, while the same run cut and pasted is a
  payload, and its flush seams are separated.

The table is the spec. A new op has to state its row, and a missing row reads as "none", which is today's
behaviour.

## Comparison

| | decides by | stays correct when an op rewrites a block | failed on |
| --- | --- | --- | --- |
| 0. today | our parse | yes | every lazily continued seam |
| 1. by kind | a per-reader table | yes | not reviewed; the table is per reader |
| 2. id pairs | node ids | no | splits, merges, drafted headings, type-over, lists with code children |
| 3. ids + lineage + kind | ids, per-op lineage | only with correct lineage | type-over, drafted heading, list separation |
| 4. line diff | text alignment | yes, except moves | moves, cross-kind joins, remainders, id drops |
| 5. marking | the op itself, and the kinds it writes | yes, by construction | the accepted gaps above |

## For another review

- **Would the parser modelling lazy continuation make the writer simpler?** #261 is that question. With it,
  the floor alone would separate every lazily continued seam. But the parser would then read existing notes
  differently, which is why it was kept out.
- **Is every row of 5's table right?** A same-scope reorder and a type-over's outer seams are the ones a
  different reading of "created" would change.
- **Do 5's accepted gaps matter in practice?** A sweep of real notes through indents and outdents would say.
