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

**Same bound for both modes, four attempts.** An intercepted attempt is the more expensive
of the two, because it carries WebdriverIO's own extra round trip. Giving interception a
smaller bound would need a figure to justify the asymmetry; the test below produces the
figure for the symmetric case, and it is small enough that the asymmetry buys nothing.

**Verify with a click that stays blocked, not one that clears.** The tempting test covers
the target and uncovers it on a timer, so a later attempt succeeds. It is unsound: if the
runner is slow enough that the first attempt lands after the timer, the test passes having
exercised nothing, and it reports that as a pass. Leaving the overlay up for the whole call
removes the race — every attempt is intercepted, deterministically — and the assertions
still pin the retry path: the call must fail with the interception error rather than a
timeout, and it must take at least the retry pauses the loop is required to spend. Neither
holds if the predicate rejects interception.

## Risks / Trade-offs

- **A genuinely unclickable element now costs four attempts instead of one.** → Bounded and
  measured: the self-test's elapsed time is the whole cost of exhausting the loop against a
  permanently blocked target, and the test asserts the call still surfaces the interception
  error itself. A failure that names its cause is worth more than one that arrives 
  a second sooner.
- **The predicate could admit a real defect that presents as interception** — a control
  genuinely drawn under fixed chrome, say. → It still fails, with its own error, after the
  attempts are spent; the helper's leading comment already records that centring is what
  keeps a target out from under the header, so a target that is intercepted at centre on
  every attempt is reported as such rather than silently clicked elsewhere.
- **The self-test asserts on wall-clock time.** → As a lower bound derived from the loop's
  own exported constants, not a fixed figure: the floor is the retry pauses the loop must
  spend, which a non-retrying loop cannot reach however fast or slow the machine is.
