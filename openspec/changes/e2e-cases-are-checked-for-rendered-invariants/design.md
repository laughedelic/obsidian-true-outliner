## Context

See proposal.md, "Why". Every reading, the hook order and the false-positive census this design
rests on are in [`docs/research/ambient-e2e-monitors`](../../../docs/research/ambient-e2e-monitors.md);
what a run can read at all is in
[`docs/research/rendered-ui-observability`](../../../docs/research/rendered-ui-observability.md).
What "aligned" means comes from the same place the grid specs get it:
[`docs/research/native-list-decoration`](../../../docs/research/native-list-decoration.md) and
[`docs/research/decoration-lessons`](../../../docs/research/decoration-lessons.md). The design
depends on these facts from the note:

- Under wdio's mocha, `beforeTest` runs after the spec's `beforeEach` and immediately before the
  body, and `afterTest` runs right after the body and before the spec's `afterEach`. The config's
  hooks and the specs share module state.
- After a timeout, `afterTest` is delivered late: after the spec's `afterEach` and the next case's
  `beforeEach`.
- The DOM selection's rect equals `coordsAtPos(head)` wherever the caret stands on text. On an empty
  line the selection sits on an element boundary and has no rect.
- A case's own editor is `app.workspace.activeEditor.editor.cm`, reachable from a plain
  `browser.execute` without the service's `executeObsidian` bridge.

## Goals / Non-Goals

**Goals:**

- Every existing and future case contributes a reading, with no edit to it.
- A monitor's failure to read, and its false positives, cost a report line and never a case.
- What was not read is as visible as what was found, so a quiet report is never mistaken for a
  clean one.

**Non-Goals:**

- A monitor test that runs under `npm test`. `e2e-verification` keeps the harness out of the unit
  suite (its "Harness excluded from bundle and unit tests" scenario), and the readings need a real
  editor. The self-test spec is the check.
- Reading the editor while a case runs. Every reading is taken once, after the body.

## Decisions

**Install from `beforeTest`, read from `afterTest`, in `caseHooks`.** Both configs spread
`caseHooks(label)`, which also runs `screenshotOnFailure`, so the two configs cannot drift on it.
Because `beforeTest` follows the spec's `beforeEach`, what a case arranges there (opening a note,
setting the buffer) is not something the monitors watch, and what it leaves is what is read.
Alternatives considered:

- *A root-level mocha `beforeEach` from `mochaOpts.require`* runs before the spec's own, so a
  spec's set-up churn would be counted as the case's, and the layout shift of every `setBuffer`
  reported.
- *Each spec importing the monitors* is the edit to every spec the issue asks to avoid.

**Read only a case that passed, and match the hook to the case it belongs to.** After a timeout the
hook arrives after the next case's `beforeEach`, so `afterCase` acts only when the case that is
running is the one the hook names, and it reads only on `passed`. A failed case records that it was
not read.

**One page-side install and one page-side read, each self-contained, run by `browser.execute`.**
`browser.execute` serialises a function, so the readings cannot share helpers across the boundary;
one install function and one read function keep each monitor's code beside the others'. They use
`window.app` and `workspace.activeEditor` rather than `executeObsidian`, which depends on a bridge
the service injects and which is absent for a moment after a reload. Alternatives:

- *A `<script>` string built from module-level functions* would share helpers, and would move the
  code out of the type checker.
- *Reading in several round trips* costs one WebDriver call per monitor, on 1,500 cases per run.

**The readings, and the rule each one holds to.** Tolerances come from the measurements.

- **Caret.** Applies when the editor is the page's active element, the selection is empty and the page has one
  collapsed selection: a range paints as a range, and the DOM selection of an editor that is not the
  active element is stale. It asks for the active element and not for CodeMirror's `hasFocus`, which
  also needs the window to have focus, and several Obsidian windows on one display take that from
  each other: in CI's first sweep 308 of 1,014 desktop cases were unreadable for it.
  The painted rect is the DOM range's first client rect. It must be within 0.5 px horizontally and
  1 px vertically of `coordsAtPos(head)`. Where the range has no rect — an empty line — the position
  CodeMirror reports stands in for it, so visibility is still read and agreement is not. The point
  must be inside the scroller's rect, unless the case itself scrolled the editor: it may have left
  the caret behind on purpose, and the scroll monitor reads what the scrolling did. And
  `elementFromPoint` there must land in the caret's own `.cm-line` or widget: a clip by
  `overflow: hidden`, as in #128, sends the hit test to an ancestor.
- **Scroll.** Stores a sample only when the active editor's `scrollTop` changes, so a jump that
  settles back is two entries, and resets the baseline when the active editor changes. The first
  baseline is taken at install, not on the next frame: a case's first action can land before that
  frame, and 7 of 20 runs of the self-test's excursion row lost it. An excursion
  is a position that leaves by more than the larger of 48 px and a quarter of the viewport and returns
  to within 2 px. A step is reported when it exceeds half the viewport in one frame while the caret
  was in view before it and after it; where the caret stood before is derived from where it stands
  now and the step, since the position sampler cannot ask CodeMirror in the past.
- **Grid.** Reads every rendered line whose own computed style carries `--to-depth` (an absent
  property reads as `''`, which `Number` turns into depth 0), minus the kinds that draw a box of
  their own (fences, callouts, tables, embeds, other widgets), whose text origin is theirs to state,
  right-to-left lines, which begin at the right edge, and lines holding an inline embed, whose
  widget stands in the middle of a row. A row that begins in an inline code span begins where the
  span's box does, since the span pads its text in. Text a decoration draws inside the line
  (a fold's hidden count, a chip) is not the line's text and starts no row.
  A row's position is the first *ink* of the row's text nodes, from `Range.getClientRects` on the
  text past its leading whitespace, and never a wrapper's box: a wrapper reports where a run of
  whitespace begins. Boxes belong to one row when they overlap vertically, not when their rounded
  tops agree: an inline code span's padding puts its box off the text beside it. Text must not begin left of `depth × unit + gutter`. It must begin on it, to
  0.5 px, on every row, unless the item carries an ordered marker wider than the gutter, a task
  control, whitespace after its marker beyond the one space, or whitespace a line without a marker
  begins with, each of which the specs let move it right. Rows of a wrapped item must agree with each other on the same terms. A mark's centre is the
  bullet's `::after`, the icon's or the checkbox's box, and must be on the column to 0.5 px, which is
  the half pixel `native-list-decoration` records between a mark's centre and its guide's.
- **Height map.** For every rendered, plain `.cm-line`, non-blank, non-collapsed and inside the
  scroller, `posAtCoords` at `coordsAtPos(line.from)` shifted one pixel right must resolve to that
  line. A widget stands for several lines and resolves to its own position, and `posAtCoords`
  returns null for a point outside the scroller, so neither is a line to round-trip.
- **Layout shift.** A `PerformanceObserver` on `layout-shift`, with each source resolved to the
  document line of the plain `.cm-line` child of `.cm-content` it sits in; sources outside the
  editor's content (the status bar, notices) and widgets (the footer, a table) are dropped. The lines an edit touched are the span between the first
  and last differing line at each `editor-change`, unioned over the case per editor, from a snapshot
  taken when the editor is first seen. A source above the span is reported for any movement; a
  source outside it is reported for sideways movement only, since a line below an insertion
  legitimately moves down. A case that edited no document is not read: with no edit there is no
  span to judge a line against, and a fold, a zoom or a setting moves lines on its own.
- **Errors.** `error` and `unhandledrejection` on the window, and a wrapper on `console.error` that
  calls the original, since CodeMirror reports a plugin that threw there rather than raising it.
  Chromium's own "ResizeObserver loop" message is dropped.
- **Notices.** A `MutationObserver` of the monitor's own, because the shared recorder is cleared by
  the cases that read it. A notice is expected when the case waited for its text or read the
  notices on screen or in the recorder, which the three notice helpers now report.

**Exemptions live with the running case, per monitor, and require a reason.** `exempt(reason,
...monitors)` from the body applies at once; from a `beforeEach` it is held and taken by the next
`beforeTest`. With no monitor named it covers all seven. One case loses it: when the previous case
timed out, that case is still the running one at the next `beforeEach`, so the exemption lands on it
and is dropped with it, and the next case is read in full. That is the direction a report-only
monitor can afford. Alternatives:

- *A table keyed by spec and title in one file* keeps reasons together and needs no spec edit, and
  drifts the moment a title changes.
- *A tag in the title* is read by the reporters and the JUnit names Codecov keys its history on.

**A record per case, aggregated by the launcher.** Each worker appends one JSON line per case to its
own file, so workers never write the same file, and `onComplete` (launcher only, as
`writeFailureSummary`) collapses the lines into the report. `scripts/e2e-monitors-summary.ts`
renders the report as Markdown so the workflow, a person and the log read one form. Reading the
report needs no re-run, as with `e2e-summary.json`.

**A monitor never throws into a case.** Install, read and write are each guarded, the page calls
race a budget, and any failure is recorded as "not read" with the reason. `E2E_MONITORS=off` skips
the hooks for a run that measures something else.

## Risks / Trade-offs

- [The rules produce findings that are not defects] → That is the state report-only exists for. Each
  rule is grouped by name in the report with its first examples, so a rule's noise is countable; a
  case that sets up an odd state on purpose takes an exemption with its reason, and a rule that is
  wrong for a whole kind is corrected in its own change.
- [Hooks add time to every case] → Each case costs one install and one read call. The note records
  the total against the run's length; `E2E_MONITORS=off` removes it.
- [The observers change what they observe] → They only read: no dispatch, no style write, no
  focus. The one node added to the page, a probe for the gutter's width, is removed in the same call.
- [A quiet report mistaken for a clean one] → Coverage is part of the report: a monitor that read 40
  of 300 cases says so, with the reasons.
- [The layout-shift span is approximate: a case that edits and moves to another note, or edits from
  outside the editor, is not classified] → Such a case's shifts are not reported, and its record says
  the monitor was not read.
- [A future Obsidian changes what the DOM selection is] → The self-test's caret case fails, and the
  caret monitor is the one that names it.

## Open Questions

- Which rules are ready to become failures, and in what order, is decided from the reports that
  follow this change and belongs to a change of its own.
