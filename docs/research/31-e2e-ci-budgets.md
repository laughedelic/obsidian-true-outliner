# Three CI-only failures, and what CI said when asked directly

Measured 2026-09-10, macOS, Obsidian v1.13.7 (installer v1.5.8), with CI figures from runs of
the `ci.yml` matrix on GitHub's hosted runners at four Obsidian instances per job. Three cases
had been failing on CI — one intermittently, two on loaded runners — and none reproduced
locally. Running the plugin at two commits of `feat/better-folding-ux` back to back gave
identical local timings, and that was read as the runner being at fault rather than the
plugin. Half of that reading survived measurement.

## What the branch's CI history actually shows

The three cases were all failing on `feat/better-folding-ux`. Asked the same question, the
trunk gives a different answer:

| Branch | Runs read | 74 "renders the corpus" | 77 "shortens the header" | 62 perf case |
| --- | --- | --- | --- | --- |
| `main`, last twelve | 12 (10 green) | never | never | never |
| `feat/better-folding-ux`, last six failing | 6 | 4 | 1 (plus 1 as a `before all` hook failure) | 3 |

The two red runs on `main` were other cases: `75` "leaves the note's bytes and undo stack
untouched while being read" (an undo landing after a fixed 4 s wait, mobile) and `60`'s
classification perf case (mobile). Both are flakes of their own, neither is one of the three.

So the three failures are branch-specific on CI even though they are invisible locally. The
branch changes the plugin's load path, registers a CM6 fold service, and edits the hub target
note itself (`test-vault/Projects/Aurora Dashboard.md` carries scratch text there); the two
cases that take longest on it are the two that drive the largest documents in the suite. That
is a hypothesis for that branch to test, not a finding of this pass — nothing in its new files
scans the vault or hooks a cache event, so the cost is not an obvious one.

## The cache is already resolved when the first case starts

The 77 failure compared two reads of the footer's header and watched the totals climb between
them: `411 · 127 → 414 · 128` over 44 samples on one run, `408 · 126 → 411 · 127` on another.
On the folding branch, a wait that logged its samples on CI had put Obsidian's metadata cache
at two to four files a second after `resetVault`, thirty-five to seventy-five seconds for the
149-note vault (29 tracked plus the 120 the hub generator adds), and the cache was named as
what the footer was counting.

`waitForMetadataCache` in `e2e/helpers.ts` now runs from the wdio `before` hook of both
configs — before mocha starts, so outside any per-case budget — and prints one line per spec
file. On the checkpoint run of this branch, all twenty spec files in the two `backlinks` jobs
read the same:

| | |
| --- | --- |
| Desktop, ten spec files | ready after 3.6–4.4 s: 149 notes, all 149 listed by the cache, 149 in `resolvedLinks` |
| Mobile, ten spec files | ready after 3.1–4.2 s, the same counts |
| Locally | 3.1 s |

The wait's own quiet window is five polls at 500 ms, so every one of those figures is the
window plus one or two round trips: the cache had finished before the hook ran. Whatever was
climbing on the folding branch was not the trunk's cache still reading the vault at session
start.

`resetVault` is not restarting it either. It compares Obsidian's stored hash for each file
with a SHA-256 of the fixture bytes and rewrites only what differs; a probe counting `modify`,
`create` and `delete` events across a reset on a fresh session saw none, and the two hashes
for `README.md` were identical.

### What the wait may and may not gate on

Three forms were tried on the folding branch and reverted before this one:

| Criterion | Verdict |
| --- | --- |
| `Object.keys(resolvedLinks).length === getMarkdownFiles().length` | Unsafe as a gate: a note with no links has nothing to resolve. On this vault the two do agree (149 and 149, so the table carries an entry per note), which is what made it look sound; it is not a relationship to rely on. |
| the same, inside `settle()` | Ran a dozen times per case in the footer specs and stacked past mocha's sixty seconds. |
| once per spec file, in `openFooter`, memoised, one minute's budget | The minute was short on the slower runners, and a wait that never succeeds memoises nothing, so every open paid it again. |
| resolved-link count held still across several polls, once every note in the vault appears in the cache's own file list (`getCachedFiles()`, present at runtime and absent from the bundled typings) | What `waitForMetadataCache` does. The list holds every file the cache has read, attachments included — the vault's one image made it 150 long against 149 notes — so it is checked note by note, never as a total that a spare attachment could satisfy with a note still missing. |

Its budget is a second per note with a sixty-second floor, then `waitBudget`'s widening under
contention. A wait that runs out logs its last samples and returns instead of failing the
file: only the cases that count the cache would notice, and they fail as before, beneath a
line naming the cause. The wait stays in, at three to four seconds per spec file, as the
instrument: its line is what showed the trunk's cache already resolved, and it is what would
show a branch's cache still reading.

## A case that takes a third of the budget locally takes all of it on a loaded runner

Two cases hit `mochaOpts.timeout` (60 s) on the folding branch's CI while their own local
runs sat well inside it:

| Case | Local | CI |
| --- | --- | --- |
| `74` "renders the corpus in both bundled themes" (eight screenshots, hub note included) | 17.6 s in this session, ~33 s on another developer run | past 60 s |
| `62` "performance: verdict computation stays within budget on a ~2000-line stress note" | 8.8 s under mobile emulation | past 60 s on the mobile job |

Neither case measures wall-clock. The 62 case asserts in-app medians and 95th percentiles per
verdict, collected by the plugin's own timers; its wall-clock is five rounds of keystrokes,
each a WebDriver round trip, and the default budget fits a case that makes a handful of them.
It now sets `this.timeout(h.waitBudget(180_000))` on itself, which touches nothing it asserts.
A negative control confirmed the mechanism: with the same call at 1000 ms the case failed with
mocha's timeout error and passed again once restored, so the call is honoured inside wdio's
wrapped `it`.

The 74 case had a second problem. Mocha abandons a case that outruns its budget, but it cannot
stop it: the loop kept switching themes and opening notes while the next two cases ran, and
those measured a footer part-way through a render they had not started — zero markers on one,
an overlapping ordinal on the other, in three of the six branch runs read. Widening the budget
would have made that rarer, not impossible. The loop is now eight cases, one per fixture and
theme, at 2.1–2.5 s each locally: an abandoned one can do at most one screenshot's worth of
work underneath its successor, and the report names which fixture was slow.

## A fourth case, found on the way: a tap the mobile job does not deliver

`75` "leaves the note's bytes and undo stack untouched while being read" failed on the mobile
`backlinks` job of every checkpoint on this branch and on two of `main`'s last twelve runs,
never locally (three mobile runs and one desktop run in a row here, with the editor focused
and the footer unfolded every time). The case types a character, scrolls to the footer,
clicks its icon twice — fold and unfold — and expects one keystroke undo to remove the
character within a fixed 4 s. Each checkpoint added a piece of the failure's message; read
together, the four runs say what it lost:

| Run | What the message said |
| --- | --- |
| first, second | only that the undo missed; CI's failure screenshot shows the footer folded |
| third | the editor still had focus (`cm-content`), the footer was folded |
| fourth | the first click left the footer unfolded, the second folded it; after one undo the buffer still began with the typed character; a second undo restored it |
| fifth, with each click verified against the fold state it should produce | the footer unfolded as intended and the editor focused; the first undo still did nothing and the second restored the buffer |

So focus is never lost, and the fold pair was a second fault, not the cause. On that job a
tap on the footer's icon is sometimes not delivered, and a blind click–pause–click then folds
the footer where it should have folded and unfolded it; the case now checks each click
against the fold state it should produce and repeats a click that did nothing, up to three
times, so a lost tap is retried rather than desynchronising the pair, and a click that never
toggles is a named failure. Separately, the first Mod-Z after that tap is dropped, every run,
whatever the footer's state, and the next one lands. The claim the case makes is about the
undo stack, so it now undoes through the editor's own history command (`editor.undo()`, on
the editor at runtime and absent from the typings) instead of a keystroke whose delivery on
the emulated platform is the one thing the case is not about. The wait goes through
`waitBudget`, and a miss still reports focus, the fold state, the buffer's head and what a
second undo did.

Whether a real touch on the footer's icon can be lost the same way is a question this harness
cannot ask — the emulation synthesises its taps — and it stays with the mobile-safe-by-
construction, desktop-tested decision (Q7) rather than becoming a claim either way.
