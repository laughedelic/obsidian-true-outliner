## 1. Diagnose before fixing

- [x] 1.1 Reproduce the CI interception under mobile emulation and probe the workspace at the
      refused click; record in `docs/research/e2e-click-retry-costs.md` that
      `leftSplit.collapsed` is false and the drawer covers the click point, unchanged across
      attempts.
- [x] 1.2 Measure what retrying an intercepted click would cost — one attempt against a
      covered target, and four against the mocha budget — and record it in the same note;
      verified by a run that timed out at 60 s and another that finished at 60.3 s.

## 2. Fix

- [x] 2.1 Collapse the phone UI's left drawer in `clickClear` before scrolling and clicking,
      on mobile runs; verified with `npm run test:e2e:narrow -- 75-footer-behaviour --mobile`.
- [x] 2.2 Leave the retry to a stale element reference, matched on its full W3C error-code
      phrase, and record beside it why interception is not admitted; verified with
      `npm run build:e2e`.

## 3. Cover it deterministically

- [x] 3.1 Add a mobile-only `00-smoke` test that calls `leftSplit.expand()`, asserts the
      drawer is over the click point, and requires `clickClear` to land the click in the
      editor; verified with `npm run test:e2e:narrow -- 00-smoke --mobile`.
      Negative control: removing the collapse fails it with the interception, every run.

## 4. Confirm nothing else moved

- [x] 4.1 `npm run test:e2e:narrow -- 75-footer-behaviour --mobile` — 20 passing, including
      the test that flaked on CI.
- [x] 4.2 `npm run test:e2e:narrow -- 00-smoke` — 4 passing on mobile, 3 plus one skipped on
      desktop, where the left split is a sidebar beside the editor rather than a drawer over
      it.
- [x] 4.3 `npm test`, `npm run build`, `npm run build:e2e`, `npm run lint`.
- [x] 4.4 `openspec validate collapse-phone-drawer-before-clicking --strict`
