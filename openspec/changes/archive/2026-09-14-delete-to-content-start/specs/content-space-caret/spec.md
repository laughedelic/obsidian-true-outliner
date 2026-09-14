## ADDED Requirements

### Requirement: Delete to line start stops at the content start

A "delete to the start of the line" gesture — Mod-Backspace where the editor binds it, and
the `Delete to content start` command everywhere — SHALL, on a list item's own line, delete
from the caret back to that line's content start and no further: on the item's first line the
column where its text begins, past the list marker and past a task marker when the item
carries one, so the checkbox survives; on a continuation line, the line's alignment column.
The marker, the indentation and the node itself SHALL survive, and the caret SHALL rest at
the content start. The range SHALL never be read as a deletion of the node, whatever follows
the item.

Where the line offers a SECOND content start — a task item's first line, whose boundary sits in
front of the checkbox — a gesture made from the first SHALL delete the task marker and leave the
caret at that boundary. The two stops are the ones Home walks on the same line, in the same
order, so the keys agree about where an item's text begins. A caret INSIDE the marker stands at
neither stop and SHALL keep the behavior below, since a range from the boundary would cut the
box in half.

With the caret at or inside the content start the gesture SHALL do what Backspace does there:
the merge or veto the content-adjacent deletion rules give at the content start, and ordinary
editing inside the marker. On a provisional position it SHALL cancel the position as
Backspace does.

Outside a list item's own line — a paragraph, a heading, an atom, a gap line — the gesture
SHALL be stock. A non-empty selection or a multi-cursor SHALL be stock too.

#### Scenario: An item followed by its sibling keeps its marker and its line

- **WHEN** the caret is at the end of `- alpha beta`, the next line is `- gamma`, and the
  user presses Mod-Backspace
- **THEN** the line reads `- ` with the caret after the marker, `- gamma` is untouched, and
  no structural verdict is computed

#### Scenario: A task item keeps its checkbox

- **WHEN** the caret is at the end of `- [ ] task text` and the user presses Mod-Backspace
- **THEN** the line reads `- [ ] ` with the caret after the task marker

#### Scenario: A continuation line keeps its alignment

- **WHEN** the caret is at the end of a list item's continuation line and the user presses
  Mod-Backspace
- **THEN** the line keeps its alignment whitespace and the caret rests after it

#### Scenario: A second gesture takes the checkbox, a third is the Backspace

- **WHEN** the caret rests where `- [ ] task text`'s text begins, below `- alpha`, and the user
  presses Mod-Backspace twice more
- **THEN** the first press leaves `- ` with the caret at the content boundary, and the second
  merges the item into `- alpha`, exactly as Backspace there does

#### Scenario: At the content start the gesture is a Backspace

- **WHEN** the caret sits at `- beta`'s content start below `- alpha` and the user presses
  Mod-Backspace
- **THEN** the two items merge into `- alphabeta`, exactly as Backspace there does

#### Scenario: A paragraph is stock

- **WHEN** the caret is at the end of a paragraph line and the user presses Mod-Backspace
- **THEN** the editor's own line-start deletion runs, unchanged

**Covered by**: `tests/caret-policy.test.ts` ("planDeleteToContentStart");
`e2e/specs/65-content-space-caret.e2e.ts` ("delete to content start", D1–D9).

## MODIFIED Requirements

### Requirement: Home and End move within the caret's own line

`Home` SHALL move the caret to the content start of the raw line it is already on, and `End` to
that same line's end. Where the line offers a SECOND content start, `Home` SHALL reach it on a
further press; once at the last one, a further press SHALL change nothing. Neither key SHALL
cross a line break, and neither SHALL depend on where the text is soft-wrapped: the targets are
computed from the parsed line, not from rendered geometry.

For a list item's first line the content start is the content-start column, after the marker;
for a continuation line it is that line's alignment column. A TASK item's first line has the
second stop: the caret reaches where its text begins, past the checkbox, and then the boundary
in front of the checkbox. Every other line has one stop, so the pair collapses and a single
press is all there is. From INSIDE the marker — between the brackets — `Home` SHALL go to the
boundary, the nearer stop, as it did before the second existed. `End` needs no correction —
chrome is always a line PREFIX, never a suffix.

This supersedes two earlier escalating designs (visual row → node, and before that visual row →
raw line → node), both retired after real-vault use; see `docs/research/open-questions` Q26.
Those ladders made one keypress mean different things depending on state the user cannot see —
where the previous press left the caret, and where the renderer chose to wrap. The task stop is
not of that kind: a checkbox is drawn on the line, the caret's own column decides which stop is
next, and the platform key a Mac user actually presses already walks these same two columns
(`docs/research/open-questions` Q36). Reaching a block's own start or end remains a separate
motion, not a further meaning for Home.

#### Scenario: Home reaches content start, never the marker

- **WHEN** the caret is mid-text in a list item and the user presses Home twice
- **THEN** the caret rests at the item's content-start column both times, never inside the
  marker prefix

#### Scenario: Home on a task item takes its text, then its checkbox

- **WHEN** the caret is mid-text in `- [ ] task text` and the user presses Home three times
- **THEN** the first press lands where the item's text begins, the second at the boundary in
  front of the checkbox, and the third changes nothing

#### Scenario: Home from inside the checkbox takes the nearer stop

- **WHEN** the caret sits between a task marker's brackets and the user presses Home
- **THEN** it lands at the content boundary in front of the marker, in one press

#### Scenario: Home does not cross a hard line break

- **WHEN** the caret is mid-text on the second raw line of a two-line node and the user presses
  Home repeatedly
- **THEN** the first press lands at that line's own content start and every further press
  changes nothing — the caret never moves to the node's first line

#### Scenario: Home ignores soft wrapping

- **WHEN** the caret is on a later visual row of a raw line long enough to soft-wrap, and the
  user presses Home
- **THEN** the caret lands at that raw line's own content start in a single press, not at the
  start of the visual row it was on

#### Scenario: End stays on the caret's own line

- **WHEN** the caret is mid-text on the first raw line of a two-line node and the user presses
  End repeatedly
- **THEN** the first press lands at that line's end and every further press changes nothing

## RENAMED Requirements

- FROM: `### Requirement: Home and End move within the caret's own line, in one step`
- TO: `### Requirement: Home and End move within the caret's own line`
