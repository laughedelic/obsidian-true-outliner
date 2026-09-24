## Context

See proposal.md, "Why". The mechanism, both probes and their figures are in
[`docs/research/e2e-ci-budgets.md`](../../../docs/research/e2e-ci-budgets.md), in the section "A
budget raised from inside a case never reaches wdio's timer". The design depends on two findings
from it:

- wdio reads a case's budget once, when it enters the case. Only a budget that is already set on
  the runnable by then takes effect.
- The mocha wdio loads is its own 10.8.2, not the root's 12. It copies a suite's budget onto a case
  or a hook only when that case or hook is declared.
- The same wrapper runs hooks, and it reads a trailing number passed to `it` as a retry count, not
  as a budget.

## Goals / Non-Goals

**Goals:**

- Every budget the suite asks for is the one the case actually runs with, under wdio as it is
  now.
- A budget set where wdio cannot see it fails `npm test` before it can reach CI.

**Non-Goals:**

- A runtime check. It would only fire when the offending case runs, which for the stress case
  means CI's mobile job. A static check fires on every `npm test`.

## Decisions

**Declare each budget on its case: `it(title, fn).timeout(ms)`.** Mocha's `it` returns the
`Test`. wdio's wrapper returns whatever mocha's `it` returned, so `.timeout()` sets `_timeout` on
the runnable before any case has run. Row D of the probe shows it honoured, and the
real-harness probe shows it with a 70 s pause against the 60 s default. Alternatives considered:

- *A `describe`-level `this.timeout()`* is honoured too, but only by what is declared after it
  (rows E and E′). It sets the budget for every case in the suite, though. `62` holds 59 cases in one `describe`, and all but one fit
  the default. Giving them all 180 s would only delay the report when one of them hangs. `53` could take one, but
  its folded-heading case asks for 60 000 ms and the others for 120 000 ms. One form across the
  suite is simpler to check.
- *`this.currentTest.timeout()` in a `beforeEach`* sets the case's budget before wdio reads it.
  It does so for every case the hook covers, and it is harder to read than a budget on the
  case itself.
- *A third argument to `it`*: wdio reads it as a retry count, so `it(title, fn, 180_000)`
  would request 180 000 retries.
- *Raising `mochaOpts.timeout`* would widen every case in both configs. It would delay every
  hang's report, and each abandoned case would keep running into the next case for longer.

**`h.waitBudget()` is evaluated at declaration, not in the body.** The result is the same.
`waitBudget` reads `E2E_MAX_INSTANCES` from the worker's environment. The launcher sets that
variable before it spawns workers (`scripts/run-e2e.mjs`, the CI action, `e2e-docker.mjs`), and
nothing sets it later. `62` is in the `clipboard` group, which `run-e2e.mjs` always runs with one
instance, so on CI its stress case gets the 180 s its code always asked for.

**Guard it with a unit test that parses `e2e/` as text.** `tests/e2e-case-budgets.test.ts` parses
each `.ts` and `.mts` file under `e2e/` with the TypeScript compiler API. It accepts a
`this.timeout(n)` only where its `this` belongs to a `describe` callback and no earlier statement
of that body declares a case, a hook or a suite, since mocha 10 copies the budget only onto what
is declared after it. It refuses `this.test.timeout(n)` everywhere: inside a case it comes too
late, as `this.timeout(n)` does. Arrows are skipped when finding which function a `this` belongs
to, since an arrow takes its `this` from the enclosing function. A hook takes its budget from the
`describe` body, ahead of the hook (row G), because `before()` returns nothing to chain
`.timeout()` on. Alternatives considered:

- *A lenient rule that refuses only a function passed directly to `it` or a hook* would miss a
  named function passed to `it` by reference. The strict rule refuses that too, and the suite
  has no other legitimate `this.timeout(n)`.
- *An ESLint `no-restricted-syntax` selector* cannot say which function a `this` belongs to
  through nested arrows. It would also need `e2e/` brought under `npm run lint`, which is a
  separate piece of work: that tree has never been linted.
- *A grep in a script* cannot tell a `describe` body from a case body.

The test also runs its rule against thirteen small sources, so each shape the rule has to tell
apart has a case. Eight are refused: a case body, `this.test` inside a case, a hook, an arrow
inside a case, a named function, and a `describe` budget after a case, after a hook, and after a
loop of cases. Five are accepted: a declared budget, a `describe` budget ahead of its case, a
`describe.only` budget, an arrow inside a `describe` body, and a bare read. The arrow inside a
`describe` body is the case that needs the arrow skip.

It reads the files and never imports, compiles or runs them. `e2e-verification`'s scenario
"Harness excluded from bundle and unit tests" is about the harness running under `npm test`, and
that still does not happen.

**Lowering is refused as well.** A budget lowered from inside a body does take effect (row C),
because mocha's timer fires first. Refusing it anyway keeps the rule to one question, where a
budget is set, and the suite has no in-body lowering to keep. `53`'s 60 000 ms case, which
equals the default, moves to its declaration with the rest.

## Risks / Trade-offs

- [A future wdio stops returning the `Test` from `it`] → `.timeout` on `undefined` throws when
  the spec file loads, so the whole file fails loudly and no case silently keeps the default.
- [The rule is syntactic: `const self = this; self.timeout(…)`, `this['timeout'](…)`,
  `this.runnable().timeout(…)`, or any other route to mocha's `Context`, gets past it] → Nothing
  in the suite does this. The test states the rule it enforces, and the research note records the
  mechanism for anyone who meets another route.
- [wdio moves to a mocha that passes a suite's budget on to cases already declared] → The rule
  then refuses a form that would work. That direction is safe, and the probe prints the mocha
  version it measured, so the note can be re-checked when the dependency moves.
- [A budget that is now honoured lets a hung case take up to that long to report] → This is what
  each case asked for when its budget was written. No budget changes size here.

## Open Questions

- Whether to report the in-body cap to WebdriverIO. `executeAsync` could read `_timeout` again
  when the body settles, or re-arm its timer when mocha's is reset. Either change upstream would
  leave this change correct, since a declared budget is honoured under both.
