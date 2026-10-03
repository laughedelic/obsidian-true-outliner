---
type: "research"
title: "Ambient monitors: what each reading measures, and what it reported"
description: "The readings taken around every e2e case (painted caret, scroll, grid, height map, layout shift, errors, notices): where a hook sees a case, what each reading returns across document shapes, and what the monitors reported over the whole suite while report-only"
---

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
  exists to find. It reproduced in the running app and is filed as
  [#330](https://github.com/laughedelic/obsidian-true-outliner/issues/330); it is not #148, which
  concerns block selection.
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

**What is left.** Nine rules in cases the CI sweeps did not explain by themselves. Each was
re-measured in the running app with `npm run drive` before it was filed, and most turned out not to
be the plugin's:

| Rule | Cases (desktop, mobile) | What it was |
| --- | --- | --- |
| `heightmap-wrong-line` | 8 of its 12 desktop cases | In a zoom on a list item, each line after the first resolves to the line above it; unzoomed and with a heading root, every line resolves to itself. A defect: [#313](https://github.com/laughedelic/obsidian-true-outliner/issues/313) |
| `caret-covered` | 5, 3 | `80-outline-zoom`'s R6: ⌦ on the cover's trailing gap line leaves the caret on the first hidden line, which `outline-zoom` forbids. A defect: [#312](https://github.com/laughedelic/obsidian-true-outliner/issues/312). On mobile, the header's buttons over the caret was not reproduced |
| `grid-left-of-column` | 6, 4 | `57`'s lone block id under an item, as stock draws it (14 px on desktop, 15.19 on mobile): [#314](https://github.com/laughedelic/obsidian-true-outliner/issues/314). A task line in `56` (`measures the chevron's dead space…`), `65` (B6, C8 and C11) and `81` (`drags without toggling`), 3.14 px left on desktop and 4.33 px on mobile (`56` and `81` on desktop only). B6 was re-measured, on desktop: while the caret is inside the checkbox syntax, Obsidian shows the source `- [ ]`, the rule takes the `[` as the first ink, and the raw `- ` is narrower than the gutter; with the caret in the text the offset is −0.02 px. The task exemption keys on the checkbox element, which is not in the line while its source shows, and the left-of-column check has no exemption. A rule error: [#324](https://github.com/laughedelic/obsidian-true-outliner/issues/324) |
| `shift-above-edit` | 12, 15 | `67-node-selection-extension` turns outline mode on and sets the buffer inside the body, and the rule reads that as the case's own shift. Corrected in [#315](https://github.com/laughedelic/obsidian-true-outliner/issues/315); see "After #315" |
| `heightmap-no-position` | 11, 11 | A table's hidden source line has no position with outline mode on and off. Corrected in #315 |
| `grid-off-column`, `grid-wrap-hang` | 0, 2 | A quote's `>` is its first row's first ink, with outline mode on and off. Corrected in #315 |
| `caret-off-coords` | 1, 2 | `92`: the caret at the end of a folded line is at its text's end, and `coordsAtPos` measures the fold widget's edge, 4.75 px on. Corrected in #315. `77` on mobile with a popover open was not reproduced |
| `unexpected-notice` | 2, 2 | `62`'s vetoed-edit case raises a refusal it never waits for. Fixed in #315; see "After #315" for the two that remain |
| `scroll-excursion`, `caret-outside-scroller`, `shift-sideways` | 2, 0; 1, 1; 1, 0 | One case each in `77`, `93` and `57`, not reproduced; listed in #315 |

## Precision corrections (#315)

Re-measured on 2026-09-29 with `npm run drive` in a Claude cloud session on `main` at `a52c495`:
Obsidian 1.13.7 on installer 1.5.8 (Chrome 120.0.6099.283), Xvfb, a 1024×800 window, outline mode on
unless stated. The driver runs the desktop app, so nothing here measures mobile emulation.

**A quote's marker.** First ink of each visual row, relative to `contentDOM`, for a quote of one
wrapped paragraph at depth 1 (column 32 + gutter 14 = 46):

| Line | Marker | Text, first row | Text, wrapped rows |
| --- | --- | --- | --- |
| `> text` | 46 | 64.5 | 64 |
| `> > text` | 46 | 83 | 83 |
| `  > text` in a list item (depth 2, column 78) | 78 | 96.5 | 96 |
| `> text`, outline mode off | 0 | 18.5 | 18 |

The marker is the first ink of the first row, and the hang under the text is the same 18 px with
outline mode off. Outline mode draws an icon in place of the `>`, which stays in the line as a
transparent glyph with its box, and the second level of a nested quote is a `.cm-blockquote-border`
widget the rule already skips. Treating the marker as chrome alone leaves every row at +18, so the
rule reads the marker as the line's column anchor and compares the text rows with each other, with a
pixel of tolerance for the first row.

**A table's source line.** A note that opens with a table keeps a 21 px `.cm-line`
(`HyperMD-table-2 HyperMD-table-row`) with no text ahead of the widget; `posAtCoords` at its
coordinates is null with outline mode on and off. A table after a heading or a paragraph leaves no
such line among `contentDOM`'s children, and a table in a list item is three ordinary 25 px lines with
no widget. The empty line's next sibling is the table's `.cm-embed-block`. A properties block at the
top of a note leaves no line among the children (a widget, then the first line after it), and an
inline `![[embed]]` line is a widget with the lines around it round-tripping to themselves.

**The caret beside a widget.** After typing `!` at the end of `- one`, folded, the painted caret is
at x 426.19, top 157.23, 19.00 high, `coordsAtPos(head)` gives 430.94, 156.23, 21.89, and
`coordsAtPos(head, -1)` gives 426.19, 157.23, 19.00. Typing once more, the second side stays within
0.02 px of the painted caret (445.44 against 445.42) and the first is 4.75 px on (450.19). One step
left, off the line's end, the two sides agree. `domAtPos` for the head at the line's end is the
`.cm-line` with a `cm-widgetBuffer` as the next child.

**Set-up in the body.** `67-node-selection-extension` run on its own, monitors on, before the
correction: 10 `shift-above-edit` observations in 7 cases, e.g. line 2 moved −101 px with the edit
touching line 6. `outlineNote` creates the note, turns the mode on and calls `setBuffer` with the text
the note already holds; the `editor-change` that produces has an identical document, which the diff
read as an edit of the last line, and the shifts followed it by 2.4 ms in a debug dump. Not counting a
change to identical text as an edit left none, in 46 cases. Judging each shift only against the edits
made before its frame was tried as well: alone it left 9 observations in 9 cases (in a different
set of cases from the 10 in 7), and with the first correction it changed
nothing on `67`, so it was dropped. Whether it would reach the residual in `68` (see "After #315") was not run. The
rest of the twelve desktop and fifteen mobile cases the CI sweeps counted are in other specs, which
the sweep after this correction accounts for.

**Controls.** Each correction taken out in turn, with `01-ambient-monitors` run: without the quote
branch the wrapped-quote row reports `grid-off-column` and `grid-wrap-hang` for each of its two
quotes and the half-pixel step reports `grid-off-column`; without the empty-line skip the table row
reports `heightmap-no-position`; without the second side the folded-item row reports
`caret-off-coords`; without the identical-text rule the row reads the case instead of finding it
unedited. In `62`, changing the message text for one run makes the vetoed-edit case fail on
`notice containing "These blocks can't be joined into one." did not appear`. The eleven cases that
reported `heightmap-no-position` from a table opening the note are gone from the sweep.

**Not corrected.** The readings the issue lists as reported and not reproduced are left in the
report: `caret-off-coords` in `77` and `caret-covered` in `75` on mobile, `heightmap-wrong-line` in
`10`, `59` and `90`, and `shift-sideways` in `57`.

## After #315: the sweep

The corrections of the section above, run by CI on the pushed checkpoint (run 36525721730 at
`1decce4`, all 30 desktop and mobile e2e jobs green, monitors report-only). Each figure is the sum of
the `[e2e] monitors:` reports printed in the jobs' logs, as observations and cases. The runs counted
1,037 desktop cases and 993 mobile ones, and 48 and 33 observations. A log prints one example per
rule per job, so a rule reported in several cases of one job names only the first.

| Rule | Before (desktop, mobile cases) | After (desktop, mobile cases) |
| --- | --- | --- |
| `shift-above-edit` | 12, 15 | 1, 2 |
| `heightmap-no-position` | 11, 11 | 1, 1 |
| `grid-off-column`, `grid-wrap-hang` | 0, 2 | 0, 0 |
| `caret-off-coords` | 1, 2 | 0, 0 |
| `unexpected-notice` | 2, 2 | 2, 2 |

The last row counts different cases: `62`'s is fixed, `60`'s is still there, and `98`'s drawn case is
new to it, since the drawn cases landed after the commit the census above was measured on (`685d3f8`).

**Rules that read clean over the whole suite, on both platforms** (six of the sixteen):
`caret-off-coords`, `scroll-step-with-caret-in-view`, `grid-off-column`, `grid-wrap-hang`,
`grid-marker-off-column` and `uncaught-error`. These are the candidates to fail a case (#316), with
these qualifications:

- A zero says the suite holds no such shape among the cases read. From the reports the jobs upload
  (`e2e-monitors.json`), this sweep read the caret in 782 of 1,037 desktop cases and 521 of 993
  mobile ones (the editor was not the active element in 158 and 336, and 3 desktop and 49 mobile cases failed, timed out or were skipped), the grid in 916 and 830, the height map in 903 and 813, the scroll in 877 and 789, and
  layout shift in 352 and 340. On each platform 39 cases are exempt from the caret monitor.
- Three of them were narrowed here, and each now accepts something the old rule reported:
  `caret-off-coords` accepts a caret painted on either side of its head, so at a soft wrap either row
  passes, which no measurement here covers; `grid-off-column` and `grid-wrap-hang` judge a quote's
  marker for its column and its text only against itself, so text at a consistent wrong distance from
  its marker passes.
- A quote in a list item was never judged for column or hang, before or after: its source begins with
  the item's indent, which the grid reading treats as standing whitespace.
- `uncaught-error` is asserted in the self-test by the message it reports, and by rule name since
  #315.

**Rules that still report:**

| Rule | Desktop, mobile | What it is |
| --- | --- | --- |
| `heightmap-wrong-line` | 29 obs in 12 cases, 16 in 8 | `80` and `81` (four cases each on desktop, two on mobile): a zoom on a list item, [#313](https://github.com/laughedelic/obsidian-true-outliner/issues/313), which counts the same cases. `90`: the lines after a raw HTML block, [#321](https://github.com/laughedelic/obsidian-true-outliner/issues/321). `59` (two cases, of which the report names one; the lines resolve one above on desktop and one below on mobile, and it is no zoom) and `10` (one case, `opens every note outlined on a fresh install`, line 8 resolving to line 6): not reproduced in a steady state |
| `heightmap-no-position` | 1, 1 | `90`, line 21. Measured with the note the case opens, outline mode on: after the raw HTML block, each line's coordinates resolve to the line after it (17 to 18, 18 to 19, 19 to 20, 20 to 21, and 21 to none). With outline mode off every line resolves to itself, and a horizontal rule alone, a table and a properties block do not do it. A defect in the height map beside a block widget: #321 |
| `caret-covered` | 5, 5 (before 5, 3) | `80` R6 (⌦ on the cover's trailing gap line), a plugin defect: [#312](https://github.com/laughedelic/obsidian-true-outliner/issues/312). `57` opens the correction menu on purpose (`div.menu-scroll` on desktop, `div.suggestion-bg` on mobile: one case on desktop, three on mobile; the two extra mobile cases are `keeps the numbers of the list a correction writes into` and `opens the menu at the command`, and why they were absent from the count of 3 is not known). Not diagnosed: `55` on desktop (the status bar, `div.status-bar` in the first sweep and the plugin's own `div.status-bar-item` in the second, in two cases, `accents a widget-rendered ANCESTOR` and `applies a settings change live`, of which only the first was looked at), `66` D8 (`div.cm-scroller` at the caret, the signature of #312's R6, in a case that ends with the caret in a table row), and `75` on mobile (the header's buttons; listed as not reproduced in #315) |
| `grid-left-of-column` | 6, 4 | `57`'s lone block id under an item, as stock draws it: [#314](https://github.com/laughedelic/obsidian-true-outliner/issues/314). A task line in `65` (B6, caret at position 2 of `- [ ] beta gamma`) and in `81` whose text starts 3.14 px left: while the caret is inside the checkbox syntax, Obsidian shows the source `- [ ]`, the rule takes the `[` as the first ink, and the raw `- ` is narrower than the gutter. With the caret in the text the offset is −0.02 px. A rule error, [#324](https://github.com/laughedelic/obsidian-true-outliner/issues/324); `81`'s example was not re-measured. The selection job holds three of these on each platform and its log names one |
| `shift-above-edit` | 1, 2 (3 obs on mobile) | `68` on desktop, `80` (X2) and `30` on mobile. Single-case runs of `68` (desktop), and of `30` and `80` X2 (mobile emulation), gave none. One of two whole-file runs of `68` gave none, and the other gave two observations in another case (`one undo reverts the whole group`: line 1 moved −106 px with the edit touching lines 2 to 4, and line 5 moved 32 px right). Its `outlineNote` is the set-up of `67`, followed by a real edit, so probably a shift the set-up causes after `setValue` is judged against that edit, the residual the design named: [#325](https://github.com/laughedelic/obsidian-true-outliner/issues/325). `30`'s shift is a `cm-indent` moving one indent unit (−25 px on mobile here, −32 px on desktop in the second sweep), not diagnosed; see the paragraphs after this table |
| `shift-sideways` | 1, 0 (second sweep: 1, 3) | `57`, a block id dropped under the item above: the line moves 32 px right, which the drop may do. Not reproduced. Listed as not reproduced in #315. The second sweep added three mobile cases, in `52` (`redraws a heading's mark when its level is retyped`), `58` (`says so in the outline when one lands inside a list…`) and `68` (`the selection survives, so a second Tab acts on…`); none is diagnosed |
| `caret-outside-scroller` | 1, 1 | `93`: the case leaves the caret out of view. Listed as not reproduced in #315 |
| `scroll-excursion` | 2 in 2 cases, 0 | Desktop only, both in `77`, the footer's narrow-width cases. Listed as not reproduced in #315 |
| `unexpected-notice` | 2, 2 | `98`'s drawn case `backspace-on-an-emptied-first-item` raises "Nothing here to join with." and the case-file runner has no way to wait for it, the same shape `62`'s had: [#322](https://github.com/laughedelic/obsidian-true-outliner/issues/322). `60` raises Obsidian's own "modified externally" notice, in a case that changes the file from outside on purpose: [#326](https://github.com/laughedelic/obsidian-true-outliner/issues/326) |
| `console-error` | 0, 1 | `62`'s 2,000-line stress case on mobile: an `ENOENT` from Obsidian writing a note the vault reset removed |

**A second sweep, on the rebased branch** (run 36594726606 at `35cb9da`, main at `b161ed8`; 1,038
desktop and 994 mobile cases, all jobs green). The plugin source is identical to the first sweep's (the rebase brought main's changes to `helpers.ts`
and to specs `00`, `61`, `65` and `66`, none of them in a case that varied), so the difference
between the two sweeps is how much of each reading is run-to-run variation:

- The six rules that read clean read clean again, with the same caret, grid, height-map, scroll and
  layout-shift read counts to within two cases (caret 781 and 523, grid 917 and 831).
- Rules that reported the same cases both times, as far as the reports name them: `caret-covered`
  (5, 5), `caret-outside-scroller` (1, 1), `heightmap-no-position` (1, 1), `scroll-excursion` (2, 0),
  `unexpected-notice` (2, 2), and `heightmap-wrong-line` on mobile (8 cases, 16 observations). A
  report names at most five examples per finding, so `59`'s second case is hidden on both platforms,
  and on desktop the `59` case that is visible differs between the sweeps. `55`'s two `caret-covered`
  cases are the same, but the covering element changed from `div.status-bar` to
  `div.status-bar-item plugin-true-outliner…`, the plugin's own status bar item.
- Rules that varied: `shift-above-edit` reported 2 cases on desktop (was 1) and 2 on mobile, in a
  different set of cases (`30` on desktop now; `68` and `81` on mobile in place of `30` and `80`);
  `shift-sideways` reported 3 mobile cases (was none); `heightmap-wrong-line` on desktop reported 11
  cases and 20 observations (was 12 and 29, with another `59` case); `grid-left-of-column` on
  desktop reported 5 cases (`56` did not); and `console-error` on mobile reported none.

The cases that moved are the layout-shift ones, `59`, `56`'s task-line reading and `62`'s console
error. Of the layout-shift cases, only `68` calls `outlineNote`, the set-up #325 is about; `30`, `52`,
`57`, `58`, `80` and `81` do not, and their shifts are not diagnosed. `68`'s desktop reading, `indent
accepts the same two-scope cover…`, came out identical in both sweeps (line 1 moved −132 px, the edit
touching lines 3 to 4). A rule that reports the same cases in two sweeps is a finding to attribute;
one that moves is not yet a finding about a case.

`30`'s shift is a `cm-indent` moving one indent unit on the line above an edit: −25 px on mobile in
the first sweep and −32 px on desktop in the second, with the edit touching lines 4 and 5. It is not
the Shift+Tab reading recorded under "Scroll and layout shift" above. That one was reproduced in the
app: Shift+Tab on a new item moves the `.cm-indent` of five grandchild lines elsewhere in the note
+32 px in one frame (+36 px with outline mode off), filed as
[#330](https://github.com/laughedelic/obsidian-true-outliner/issues/330). `30`'s five Enters gave no
horizontal shift in six replays in the app, so it remains a reading from the CI reports only.

The mobile readings were not re-measured in the app: the driver runs the desktop app.

## What the monitors do not read

- **A shift the browser has not rendered yet.** A layout shift reaches the observer when the browser
  next renders; the read takes what has been recorded, so a shift produced by the body's last action
  can be missed. The self-test's shift rows wait for the entry for that reason.
- **A caret in a case that never focused the editor.** 158 desktop cases and 336 mobile ones in the latest sweep.
- **A case that reloads the page.** Three of them, whose monitors were gone by the read.
- **What the recorders cost inside a case.** The 22 ms a case is the install and the read. A frame
  sampler, a layout-shift observer, a notice observer and a document diff at each edit run through
  the body, exempt cases included, and that cost is not measured. The cases that time the plugin
  pass with them on; `E2E_MONITORS=off` is the way to time one without them.
- **A popout window, or a window whose frames are throttled.** The caret, grid and notice readings
  use the main window's `document`; a sampler in a throttled window records nothing and still reports
  the monitor as read.
- **Anything a person reads off the screen.** Ink, colour and motion are #294 and #287.
