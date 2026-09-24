## 1. Measure where a budget has to be set

- [x] 1.1 Run mocha through `@wdio/utils`' own `wrapGlobalTestMethod` at a scaled timescale, one row
      per form: an in-body raise with and without the wrapper, the case after it, an in-body
      lower, a declared budget, a `describe` budget before and after the case, and an in-body
      raise in a hook. Verified by `node docs/research/prototypes/e2e-case-budget/case-budget-probe.mjs`:
      B and F fail with `Timeout`, B′ sees B's body finish inside it, C fails with mocha's own
      message, and A, D, E and E′ pass.
- [x] 1.2 Run #172's probe in the real harness: a 70 s pause against the 60 s default, once with
      an in-body raise and once with the budget declared on the case. Verified by copying
      `docs/research/prototypes/e2e-case-budget/timeout-probe.e2e.ts.txt` into `e2e/specs/` and
      running `npm run test:e2e:narrow -- 99-zz-timeout-probe`: the first case fails after 60.1 s
      with `Error: Timeout`, and the second passes.
- [x] 1.3 Record both probes in `docs/research/e2e-ci-budgets.md` and correct its paragraph about
      the negative control. Verified by `node scripts/check-research-index.mjs`, which passes
      with the index row updated.

## 2. Guard the form

- [ ] 2.1 Add `tests/e2e-case-budgets.test.ts`. It parses every `.ts` and `.mts` under `e2e/` and
      refuses a `this.timeout(n)` whose `this` belongs to anything except a `describe` callback.
      It also runs the rule on nine small sources. The refused shapes are a case body, a hook, an
      arrow inside a case, and a named function. The accepted ones are a declared budget, a
      `describe` and a `describe.only` budget, an arrow inside a `describe` body, and a bare read.
      Verified by `npx vitest run tests/e2e-case-budgets.test.ts`, which fails at this point naming
      `62-outline-edit-enforcement.e2e.ts:607` and `53-decoration-dom-baseline.e2e.ts:139`, `:150`
      and `:164`. Negative controls: that failure is the control for the scan. Removing the arrow
      skip in `thisOwner` must fail "accepts one set from an arrow inside a describe body".
      Accepting `it` as a suite function must fail "refuses a budget set from inside a case" and
      "refuses one set from an arrow inside a case".

## 3. Declare each budget on its case

- [ ] 3.1 `62-outline-edit-enforcement.e2e.ts`: move the stress case's `h.waitBudget(180_000)` from
      the body to `it(...).timeout(...)`, with its comment. Verified by
      `npm run test:e2e:narrow -- 62-outline-edit-enforcement "performance|find-and-replace"`,
      which reports 2 passing: the stress case and the case its body used to run into.
- [ ] 3.2 `53-decoration-dom-baseline.e2e.ts`: move all three budgets (120 000, 120 000 in the
      per-fixture loop, 60 000) to their declarations. Verified by
      `npm run test:e2e:narrow -- 53-decoration-dom-baseline`, with every case passing, and by
      2.1's test, which now passes.

## 4. Confirm nothing else moved

- [ ] 4.1 `npm test`, `npm run build`, `npm run build:e2e` and `npm run lint` all pass.
- [ ] 4.2 `openspec validate an-e2e-budget-is-declared-on-its-case --strict`
