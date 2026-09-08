## Why

CI run 34252974667, job `mobile (backlinks)`, failed
`75-footer-behaviour.e2e.ts > backlinks footer: behaviour > leaves the note's bytes and undo
stack untouched while being read` with

> `element click intercepted: Element <svg ... class="to-backlinks-icon"> is not clickable
> at point (195, 412). Other element would receive the click:
> <div class="nav-files-container node-insert-event">`

A plain re-run of the same commit went green and the same tree had already passed the full
matrix twice, which reads like timing.

It is not timing. Reproducing the failure locally and probing the workspace at the refused
click found the phone UI's left drawer simply OPEN — `leftSplit.collapsed` false, 327 of the
390 available pixels covered, unchanged across two attempts ~15 s apart
(`docs/research/29-e2e-click-retry-costs.md`). It closes on its own later in the session,
which is why a re-run goes green. No wait inside one test closes it, so the click has to be
made against a workspace with the editor actually on screen.

## What Changes

- `clickClear` collapses the phone UI's left drawer before clicking, on mobile runs. Nothing
  in the suite asserts the drawer's state, so closing it costs nothing.
- `00-smoke` gains a mobile-only test that forces the failing state with `leftSplit.expand()`
  rather than waiting for it, asserts the drawer really is over the click point, and requires
  the click to land in the editor.
- `clickClear`'s retry stays what it was — a stale element reference, four attempts — now
  matched on its full W3C error-code phrase rather than the bare word `stale`.

## Non-goals

- Retrying an intercepted click. It was proposed here and measured out: an attempt against a
  covered target costs ~15 s, four overrun the mocha per-test budget and replace the error
  naming the covering element with a bare timeout, and the one interception this suite has
  actually met is the drawer, which a wait does not close.
- Dismissing app chrome generally, or waiting for the workspace to settle before clicking.
  The drawer is collapsed because it is a workspace state with the editor off screen, not as
  a general obstruction sweep.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `e2e-verification` states what the harness verifies — the behaviours, the sandbox
guarantees, the exclusion from the bundle and the unit suite — and none of its requirements
describe how a helper reaches an element. The same scenarios are verified before and after,
so the change declares `skip_specs: true`.

## Impact

- `e2e/helpers.ts` — `clickClear` and the drawer collapse beside it.
- `e2e/specs/00-smoke.e2e.ts` — one added test, in the harness's own spec rather than in a
  feature group, because what it verifies is the harness.
- `docs/research/29-e2e-click-retry-costs.md` — new, holding the figures and the probe.
- No `src/` change and no plugin behaviour change.
