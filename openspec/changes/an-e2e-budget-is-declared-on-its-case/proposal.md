## Why

Three e2e cases raise their own budget with `this.timeout()` as the first statement of their body,
and none of those raises has ever taken effect. WebdriverIO wraps every case in `executeAsync`,
which reads the budget once, before the body runs, and races the body against a timer of that
length. So each of the three has had `mochaOpts.timeout`'s 60 s all along. The stress case in `62`
fails on a loaded mobile runner with a bare `Error: Timeout`, and its body keeps sending keystrokes
into the case after it, which fails too. #172 has the diagnosis and the failing run. The mechanism
is measured in [`docs/research/e2e-ci-budgets.md`](../../../docs/research/e2e-ci-budgets.md),
"A budget raised from inside a case never reaches wdio's timer". That section also corrects the
same note's earlier reading that the in-body call "is honoured inside wdio's wrapped `it`".

## What Changes

- Every e2e budget that is set today from inside a case body is declared on the case instead,
  `it(title, fn).timeout(ms)`. Mocha's `it` returns the `Test` through wdio's wrapper, so the
  budget is in place when `executeAsync` reads it. The affected cases are `62`'s stress case
  (`h.waitBudget(180_000)`) and the three cases in `53` (120 000, 120 000 and 60 000 ms). The
  budgets stay the same size and only move to where they are set.
- A unit test parses every file under `e2e/` as text and refuses a `this.timeout(n)` call anywhere
  except a `describe` body. It also runs its rule on small sources of its own. It refuses a
  budget set in a case body, a hook, an arrow inside a case, or a named function. It accepts a
  declared budget, a `describe` budget, an arrow inside a `describe` body, and a bare read.
- `docs/research/e2e-ci-budgets.md` records the measurement. It corrects its own paragraph about
  the negative control: that control showed a lowered budget is honoured, not a raised one.

## Non-goals

- **The case that keeps running after it is abandoned.** A case that outruns an honoured budget
  still keeps driving the editor into its successor, because neither mocha nor wdio can stop a
  running body. An honoured budget makes that rarer, not impossible (#172, last bullet). Stopping
  it would need a cancellation signal every helper checks, which is a separate design question.
- **Resizing any budget.** Each case keeps the figure it already asked for. Whether 180 s is
  right for `62` is the question the note's earlier section answered, and no measurement here
  reopens it.
- **Lowering `mochaOpts.timeout`, or raising it.** The default is sized for the ordinary case,
  and the ordinary case is not affected.
- **Budgets on hooks.** No hook sets one today, and the guard refuses the in-body form there as
  it does in a case. A hook that needs a larger budget takes it from its `describe` body.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `e2e-verification` states what the harness verifies and what it must not touch. None of
its requirements says how long a case may run, and the same scenarios are verified before and
after. The change declares `skip_specs: true`.

## Impact

- `e2e/specs/62-outline-edit-enforcement.e2e.ts`: one budget, moved from the body to the
  declaration.
- `e2e/specs/53-decoration-dom-baseline.e2e.ts`: three budgets, moved the same way.
- `tests/e2e-case-budgets.test.ts`: new. It reads files under `e2e/` as text and never imports,
  compiles or runs them, so `e2e-verification`'s "Harness excluded from bundle and unit tests"
  scenario still holds.
- `docs/research/e2e-ci-budgets.md`: a new section, and the corrected paragraph.
- `docs/research/prototypes/e2e-case-budget/`: the two probes behind the section's figures, and
  the implementation as a patch.
- No `src/` change and no plugin behaviour change.
