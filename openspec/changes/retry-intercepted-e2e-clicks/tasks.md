## 1. Measure before choosing a bound

- [x] 1.1 Drive `clickClear` at a target covered for the whole call and time it; record the
      per-click, per-attempt and per-bound figures in `docs/research/29-e2e-click-retry-costs.md`.
      Verified: four attempts cost 59.7 s against a 60 s mocha budget, observed both timing
      out and finishing at 60.3 s.

## 2. Widen the retry loop

- [x] 2.1 Replace `clickClear`'s inline condition with `clickAttemptBudget` in
      `e2e/helpers.ts` — four attempts for staleness, two for interception, none otherwise —
      with a comment per mode saying why it is admitted and what its bound rests on; verified
      with `npm run build:e2e`.
- [x] 2.2 Keep the loop's other reasoning where it was: the doc comment on `clickClear` still
      owns centring and re-querying, and now points at the budget for which failures repeat.

## 3. Make the retry path reachable

- [x] 3.1 Add a `00-smoke` test asserting `clickAttemptBudget` against the verbatim errors
      each mode was observed with; verified with `npm run test:e2e:narrow -- 00-smoke`.
      Negative control: returning 0 for an intercepted click fails it (expected 2, got 0) —
      run and confirmed.
- [x] 3.2 Add a `00-smoke` test that blocks a real click for the whole call and asserts it
      still fails as an interception; verified with the same run, at ~30 s.
      Negative control: raising interception's bound to 4 puts the call at the 60 s mocha
      budget — run and confirmed non-deterministic there, timing out on one run and passing
      at 60.3 s on another, which is the reason the bound is 2.

## 4. Confirm nothing else moved

- [x] 4.1 `npm run test:e2e:narrow -- 75-footer-behaviour --mobile` — 20 passing, including
      the test that flaked on CI.
- [x] 4.2 `npm run test:e2e:narrow -- 00-smoke` desktop and mobile — 5 passing each.
- [x] 4.3 `npm test` (1213 passing), `npm run build`, `npm run build:e2e`, `npm run lint`.
- [x] 4.4 `openspec validate retry-intercepted-e2e-clicks --strict`
