## 1. Measure what each monitor reads

- [x] 1.1 Log the order of the spec's hooks, wdio's `beforeTest`/`afterTest` and the body over a
      passing, a failing, a timed-out and a skipped case, and whether a module the spec sets is seen
      by the config's hooks. Verified by
      `npm run test:e2e:narrow -- 99-zz-hook-order` from
      `docs/research/prototypes/ambient-monitors/hook-order.e2e.ts.txt`: `beforeTest` follows the
      spec's `beforeEach`, `afterTest` precedes its `afterEach`, module state is shared, and the
      timed-out case's `afterTest` arrives after the next case's `beforeEach`.
- [x] 1.2 Read the DOM selection's rect against `coordsAtPos` across seventeen caret shapes, and
      layout shift, scroll and rendered text columns across keystroke scenarios and a mixed-kind
      document. Verified by `npm run test:e2e:narrow -- 99-zz-monitor-probe` from
      `docs/research/prototypes/ambient-monitors/monitor-probe.e2e.ts.txt`.
- [x] 1.3 Run the prototype monitors over the whole desktop suite and record the findings, the
      coverage and the cost. Verified by `npm run test:e2e` and `.obsidian-cache/e2e-monitors.json`.
- [x] 1.4 Write the measurements up in `docs/research/ambient-e2e-monitors.md`, with its row in
      `docs/research/index.md`. Verified by `npm run lint`, whose research-index check passes.

## 2. The monitors

- [x] 2.1 `e2e-tests/monitors.ts`: the page-side install and read, the worker-side hooks, `exempt`,
      `expectNotices`, and the per-case record. Verified by `npm run typecheck:e2e` and a narrow run
      of `56-list-grid`, whose report lists all seven monitors read.
- [x] 2.2 `e2e-tests/wdio.shared.mts`: `caseHooks`, the report writer, and the reset of the records
      and the report; both configs spread `caseHooks` and write the report from `onComplete`. Verified
      by narrow runs on desktop and with `--mobile`, each printing the `[e2e] monitors:` line and
      leaving `.obsidian-cache/e2e-monitors.json`.
- [x] 2.3 `e2e-tests/helpers.ts`: `waitForNotice`, `noticeTexts` and `recordedNoticeTexts` report
      what a case expected. Verified by `20-structural-commands`, whose cases that wait for a refusal
      report no unexpected notice, and by 3.1's row for a notice with block children, which reads the
      text the way WebDriver does. The helpers' calls themselves have no row of their own.
- [x] 2.4 `E2E_MONITORS=off` skips both hooks. Verified by a narrow run with it set, which writes no
      record and no report.

## 3. Check the monitors themselves

- [x] 3.1 `e2e-tests/specs/01-ambient-monitors.e2e.ts`, exempt from every monitor in each case
      because each drives the install and read itself: one case per rule, each first reading a clean
      state, then breaking the thing on purpose and reading again. Rows: a caret clipped by
      `overflow: hidden` on its line; a caret whose line is covered, or moved out of the scroller, or
      already out of view when the case began; a scroll that leaves and returns;
      a step with the caret in view; a line moved by `left` or `top`; a wrapped row off its item's hang; a
      mark moved a pixel; a line moved sideways by a style write that touches no text, and another
      pushed down by an edit above it; a thrown error, a `console.error`; a notice, awaited and not;
      and a case with no focus. Negative controls, one per row: weakening the rule (dropping the hit
      test; the excursion's return check; the grid's tolerance; the layout-shift span; the awaited
      text match) must fail its row.
- [x] 3.2 A case that fails or times out is not read, and an exemption without a reason fails the case
      that made it. Verified by 3.1's rows for the exemption and the unread failure, with a spec-level
      control that passes an empty reason.

## 4. Report

- [x] 4.1 `scripts/e2e-monitors-summary.ts` renders the report; `.github/actions/e2e/action.yml`
      appends it to `$GITHUB_STEP_SUMMARY` after the run, whatever its status, and uploads
      `.obsidian-cache/e2e-monitors.json` as an artifact. Verified by `npm run typecheck:scripts`, by
      running the script on a local report, and by the pushed checkpoint's job summary.
- [x] 4.2 The full sweep runs with the monitors on, desktop and mobile. Verified by the pushed
      checkpoint's matrix: every job leaves a report, and the census in
      `docs/research/ambient-e2e-monitors.md` states what each reported.
- [x] 4.3 A case whose findings are deliberate takes an `exempt` with its reason, and each rule that
      reports in more than a few cases is named in the note with what its findings turned out to be.
      Verified by the CI sweeps after the corrections, whose remaining findings the note lists by rule and
      case; nine rules stay unexplained there, and are candidates, not claims.

## 5. Document and close

- [x] 5.1 `CLAUDE.md`, "E2E testing": where the report is, how a case exempts itself, and the
      switch. `docs/research/refused-commands-in-e2e.md`: its closing thread points at the notices
      monitor. Verified by `npm run lint`.
- [x] 5.2 `npm test`, `npm run build`, `npm run typecheck`, `npm run typecheck:e2e`,
      `npm run typecheck:scripts` and `npm run lint` all pass.
- [x] 5.3 `openspec validate e2e-cases-are-checked-for-rendered-invariants --strict`
