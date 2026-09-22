## Context

`normalizeBoundaries` runs on the tree an operation produced, and `encode` runs after it. Every
rule in it reads `node.kind`, which is the kind the node had when the surgery built it. That is
the same kind the parse will read back for every node whose lines have not moved — which, before
the re-encode arms landed, was every node an operation touched. A payload converted for its
destination is the case where the two come apart: `reencodeBlocksForDestination` writes the
node's lines at a new column, and four atoms and the ATX heading are recognised only within
three columns of the left margin.

## Goals / Non-Goals

- **Goal.** A seam is separated by what the RE-PARSE needs, so an operation's result holds every
  node its payload carried.
- **Goal.** The encoding stays minimal: a separator is there because the parse needs one.
- **Non-goal.** Preserving the node's KIND across the re-indent. That is the other half of #158
  and a parser question, recorded in the proposal's Non-Goals.
- **Non-goal.** Any change to which kind pairs merge.

## Decisions

### D1. The demotion is read off the line, not tracked through the re-encode

The alternative was to have `reencodeBlocksForDestination` record which nodes it pushed past the
margin and hand that set to `normalizeBoundaries`. It would answer the same question for the one
caller that exists today and be wrong for the next one: any operation that moves a node's column
reaches this seam, and a set built by one of them says nothing about the others. The node's own
first line already carries the answer, because the re-encode has written the indentation into it
by the time boundaries are normalized. `kindAsWritten` reads it there.

### D2. The margin lives in `parse.ts`, beside the anchors it describes

`OPENING_MARGIN` is `3` because `QUOTE_RE`, `CALLOUT_RE`, `HR_RE`, `HTML_OPEN_RE` and `ATX_RE`
are written `^ {0,3}`. A copy of that number in `ops.ts` would be a second statement of the
parser's own rule, free to drift from it. `indentWidth(line) > 3` and a failing `^ {0,3}` are the
same test, in both directions: a match consists of spaces alone and so measures 3 or less, and a
run measuring 3 or less is spaces alone, because a tab advances to the next `TAB_WIDTH` stop and
so reaches column 4 from any start the margin allows.

### D3. A setext heading is judged on its underline

`SETEXT_RE` is the anchor a setext heading depends on, and it sits on the node's LAST line, not
its first. A setext heading whose underline is pushed past the margin is a paragraph of two
lines. Judged on its first line instead — an ordinary text line, which no margin governs — it
would come back `heading` and the seam above it would be separated for a node that is not there.

### D4. The demoted kind is read off the line, not assumed

A demoted line is a paragraph in most spellings and a LIST ITEM in two: `LIST_ITEM_RE` carries no
margin, so `- - -` and `* * *` — the rule spellings whose first two characters are a marker and a
space — open a list item at column 4 where `---` opens nothing. Assuming a paragraph there writes
a blank line for a node the document does not contain, which is the same mistake this change
exists to fix, one layer down. No other opener can arise: a fence and a table row have no margin
either, so a node whose first line matches one of them is a `code` or a `table` and is never
demoted at all.

The change therefore both adds and removes separators, and for one reason in both directions —
the rule that applies is the rule for the node the document will contain. Measured across the
differential: 12 rows gain a separator, 37 lose one, none loses a node or changes one already there.

### D5. The seam below a node is its LAST block's, asked of the parser

The seam above a node is decided by the line that opens it, which is what `kindAsWritten` reads.
The seam below is decided by the block its LAST line lands in, and for a demoted node of more
than one line those differ: an `html` block runs to a blank line whatever its lines hold, so past
the margin its later lines open what they open at their own column, and `<div>` over a table is a
paragraph and then a table. `tailAsWritten` answers the lower seam by running `parse` over the
node's own lines — only for a demoted node of more than one line, since every other node is its
own tail — rather than restating how a paragraph ends, because the parse is what decides that.
A node whose lines form no block at all is judged by its opening line.

### D6. The table branch follows the table's loop

`segment`'s table loop claims every following non-blank line that contains a `|`, whatever it
would otherwise open; the branch separated a table only from another table. With D5 a demoted
`html` block's tail can be a table, which made that gap reachable in places `main` covered by
accident with `html`'s separate-from-everything rule. The branch now separates a table from any
node whose first line carries a pipe, which is the loop's own condition — and which also closes
the pre-existing half of #197, where a pasted table takes a list item holding a wikilink alias as
a row.

## Risks / Trade-offs

- **`kindAsWritten` can disagree with `parse` on a spelling nobody thought of.** It restates the
  anchors rather than running them, so the guard is a unit test walking every kind at both sides
  of the margin, and every rule spelling against `parse` itself. The `- - -` case was found that
  way — by a review sweep comparing the two functions over every whitespace shape, after the
  first reading of this design asserted a demotion is always a paragraph.
- **A seam below a demoted `html` block loses its blank line.** That blank was there for the
  HTML-block rule, which does not apply to a paragraph, and the seam re-parses to the same nodes
  without it. Both encodings render identically under `commonmark` 0.31.2. The cost is that a
  document written before this change and re-encoded after it can lose that one line where an
  operation touches the seam; the gain is that "a blank line is here because something needs it"
  holds again.
- **`kindAsWritten` restates the parser's anchors rather than calling them.** It lives beside
  them, with a comment naming each one, and the unit test walks every kind at both sides of the
  margin. A sixth margin-anchored kind would have to be added in both places.
