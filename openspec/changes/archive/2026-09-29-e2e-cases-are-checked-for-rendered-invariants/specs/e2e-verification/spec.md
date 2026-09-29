## ADDED Requirements

### Requirement: The rendered editor is read around every case, and the reading is reported

The harness SHALL read the rendered editor around every e2e case, on desktop and under mobile
emulation, without any case asking. It SHALL read:

- **the painted caret**: that it agrees with the position CodeMirror reports for the selection's
  head, lies inside the editor's scroller, and is what a hit test finds at its centre;
- **the scroll position**, frame by frame: a position that leaves and returns within the case, and
  a large step in one frame while the caret was in view before and after it;
- **the grid**: that each rendered line's text begins on its depth's column plus the marker gutter
  on every visual row, and that each mark is centred on its column within half a pixel;
- **the height map**: that the coordinates of each rendered line resolve back to that line;
- **layout shift** on lines of the editor that the case's edits did not touch;
- **errors**: uncaught errors, unhandled rejections and `console.error`;
- **notices** the case neither waited for nor read.

A reading SHALL be REPORT-ONLY: it SHALL NOT fail, retry or delay a case, and a run's status SHALL
NOT depend on it. A monitor that cannot read — no editor, no focus, a page reloaded during the
case, no answer within its budget — SHALL say so in the report, with the reason, instead of
reporting nothing. A case that failed or timed out SHALL NOT be read, since the editor is in
whatever state the failure left.

Each run SHALL write one report that names, for every monitor, how many cases it read and why it
did not read the rest, and for every rule it saw broken, the number of observations and cases and
the first examples with their spec and case. The report SHALL be printed at the end of the run and
rendered into the CI job's step summary.

A case that arranges a deliberately odd state SHALL be able to exempt itself from a monitor, and
the exemption SHALL require a reason. The report SHALL list every exemption with its reason.

#### Scenario: A caret clipped out of sight is reported

- **WHEN** a case ends with the caret in a line whose box clips it, so that the element at the
  caret's centre is not the caret's own line
- **THEN** the report lists a caret observation for that case, and the case still passes

#### Scenario: A scroll position that leaves and returns is reported

- **WHEN** a case moves the scroller away from its position by more than a quarter of its height
  and back before the case ends
- **THEN** the report lists a scroll observation with the distance and how long it took

#### Scenario: A line off the grid is reported

- **WHEN** a case ends with a rendered list line whose text begins away from its column plus the
  gutter
- **THEN** the report lists a grid observation naming the line and the distance

#### Scenario: A mark's half-pixel guide offset is not reported

- **WHEN** a mark is centred on its column, the guide beside it being drawn half a pixel to its
  right
- **THEN** the report lists no observation for that mark

#### Scenario: A line the edit did not touch moving sideways is reported

- **WHEN** a case edits one line and a line elsewhere in the note moves sideways in the same
  frame
- **THEN** the report lists a layout-shift observation for the line that moved, and none for a
  line below the edit that moved only down

#### Scenario: An unexpected notice is reported and an awaited one is not

- **WHEN** a notice appears during a case that neither waited for it nor read the notices on
  screen, and another appears during a case that waited for it by its text
- **THEN** the report lists the first and not the second

#### Scenario: A case that did not pass is not read

- **WHEN** a case fails, times out or is skipped
- **THEN** every monitor's record for it says the case did not run to a pass, and no observation is
  listed

#### Scenario: An exemption names its reason

- **WHEN** a case exempts itself from the grid monitor with a reason
- **THEN** that case's grid monitor is not read, its other monitors are, and the report lists the
  exemption with the reason; an exemption with a blank reason fails the case that made it

#### Scenario: A monitor that cannot read says so

- **WHEN** a case ends with the editor not the page's active element
- **THEN** the caret monitor's record says the editor was not the active element, and the other monitors are
  read as usual
