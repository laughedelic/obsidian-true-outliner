## 1. Widen the retry loop

- [ ] 1.1 Extract the retry decision from `clickClear` into `isRetriableClickFailure` in
      `e2e/helpers.ts`, admitting an intercepted click alongside a stale element reference,
      with a comment per mode saying why waiting helps; verify with `npm run build:e2e`.
- [ ] 1.2 Export the loop's attempt count and inter-attempt pause so the self-test can
      derive its floor from them rather than restate a figure; verify with
      `npm run build:e2e`.

## 2. Make the retry path reachable

- [ ] 2.1 Add a `00-smoke` test that covers the click target with a fixed overlay for the
      whole call, drives `clickClear` at it, and asserts the call fails with the
      interception error and only after at least `(attempts - 1) x pause` has elapsed;
      verify with `npm run test:e2e:narrow -- 00-smoke "intercepted"`.
      Negative control: narrowing `isRetriableClickFailure` back to staleness alone must
      fail the elapsed-time assertion, because the call then throws on the first attempt.
- [ ] 2.2 Record the measured cost of exhausting the loop against a permanently blocked
      target, and confirm it leaves the 60s mocha budget intact; verify from the narrow
      run's reported duration for that test.

## 3. Confirm nothing else moved

- [ ] 3.1 Run `npm run test:e2e:narrow -- 75-footer-behaviour --mobile` and confirm the
      spec that flaked still passes end to end.
- [ ] 3.2 Run `npm run test:e2e:narrow -- 00-smoke` desktop and mobile, and `npm test`, and
      confirm all pass.
- [ ] 3.3 `openspec validate retry-intercepted-e2e-clicks --strict`
