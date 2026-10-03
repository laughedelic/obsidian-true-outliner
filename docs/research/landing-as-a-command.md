# Landing as a command

Landing a PR — archive its OpenSpec change, sync the delta specs, bump the version, run
`scripts/check-landed.ts` — costs a cycle on almost every PR and collides between PRs that land
together. Issue #338 asks for a `/land` skill, a lock between concurrent landings and a view of
what moves into a workflow. This note holds the measurements the design rests on, the proposal,
and what we could not measure. Measured on 2026-10-03 from a cloud session, with REST reads
only: the 84 PRs merged since 2026-09-14, the 480 runs of `landed.yml` since it started on
2026-09-25 (115 with logs read), and the repository's ruleset.

## Constraints

Fixed by review of #338, and taken as given: archive, spec sync and the final code↔spec review
stay in the PR; the maintainer merges by hand after reading the squash message and agents never
merge; `main` takes no commits besides squashes; no release PRs; a release is cut automatically
when a merge moves `manifest.json`; Obsidian reads `manifest.json` from the default branch, so
the version has to be on `main`; GitHub's merge queue is unavailable here.

## What we measured

### The repository's settings decide what a collision costs

The `Protect main` ruleset requires `lint`, `unit-test`, `e2e-desktop-passed` and
`e2e-mobile-passed`, with `strict_required_status_checks_policy: false`. So:

- **`Landed` is not a required check.** It is read by the maintainer, not enforced.
- **A branch need not be up to date to merge.** A squash is a three-way merge against the
  PR's merge base. Two PRs that both move `manifest.json` from 0.3.0 to 0.4.0 merge cleanly,
  because both sides made the same edit.

That second property is how a bump is lost. #75 (feat, 0.3.0 → 0.4.0) and #81 (fix, 0.3.0 →
0.4.0) merged one second apart on 09-08. #81's squash left `manifest.json` as it found it, so
`release.yml`, which fires on a change to that file, did not run for it. When the bumps differ,
the merge conflicts instead and the PR has to be rebased. Every other PR in the window got past
this by being rebased and re-bumped right before the merge, which is the cost #338 describes.

### How often the version collides

Of the 84 PRs merged since 09-14, 43 write `manifest.json` or a main spec under
`openspec/specs/`, and 35 bump the version. Git history cannot show a collision: the re-bump
rewrites the commit, so every surviving bump looks sequential. The `Landed` logs can, because
each run prints `version: <base> -> <head>`:

| Collision | Evidence |
| --- | --- |
| #245 and #246, both 0.13.5 → 0.13.6 | #246 green at 0.13.6 from 11:28 on 09-26; #245 merged at 17:29 with the same bump; #246 re-bumped to 0.13.7 and merged at 19:23 |
| #264 and #274, both 0.14.2 → 0.14.3 | both green at 0.14.3 on 09-29, #264 at 05:31 and #274 at 05:38. #264 merged on 10-02, 68 hours later; #274 is still open |
| #131 and #139 | #139's bump is authored 23 minutes after #131 merges and lands at 0.11.1, consistent with the 0.10.2 → 0.11.1 re-bump #338 reports. Not verifiable from the logs: `Landed` did not exist yet |
| #75 and #81 | above: two PRs at 0.4.0, one release |

Three collisions among the 35 bumping PRs of the 18 days, two of them verified by the logs, and one earlier. Each costs a rebase, a re-bump and one more full
e2e sweep, because pushing the bump is a push.

The time a bump waits for the merge is the window a lock would have to cover. From the first
green `Landed` run that shows a bump (from 09-25) or the authored bump commit (before it) to the
merge, across the 35: median 12 minutes, p75 37, p90 159, longest 4,075 (#264). 31 of 35 are
under 3 hours.

### The red-by-design cost

`Landed` fails on a ready PR that has not landed, and the Bugfix routine marks PRs ready before
landing. Since 09-25, 12 merged PRs bumped the version; 9 of them ran red at least once before
landing, 19 red runs in all (#256 alone 5). The same sequence — rebase, re-bump against the new
base, sync, archive, run the check — appears in each, and each ends with a bump push.

### The `landed.yml` skip race is real

The job has `if: !github.event.pull_request.draft` and the workflow cancels in progress per PR.
The `draft` flag is read from the event's payload, which is a snapshot taken when the event was
generated. A push that happens while the PR is still a draft and a `ready_for_review` that
follows it within a second produce two events; if the stale one starts second, it cancels the
ready run and then skips itself. The check ends `skipped`, which GitHub counts as passing.

Of 26 PRs merged since the check started that went through a ready flip, 8 got a `skipped` run
created 1 to 3 seconds after the flip. Six of them recovered because a later run on the same
commit succeeded or failed. Two of the eight (#226 on `0752e9e`, #317 on `44e4947`) ended with
the ready run `cancelled` and the newest run on that commit `skipped`, with nothing after it:

```
#226  ready 19:24:39   run 14  0752e9e  cancelled  19:24:41
                       run 15  0752e9e  skipped    19:24:42     ← the check a reader sees
#317  ready 12:33:19   run 403 44e4947  cancelled  12:33:22
                       run 404 44e4947  cancelled  12:33:22
                       run 405 44e4947  skipped    12:33:22     ← the check a reader sees
```

Both heads were superseded by a later push before the merge, so no merged PR's final head ended
skipped. The run object does not record which action produced a run, so which event carried the
stale `draft: true` is inferred from the timing, not read. The consequence is bounded today only
because `Landed` is not required.

### What the environment allows

Read from this session: `GET /repos/{o}/{r}/issues/{n}/events` and `/timeline` work, so label
events and their order are readable from a cloud session. Not measured, because each is a write
to the repository: whether a cloud session can add and remove a label on a PR through REST or
MCP, and whether it can create a check run. `docs/research/cloud-session-github-access.md`
measured PR writes as allowed and ref deletes as refused, so a lock that a session has to
delete cannot rely on a session releasing it.

Two things constrain how a session waits. A session arms no check-ins, so it cannot poll. And
the cloud environment's PR instructions list commit statuses as not pushed to a session, while check runs are,
so anything meant to wake a waiting session has to be a check run.

## Proposal

**Correctness comes from detection; efficiency comes from the lock.** A wrong bump must never
look right against the `main` it will merge onto, and a lock only reduces how often one has to
be redone. Both halves matter, and the measurements say the second is the smaller.

### What the lock guards

The lock guards what every landing writes: `manifest.json` (with `versions.json` and the two
`package` files) and the main specs. A PR whose diff writes neither — chores, dependency bumps,
docs — takes no lock and needs no landing. That is 41 of the 84. The test is the diff, the same
one `check-landed.ts` already reads.

### `/land`, step by step

A skill, `.agents/skills/land/`, with the usual symlinks. The maintainer runs it in the PR's
session when the PR is ready to merge, and the skill stops where the maintainer merges.

1. **Preconditions.** The PR is open, ready, on a branch whose base is `main` (a layer of a stack
   is landed from the primary checkout, `docs/pr-stacks.md`), and the required checks are green
   on the head. Otherwise stop and say which.
2. **Classify.** Read the kind from the title, whether the diff ships (`src/`, `styles/`) and
   whether it opens an OpenSpec change. Nothing to write means nothing to land: report that and
   stop.
3. **Take the lock.** Add the `landing` label, then read the queue (below). If another PR holds
   the lock, say which and since when, and end the turn. The `Landed` check on this PR will say
   `queued behind #N`.
4. **Bring in `main`.** `git fetch origin main`, rebase onto it, push with
   `--force-with-lease` once at the end. `/land` is the explicit ask the steward skill requires
   for rewriting the branch. A conflict stops the skill and shows it, spec conflicts first.
5. **Archive and sync.** `openspec archive` for each change the PR opened, and the sync the
   `openspec-sync-specs` skill performs. A delta that does not apply cleanly stops the skill.
6. **Bump.** The target is a function of the kind, whether the PR ships and the version on the
   fresh `origin/main`: a feature takes a minor bump, a fix a patch, anything else none. Run
   `npm version <minor|patch>`; it writes all four files and no tag.
7. **Check.** `node scripts/check-landed.ts origin/main "<title>"` against the tip fetched in
   step 4, then commit and push.
8. **Final review.** Compare the synced specs against the implementation and the tests the
   `Covered by` lines name, and report disagreements. This is the review the maintainer asked
   for; it uses the independent-review skill (#337) once that exists.
9. **Report and stop.** The squash commit title and body as GitHub will build them, the version,
   the archived changes, the spec requirements added, modified or removed, when the lock lapses,
   and the CI state. The skill never merges.

Re-running `/land` is idempotent: archived changes are skipped, a bump that already equals the
target is skipped, the lock claim is refreshed.

### The lock

The lock is a claim, not a guarantee, and it is the same object `Landed` reads.

- **Held** by a `landing` label on an open, ready PR. The label is declared in
  `.github/labels.yml` like every other.
- **Queue order** is the id of each PR's latest `labeled` event for that label. Event ids are
  assigned by the server, so two sessions that add the label in the same second still get a
  total order, and each sees the same one when it reads back. No compare-and-swap is needed.
- **The holder** is the first PR in the queue whose claim is younger than 3 hours. A claim
  older than that does not block one queued behind it. The 3 hours is the p89 of the windows
  measured above; it is a constant in `scripts/landing.ts`, not a setting.
- **Released** when the PR merges, closes, goes back to draft, loses the label, or its claim
  lapses with another PR queued. A merge or a close needs no action: only open PRs count.
  Nothing a session has to delete is part of it.
- **Waiting** is event-driven. When `main` moves, a job in `landed.yml` re-evaluates every open
  PR carrying the label and rewrites its check run; a queued PR whose turn has come gets
  `lock free: run /land`, which wakes a session that watches it. The maintainer can also run
  `/land` again by hand.

Two PRs, one holder that idles and one that takes over:

```
 #A  /land ── holds ─────────────────── lapses (3 h) ·········· main is 0.14.3,
 #B             /land ── queued ───────────────────┴─ holds ── merged        A bumps to 0.14.3
 main  0.14.2 ─────────────────────────────────────────────── 0.14.3        → run /land again
```

When a claim lapses and the second PR merges first, the first PR's bump is stale. That is not
a failure of the lock; it is what the detection below is for, and the cost is today's: one
`/land` re-run.

### What moves into a workflow

| Stays in the skill | Moves into `landed.yml` |
| --- | --- |
| Rebase, archive, spec sync, `npm version`, the final review, the report | Reading the queue and the check's result from the current `main` |
| Pushing the branch | Re-evaluating open landing PRs when `main` moves |
| | Writing the check run in its three states |

The bump itself stays a session's commit. A workflow that pushed it would need a token whose
push re-triggers CI, because a commit authored with the default token starts no workflow and the
required checks would then be missing on the new head; and the maintainer would be merging a
commit no one reviewed. We do not know that such a token exists, and nothing here needs it.

### What `Landed` checks afterwards

Every run reads live state instead of the event payload: the PR's draft flag from the API, and
`origin/main` fetched fresh in place of `pull_request.base.sha`. The job has no `if`, so it
cannot be skipped, and the per-PR concurrency group can keep cancelling, since the newest run
reads current state and so is always right. That removes the race.

The result is a check run, written through the Checks API, in three states instead of a job's
pass or fail:

| The PR | Check |
| --- | --- |
| a draft | `neutral` — "draft" |
| has nothing to land (`check-landed.ts` passes without the label) | `success` — "nothing to land" |
| has something to land and has not asked | `neutral` — "run /land" |
| asked, and another PR holds the lock | `neutral` — "queued behind #N" |
| asked, holds the lock, and every rule below holds | `success` |
| asked, and a rule below fails | `failure`, naming it |

`neutral` is the state that ends the "red by design" comments: a ready PR that has not landed is
grey, not red. The rules `check-landed.ts` applies are today's, plus three:

- **The version is the target.** At least the one `/land` computes from the fresh `origin/main`,
  and strictly above it. Today it is only "forward of the stale base".
- **The branch has the base's version.** The version at the merge base equals the version at
  the `main` tip. This is what turns a duplicate bump (#75, #81) from a silent loss into a red.
- **The holder is current.** A PR holding the lock whose bump no longer follows `main` fails
  and says `main moved to X: run /land`.

After a merge, the `push` job also audits the squash: a `feat` or `fix` that touches `src/` or
`styles/` and left `manifest.json` as it found it fails the run on `main`, naming the PR. It is
the only place where #81's lost release would have been caught after the fact.

### What this does not make safe

A bump is checked against `main` when a run happens, so two bumping PRs merged within the
latency of that run (about half a minute) are not caught first. The maintainer merges by hand,
one at a time, and this is the same window as today with the check now able to see it. A
required check would not close it, because `neutral` and `skipped` both count as passing in a
required check.

### Alternatives measured or argued against

| Option | Why not |
| --- | --- |
| No lock; detection only | The simplest, and the right first step. It misses the cheap win of telling the second PR to wait instead of finding out at merge. Kept as the fallback if the lock proves unused |
| A workflow `concurrency` group as the lock | A group holds only while a run is in progress. A landing lasts from `/land` to a hand merge: minutes to days |
| A ref created for the claim (`land-lock`) | Creating a ref is atomic, but no queue and no holder identity, and a session cannot delete the ref; only a workflow could release it, and a lapse needs one anyway |
| A queue as comments on a pinned issue | Same ordering as label events, with a second place to look and a place to clean |
| The bump computed in a workflow at merge | Needs a commit on `main` besides the squash, which the constraints exclude |
| Making the version unique per PR | The version has to grow with merge order, and a merge order that differs from numbering would make Obsidian skip the update |
| A merge queue | Unavailable on a personal repository |

## Replaying the last weeks against the rules

| Rule | Where it would have collided |
| --- | --- |
| Lock on `manifest.json` or a main spec | **#245 / #246 (09-26).** #246 held from 11:28 and was idle for 6 hours. At 3 hours its claim lapses; #245 takes the lock at 17:22, merges at 17:29, and #246 is red at once with `main moved to 0.13.6`. The cost is the re-bump #246 paid anyway. No gain except that it shows up in seconds |
| | **#264 / #274 (09-29).** Both would have been green at 0.14.3. With the lock, #274 reads `queued behind #264` at 05:38; #264 idles 68 hours, so the claim lapses at 08:31 and #274 may take it. A visible conflict instead of two PRs sitting on one number, but not fewer re-bumps |
| | **#317, #319, #310 (09-29 → 10-02).** Chores that sync `e2e-verification` or `drawn-case-files` while #264 held. Without a lapse they would have queued up to 68 hours behind an idle holder; with 3 hours, at most 3 |
| | **#232, #233, #234 (09-25).** A stack landed as a unit with `gh stack merge`; each layer shows the same spec diff. `/land` refuses a layer, so none of them would have taken the lock |
| Fresh `main` and the base's version | **#75 / #81 (09-08).** Red on #81 as soon as #75 merged, instead of a lost release. Predates `Landed`, so replayed from history, not from a run |
| Three-state check | **9 of 12** shipping PRs since 09-25 that ran red before landing would have been grey; the 19 red runs become 0 |
| No `if` on the job, live state | **#226, #317.** Neither would have ended `skipped`; the newest run on their head reads the live draft flag |

Where the lock would have prevented a re-bump outright: none of the collisions the logs can show.
In both, the holder was idle past any lapse we could defend. The
lock would have made each visible one step earlier and told the maintainer who to merge first.
That is a smaller win than the skill and the check carry, and it is why the lock is the part to
revisit after a few weeks of use. An upper bound on the same replay, taking each landing to start
at the archive commit and not at the bump: 13 overlapping pairs, 3 of them the stack above.

## Open decisions

1. **One stage or two.** The skill, the three-state check, the fresh-`main` rules and the race fix
   stand without the lock, and carry most of the measured saving. The lock adds the label, the
   queue and the lapse. We recommend two PRs in that order, so that the lock is built against a
   few weeks of use of the first; it is a small addition, since the check already reads `main`.
2. **The lapse.** 3 hours, set from the measured windows. A holder who is slower loses the claim
   and re-runs `/land`. Shorter costs more re-runs; longer lets an idle holder block a chore that
   syncs a spec.
3. **Whether `Landed` becomes required.** Not recommended: three states do not survive a
   required check. The ruleset is the maintainer's to change in any case.
4. **A token for a workflow-made bump.** If the maintainer has or wants a PAT or app token whose
   pushes trigger CI, the bump could move into a workflow later. Nothing here depends on it.
5. **Whether a cloud session can write the label and a check run.** Unmeasured because each is
   a write. The first implementation commit measures both on its own PR before the skill relies
   on them, and the skill falls back to telling the maintainer what to add if either is refused.

## What the implementation carries

Stage one:

- `scripts/landing.ts`: the target version and, later, the queue and the lapse, shared by the
  skill, `check-landed.ts` and the workflow, with unit tests over the recorded cases above.
- `scripts/check-landed.ts`: fresh base, the version rules, a JSON result with the three states.
- `.github/workflows/landed.yml`: no job-level `if`, live PR state, the check run, the `push`
  job, the squash audit.
- `.agents/skills/land/` and its two symlinks, without the lock steps.
- CLAUDE.md "Change lifecycle", step 5, and the steward skill's line on rewriting a branch,
  both pointing at `/land`. The Bugfix routine's step 8 follows in #348.

Stage two: the `landing` label in `.github/labels.yml`, the queue and lapse in
`scripts/landing.ts`, the queued state in the check, and step 3 of the skill.
