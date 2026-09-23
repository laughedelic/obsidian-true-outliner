## Context

`reencodeForDestination` is the re-encoder `indent` and `outdent` call for the node they move and
for the siblings an outdent re-parents under it. Its no-conversion branch rewrote the first line
with `indentText` and handed every other line to `shiftSubtree` with a width delta. `shiftLine`,
which does the work, keeps whole tabs when it DEDENTS and pads with spaces when it indents, so an
outdent in a tab vault was already right and an indent was not.

## Goals / Non-Goals

- **Goal.** A node's lines are written in the characters its first line is, wherever the source
  already wrote them that way.
- **Goal.** No line lands on a different column than it did: the change is to characters only,
  and the differential pins that no verdict and no tree shape moves.
- **Non-goal.** The conversion branches and renumbering, recorded in the proposal's Non-Goals.

## Decisions

### D1. Swap the node's own prefix, as the paste path does

The alternative was to hand `shiftLine` the unit and have it spell a positive delta in that
unit. A delta of 4 in a tab vault is one tab; a delta of 6 is a tab and two spaces; but the
destination's indentation is not always a whole number of units plus a remainder, and a
continuation line's relationship to its item is the source's own, not the unit's. Swapping the
prefix the node's first line and its other lines share writes exactly the destination's
characters where the node's indentation was and carries everything after it, which is both
simpler and what `reindentSubtreeVerbatim` settled on for a paste.

### D2. The swap is checked against the column, and falls back

A tab AFTER the shared prefix re-expands from wherever the new prefix ends, so a swap between
prefixes whose widths differ by less than a tab stop moves that line by some other amount. The
swap is taken only when `indentWidth` of the result equals the old width plus the delta; any
other line goes to `shiftLine` as before. This is what makes the whole change unable to move a
line, which is the property the differential checks.

### D3. No space in front of a tab

`- foo` / `\tbar` indented by four spaces swaps to `    \tbar`, which reaches the right column
and puts a space in front of a tab. `shiftLine`'s own comments give the reason not to: a space
in front of a tab vanishes into the stop the moment the prefix narrows. The swap is refused
there unless the line already had one, and `shiftLine` writes `\t    bar`.

### D4. The swap first, then the marker's change

A list item's marker run is normalized with the line it sits on, which moves its content column
and so its continuation lines and children, by the change in the marker's width. A swapped line
takes that change after the swap, as a dedent of the swapped line, which keeps the destination's
prefix because the line sits at or past the node's content column. A line that is not swapped
takes the width delta and the marker's change as ONE shift, which is `main`'s own output for it.

Applying the marker's change first, as a separate pass, was the first reading and the review
round's finding against it: a dedent run on its own breaks a tab it cannot keep into spaces, and
the fallback then adds its own spaces on top — a whole tab stop spelled in spaces on a line
`main` had written with tabs, the shape the change exists to remove.
