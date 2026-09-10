# Two things a CI runner does slower than a developer machine

Measured 2026-09-10, macOS, Obsidian v1.13.7 (installer v1.5.8), with the CI figures taken
from runs of the `ci.yml` matrix on GitHub's hosted runners at four Obsidian instances per job.
Three cases failed there — one on roughly every other run, two on loaded runners only — and
none of them reproduced locally. Running the plugin at two commits back to back showed the
same local timings, so the plugin was not what had changed; the runner was.

## Obsidian's own cache is still reading the vault when the first case starts

`77-footer-controls` "shortens the header on the same narrow footer that sheds facet words"
compares two reads of the footer's header and failed because the totals kept climbing between
them: `411 · 127 → 414 · 128` over 44 samples on one run, `408 · 126 → 411 · 127` on another.

Everything the footer counts comes from `app.metadataCache`, and every e2e session starts
that cache cold — the service launches each worker on its own copy of the vault with its own
user-data directory, so nothing from a previous session survives. Obsidian indexes the vault
asynchronously after the window is already usable. A wait that logged its samples on CI put
the rate at two to four files a second; the test vault is 29 tracked notes plus the 120 the
hub generator adds, so the initial index takes between thirty-five and seventy-five seconds
there. Locally it is over before the first spec's `before` finishes.

`resetVault` is not what restarts this. It compares hashes and rewrites only the files that
differ from the fixture — on a fresh copy, none — so the initial index is the whole of what
has to finish, and a wait belongs once per session, not after every reset.

### What the wait may and may not gate on

| Criterion | Verdict |
| --- | --- |
| `Object.keys(resolvedLinks).length === getMarkdownFiles().length` | Unsafe. A file with no links has nothing to resolve; on the folding branch this comparison never became true on CI, so the wait ran to its budget every time. Locally the two happen to agree (149 and 149), which is what made it look sound. |
| the same, inside `settle()` | Ran a dozen times per case in the footer specs and stacked past mocha's sixty seconds. |
| once per spec file, in `openFooter`, memoised, one minute's budget | The minute was short on the slower runners, and a wait that never succeeds memoises nothing, so every open paid it again. |
| resolved-link count held still across several polls, with the cache's own file list (`getCachedFiles()`, present at runtime and absent from the bundled typings) at or above the vault's note count | What `waitForMetadataCache` in `e2e/helpers.ts` does now. |

The wait runs from the wdio `before` hook of both configs, which the framework executes
before mocha starts and outside any per-case budget. Its budget is a second per note in the
vault with a sixty-second floor, then `waitBudget`'s widening under contention — half the
slowest measured rate in reserve, and scaling with a larger generated fixture rather than
hard-coding this one's size. A wait that runs out logs its last samples and returns instead
of failing the file: only the cases that count the cache would notice, and they fail as they
did before, now beneath a line naming the cause.

| Locally | |
| --- | --- |
| Time to ready | 3.1 s per spec file, 2.5 s of which is the quiet window (five polls at 500 ms) |
| Sample at ready | 149 notes, 150 cached files, 149 entries in `resolvedLinks` |

The one extra cached file is the vault's single image: `getCachedFiles` lists every file the
cache has read, not only notes, which is why the floor is "at or above" rather than equal.

## A case that takes a third of the budget locally takes all of it on a loaded runner

Two cases hit `mochaOpts.timeout` (60 s) on CI while their own local runs sat well inside it:

| Case | Local | CI |
| --- | --- | --- |
| `74` "renders the corpus in both bundled themes" (eight screenshots, hub note included) | 17.6 s in this session, ~33 s on another developer run | past 60 s on loaded runners |
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
an overlapping ordinal on the other. Widening the budget would have made that rarer, not
impossible. The loop is now eight cases, one per fixture and theme, at 2.1–2.5 s each locally:
an abandoned one can do at most one screenshot's worth of work underneath its successor, and
the report names which fixture was slow.
