## 1. Measure before choosing a bound

- [x] 1.1 Drive `clickClear` at a target covered for the whole call and time it; record the
      per-click, per-attempt and per-bound figures in `docs/research/29-e2e-click-retry-costs.md`.
      Verified: four attempts cost 59.7 s against a 60 s mocha budget, observed both timing
      out and finishing at 60.3 s.

## 2. Fix the obstruction that was actually there

- [x] 2.0 Reproduce the CI interception under mobile emulation and probe the workspace at the
      refused click; record in `docs/research/29-e2e-click-retry-costs.md` that
      `leftSplit.collapsed` is false and the drawer covers the click point, unchanged across
      both attempts. Collapse it in `clickClear` on mobile runs; verified with two clean
      `npm run test:e2e:narrow -- 75-footer-behaviour --mobile` runs, back to ~52 s from the
      ~80 s the exhausted retry cost.
- [x] 2.1 Cover the collapse deterministically rather than relying on the intermittent state:
      a mobile-only `00-smoke` test that calls `leftSplit.expand()`, asserts the drawer is
      over the click point, and requires `clickClear` to land the click in the editor.
      Negative control: removing the collapse fails it with the interception, every run.

## 3. Widen the retry loop

- [x] 3.1 Move `clickClear`'s retry decision into `clickFailureMode`, `CLICK_ATTEMPTS` and
      `spendClickAttempt` in `e2e/helpers.ts` — four attempts for staleness, two for
      interception, none for anything else, tallied per mode so one mode cannot spend
      another's budget — with a comment per mode saying why it is admitted and what its bound
      rests on; verified with `npm run build:e2e`.
- [x] 3.2 Keep the loop's other reasoning where it was: the doc comment on `clickClear` still
      owns centring and re-querying, and now points at the budget for which failures repeat.

## 4. Make the retry path reachable

- [x] 4.1 Add two pure `00-smoke` tests — the classifier against the verbatim errors each
      mode was observed with plus a message merely containing `intercepted`, and the tally
      driven through a stale-then-intercepted sequence; verified with
      `npm run test:e2e:narrow -- 00-smoke`.
      Negative control: making the tally a single counter shared by both modes fails the
      second — run and confirmed.
- [x] 4.2 Add a `00-smoke` test that blocks a real click for the whole call, times one
      blocked click first, and asserts the loop spent more than a single attempt and still
      failed as an interception; verified with the same run, at ~45 s.
      Negative controls, both run and confirmed: a `clickClear` that throws without
      consulting the budget fails the elapsed assertion (14.7 s against a 19.4 s floor), and
      raising interception's bound to 4 puts the call at the 60 s mocha budget — timing out
      on one run and passing at 60.3 s on another, which is the reason the bound is 2.

## 5. Confirm nothing else moved

- [x] 5.1 `npm run test:e2e:narrow -- 75-footer-behaviour --mobile` — 20 passing twice over,
      including the test that flaked on CI.
- [x] 5.2 `npm run test:e2e:narrow -- 00-smoke` — 7 passing on mobile, 6 plus one skipped on
      desktop, where the left split is a sidebar beside the editor rather than a drawer over
      it.
- [x] 5.3 `npm test` (1216 passing), `npm run build`, `npm run build:e2e`, `npm run lint`.
- [x] 5.4 `openspec validate retry-intercepted-e2e-clicks --strict`
