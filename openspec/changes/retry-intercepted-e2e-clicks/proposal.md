## Why

`clickClear` in `e2e/helpers.ts` retries a failed click only when the error mentions
staleness; every other failure is thrown on the spot. CI run 34252974667, job
`mobile (backlinks)`, failed `75-footer-behaviour.e2e.ts > backlinks footer: behaviour >
leaves the note's bytes and undo stack untouched while being read` with

> `element click intercepted: Element <svg ... class="to-backlinks-icon"> is not clickable
> at point (195, 412). Other element would receive the click:
> <div class="nav-files-container node-insert-event">`

— the phone-viewport file-explorer drawer sitting over the footer icon at click time. A
plain re-run of the same commit went green and the same tree had already passed the full
matrix twice, which reads like timing.

It is not timing. Reproducing the failure locally and probing the workspace at the refused
click found the drawer simply OPEN — `leftSplit.collapsed` false, 327 of the 390 available
pixels covered, unchanged across two attempts ~15 s apart
(`docs/research/29-e2e-click-retry-costs.md`, addendum). It closes on its own later in the
session, which is why a re-run goes green. No bounded wait inside one test closes it, so the
click has to be made against a workspace with the editor actually on screen.

That is the fix. The retry this change also makes is a second, smaller thing: interception is
a failure mode that sometimes IS transient, and admitting it to the existing loop is cheap
insurance — but it is not what makes the observed flake go away, and the change no longer
claims it is.

## What Changes

- `clickClear` collapses the phone UI's left drawer before clicking, on mobile runs. Nothing
  in the suite asserts the drawer's state, so closing it costs nothing.
- `clickClear` also treats an intercepted click as retriable alongside a stale element
  reference, with the same pauses and the same re-query and re-centre — a safety net for the
  interceptions that are genuinely transient, not the fix above.
- The retry decision moves out of the loop entirely: `clickFailureMode` names the failure
  from its full W3C error-code phrase, `CLICK_ATTEMPTS` gives each mode its bound — four for
  staleness, two for interception — and `spendClickAttempt` tallies attempts against the mode
  that caused them, so a click that goes stale first still arrives at an interception with
  its interception budget intact.
- Interception gets two attempts and not four because of what an attempt costs there:
  `docs/research/29-e2e-click-retry-costs.md` measures it at ~15 s, four of which overrun
  the 60 s mocha per-test budget and replace the error naming the covering element with a
  bare timeout.
- `00-smoke` gains three harness self-tests: two pure ones on the classifier and on the
  per-mode tally, and one that blocks a real click for the whole call and asserts both that
  the loop spent more than a single attempt on it and that it still fails as an
  interception.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `e2e-verification` states what the harness verifies — the behaviours, the sandbox
guarantees, the exclusion from the bundle and the unit suite — and none of its requirements
describe how a helper reaches an element. The same scenarios are verified before and after,
so the change declares `skip_specs: true`.

## Impact

- `e2e/helpers.ts` — `clickClear`, the drawer collapse, and the classifier, bounds and tally
  beside it.
- `e2e/specs/00-smoke.e2e.ts` — three added tests, in the harness's own spec rather than in a
  feature group, because what they verify is the harness. The blocked-click one costs ~45 s,
  in the smallest group and off the matrix's critical path.
- `docs/research/29-e2e-click-retry-costs.md` — new, holding the figures both bounds rest
  on.
- No `src/` change, no plugin behaviour change, no change to any spec under
  `openspec/specs/`.
