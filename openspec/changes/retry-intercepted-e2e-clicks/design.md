## Context

See proposal.md — Why. One measurement shapes everything below. WebdriverIO's own
`click` already handles interception, in `elementClick`
(`node_modules/webdriverio/build/index.js`, the bundled
`packages/webdriverio/src/commands/element/click.ts`): on an error whose message contains
`element click intercepted` it re-scrolls the element to centre and issues the click a
second time, immediately, then lets the second failure through. So the CI failure is not
a click that was never retried. It is a click that was retried without waiting, against an
obstruction that only time removes.

That is the gap `clickClear` already fills for staleness: it is the only layer here that
pauses between attempts.

## Goals / Non-Goals

**Goals:**

- Admit interception to the existing retry loop on the same terms as staleness — same four
  attempts, same pauses, same re-query and re-centre.
- Keep the loop's narrowness legible: a reader should find, next to the code, why exactly
  two failure modes are admitted and what disqualifies a third.
- Bound the cost of the change with a measurement rather than an argument, since the whole
  objection to a wider retry is what it does to a genuinely failing click.

**Non-Goals:**

- Dismissing the drawer, or waiting on app chrome to settle, before clicking. That would
  couple the helper to Obsidian's phone layout for one observed obstruction, and the
  next one would be a different element.
- Any general retry-on-error. Every failure mode not named in the predicate keeps throwing
  on its first occurrence.
- Making the flake reproducible on demand. The drawer's position is a race, and the
  verification below is deliberately built not to depend on reproducing it.

## Decisions

**A named predicate rather than a widened inline condition.** The condition becomes
`isRetriableClickFailure(error)`, defined immediately above `clickClear`. Two entries in a
disjunction is where an inline `||` starts hiding the reasoning, and the reasoning is the
part worth keeping: each admitted mode carries its own sentence about why waiting helps.
The alternative — a second `includes` in the `if` — keeps the diff smaller and puts the
justification for both modes in one undifferentiated comment block.

**Match the message substring, as the existing condition does.** `element click
intercepted` is the W3C error code phrase, and it is the same string WebdriverIO itself
matches on. Matching `error.name` instead would be tighter but is not what the surrounding
code does, and the observed error reaches us as a wrapped `WebDriverError` whose name is
not the code.

**A bound per mode, not one bound for both.** The change was drafted with four attempts for
both, on the assumption that an intercepted attempt costs about what a stale one does. The
measurement says otherwise — `docs/research/24-e2e-click-retry-costs.md` — and it is the
figure the whole design turns on: chromedriver spends its own budget before refusing, so
one `clickClear` attempt against a covered target costs ~15 s and four of them cost ~60 s
against a 60 s mocha per-test budget. Observed on both sides of that line in one afternoon:
a run that timed out and a run that finished at 60.3 s. A bound that decides by coin flip
whether a real failure reports its cause or reports nothing is not a bound, so interception
takes two attempts and staleness keeps four.

The asymmetry costs the retry nothing. Attempt 0 already spends ~15 s inside chromedriver
before the loop's pause is reached, so attempt 1 clicks some 15 s after attempt 0 — far
more settling time than transient chrome needs, and far more than the three extra attempts
would have added in the mode where attempts are cheap.

Expressing this as `clickAttemptBudget(error): number` rather than a predicate plus a lookup
keeps one function answering one question, with `0` meaning "not retriable" and no separate
boolean to keep in step with it.

**Verify in two pieces, because one test cannot carry both halves.** The retry decision is
pinned by asserting `clickAttemptBudget` against the verbatim errors each mode was observed
with — exact, instant, and needing no session, since the function is pure and the spec
imports it directly. What that cannot show is that the bound is survivable, so a second test
covers a real target for the whole call, making every attempt refused deterministically, and
asserts the failure still arrives as an interception. Mocha's own per-test timeout is the
other half of that assertion: this test failing that way is the regression it exists for.

The tempting third design — cover the target and uncover it on a timer, so a later attempt
succeeds — was rejected. It is unsound in the direction that matters: a runner slow enough
to land the first attempt after the timer exercises nothing and reports a pass. It is also
no longer needed, since the elapsed time of a blocked call stopped discriminating once one
attempt was measured at ~15 s; a floor built from the loop's 250 ms pauses is cleared by a
single non-retrying attempt.

## Risks / Trade-offs

- **A genuinely unclickable element now costs two attempts instead of one** — ~30 s rather
  than ~15 s before it reports. → Half the mocha budget, and the blocked-click self-test
  measures exactly this case on every run, on both platforms, so a future change to either
  bound or to chromedriver's own cost shows up as that test timing out rather than as a
  spec somewhere reporting a timeout instead of its real error.
- **The predicate could admit a real defect that presents as interception** — a control
  genuinely drawn under fixed chrome, say. → It still fails, with its own error, after the
  attempts are spent; the helper's leading comment already records that centring is what
  keeps a target out from under the header, so a target that is intercepted at centre on
  every attempt is reported as such rather than silently clicked elsewhere.
- **The blocked-click self-test rests on chromedriver's ~7.5 s per refused click, which is
  not ours to fix.** → It is not asserted as a figure anywhere in the code; the test simply
  runs to completion inside mocha's budget. If chromedriver's cost rises, the test fails
  loudly and the bound is re-derived from a fresh measurement rather than from this one.
- **The `intercepted` and `stale` substrings could match an unrelated message.** → Both are
  W3C error-code phrases, and `intercepted` is the same string WebdriverIO itself matches on
  in `elementClick`. A false match costs one extra attempt, not a wrong result.
