# When a real click's caret lands, under mobile emulation

Measured on 2026-09-29 in a Claude cloud session (Linux x64, Xvfb, 4 vCPUs) on `main` at
`a52c495`, app 1.13.7, mobile emulation, one Obsidian per run. It is the diagnosis of
[#304](https://github.com/laughedelic/obsidian-true-outliner/issues/304), the two gap-click cases
that failed intermittently on the newest installer in
[`e2e-runtime-versions.md`](e2e-runtime-versions.md), "The first full runs on Chrome 150".

## What fails

`65-content-space-caret` D1 and the code-fence D8 of `66-content-space-caret-manual-pass` ("a gap
click before it lands on the previous node") click an empty gap line and read the caret straight
afterwards, expecting the end of the node above. Under mobile emulation on Chrome 150 the read
sometimes returns the caret's old position.

The issue records a real pointer action under emulation reaching the page as touch pointer events,
then mouse events and a click. For a click on a gap line or on plain text, the selection change is
recorded about 360 ms after `clickAt` begins (the position lookup included), and WebDriver's
`perform()` returns within a few milliseconds of it, so a single read straight after `perform()`
can precede the change. The runs below are consistent with that and a wait cures it; the timings
alone do not predict the failure rate (see "The timeline").

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
issue and `e2e-runtime-versions.md` record for it, which these runs do not reproduce (see "Not
settled").

## The plugin recorded the click

`TransactionStats` keeps the classes, user events and timing of the last 200 transactions
(`getStats()` in `e2e-tests/helpers.ts`). A copy of spec 65 that read it in an `afterEach` when D1
failed, with nothing added before the click, recorded the same sequence in each of four failing runs
(loaded, Chrome 150): the transactions of the note's setup, then one `selection-only` transaction
with user event `select` 352 to 365 ms after the case began the click, then two `programmatic` ones.
`getCursor()` in the same `afterEach` read `0:10`, the expected position, where the assertion had
read `0:0` about half a second earlier.

`selection-only` is the class of a transaction that carries a user event and changes no text. The
record keeps no selection, so it does not show which transaction placed the caret: the two
`programmatic` ones after it could have, since the plugin resolves the caret of transactions that
carry no user event. What shows the caret at `0:10` is the `afterEach` read, and what shows the
click reaching the editor is the `select` transaction; no filter reverting a move is visible in
either. The user event is `select`, not CodeMirror's `select.pointer`, and this note does not
settle which handler dispatches it.

## The timeline

A copy of D1 with `Date.now()` stamps around the same commands as `clickAt` (position lookup,
pointer action, first read) and no others, loaded, in ms from the start of `clickAt`, which includes
the position lookup:

| | `perform()` returned | `select` recorded | `select` relative to the return | first read after the return | first read right |
| --- | --- | --- | --- | --- |
| Chrome 150, 8 runs | 353 to 363 | 358 to 369 | 0 to 8 ms after | 5 to 26 ms | 5 of 8 |
| Chrome 120, 4 runs | 392 to 423 | 349 to 378 | 43 to 45 ms before | 6 to 21 ms | 4 of 4 |

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
- The timeline's 5 of 8 right reads on Chrome 150 and spec 65's 7 of 10 failing runs are separate
  small samples, and this note does not reconcile them.
- A tap on a marker takes another path: the caret moved to the item's content start with no
  transaction other than `programmatic` recorded. `zoom-click.ts` takes a press on a mark on
  `pointerdown`, which is the likely reason and was not tested. It fits D2, which clicks a marker
  in the same file as D1 and did not fail in any of the spec 65 runs above.

A third probe timed a double click (`doubleClickAt`'s two presses 10 ms apart) on `First
paragraph.`, five rounds each, unloaded, in ms from the start of the click:

| | first `select` | word-selecting `select` | `perform()` returned | word selection relative to the return |
| --- | --- | --- | --- | --- |
| Chrome 150 | 353 to 375 | 552 to 576 | 550 to 573 | 0 to 5 ms after |
| Chrome 120 | 340 to 365 | 541 to 580 | 559 to 601 | 16 to 24 ms before |

The word selection lands as `perform()` returns on Chrome 150 and before it on Chrome 120, the pattern
of a single tap. A read taken between the two `select` transactions would see the first tap's
collapsed caret; that is inferred, since the record keeps no selection and no read fell between them.
The first read in this probe followed the return by 8 to 15 ms and saw the word in all ten rounds.

## In CI on the newest installer

`newest-installer.yml` dispatched by hand, one run each, four instances per job:

| Job | `main` at `a52c495` | This change at `0ec20cf` (the helper's first form); the later run on `777409a` is under the table |
| --- | --- | --- |
| `mobile (selection)` | `65` D1 and `66` code-fence D8 failed | green |
| `mobile (clipboard)` | `61` "double-click word selection is untouched" failed | the same case failed, and failed again on the re-run of the failed jobs (see below) |
| `desktop (selection)` | `66` "D8: a table row: Home/End match off-mode parity" failed | `63` "a drag past a node's end onto its gap line gets chrome…" failed once and passed on the re-run |

A run on `777409a`, the final helper and smoke case, had `mobile (selection)` and `desktop (selection)`
green and failed `mobile (clipboard)` on the `61` case again; the smoke case's elapsed-time check
came after it. D1 and D8 fail on `main` and pass with the wait, in a run each. The other three failures are outside
this change's files. The `61` double-click case failed in all three CI runs and passed locally in 8
of 8 mobile runs (three unloaded, five loaded). It asserts that a double click's selection is not
collapsed (`anchor.ch` not equal to `head.ch`), read once straight after `doubleClickAt` returns,
which is what the third probe's window would produce on a read that precedes the word selection; so
it is a suspect for this same lateness, seen here in CI and not locally, and untested. The `63`
drag case passed in 10 of 10 desktop runs here (four unloaded, six loaded), and `66`'s table-row
case is the one `e2e-runtime-versions.md` records failing once in CI and never reproducing. Their
causes are not diagnosed here.

## What waiting does

Spec 65 and spec 66 on Chrome 150, four busy loops beside the suite, each run a fresh app:

| Read after the click | Spec 65 (D1) | Spec 66 (code-fence D8) |
| --- | --- | --- |
| one `getCursor()`, as it was | 7 of 10 failed | 3 of 6 failed |
| `waitUntil` inline, in a throwaway patch | 10 of 10 passed | 8 of 8 passed |
| `waitForCursor`, first committed form | 10 of 10 passed | 8 of 8 passed |
| `waitForCursor`, final form | 5 of 5 passed | 4 of 4 passed |

The first row is the loaded baseline above; the second and third are separate sets of runs. Each
spec also passes once per platform on both installers, with the helper's first form and again with
its final one. The two forms differ only in how the failure message is built. The CI comparison is
one run each, red on `main` and green with the wait.

The wait's own case, in `00-smoke`, moves the caret from the page 300 ms after the wait begins and
then checks a wrong column, another line and a caret already there. It passes on desktop and mobile
on the oldest installer and on mobile on the newest, and fails against each of four broken helpers,
one run apiece: a message built before the first read, a single read, a wait that ignores the
line, and a wait that ignores its limit.

## What was ruled out

- **The plugin dropping the selection.** The record above.
- **A stale claim in the pointer handlers.** Read from the code, not measured: `zoom-click.ts`,
  `decorations.ts`'s surplus-space mark and `misplaced-ids.ts` each clear their `consuming` flag on
  every `pointerdown`, and a gap line in a note of paragraphs and a fence is neither a mark nor a
  guide column (`handleGuide` reads the line's guide class and geometry), so none of them takes the
  press.
- **The plugin's own 350 ms.** `TOUCH_DWELL_MS` in `zoom-click.ts` is a touch's rest on a mark before
  it becomes a drag (`armDwell` needs a mark), and a tap on plain text or a gap lags as much without
  one.
- **A delay before the click.** The selection change is recorded after the click, which is why
  waiting 150 ms or two frames before clicking changed nothing in the issue's measurements.

## Not settled

- What the roughly 360 ms is made of. It is the same on both installers; the emulated tap's
  confirmation delay is the candidate, and no trace here shows it.
- Why `perform()` returns sooner on the newer chromedriver.
- Why group runs failed on Chrome 120. The selection lands 17 to 45 ms before `perform()` returns
  there, so this race does not account for them, and the 0 of 20 above says nothing about the
  wait's effect on that installer.
- The issue's two other observations: that the rate rose with the number of tests already run in
  the session, and that event hooks in the page stopped the failure (40 of 40 clicks landing). Load
  is the one variable this note shows to move the rate. A looped copy of D1, unloaded, that paused
  400 ms before reading landed 75 of 75, which the wait explains and which says nothing about
  hooks.
- Whether the other thirteen `clickAt` call sites (specs 30, 59, 62, 80, `65` D2 and the two gap
  clicks of `66`'s table case, "a real click on the gap directly above/below a table") and the `clickAtPoint` ones share the effect. None is observed failing, and none was
  timed for this note; D2 is a marker click, which took another path above, and 66's two are in a
  case that skips itself under mobile emulation. The gap, with `61`'s double click, is
  not yet tracked as an issue.
- Whether the `61` double-click case is this same lateness: the timing fits, and no run has waited
  for its selection.
- Whether the fix holds outside the runs in "In CI": the weekly run's results are the standing
  check.

## Reproducing

Four loops of `while :; do :; done` in the background, then

```bash
OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e:narrow -- --mobile 65-content-space-caret
```

repeated. Every rate in "Rates" and "What waiting does" comes from a whole spec file per run; the one single-case run of D1
(`... "D1"`) passed and says nothing about a rate.
