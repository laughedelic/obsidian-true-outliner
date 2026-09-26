## Context

`docs/research/block-start-margin` measures the defect and the prototype
(`prototypes/block-start-margin/implementation.patch.txt`); `seams-across-a-re-indent` carries
the seam rules this change keeps in step with the parser.

## Decisions

### D1. The margin is the innermost open list item's content column

`segment` keeps a stack of content columns: pushed after each list item, popped while a line's
indentation falls short of the top, cleared by a heading of either spelling — an ATX line, or a
paragraph that a setext underline turns into one. This is the stack `parse` builds
when it attaches blocks, rebuilt from the same inputs one step earlier, so the two agree on which
item holds a line. A paragraph that collects list items under the attachment rule opens no margin
of its own; its items do.

### D2. The patterns see the line; the block keeps it

`fromMargin(line, margin)` spells whatever indentation is left past the margin as spaces and
keeps the rest of the line. The indentation it reads is spaces and tabs only, as `indentWidth`
counts it; any other whitespace is content. The patterns are applied to that; the block's lines stay the raw
lines, so encoding and the round trip are untouched. A tab straddling the margin counts for the
columns it covers past it, as `indentWidth` already expands it.

### D3. Every place a block start is tested takes the margin

A quote's run, a list item's continuation loop and a paragraph's interruption test all ask
whether a line opens a block. Each takes the margin of the block it is inside — for the
continuation loop, the item's own content column. A quote's run also stops at a line indented
short of its margin: that line has closed the item, and a `>` line there opens a quote of the
enclosing scope.

### D4. Headings and HTML blocks stay at column 0

`ATX_RE` and the setext underline are not given the margin, and neither is a `-` or `=` rule in
the paragraph interruption test, which at the margin would be a setext underline. `HTML_OPEN_RE`
is not given it either: the pattern is wider than CommonMark's HTML block starts and the block's
run ignores its container closing, so the margin would move readings away from CommonMark. See
the proposal's Non-Goals.

### D5. The seam rules read the same margin

`kindAsWritten(node, margin)` and `tailAsWritten(node, margin)` demote a quote, a callout or a
rule only past `margin + OPENING_MARGIN`, and a heading or an HTML block past `OPENING_MARGIN`
as before; `tailAsWritten` re-reads a demoted node's lines from the same column its kind was
judged at. `normalizeBoundaries` threads the margin down: a list item's children
get its content column, every other node's children the margin it was read at.
`needsBlankBetween` reads the leaf above a seam at the margin of the list that holds the leaf,
which is found on the way down to it.
