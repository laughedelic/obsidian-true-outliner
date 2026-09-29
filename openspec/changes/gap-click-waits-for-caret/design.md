## Context

Under mobile emulation a real pointer action reaches the page as a tap, and the tap's selection
update lands about 360 ms after the action begins. WebDriver's `perform()` returns at about the
same moment, so a case that reads the caret once, straight after `clickAt`, races the update. On
Chrome 120 `perform()` returns after the update and the read is safe; on Chrome 150 it returns
into the same window and load decides. The measurements, the plugin's own record of the click and
the runs that ruled out the alternatives are in
[`docs/research/gap-click-timing.md`](../../../docs/research/gap-click-timing.md).

## Decisions

**A wait for the caret, in the two cases.** `waitForCursor(line, ch)` polls `getCursor()` every
20 ms for `waitBudget(3000)` and rejects with the last position read. Both cases assert one
position after a click, so the wait states the assertion, and its message keeps what the old
`toEqual` showed: the position the caret was left at.

Validated before this proposal by a throwaway patch of that shape, loaded, on Chrome 150: spec 65
passed 10 of 10 where 7 of 10 had failed, and spec 66 passed 8 of 8 where 3 of 6 had failed
(the note, "What waiting does").

**Not in `clickAt`.** `clickAt` returns nothing about the click's outcome, and a click that leaves
the caret where it was is a legitimate outcome, so the helper cannot wait for a change. A fixed
pause after `perform()` would cover the measured 5 to 26 ms gap and cost that time on every click
in every spec on every run, and it would still be a guess about a delay the note has not
explained.

**A helper, not `browser.waitUntil` inline.** The two cases would each carry the same eight
lines and a timeout message; `waitForCursor` sits beside `getCursor` and `waitForOutlineMode`.

**Two cases only.** Thirteen other `clickAt` call sites read the caret afterwards and none is
observed failing. Wrapping them unmeasured would hide a race behind a wait rather than diagnose
it; the weekly run reports one if it is real.

## Risks

- A case that waits passes when the caret arrives late for a reason other than this race: a
  handler that moves the caret 300 ms after every gap click would be masked. The plugin's record
  in the note shows one `select` transaction and no later selection change, so the wait hides
  nothing today. Mitigation: none beyond the case's next assertions, which read the settled caret.
- `waitBudget(3000)` widens with `E2E_MAX_INSTANCES`; a loaded machine waits longer before it
  gives up.

## Open Questions

None for this change. What the 360 ms is, and why `perform()` returns sooner on the newer
chromedriver, are in the note's "Not settled".
