## Context

See proposal.md — Why, including the correction: the observed failure is an open drawer, not
a race, and the retry below is a safety net rather than the fix. One measurement shapes everything below. WebdriverIO's own
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

- Admit interception to the existing retry loop — same pauses, same re-query and re-centre —
  with the attempt bound its own cost allows rather than the one staleness uses.
- Keep the loop's narrowness legible: a reader should find, next to the code, why exactly
  two failure modes are admitted and what disqualifies a third.
- Bound the cost of the change with a measurement rather than an argument, since the whole
  objection to a wider retry is what it does to a genuinely failing click.

**Non-Goals:**

- Waiting on app chrome to settle before clicking. Waiting is what the retry already does,
  and the obstruction measured here does not settle.
- Any general retry-on-error. Every failure mode the classifier does not name keeps throwing
  on its first occurrence.
- Making the flake reproducible on demand. The drawer's position is a race, and the
  verification below is deliberately built not to depend on reproducing it.

## Decisions

**Collapse the drawer, because it is not going to close itself.** Dismissing app chrome was a
non-goal in the first draft, on the reasoning that it couples the helper to Obsidian's phone
layout for one observed obstruction. The measurement removed the premise that made that
reasoning apply: the drawer is not an obstruction passing through, it is a workspace left in
a state where the editor is off screen, and `clickClear`'s stated job — put the target clear
of the app's fixed chrome — already covers it. The alternative, collapsing it once in the
mobile config's `before` hook, is cheaper but only correct while nothing reopens it; doing it
per click is one round trip that does nothing when the drawer is already closed.

**Keep the interception retry anyway, and stop crediting it.** It no longer has the flake to
justify it, and the honest options were to drop it or to keep it as a bounded safety net for
the interceptions that are transient — a notice, a tooltip, a re-layout. It is kept, because
the mechanism is already there for staleness and the marginal cost is two attempts on a class
of failure that would otherwise fail outright. What changed is the claim: the change no
longer says the retry fixes the observed CI failure, and the research note records why not.

**The whole decision leaves the loop, bookkeeping included.** `clickFailureMode` names the
failure, `CLICK_ATTEMPTS` gives each mode its bound, and `spendClickAttempt` records an
attempt against its mode and answers whether another is owed; `clickClear` keeps three
lines. Two things follow. The reasoning has somewhere to live — each admitted mode carries
its own paragraph on why waiting helps it — and the decision becomes drivable directly,
which is how the mixed-mode case below is tested at all, since a real browser cannot be made
to fail stale and then intercepted on demand.

**A tally per mode, not one running attempt count.** The first draft indexed attempts
globally and compared that index against the failing mode's bound. It is wrong in the
direction that matters: a click that goes stale twice and is then intercepted has spent
none of its interception budget, yet a shared counter reads it as spent and throws the
interception immediately — without the waited retry that interception is admitted for, which
is the entire change. The overall bound stays finite at the sum of the two, and the worst
case (four stale attempts and two intercepted) stays inside the mocha per-test budget.

**Match the full error-code phrase, not a word from it.** `element click intercepted` and
`stale element reference` are the W3C error-code phrases, and the former is the same string
WebdriverIO itself matches on in `elementClick`. Matching bare `intercepted` would hand an
expensive retry to any unrelated message containing the word — a real cost here, unlike a
harmless over-match, since one wrong admission is ~15 s. Matching `error.name` instead would
be tighter still, but the observed error arrives as a wrapped `WebDriverError` whose name is
not the code.

**A bound per mode, not one bound for both.** The change was drafted with four attempts for
both, on the assumption that an intercepted attempt costs about what a stale one does. The
measurement says otherwise — `docs/research/29-e2e-click-retry-costs.md` — and it is the
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

**Verify the drawer fix by forcing the state, not by waiting for it.** The workspace state
that produced the CI failure is intermittent, and a first draft of this section conceded that
the collapse could therefore only be justified by the probe taken at the refused click. That
was wrong: `leftSplit.expand()` opens the drawer on demand under emulation, so `00-smoke`
puts the workspace into the failing state deliberately, asserts the drawer really is over the
click point, and requires the click to land in the editor anyway. The click targets a text
line rather than `.cm-content`, whose centre in that note is the backlinks footer widget — a
click there lands without focusing anything, which would have made the assertion measure the
wrong thing.

**Verify the retry in three more pieces, because no one test carries all of it.** Two are pure and instant,
needing no session, since the spec imports the functions directly: the classifier against
the verbatim errors each mode was observed with plus a message that merely contains the word
`intercepted`, and the bookkeeping driven through a stale-then-intercepted sequence, which is
the case a real browser cannot be made to produce.

Those two verify the decision in isolation, and on their own would still pass if `clickClear`
never consulted it — the gap a review caught. So the third covers a real target for the whole
call, making every attempt refused deterministically, and times a single blocked click first
so both of its assertions are relative to what one attempt costs on that machine: the call
must take more than one attempt's worth of work, which is what ties the loop to the budget,
and must still fail as an interception rather than as a mocha timeout. Mocha's own per-test
timeout is the other half of that second assertion.

The tempting third design — cover the target and uncover it on a timer, so a later attempt
succeeds — was rejected. It is unsound in the direction that matters: a runner slow enough
to land the first attempt after the timer exercises nothing and reports a pass. It is also
no longer needed, since the elapsed time of a blocked call stopped discriminating once one
attempt was measured at ~15 s; a floor built from the loop's 250 ms pauses is cleared by a
single non-retrying attempt.

## Risks / Trade-offs

- **The drawer's open state is intermittent in the wild**, so a run that passes proves
  little. → It does not have to be waited for: `leftSplit.expand()` opens it on demand under
  emulation, so `00-smoke` forces the state and asserts the click lands anyway. Removing the
  collapse fails that test every run.
- **A genuinely unclickable element now costs two attempts instead of one** — ~30 s rather
  than ~15 s before it reports. → Half the mocha budget, and the blocked-click self-test
  measures exactly this case on every run, on both platforms, so a future change to either
  bound or to chromedriver's own cost shows up as that test timing out rather than as a
  spec somewhere reporting a timeout instead of its real error.
- **The classifier could admit a real defect that presents as interception** — a control
  genuinely drawn under fixed chrome, say. → It still fails, with its own error, after the
  attempts are spent; the helper's leading comment already records that centring is what
  keeps a target out from under the header, so a target that is intercepted at centre on
  every attempt is reported as such rather than silently clicked elsewhere.
- **The blocked-click self-test rests on chromedriver's ~7.5 s per refused click, which is
  not ours to fix.** → It is not asserted as a figure anywhere in the code; the test simply
  runs to completion inside mocha's budget. If chromedriver's cost rises, the test fails
  loudly and the bound is re-derived from a fresh measurement rather than from this one.
- **A message could still contain a whole error-code phrase without being that error.** →
  Unlikely enough to accept, having tightened the match from a bare word: `element click
  intercepted` is the same phrase WebdriverIO matches on in `elementClick`. The cost of a
  false match is bounded — extra attempts, then the real error — but it is not trivial at
  ~15 s each, which is why the phrase and not the word.
