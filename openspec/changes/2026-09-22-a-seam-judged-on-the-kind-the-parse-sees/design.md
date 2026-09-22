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
same test: a tab is `TAB_WIDTH` columns from a stop, so no line reaches column 4 or beyond while
still matching, and none matches while measuring 3 or less.

### D3. A setext heading is judged on its underline

`SETEXT_RE` is the anchor a setext heading depends on, and it sits on the node's LAST line, not
its first. A setext heading whose underline is pushed past the margin is a paragraph of two
lines. Judged on its first line instead — an ordinary text line, which no margin governs — it
would come back `heading` and the seam above it would be separated for a node that is not there.

### D4. The demotion only ever adds a merge risk, never hides one

`kindAsWritten` maps five kinds to `paragraph` and leaves the rest alone, and `paragraph` is the
most claiming kind the rules know: as the node ABOVE a seam it claims a following paragraph, an
html block, a setext underline and a `-` rule; as the node BELOW one it is claimed by a paragraph
and by a list item's continuation lines. So a demotion adds a separator wherever the seam now
merges, and removes one only where the rule that asked for it described a block the document no
longer contains — measured across the differential as 8 rows gaining a separator and 7 losing
one, with no row losing a node.

## Risks / Trade-offs

- **A seam below a demoted `html` block loses its blank line.** That blank was there for the
  HTML-block rule, which does not apply to a paragraph, and the seam re-parses to the same nodes
  without it. Both encodings render identically under `commonmark` 0.31.2. The cost is that a
  document written before this change and re-encoded after it can lose that one line where an
  operation touches the seam; the gain is that "a blank line is here because something needs it"
  holds again.
- **`kindAsWritten` restates the parser's anchors rather than calling them.** It lives beside
  them, with a comment naming each one, and the unit test walks every kind at both sides of the
  margin. A sixth margin-anchored kind would have to be added in both places.
