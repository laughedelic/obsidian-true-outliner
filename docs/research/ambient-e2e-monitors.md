# Ambient monitors: what each reading measures, and what it reported

The measurements behind `e2e-cases-are-checked-for-rendered-invariants` (#288): where a monitor can
hook a case, what each reading returns across the shapes a document takes, and what the monitors
reported over the whole suite while report-only. Measured on 2026-09-28 in a Claude cloud session
on `main` at `685d3f8`: Obsidian 1.13.7 on installer 1.5.8 (Chrome 120.0.6099.283), under Xvfb, 4
vCPUs, software rendering, a 1024×800 window. The probes are under
`prototypes/ambient-monitors/`. What a run can read at all is in
[rendered-ui-observability.md](rendered-ui-observability.md).

## Where a monitor hooks a case

A spec with a passing, a failing, a timed-out and a skipped case, and a config with `beforeTest` and
`afterTest` printing the order (`prototypes/ambient-monitors/hook-order.e2e.ts.txt`):

| Event | Order for a passing case |
| --- | --- |
| 1 | spec `beforeEach` |
| 2 | config `beforeTest` |
| 3 | the body |
| 4 | config `afterTest`, with `passed` |
| 5 | spec `afterEach` |

- A module the spec writes is seen by the config's hooks: they run in one worker and load one
  instance.
- A failed case's `afterTest` reports `passed: false`; so does a case that calls `this.skip()`.
- A timed-out case's `afterTest` is delivered **after** the spec's `afterEach` and after the next
  case's `beforeEach`, and before that next case's `beforeTest`. A hook that clears per-case state
  when it runs would clear the next case's state; the monitors match the hook to the case it names
  and read only a passed one.
- Because `beforeTest` follows `beforeEach`, a spec's set-up is not inside the window a monitor
  watches.

## The painted caret

The DOM selection's rect against `coordsAtPos(head)` on a scratch note with a heading, an empty line,
bullets at three depths, a task, an ordered item, a paragraph and its continuation line, a callout, a
fence and a table, outline mode on, one reading per position after the caret settled:

| Shape | Rects on the range | Against `coordsAtPos` | Element at the centre |
| --- | --- | --- | --- |
| Heading start, middle, end | 1 | 0 / 0 / 0 px (x, top, height) | its own line |
| Bullet, nested bullet, task, ordered, paragraph, continuation line, callout title and body, fence | 1 each | 0 / 0 / 0 | its own line |
| Empty line | none: the range is on the line element, offset 2 | not comparable | not readable from the range |
| A range selection, or the editor not focused | 1, stale | −43 px, +461 px: the page's selection was not updated | – |

Fifteen positions on text agree to the hundredth of a pixel, as `decoration-follow-ups.md` records for
eight. The caret cannot be read from the range where the line is empty, so the monitor takes the
position CodeMirror reports for it, which still says whether the caret can be seen. The table cell
and the note's final empty line could not be reached: `setCursorSettled` never held the caret there.

## Scroll and layout shift

An rAF sampler on `scrollDOM.scrollTop`, a `layout-shift` observer resolving each source to its
editor line, and the line span each `editor-change` touched, over twelve scenarios on a 60-line
outline (`prototypes/ambient-monitors/monitor-probe.e2e.ts.txt`):

- The sampler ran at about 35 frames a second: 288 frames in 8 s under software rendering. Storing a
  sample only when the position changes kept it to five entries.
- Fifteen layout-shift entries. Eleven had sources outside the editor's content: the status bar when
  its text changed, and a notice while it animated in. Both are dropped by requiring a source inside
  `.cm-content`.
- Move-node-up and undo moved the nodes they edited and, below them, the lines under those, in the
  vertical only.
- **Shift+Tab on one line moved the first `.cm-indent` of five grandchild lines elsewhere in the note
  one unit (32 px) right in a single frame**, though the edit touched only its own line. The final
  layout is stable; the entry says a frame between showed something else. This is what the monitor
  exists to find, and what #148's residual flicker may be. It is a candidate for its own issue once a
  later report shows it is not an artefact of this probe.
- Ctrl+End scrolled to 1050 px and Ctrl+Home then returned to 87 px rather than 0.

## The grid

Text columns from the first ink of each visual row, relative to `contentDOM`, less `depth × unit +
gutter` (unit 32 px, gutter 14 px here), on a note holding every kind in a mixed document:

| Kind | Offset of the first row | Note |
| --- | --- | --- |
| Heading, paragraph and its continuation | 0 | |
| Bullet at any depth; continuation line of an item, with and without extra indentation | 0 | extra indentation on a list continuation is absorbed |
| Task | −0.02 | the control's own space |
| Ordered, `10.` | +9.75 | the marker is wider than the gutter, which the spec allows |
| Quote | 0 | |
| Fence, a fence in a list item | +16, and +451.84 on the opening line (its language label) | a box of its own |
| Callout, table | no text run: the widget carries its own | a box of its own |

A note of 23 lines of nested and wrapped bullets, paragraphs and ordered items had no row off the grid.

## The first sweep

The monitors as first written, over the whole desktop suite on 2026-09-28: 56 spec files, 980
cases, two instances, 36 minutes 24 seconds. Every spec file passed: a report-only monitor changed
no case's result. The hooks took 27.5 s in all, 28 ms a case, one install and one read each.

| Monitor | Cases read | Cases not read |
| --- | --- | --- |
| errors, notices | 979 | 2 failed or timed out; 2 lost the page (a reload inside the case) |
| scroll | 957 | 22 with no editor scrolled or visible |
| heightMap | 947 | 25 with no editor; 7 with no rendered line to round-trip |
| grid | 909 | 33 with outline mode off; 25 with no editor; 12 with no rendered line on the grid |
| layoutShift | 890 | 89 that began with no editor |
| caret | 769 | 160 with the editor unfocused; 25 with a range selected; 25 with no editor |

Fourteen rules reported 772 observations. What each turned out to be, read from the examples the
report keeps:

| Rule | Cases | Reading |
| --- | --- | --- |
| `grid-off-column`, `grid-wrap-hang` | 114, 137 | Mostly rule errors. `Number('')` is 0, so a widget line carrying no `--to-depth` was checked as depth 0. Text a decoration draws inside a line (a fold's hidden count, a footer chip) started a row of its own far to the right, and right-to-left lines begin at the right edge. Whitespace left standing after a marker (`56-source-indent`) is meant to sit right of the gutter |
| `heightmap-wrong-line`, `heightmap-no-position` | 99, 62 | Mostly rule errors. A table, a properties block or an embed is one child standing for several lines, so its first line's coordinates resolve to the widget's own position; and `posAtCoords` returns null for a point outside the scroller. Eight cases remain after restricting the rule to plain, visible lines, in zoom (`80`) and dragging (`81`): a line whose coordinates resolve to the line above it |
| `caret-outside-scroller` | 67 | The footer specs scroll the footer into view (`74` calls `scrollToEnd` in most of its cases) and leave the caret behind |
| `scroll-excursion` | 27 | The same footer scrolls, and one case each in `62`, `42`, `70`, `80` and `81`; the five were not read for why |
| `shift-sideways`, `shift-above-edit` | 16, 13 | Cases that fold, drag, toggle a layout setting or zoom while they edit; those change layout on their own. Without a document change there is no touched span to judge against, and 89 cases carried none |
| `grid-left-of-column` | 8 | Frontmatter lines, a lone block id line, and a task line whose text starts 3.14 px left of its column while the caret is on it (`65`, and `56`'s dead-space case) |
| `caret-covered` | 5 | An open menu over the caret (`57`); the scroller itself at the caret's point in a case that deletes a gap line (`80`); a status bar item over it (`55`) |
| `grid-marker-off-column` | 2 | The right-to-left fixture (`52`), where the mark is at the right edge; one case in `65` |
| `unexpected-notice` | 2 | A vetoed edit in `62` raises "These blocks can't be joined into one." and the case never waits for it; Obsidian's own "modified externally" notice in `60` |
| `caret-off-coords` | 1 | `92`'s typing on a folded line: the painted caret is 4.75 px left of `coordsAtPos` and 2.89 px shorter |
| `console-error` | 1 | An `ENOENT` from Obsidian writing a note the vault reset removed (`62`) |

## What the readings could not see

- **`unhandledrejection`, from a script the driver runs.** A rejection or throw raised inside
  `browser.execute` reaches the page as an opaque "Script error." and, for a rejection, not at
  all; the same code in a `<script>` element the page runs reports the message and both events. The
  monitors read the page's own code, which is what a defect would be.
- **A change the diff cannot bound.** The touched span is the first and last differing line of the
  document at each `editor-change`; a case that replaces the whole buffer with almost the same text
  touches one line and moves the rest, which is what `59`'s settings case reports.
- **The first frame.** A scroll baseline taken on the first `requestAnimationFrame` missed the
  case's first action in 7 of 20 runs, since the action lands before the frame. The recorders take
  it at install.

## After the corrections: the sweep in CI

The same monitors with the corrections the first sweep called for, run by CI on the pushed
checkpoint (desktop and mobile emulation, four instances a job, one job per group). Each job
uploads its report and renders it into the step summary; the figures below add the reports of the
fourteen groups of each platform. The whole matrix took six minutes.

| | Desktop | Mobile |
| --- | --- | --- |
| Cases | 1,016 | 972 |
| Hook time in all | 22.3 s | 25.6 s |
| Caret read | 771 of 1,016 | 513 of 972 |
| Scroll read | 866 | 777 |
| Grid read | 907 | 821 |
| Height map read | 896 | 806 |
| Layout shift read | 358 | 344 |
| Errors and notices read | 980 | 890 |

What kept the rest from being read, on desktop: the caret in 157 cases where the editor was not
the page's active element, 25 with no editor and 27 with a range selected; layout shift in 552 cases
that edited no document. On mobile the editor is not the active element in 333 cases, and 50 cases failed,
timed out or skipped themselves, which the specs that skip under emulation account for.

The corrections, each from a finding: rows are boxes that overlap vertically, so an inline code
span's padding starts no row of its own; a row that begins in a code span begins where the span's box
does; text a decoration draws inside a line and lines holding an inline embed are not read; the
whitespace a marker-less line begins with is the line's own, as it is after a marker; the caret
monitor asks whether the editor is the active element, and not CodeMirror's `hasFocus`, which several
windows on one display take from each other (308 of 1,014 desktop cases before, 157 after); a caret
the case found out of view is not one it put there; layout shift reads plain lines only, since a
widget follows the text around it.

**Exemptions.** Cases that do what a monitor reads on purpose take an exemption where it happens,
each with its reason: the footer specs scroll the footer into view (the local `scrollToEnd` helpers,
`scrollToFooter`, `clickClear`), three cases drive edits across a 2,000-line note, one scrolls a long
note away from the top and one is a drag that autoscrolls, the drag and fold suites move the lines
around an edit, the gap-line suite toggles its setting between reads, and one case holds whitespace
after an ATX marker. They are 24 places in the specs and, in a desktop report, 122 cases exempt
from `scroll` and 100 from `layoutShift`, of which 30 are the self-test's own.

**What is left.** Nine rules, in cases the note has not explained. None was diagnosed here, and none
is filed: each needs a re-measurement against the code before it is a claim.

| Rule | Cases (desktop, mobile) | Where |
| --- | --- | --- |
| `shift-above-edit` | 12, 15 | `67-node-selection-extension`: a line above the edited one moves 48 to 80 px up while a selection extends |
| `heightmap-wrong-line` | 12, 8 | `80-outline-zoom`: in a zoomed note, a line's coordinates resolve to the line above it |
| `heightmap-no-position` | 11, 11 | notes holding a table (`20`, `30`, `52`, `57`, `62`, `67`, `90`): a line has no position at its own coordinates |
| `grid-left-of-column` | 6, 4 | `57-misplaced-block-ids`: a lone `^abc` line's text begins at its column, without the gutter |
| `caret-covered` | 5, 3 | `80-outline-zoom`: the scroller is at the caret's point after a gap line is deleted; `75`: on mobile the header's buttons |
| `unexpected-notice` | 2, 2 | `62`: a vetoed edit raises a refusal the case never waits for |
| `grid-off-column`, `grid-wrap-hang` | 0, 2 | `93-fold-chrome` on mobile: the second row of a wrapped quote begins 18 px in |
| `caret-off-coords` | 1, 2 | `92` on a folded line, 4.75 px; `77` with a popover open, 176 px |
| `scroll-excursion`, `caret-outside-scroller`, `shift-sideways` | 2, 0; 1, 1; 1, 0 | one case each in `77`, `93` and `57` |

## What the monitors do not read

- **A shift the browser has not rendered yet.** A layout shift reaches the observer when the browser
  next renders; the read takes what has been recorded, so a shift produced by the body's last action
  can be missed. The self-test's shift rows wait for the entry for that reason.
- **A caret in a case that never focused the editor.** 157 desktop cases and 333 mobile ones.
- **A case that reloads the page.** Three of them, whose monitors were gone by the read.
- **What the recorders cost inside a case.** The 22 ms a case is the install and the read. A frame
  sampler, a layout-shift observer, a notice observer and a document diff at each edit run through
  the body, exempt cases included, and that cost is not measured. The cases that time the plugin
  pass with them on; `E2E_MONITORS=off` is the way to time one without them.
- **A popout window, or a window whose frames are throttled.** The caret, grid and notice readings
  use the main window's `document`; a sampler in a throttled window records nothing and still reports
  the monitor as read.
- **Anything a person reads off the screen.** Ink, colour and motion are #294 and #287.
