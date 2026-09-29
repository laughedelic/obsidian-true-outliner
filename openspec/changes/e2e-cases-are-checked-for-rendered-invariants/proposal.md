## Why

The defects that reach the manual pass are mostly ones no case was asked to look at: a caret placed
right and clipped out of sight (#128), a caret off its column (#63, #140), a scroll jump (#143, the
footer's fold jump), a guide or mark off the grid on a shape no fixture had. Each was pinned only
afterwards, by a case written for that one shape. The harness can read all of these on any
document, after any case, and none of the 56 spec files does unless it asks: the height map's
round trip exists in one of them, and no spec checks that a keystroke leaves the scroll alone.
[`docs/research/rendered-ui-observability`](../../../docs/research/rendered-ui-observability.md)
measures what a run can read, and
[`docs/research/ambient-e2e-monitors`](../../../docs/research/ambient-e2e-monitors.md) measures
the readings this change installs. #288 is the first of the umbrella #297's items that the sweeps
in #294 build on.

## What Changes

- Seven monitors run around **every** e2e case, from the hooks both wdio configs share
  (`e2e-tests/wdio.shared.mts`, beside `screenshotOnFailure`), so no existing case is edited:
  - **caret**: the painted caret, which is the DOM selection's rect, agrees with `coordsAtPos`,
    lies inside the scroller, and is what `elementFromPoint` finds at its centre;
  - **scroll**: a frame-by-frame sampler on the scroller reports a position that leaves and
    returns, and a large single-frame step while the caret was in view before and after it;
  - **grid**: every rendered line's first ink, on every visual row, sits on
    `column + gutter`, and each mark is centred on its column within the half pixel its guide is
    drawn off by;
  - **height map**: `posAtCoords(coordsAtPos(p))` returns the line for every rendered line;
  - **layout shift**: `layout-shift` entries on editor lines the case's edits did not touch;
  - **errors**: uncaught errors, unhandled rejections and `console.error`, which is where
    CodeMirror logs a plugin that threw;
  - **notices**: a notice the case neither waited for nor read.
- **Report-only.** A monitor never fails a case. Each case leaves a record of what was read,
  what was not and why, and what was seen; the launcher collapses them into
  `.obsidian-cache/e2e-monitors.json` beside `e2e-summary.json`, prints the findings, and CI
  renders the file into the job's step summary and uploads it.
- **A per-case opt-out that names its reason**: `exempt(reason, ...monitors)` from the case or its
  `beforeEach`, per monitor, with the reason required. The report lists every exemption.
- **`E2E_MONITORS=off`** turns the hooks off for a run that is timing something else.
- A self-test spec breaks each thing a monitor reads, on purpose, and asserts the monitor says so.
- The full sweep, desktop and mobile, is run with the monitors on, and the note records what it
  reported.

## Non-goals

- **Promoting any check to a failure.** Report-only is the state this change ships in. Promotion,
  check by check, follows once the false positives in the first reports are understood.
- **The monitors that need the DevTools protocol**: flicker from the screencast and per-keystroke
  latency. They wait for #287.
- **Ink probes**, which crop a screenshot and measure non-background pixels, and the sweeps over
  real notes, themes, zoom and width (#294).
- **Changing what any case asserts.** The monitors read the editor after a case has made its own
  assertions; an existing case is edited only to take an exemption its findings justify.
- **A read after a case that failed or timed out.** The editor is in whatever state the failure
  left, and a timed-out case's hook can arrive after the next case has started.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: adds a requirement that the harness reads the rendered editor around every
  case and reports what it saw, without failing the case, with a reasoned per-case opt-out.

## Impact

- `e2e-tests/monitors.ts`: new. The page-side readings, the worker-side hooks, the exemption
  API and the per-case record.
- `e2e-tests/wdio.shared.mts`: `caseHooks`, the report writer, and the reset of the new files.
  `e2e-tests/wdio.conf.mts` and `e2e-tests/wdio.mobile-emulation.conf.mts`: use them.
- `e2e-tests/helpers.ts`: `waitForNotice`, `noticeTexts` and `recordedNoticeTexts` tell the notice
  monitor what a case expected.
- `e2e-tests/specs/01-ambient-monitors.e2e.ts`: new, in the `smoke` group.
- `scripts/e2e-monitors-summary.ts`: new. `.github/actions/e2e/action.yml`: appends its output to
  the step summary and uploads the report.
- `CLAUDE.md`, "E2E testing": the report, the exemption and the switch.
- `docs/research/ambient-e2e-monitors.md`: new, with its index row, and a note in
  `docs/research/refused-commands-in-e2e.md` that its closing thread is now reported.
- No `src/` or `styles/` change and no plugin behaviour change.
