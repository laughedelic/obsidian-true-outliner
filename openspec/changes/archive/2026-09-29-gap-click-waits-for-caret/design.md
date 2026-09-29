## Context

Under mobile emulation a real click's selection update can land after the WebDriver call that sent
the click returns, so a case that reads the caret once, straight after `clickAt`, can read the old
position. The timings, the plugin's own record of the click and what was ruled out are in
[`docs/research/gap-click-timing.md`](../../../../docs/research/gap-click-timing.md); the note also
lists what it leaves unexplained.

## Decisions

**A wait for the caret, in the two cases.** `waitForCursor(line, ch)` polls `getCursor()` every
20 ms for `waitBudget(3000)`, or for a third argument's milliseconds, and rejects naming the
position it waited for and the last one read. Both cases assert one position after a click, so the
wait states the assertion, and its message keeps what the old `toEqual` showed: where the caret was
left. The note carries the runs that showed the wait holds under the load that fails the single
read.

**The message is `timeoutMsg` as a function.** `browser.waitUntil` evaluates a function `timeoutMsg`
after the timeout, so the message can name the last position read; a string would be built before
any read. A condition that throws on its last poll surfaces as WebdriverIO's own "condition failed"
error instead, which is the honest report for that failure.

**Not in `clickAt`.** `clickAt` returns nothing about the click's outcome, and a click that leaves
the caret where it was is a legitimate outcome, so the helper cannot wait for a change. A fixed
pause after `perform()` would cost its time on every click in every spec on every run, and it would
still be a guess about a delay the note has not explained.

**A helper, not `browser.waitUntil` inline.** The two cases would each carry the same lines and a
timeout message; `waitForCursor` sits beside `getCursor` and `waitForOutlineMode`.

**Two cases only.** The other `clickAt` sites read the caret afterwards and none is observed
failing; wrapping them unmeasured would hide a race behind a wait rather than diagnose it. The
weekly run reports one if it is real, and the requirement names the two cases, not every click.

**Platform-wide.** The wait is not scoped to mobile emulation. It resolves on its first read
whenever the caret is already there, so on desktop, where the note records each spec passing,
scoping would add a branch to the spec for no difference in what it checks.

**The smoke case moves the caret itself.** A wait that read once would pass a case that only checks
a caret already there or one that never arrives, so the case also moves the caret from the page
300 ms after the wait begins, and checks that the same column on another line is a different
position.

**No case file.** The defect is in how a spec reads the caret after a click, not in what the editor
does with keys, which is what `e2e-tests/cases/` files draw.

## Risks

- A case that waits passes when the caret arrives late for a reason other than the click's own
  delay: a handler that moved the caret a moment after every gap click would be masked, because the
  wait resolves on the first read that matches and neither case reads again. Nothing in the two
  cases guards this; the note's record of the click shows one selection change and no later move.
- `waitBudget(3000)` widens with `E2E_MAX_INSTANCES`; a loaded machine waits longer before it
  gives up.

## Open Questions

None for this change. What the delay is made of, why `perform()` returns sooner on the newer
chromedriver, and why the group runs failed on the oldest installer, are in the note's "Not
settled".
