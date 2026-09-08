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
  reference, inside the existing four-attempt bound and its existing pauses.
- The retriable-failure decision moves into a named predicate so the two admitted failure
  modes, and the reason each is admitted, sit in one place.
- `00-smoke` gains a harness self-test that drives a real intercepted click through
  `clickClear` and asserts both halves of the contract: the retry path runs, and a click
  that stays blocked still fails as an interception rather than as a timeout.

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
- `e2e/specs/00-smoke.e2e.ts` — one added test, in the harness's own spec rather than in a
  feature group, because what it verifies is the harness.
- No `src/` change, no plugin behaviour change, no change to any spec under
  `openspec/specs/`.
