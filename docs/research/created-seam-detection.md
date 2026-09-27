# Telling which seams an operation created

`created-seams-are-separated` writes one blank line at every seam an operation creates outside a list
(`lazy-continuation-at-seams` has the why). That rule needs an answer to one question: which seams did
this operation create? Six answers were proposed and reviewed in turn. This note records
each answer, what the reviews found against it, and why it was dropped or kept, so the comparison can be
re-run from another angle. A step-back review then read the whole record at once, alongside the two
placement-grammar branches; what it found closes the note.

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

**What the second review found.** The table held, and the gaps were the same kind of case each time: an op that
moves a block across a list's edge, or changes what the block above a seam can swallow, without the table naming
that seam.
- **⇧⇥ on `  > q` under `  - b`** outdents the quote to the root, directly under the list, and reading mode draws it
  inside `- b`. A drag producing the same tree is separated, and the outdent is not.
- **A split with a list donor.** Enter mid-title in `# Hello world` above a quote and a list makes the remainder
  `- world`, and the quote below it is left flush.
- **Block-id corrections.** "Remove the id" and "attach to `b`" join a quote to a list item.
- **The same structure spaced by gesture.** Enter at the end of `# H` and Enter at the content start of `- a` both
  give `# H` / `- ` / `- a`, and the table spaced them differently.
- **The kind clause was too broad.** It fired when a paragraph absorbed a list item, the case 4 already recorded as
  firing on joins no reader continues.
- **A false premise.** The parse floor is not a no-op on parsed notes: it separates a flush quote, callout or rule
  under a list item on any operation (#255).

## 6. By edit site: every seam next to what the operation wrote

The second review's cases share one property: the op rewrote a block, or moved something away from between two
blocks, and the seam next to that went unnamed. So the rule names the seams by that property instead of by op. A
seam is at the EDIT SITE when either:
- its lower block was written (new, its text or kind changed, or a new parent or previous sibling)
- its upper block was written (new, or its text or kind changed)
- its two blocks were not consecutive before

Every seam at the edit site outside a list is separated.

This judges BLOCKS by node id, and a block's identity survives every surgery. What 2 and 3 judged was seam pairs,
which a split or a merge rearranges without moving the seam. A moved subtree's inner blocks keep their lines,
parent and previous sibling, so its inner seams are not at the edit site. A split, a merge and a type-over now
separate their outer seams, which 3 to 5 had tried to keep the user's. That was accepted in review: changes next to
the edit site are expected, and seams away from it stay as written.

A bound limits the damage a renewed id could do: a seam counts only inside, or at an edge of, the text the op
changed. A surgery built from a fresh parse can then separate nothing outside the lines it touched.

What it closes, by construction:
- **5's list-edge cases.** The outdented quote, the donor split's `- world` and the corrected id's block are all
  written blocks.
- **The gesture split.** The new `- ` is written either way.
- **The kind clause,** which a written block's changed text or kind now covers.

What it leaves:
- **A single block pasted natively,** which never reaches an operation.
- **Shapes inside a tight list.**
- **#255.** The floor's own rewrite stays, and the change's byte-identical claims exclude it.

**What the review found.** The review ran each scenario's starting note through `parse`, the ops and `planKey`.
The "D1" columns below apply the rule by hand to today's surgeries.

The classifier's own gaps:
- **A run of several roots moved to another parent is separated between its roots.** Its second root has a new
  parent, so it counts as written. That contradicts D1's own table and the moved-run scenario:
  ```
   before    D1 as written    the scenario
  ┆## A     ┆## A            ┆## A
  ┆> q      ┆                ┆
  ┆body     ┆## B            ┆## B
  ┆         ┆text            ┆text
  ┆## B     ┆                ┆
  ┆text     ┆> q             ┆> q
            ┆                ┆body
            ┆body
  ```
  A new parent written only where the block has no previous sibling would close it.
- **Renumbering and heading-level shifts,** as the step-back review below found. They also contradict
  "Heading indent and outdent shift levels", "Sibling reordering" and "Operation closure", which the change
  leaves as they are.
- **Dropping a lone id writes its host.** `dropLoneId` rewrites `Lead.` to `Lead.` / `^id`, so the seam above
  `- a` is at the edit site, against `misplaced-block-ids`. It is 4's failure, back.
  ```
   before    D1 as written    misplaced-block-ids
  ┆Lead.    ┆Lead.           ┆Lead.
  ┆- a      ┆^id             ┆^id
  ┆         ┆                ┆- a
  ┆^id      ┆- a
  ```
- **Block-id corrections never reach `finalize`.** They are raw edits built in `src/block-ids.ts` and applied
  by `src/plugin/misplaced-ids.ts`. Routed through the pass, "Attaching to the lead paragraph" would gain a line
  above `- a`, again against `misplaced-block-ids`.
- **The changed-region bound can drop a seam at the edit site when text repeats.** The region comes from the
  longest unchanged prefix and suffix, and with repeated lines it shifts off the change. `x` / blank / `z`
  pasted at the end of `> quote`:
  ```
   before      D1 without the bound    with it
  ┆> quote    ┆> quote                ┆> quote
  ┆x          ┆                       ┆x
  ┆           ┆x                      ┆
  ┆y          ┆                       ┆z
              ┆z                      ┆
              ┆                       ┆x
              ┆x                      ┆
              ┆                       ┆y
              ┆y
  ```
  The unchanged prefix is `> quote` / `x` / blank, so the pasted `x` lands outside the region and stays flush:
  the defect the change exists to fix. A deletion's join fails the same way.
- **One more encode per operation,** to find the region: the cost 4 was faulted for.

Where the rule meets the rest of the specs:
- **The group forms no longer equal their sequential composition,** as "Group forms of indent, outdent and
  reordering" requires. Its closure scenario compares trees gaps included (`treesEqual`). Each single-node step
  has its own edit site, which the one group `finalize` never sees. Block-selecting `a` and `> b` under `# X`
  and moving them up:
  ```
   before    group     sequential
  ┆# X      ┆# X      ┆# X
  ┆> p      ┆         ┆
  ┆a        ┆a        ┆a
  ┆> b      ┆> b      ┆
  ┆# N      ┆         ┆> b
            ┆> p      ┆
            ┆         ┆> p
            ┆# N      ┆
                      ┆# N
  ```
- **A type-over, a move to a list's edge and #255 break scenarios the change leaves or rewrites.**
  - "A type-over keeps the separation of what it replaced" is untouched.
  - The rewritten move scenario promises what #272 prevents.
  - The new requirement's "a seam away from the edit site is not touched" has no carve-out for #255, which
    appears only in the design.

The places half does not work as written:
- **An Enter position is never carried.** The design's "carried place" amendment rested on a misreading of
  #253. After ⏎ ⇥ the caret is at `- ┃para`, off the position, and `placeOutline` refuses a position that stands
  for a new node, which is what #253 itself records. The amendment applies only to Shift+Enter positions, which
  have no separators, and its task cannot pass.
- **A dissolved place leaves a node, not gap lines.** `outdentSurgery`'s dissolve and `splitNode`'s folded end
  leave an empty paragraph node, which the pass treats as a written block. And `applyGroups` keeps only each
  step's document, so a record on the surgery does not survive a group form.
- **The removal contradicts itself.** Removing the place's line and the lines added beside it leaves `- item`
  flush above `next`, while the same text says the seam then holds one blank line.

The rest checked out: the pasted quote, the `<div>` drag, the `---` removal, the `para text` split, the merge
above `> q`, the `## Budget` reorder, the `^id3` lone id, the four-column payload, the type-over in a tight list,
the two gestures on `# H` / `- a`, a paste onto a place and Enter over a block selection each give the stated
result. Node ids survive every re-encode the review checked.

**Revised after both reviews.** The step-back review and 6's review pointed the same way, and the maintainer
took their recommendations:
- **A block is judged on the outline, not its text** (the step-back review's alternative A). A block is written
  when it is new, or its kind, its content without indentation, marker, ordinal or id, or a heading's level
  relative to its parent changed. That closes renumbering, level shifts and the id drop.
- **A new parent counts only for a block with no previous sibling,** which closes the multi-root move.
- **The text-region bound is dropped.** Ids are never reused, and every caller passes the document its surgery
  was built from, so identity alone bounds the edit site. That closes the repeated-text case and the extra encode.
- **A group operation has one edit site for the gesture.** Its equality with the sequential composition holds
  with blank lines set aside.
- **Places, block-id corrections and #272 leave the change.** Places wait on #253's decision.
- **A seam oracle comes first,** and its count of seams separated where no reader continues decides alternative
  B before the change lands.

## Comparison

| | decides by | stays correct when an op rewrites a block | failed on |
| --- | --- | --- | --- |
| 0. today | our parse | yes | every lazily continued seam |
| 1. by kind | a per-reader table | yes | not reviewed; the table is per reader |
| 2. id pairs | node ids | no | splits, merges, drafted headings, type-over, lists with code children |
| 3. ids + lineage + kind | ids, per-op lineage | only with correct lineage | type-over, drafted heading, list separation |
| 4. line diff | text alignment | yes, except moves | moves, cross-kind joins, remainders, id drops |
| 5. marking | a per-op table | yes, by construction | ops that move a block across a list's edge |
| 6. edit site | which blocks the op wrote, by id, within the changed text | yes, by construction | text-derived rewrites, multi-root moves, id drops, repeated text, group forms, places |
| 6, revised | which blocks' outlines the op changed, by id, for the whole gesture | yes, by construction | under review; the oracle checks it |

## A step back: what the reviews were about

After approach 6, one review read this whole record rather than a proposal, together with the two
placement-grammar branches, `chore/node-placement-grammar` and `chore/placement-grammar-formalization`. Its
question was whether the approaches were going in circles.

### Two questions under "created"

- **Q-a: may this seam be rewritten?** That is fidelity to what the user wrote, and it needs the note as it
  was before the op.
- **Q-b: what does a blank line do here?** That is structure: lists, block ids, indented code, places.

Approaches 2 to 6 differ only in their answer to Q-a. Their answer to Q-b is the list under "What every answer
had to satisfy", unchanged throughout. So a finding about Q-b recurs under every approach, and says nothing
against any one of them.

The review sorted the 31 findings recorded above. The families are its own reading of this note:

| family | findings |
| --- | --- |
| the defect itself: a seam some reader continues was left flush | 8 |
| spacing at a seam no reader continues | 8 |
| a list turned loose | 5 |
| a blank line changes a block: a lone id, indented code | 4 |
| mechanics: dispatch, lineage, cost, #255 | 4 |
| places | 2 |

- **All 8 defect findings have a quote, a callout or a list item above the seam.** Five of them are a list item
  directly above `> q`, which reading mode alone continues (`lazy-continuation-at-seams`, "Measured:
  CommonMark").
- **The 8 spacing findings exist because the rule writes a line at every created seam.** Each time a
  classifier fired wrongly, the result was visible, whether or not any reader would have continued the seam.

**The verdict: the classifier converges.** 6 closes by construction what failed 2 to 5: the identity lost in
splits, merges and type-overs, and the rows missing from a per-op table. To leave a seam flush wrongly, 6 needs
a seam whose two blocks were both unwritten and consecutive before. Any change to the upper block's containers
gives the lower block a new previous sibling, so the review could not build such a case. That is not a proof.
What keeps producing findings is the method: every design was checked only against cases built by hand.

### Where 6 is still exposed: "written" is judged on text

Some ops rewrite text they derive from position rather than from what the user asked for: an ordered list's
numbers, and heading levels. The "today" columns are measured through `deleteSubtrees` and `indent` on the
current ops. The last column is D1 as written, read by hand.

**Deleting `1. a`.**
```
 before     today      D1, by text
┆1. a      ┆1. b      ┆1. b
┆2. b      ┆2. c      ┆2. c
┆3. c      ┆para      ┆
┆para                 ┆para
```
Renumbering rewrites `2. c`, so the seam below the list is at the edit site. Before the delete, CommonMark and
reading mode both draw `para` inside item `c`, a lazy line the user wrote. D1 moves it out of the item, two
items away from the deletion, and in a longer list the seam can be any distance away.

**⇥ on `## B`.**
```
 before     today      D1, by text
┆# A       ┆# A       ┆# A
┆## B0     ┆## B0     ┆## B0
┆## B      ┆### B     ┆
┆text      ┆text      ┆### B
┆### C     ┆#### C    ┆
┆body      ┆body      ┆text
┆### D     ┆#### D    ┆
┆more      ┆more      ┆#### C
                      ┆
                      ┆body
                      ┆
                      ┆#### D
                      ┆
                      ┆more
```
Every heading in the run changes its text, so six seams gain a line, and no reader continues any of them.
D1's table keeps a moved run's inner seams "unless it was re-indented into another kind". A heading run
shifted a level changes no kind and still loses them. The moved-run scenario avoids this only because its run
keeps its depth.

### What the placement-grammar branches bring

Both branch from `c6b12c5`, 24 commits behind `main`.

- **`chore/node-placement-grammar`** (`docs/research/node-placement-grammar.md` there) writes down what `parse`
  admits as a small tree grammar. It models every op as a tree edit plus one explicit conversion, with the
  re-parse as a second, implicit one, and sweeps labelled nodes through drops, indents, outdents, moves and
  pastes. Its principle: a mark an author wrote is kept, and the unmarked kind joins its neighbours.
- **`chore/placement-grammar-formalization`** (`docs/research/placement-grammar-formalization.md` there) shows
  that grammar is local.
  - Its sibling rules only look at two adjacent blocks.
  - A placement's verdict depends only on the parent, the two neighbours and the moved kind.
  - It frames the tree-to-outline mapping as a lens: `get` forgets markers, indentation, blank lines and
    numbers, and `put` re-derives them.
  - It leaves open whether that locality survives the text layer in tight notes, which is this question seen
    from the grammar's side.

For this question, they give four things:

- **Q-b is structural.** Outside a list, the canonical answer is one blank line. The node-placement principle,
  applied to gaps, settles lists: a gap the author wrote is kept, and a gap nobody wrote takes the list's own
  separation from before the op. That is #272's fix, and reading it from before avoids 3's failure.
- **Q-a is not structural.** "A seam the user wrote is not touched" needs the note before the op. The lens
  names the least history that answers it: the old and new outline, rather than the op's history or the text.
  The seam rule is then a Retentiveness law: the layout between blocks whose outline is unchanged is kept, and
  the rest is derived. That is approach 6 comparing outlines where it compares text, and it answers both cases
  above.
- **The same edit site, derived another way.** For moves, insertions and deletions, the formalization's seven
  admissibility checks name the seams D1 names:
  - the source seam
  - the destination's left, right and parent pairs
  - the converted roots
  - columns
  - whether the writing re-reads as intended

  A uniform level shift is only a bounds check there, which again puts a shifted run's inner seams outside the
  edit site.
- **An oracle.** The labelled generator, the op sweeps and `prototypes/lazy-continuation/commonmark-lazy.mjs.txt`
  combine into one test, so a review can check counts rather than build cases.

### The alternatives

**A. The edit site judged on the outline.**
- **The rule.** A block is written when its outline changed: its kind as it will re-parse, its content without
  indentation, list marker or ordinal, a heading's level relative to its parent heading, its parent, or its
  previous sibling. Renumbering and a level shift no longer write a block.
- **Lists, optionally.** A seam inside a list takes the list's separation from before the op, which closes
  #272. A list that is new as a whole then needs a default.
- **Cost.** 6's, plus the view, which has to be right for every kind, tasks and setext headings included.

**B. Separate only a seam some reader could continue.** This is a change of goal, not of classifier.
- **The rule.** Keep A's test for which seams may be rewritten. Outside a list, add a line only where the upper
  block ends in or inside a quote, a callout or a list item, and the lower block does not open with an ATX
  heading, a fence, or a `-`, `*`, `+` or `1.` marker.
- **Why it is not approach 1.** Those openers interrupt a paragraph in CommonMark, and every measured reader
  reads them as blocks of their own. It is the test `lazy-continuation-at-seams` already ran on the corpus.
- **What it changes.**
  - The 8 defect findings stay closed.
  - The 8 spacing findings and the lone-id exemption do not arise.
  - It reverses the settled "one line at every created seam".
  - Spacing varies by kind within one op's result: the split of `para text` above `# H` leaves `text` flush
    above `# H`.

**C. The parser models lazy continuation (#261).**
- **The rule.** Our parse reads a flush paragraph line under a quote, a callout or a list item as part of that
  block. The floor alone then separates every such seam an op writes, with no history.
- **What it misses.** A list item above `> q`, which is five of the 8 defect findings, a list item above a
  `<div>`, and a quote above `2. x`. Reading mode alone continues those.
- **Cost.** Existing notes read differently in the outline, and Live Preview and reading mode disagree on list
  items, so the outline has to pick one.

### Its recommendations

1. Continue with 6.
2. Judge "written" on the outline (A), and fold #272 in if it is in scope.
3. Build the seam oracle before implementing, and record its figures here. Over generated notes whose gaps vary
   (flush, one line, two, including flush seams the user wrote under containers), every op must:
   - keep the bytes of a seam between unchanged blocks
   - agree with CommonMark and reading mode's three extra rows at every derived seam outside a list
   - flip no list between tight and loose
   - re-attach no id
   - write no indented code

   The oracle also counts the seams that gained a line where no reader continues.
4. Decide B once that count exists.
5. Keep C on #261's own track, not as a substitute.
6. Optionally, split places into a layer of their own: D5, their abandonment and the #253 extension. They do not
   depend on how seams are chosen.

The review left unverified that 6 misses no seam, its own cost estimates, how often user-written lazy lines occur
in real notes (the corpus holds test notes only), and whether the view covers every kind.

## For another review

- **What the oracle counts.** How many seams each op separates where no reader continues, and whether any
  derived seam still disagrees with a reader. B is decided on the first figure.
- **Whether 6, or A, misses a seam.** The step-back review could not build a case against the classifier. The
  one 6's review built, repeated text, comes from the changed-region bound, not from the classifier. The oracle
  is the check.
- **What the group forms promise about gaps.** Their equality with the sequential composition includes gaps
  today, and an edit site per step differs from one per gesture.
- **How often a user writes a lazy line on purpose.** The corpus holds test notes only.
- **Is every row of 5's table right?** A same-scope reorder and a type-over's outer seams are the ones a
  different reading of "created" would change.
