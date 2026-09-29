# When a real click's caret lands, under mobile emulation

Measured on 2026-09-29 in a Claude cloud session (Linux x64, Xvfb, 4 vCPUs) on `main` at
`a52c495`, app 1.13.7, mobile emulation, one Obsidian per run. It closes the diagnosis of
[#304](https://github.com/laughedelic/obsidian-true-outliner/issues/304), the two gap-click cases
that failed intermittently on the newest installer in
[`e2e-runtime-versions.md`](e2e-runtime-versions.md), "The first full runs on Chrome 150".

## What fails

`65-content-space-caret` D1 and `66-content-space-caret-manual-pass` D8 click an empty gap line and
read the caret straight afterwards, expecting the end of the node above. Under mobile emulation on
Chrome 150 the read sometimes returns the caret's old position.

A click sent as a real pointer action under emulation arrives as a tap. Its selection update lands
about 360 ms after the action begins, and WebDriver's `perform()` returns at about the same moment.
The spec's next command is a race against the update.

## Rates

"Loaded" is four busy loops beside the suite, standing in for the four Obsidians of a group run.
Each figure counts runs of a spec file, each run a fresh app.

| Run | Chrome 150 (installer 1.13.7) | Chrome 120 (installer 1.5.8) |
| --- | --- | --- |
| spec 65 alone, unloaded | D1 failed in 2 of 15 | 0 of 10 |
| spec 65 alone, loaded | D1 failed in 7 of 10 | 0 of 10 |
| spec 66 alone, loaded | D8 failed in 3 of 6 | not run |

Every failure in these runs was D1 or D8. Load moves the rate; the installer decides whether there
is one.

## The plugin saw every click

`TransactionStats` keeps the classes, user events and timing of the last 200 transactions
(`getStats()` in `e2e-tests/helpers.ts`). A copy of spec 65 that read it in an `afterEach` when D1
failed, with nothing added before the click, recorded the same sequence in four failing runs
(loaded, Chrome 150): the transactions of the note's setup, then one `selection-only` transaction
with user event `select` 352 to 365 ms after the case began the click, then two `programmatic` ones.
`getCursor()` in the same `afterEach` read `0:10`, the expected position, where the assertion had
read `0:0` about half a second earlier.

So the click is not dropped, and no filter reverts it.

## The timeline

A copy of D1 with `Date.now()` stamps around the same commands as `clickAt` (position lookup,
pointer action, first read) and no others, loaded, in ms from the start of `clickAt`:

| | `perform()` returned | `select` recorded | first read after the return | first read right |
| --- | --- | --- | --- | --- |
| Chrome 150, 8 runs | 353, 357, 357, 359, 359, 361, 363, 357 | 358 to 369 | 5 to 26 ms | 5 of 8 |
| Chrome 120, 4 runs | 392, 397, 410, 423 | 349 to 378 | 6 to 21 ms | 4 of 4 |

- The selection lands at about the same time after the click on both installers.
- On Chrome 120 it lands 35 to 45 ms before `perform()` returns, and a read never precedes it.
- On Chrome 150 `perform()` returns 30 to 60 ms sooner, into the same window as the selection, and
  load decides which comes first by a few milliseconds.

## What waiting does

With `browser.waitUntil` polling `getCursor()` for the expected position in place of the one read,
loaded, Chrome 150: spec 65 passed 10 of 10 (7 of 10 failed without) and spec 66 passed 8 of 8 (3
of 6 failed without). The same figures from the helper as committed (`waitForCursor`, every run
one build): spec 65 10 of 10 and spec 66 8 of 8 again, and each spec passes once per platform on
both installers.

## What was ruled out

- **The plugin dropping the selection.** The record above.
- **A stale claim in the pointer handlers.** `zoom-click.ts`, `decorations.ts`'s surplus-space mark
  and `misplaced-ids.ts` each clear their `consuming` flag on every `pointerdown`, and a gap line
  is neither a mark nor a guide, so none of them takes the press.
- **A delay before the click.** The lag is after it, which is why waiting 150 ms or two frames
  before clicking changed nothing in the issue's measurements.
- **Hooks that made the failure stop.** Not tested here. A looped copy of D1 that paused 400 ms
  before reading landed 75 of 75, which the race explains without a hook.

## Not settled

- What the roughly 360 ms is made of. It is the same on both installers, so it is not new in Chrome
  150; the emulated tap's confirmation delay is the candidate, and no trace here shows it.
- Why `perform()` returns sooner on the newer chromedriver.
- Whether the other thirteen `clickAt` call sites, in specs 30, 59, 62, 66 and 80, share the race.
  None is observed failing, and none was measured for this note.

## Reproducing

Four loops of `while :; do :; done` in the background, then

```bash
OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e:narrow -- --mobile 65-content-space-caret "D1"
```

repeated. Every figure above comes from a whole spec file per run; the one single-case run of D1
(`... "D1"`) passed and says nothing about a rate.
