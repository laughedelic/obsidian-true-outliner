## Context

See proposal.md — Why. Two measurements shape everything below, and both corrected a draft
that had assumed otherwise.

WebdriverIO's own `click` already handles interception: `elementClick`
(`node_modules/webdriverio/build/index.js`, the bundled
`packages/webdriverio/src/commands/element/click.ts`) re-scrolls the element to centre and
issues the click a second time, immediately, then lets the second failure through. So the CI
failure is not a click that was never retried.

And the obstruction does not pass. Probed at the refused click, the drawer is open, covering
the click point, unchanged across attempts — `docs/research/e2e-click-retry-costs.md`.

## Goals / Non-Goals

**Goals:**

- Make a click on the phone viewport reach the editor rather than the drawer over it.
- Ground the decision not to retry interception in the cost of doing so, since a bounded
  retry is the obvious thing to reach for here and it is wrong for a measurable reason.
- Cover the fix deterministically, without depending on the intermittent state that produced
  the CI failure.

**Non-Goals:**

- Waiting for app chrome to settle. The obstruction measured here does not settle.
- A general obstruction sweep before every click. One drawer was measured; the next thing in
  the way would be a different element and would deserve its own diagnosis.

## Decisions

**Collapse the drawer, in `clickClear`, on mobile runs.** Dismissing app chrome was a
non-goal in the first draft, on the reasoning that it couples the helper to Obsidian's phone
layout for one observed obstruction. The measurement removed the premise: the drawer is not
an obstruction passing through, it is a workspace left in a state where the editor is off
screen, and `clickClear`'s stated job — put the target clear of the app's fixed chrome —
already covers it. The alternative, collapsing it once in the mobile config's `before` hook,
is cheaper but only correct while nothing reopens it; doing it per click is one round trip
that does nothing when the drawer is already closed.

**Do not retry an intercepted click.** This change was proposed as exactly that, on the
assumption that an intercepted attempt costs about what a stale one does. It costs ~15 s,
and four attempts cost ~59.7 s against a 60 s mocha budget — observed on both sides of that
line, a run that timed out and a run that finished at 60.3 s. A bound that decides by coin
flip whether a real failure reports its cause is not a bound. Two attempts would fit, but
the only interception this suite has met is the drawer, and a wait does not close it; a
retry with no case behind it is ~15 s added to every genuinely blocked click in exchange for
nothing. So interception throws where it happens, and the reason is recorded next to the
code so the next reader does not re-derive it.

**Keep the stale retry as it was, matched on the full phrase.** `stale element reference` is
the W3C error-code phrase; the bare word `stale` would catch unrelated messages. The bound
and the pause are unchanged — an attempt there costs a query and a pause, and the race it
answers is real and cheap to re-run.

**Verify by forcing the state, not by waiting for it.** The workspace state that produced the
CI failure is intermittent, and an earlier draft of this section conceded that the collapse
could therefore only be justified by the probe. That was wrong: `leftSplit.expand()` opens
the drawer on demand under emulation, so `00-smoke` puts the workspace into the failing state
deliberately, asserts the drawer really is over the click point, and requires the click to
land in the editor. The click targets a text line rather than `.cm-content`, whose centre in
that note is the backlinks footer widget — a click there lands without focusing anything,
which would have made the assertion measure the wrong thing.

## Risks / Trade-offs

- **The collapse fires on every mobile `clickClear`, not only when the drawer is up.** → One
  `executeObsidian` round trip that does nothing when `collapsed` is already true. The
  cheaper placement (once, in the config's `before` hook) is only correct while nothing
  reopens the drawer, which is not a property this suite guarantees.
- **A test could one day want the drawer open across a `clickClear`.** → None does, and the
  helper's contract is already "put the target clear of the app's chrome". A test that wants
  the drawer open wants a different helper.
- **An interception from something genuinely transient now fails outright** where a retry
  might have cleared it. → Hypothetical: no such case has been observed, and the measured
  cost of insuring against it is ~15 s on every real failure. If one turns up, the figures
  to re-decide with are already in the research note.
