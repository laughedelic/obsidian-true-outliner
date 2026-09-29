# When a real click's caret lands, under mobile emulation

Measured on 2026-09-29 in a Claude cloud session (Linux x64, Xvfb, 4 vCPUs) on `main` at
`a52c495`, app 1.13.7, mobile emulation, one Obsidian per run. It is the diagnosis of
[#304](https://github.com/laughedelic/obsidian-true-outliner/issues/304), the two gap-click cases
that failed intermittently on the newest installer in
[`e2e-runtime-versions.md`](e2e-runtime-versions.md), "The first full runs on Chrome 150".

## What fails

`65-content-space-caret` D1 and `66-content-space-caret-manual-pass` D8 click an empty gap line and
read the caret straight afterwards, expecting the end of the node above. Under mobile emulation on
Chrome 150 the read sometimes returns the caret's old position.

A real pointer action under emulation reaches the page as a tap. For a tap on a gap line or on plain
text, the selection update lands about 360 ms after the action begins, and WebDriver's `perform()`
returns within a few milliseconds of it. The spec's next command is a race against the update.

## Rates

"Loaded" is four busy loops beside the suite, standing in for the four Obsidians of a group run.
Each figure counts runs of a spec file, each run a fresh app.

| Run | Chrome 150 (installer 1.13.7) | Chrome 120 (installer 1.5.8) |
| --- | --- | --- |
| spec 65 alone, unloaded | D1 failed in 2 of 15 | 0 of 10 |
| spec 65 alone, loaded | D1 failed in 7 of 10 | 0 of 10 |
| spec 66 alone, loaded | D8 failed in 3 of 6 | not run |

Every failure in these runs was D1 or D8. Load raises the rate on Chrome 150. Chrome 120 showed none
in these 20 runs of spec 65, against about one run in seven and one in eight in the group runs the
issue and `e2e-runtime-versions.md` record for it, which these runs do not reproduce.

## The plugin recorded the click

`TransactionStats` keeps the classes, user events and timing of the last 200 transactions
(`getStats()` in `e2e-tests/helpers.ts`). A copy of spec 65 that read it in an `afterEach` when D1
failed, with nothing added before the click, recorded the same sequence in each of four failing runs
(loaded, Chrome 150): the transactions of the note's setup, then one `selection-only` transaction
with user event `select` 352 to 365 ms after the case began the click, then two `programmatic` ones.
`getCursor()` in the same `afterEach` read `0:10`, the expected position, where the assertion had
read `0:0` about half a second earlier.

`selection-only` is the class of a transaction that changes the selection and nothing else, so it is
the one that placed the caret; the two after it carry no user event. The record shows the click
reaching the editor and the caret arriving, not a filter reverting it. The user event is `select`,
not CodeMirror's `select.pointer`; this note does not settle which handler dispatches it.

## The timeline

A copy of D1 with `Date.now()` stamps around the same commands as `clickAt` (position lookup,
pointer action, first read) and no others, loaded, in ms from the start of `clickAt`:

| | `perform()` returned | `select` recorded | `select` minus return | first read right |
| --- | --- | --- | --- | --- |
| Chrome 150, 8 runs | 353 to 363 | 358 to 369 | 0 to 8 ms after | 5 of 8 |
| Chrome 120, 4 runs | 392 to 423 | 349 to 378 | 43 to 45 ms before | 4 of 4 |

A second probe timed one tap of each kind, three rounds each, unloaded, on both installers, in
a fresh note: a gap line (`Alpha one.` / gap / `Bravo two.`, click on the gap), a text position in
`Bravo two.`, and the list marker of the second item in `- alpha` / `- bravo`. Ranges over the three
rounds, in ms from the start of the click:

| Tap | Chrome 150: `select` recorded, `perform()` returned | Chrome 120: the same |
| --- | --- | --- |
| gap line | 355 to 372, 351 to 365 | 338 to 360, 359 to 384 |
| plain text | 357 to 359, 352 to 356 | 350 to 356, 374 to 382 |
| list marker | no transaction other than `programmatic` | the same |

- The selection lands at about the same time after the click on both installers, so the lag is not
  new in Chrome 150, and a tap on plain text lags as a tap on a gap does.
- On Chrome 150 the selection lands 0 to 8 ms after `perform()` returns in every run of both
  probes. On Chrome 120 it lands 17 to 45 ms before: 43 to 45 loaded, 17 to 26 unloaded.
- The first read follows the return by 5 to 26 ms on Chrome 150 and 6 to 21 ms on Chrome 120. The
  timeline's 5 of 8 right reads on Chrome 150 and spec 65's 7 of 10 failing runs are separate small
  samples, and this note does not reconcile them.
- A tap on a marker takes another path: the caret moved to the item's content start with no
  transaction other than `programmatic` recorded. `zoom-click.ts` takes a press on a mark on
  `pointerdown`, which is the likely reason and was not tested. It fits D2, which clicks a marker
  in the same file as D1 and did not fail in any of the spec 65 runs above.

## What waiting does

With `browser.waitUntil` polling `getCursor()` for the expected position in place of the one read,
loaded, Chrome 150: spec 65 passed 10 of 10 (7 of 10 failed without) and spec 66 passed 8 of 8 (3
of 6 failed without). The same figures from the helper as committed (`waitForCursor`, every run
one build): spec 65 10 of 10 and spec 66 8 of 8 again, and each spec passes once per platform on
both installers.

## What was ruled out

- **The plugin dropping the selection.** The record above.
- **A stale claim in the pointer handlers.** Read from the code, not measured: `zoom-click.ts`,
  `decorations.ts`'s surplus-space mark and `misplaced-ids.ts` each clear their `consuming` flag on
  every `pointerdown`, and a gap line in a note of paragraphs and a fence is neither a mark nor a
  guide column (`handleGuide` reads the line's guide class and geometry), so none of them takes the
  press.
- **A delay before the click.** The lag is after it, which is why waiting 150 ms or two frames
  before clicking changed nothing in the issue's measurements.
- **Hooks that made the failure stop.** Not tested here. A looped copy of D1, unloaded, that paused
  400 ms before reading landed 75 of 75, which the race accounts for without any hook.

## Not settled

- What the roughly 360 ms is made of. It is the same on both installers; the emulated tap's
  confirmation delay is the candidate, and no trace here shows it.
- Why `perform()` returns sooner on the newer chromedriver.
- Whether the other thirteen `clickAt` call sites (specs 30, 59, 62, 65 D2, 66 lines 125 and 127,
  and 80) and the `clickAtPoint` and `doubleClickAt` ones share the race. None is observed
  failing, and none was timed for this note; D2 is a marker click, which took another path above.
- Whether the fix holds in CI on the newest installer: the run dispatched on the change's branch is
  the first check, and the weekly run's results are the standing one.

## Reproducing

Four loops of `while :; do :; done` in the background, then

```bash
OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e:narrow -- --mobile 65-content-space-caret
```

repeated. Every rate above comes from a whole spec file per run; the one single-case run of D1
(`... "D1"`) passed and says nothing about a rate.
