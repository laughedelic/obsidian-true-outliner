# What a refused click costs in the e2e harness

Measured 2026-09-08, macOS, Obsidian v1.13.7 (installer v1.5.8), chrome 120.0.6099.283,
against `e2e/helpers.ts`'s `clickClear`. The question began as "may an intercepted click join
the retry loop beside a stale element reference?" and the figures answered no, twice over —
once on cost, once on the diagnosis.

## Method

A `position:fixed; inset:0` div was appended to the document body, covering the click target
for the whole call, and `clickClear` was pointed at `.cm-content` beneath it. Every attempt
is then refused, deterministically, so a bounded loop runs to its bound and the elapsed time
is the cost of exhausting it. The per-click figure is the interval between successive
`element click intercepted` errors in the wdio log.

## Figures

| | |
| --- | --- |
| One refused click, chromedriver | 7.46 s (7.24–7.77 over 7 intervals) |
| Refused clicks per `clickClear` attempt | 2 |
| One `clickClear` attempt against a covered target | 14.9 s |
| Four attempts | 59.7 s |
| Mocha per-test budget (`mochaOpts.timeout`) | 60 s |

Two refused clicks per attempt, not one, because WebdriverIO's `click` handles this error
itself: `elementClick` re-scrolls the element to centre and re-issues the click, then lets
the second failure through. Its retry is immediate — no pause — so it does nothing for an
obstruction that only time would remove.

The per-refusal cost is not constant. Refusals against a `.cm-line` behind the phone drawer
came back in ~1.5–2 s, against ~7.5 s for the `.cm-content` measurement above. The figures
that matter are the slow ones, since they are what reached the budget.

## Why interception is not retried

Four attempts land on the mocha budget: a run at four timed out at 60 s, and another finished
at 60.3 s. A bound that decides by coin flip whether a real failure reports its cause or
reports nothing is not a bound, and the error lost to a timeout is the one naming the element
that covered the target. Two attempts (~30 s) stay inside the budget, but buy nothing — see
below. So `clickClear` retries a stale element reference, whose attempt costs a query and a
pause, and throws an interception where it happens.

## The obstruction that prompted this was never transient

`75-footer-behaviour` under mobile emulation reproduced the CI interception locally — same
element, same point (195, 412), same `nav-files-container` — and it survived two attempts.
Probing the workspace at each refusal:

| | |
| --- | --- |
| `app.workspace.leftSplit.collapsed` | `false` |
| `.workspace-drawer.mod-left` rect | (0, 0) 327.6 x 844 |
| viewport | 390 x 844 |

The phone UI's file explorer is a drawer, and open it covers 327 of the 390 available pixels
— including the centre of the editor, which is exactly where `clickClear` scrolls its target.
It read open at both attempts ~15 s apart and closed on its own later in the session; that is
what made the failure look like a race in CI, where a plain re-run went green.

It is not a race, and no bounded wait inside one test closes it. `clickClear` collapses the
drawer before clicking on mobile runs. Nothing in the suite asserts the drawer's state.

The open state is intermittent in the wild but does not have to be waited for:
`leftSplit.expand()` opens it on demand under emulation, as `24-outline-mode-surfaces.md`
measured. `00-smoke` forces it and asserts the click lands anyway, so removing the collapse
fails a test every run.
