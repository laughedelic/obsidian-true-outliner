# E2E case budget

The probes behind "A budget raised from inside a case never reaches wdio's timer" in
[`../../e2e-ci-budgets.md`](../../e2e-ci-budgets.md), and the change they led to.

- `case-budget-probe.mjs` runs mocha in Node through `@wdio/utils`' own wrapper, one row per
  place a budget can be set, at a scaled timescale. It loads the mocha `@wdio/mocha-framework`
  resolves (10.8.2 at the time of writing), not the root's 12, and prints its version. It needs
  no Obsidian:

  ```bash
  node docs/research/prototypes/e2e-case-budget/case-budget-probe.mjs
  ```

- `timeout-probe.e2e.ts.txt` is the same question asked in the real harness at full scale. Copy it
  to `e2e/specs/99-zz-timeout-probe.e2e.ts` and run
  `npm run test:e2e:narrow -- 99-zz-timeout-probe`. Delete the copy afterwards, since
  `tests/e2e-case-budgets.test.ts` refuses its first case.

- `implementation.patch.txt` is `an-e2e-budget-is-declared-on-its-case` as it was proposed and
  reviewed: specs `53` and `62` with their budgets declared on the case, and the unit test that
  guards the form. The change applied it as it stands, and review then tightened the test: a
  `this.timeout(n)` inside an arrow is refused even in a `describe` body, since the arrow can be
  called from a case.
