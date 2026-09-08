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
matrix twice, so the drawer's position is timing, not a defect in the footer.

Interception is therefore the second failure mode this helper meets that is transient by
construction, and the loop already does the two things that dislodge it: it re-queries and
re-centres the target, and it waits between attempts. Nothing else in the helper needs to
change.

## What Changes

- `clickClear` treats an intercepted click as retriable alongside a stale element
  reference, with the same pauses and the same re-query and re-centre.
- The retry decision moves into `clickAttemptBudget`, which returns the number of attempts
  a failure is worth — four for staleness, two for interception, none for anything else —
  so each admitted mode carries its own bound and its own reason.
- Interception gets two attempts and not four because of what an attempt costs there:
  `docs/research/24-e2e-click-retry-costs.md` measures it at ~15 s, four of which overrun
  the 60 s mocha per-test budget and replace the error naming the covering element with a
  bare timeout.
- `00-smoke` gains two harness self-tests: one on the budget itself, using the verbatim
  errors each mode was observed with, and one that blocks a real click for the whole call
  and asserts it still fails as an interception.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `e2e-verification` states what the harness verifies — the behaviours, the sandbox
guarantees, the exclusion from the bundle and the unit suite — and none of its requirements
describe how a helper reaches an element. The same scenarios are verified before and after,
so the change declares `skip_specs: true`.

## Impact

- `e2e/helpers.ts` — `clickClear` and the new predicate beside it.
- `e2e/specs/00-smoke.e2e.ts` — two added tests, in the harness's own spec rather than in a
  feature group, because what they verify is the harness. The blocked-click one costs ~30 s,
  in the smallest group and off the matrix's critical path.
- `docs/research/24-e2e-click-retry-costs.md` — new, holding the figures both bounds rest
  on.
- No `src/` change, no plugin behaviour change, no change to any spec under
  `openspec/specs/`.
