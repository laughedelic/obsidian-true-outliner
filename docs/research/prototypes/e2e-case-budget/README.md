# E2E case budget

The probes behind "A budget raised from inside a case never reaches wdio's timer" in
[`../../e2e-ci-budgets.md`](../../e2e-ci-budgets.md), and the change they led to.

- `case-budget-probe.mjs` runs mocha in Node through `@wdio/utils`' own wrapper, one row per
  place a budget can be set, at a scaled timescale. It needs no Obsidian:

  ```bash
  node docs/research/prototypes/e2e-case-budget/case-budget-probe.mjs
  ```

- `timeout-probe.e2e.ts.txt` is the same question asked in the real harness at full scale. Copy it
  to `e2e/specs/99-zz-timeout-probe.e2e.ts` and run
  `npm run test:e2e:narrow -- 99-zz-timeout-probe`. Delete the copy afterwards, since
  `tests/e2e-case-budgets.test.ts` refuses its first case.

- `implementation.patch.txt` is the whole of `an-e2e-budget-is-declared-on-its-case`: specs `53`
  and `62` with their budgets declared on the case, and the unit test that guards the form.

  ```bash
  git apply docs/research/prototypes/e2e-case-budget/implementation.patch.txt
  ```
