# What a retried click costs in the e2e harness

Measured on 2026-09-08, macOS, Obsidian v1.13.7 (installer v1.5.8), chrome 120.0.6099.283,
against `e2e/helpers.ts`'s `clickClear`. The question: `clickClear` retries a failed click,
and admitting a second failure mode to that loop is only safe if we know what an attempt
costs when it can never succeed.

## Method

A `position:fixed; inset:0` div was appended to the document body, covering the click
target for the whole call, and `clickClear` was pointed at `.cm-content` beneath it. Every
attempt is then refused, deterministically, so the loop runs to its bound and the elapsed
time is the cost of exhausting it. The per-click figure is the interval between successive
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
the second failure through. Its retry is immediate — no pause — which is why it does not
help against an obstruction that only time removes, and why the harness loop's pause is the
part that does.

## What follows

A four-attempt bound on interception overshoots the mocha budget: the run above failed at
60 s with a mocha timeout, and the `element click intercepted` error naming the covering
element was lost with it. A permanently blocked click must report itself, so interception
gets a bound of its own — two attempts, ~30 s — while staleness keeps four, an attempt there
costing a query and a pause rather than 15 s.

The asymmetry does not weaken the retry. Attempt 0 already spends ~15 s inside chromedriver
before the loop's own pause is reached, so a second attempt clicks roughly 15 s after the
first — far more settling time than the transient chrome this exists for needs.
