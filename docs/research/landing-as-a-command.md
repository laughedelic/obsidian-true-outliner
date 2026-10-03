# Landing as a command

Landing a PR — archive its OpenSpec change, sync the delta specs, bump the version, run
`scripts/check-landed.ts` — costs a cycle on almost every PR and collides between PRs that land
together. Issue #338 asks for a `/land` skill, a lock between concurrent landings and a view of
what moves into a workflow. This note holds the measurements, the design they led to, and what we
could not measure. A first version proposed a lock; review replaced it with auto-merge as the one
approval, and the measurements that decided that stay here. Measured on 2026-10-03 from a cloud session, with REST reads
only: the 84 PRs merged since 2026-09-14, the 480 runs of `landed.yml` since it started on
2026-09-25 (115 with logs read), and the repository's ruleset.

## Constraints

Fixed by review of #338, and taken as given: archive, spec sync and the final code↔spec review
stay in the PR; the maintainer decides every merge, by hand or by enabling auto-merge, after reading the
squash message, and agents never merge; `main` takes no commits besides squashes; no release PRs; a release is cut automatically
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

A cloud session's GitHub traffic goes through a proxy that allows REST on this repository,
including PR writes, and refuses GraphQL and ref deletes
(`docs/research/cloud-session-github-access.md`). It pushes and calls the API as the maintainer,
so GitHub cannot tell a session's `enable_pr_auto_merge` from the maintainer's click. The GitHub
MCP tools include `enable_pr_auto_merge`, `disable_pr_auto_merge` and `merge_pull_request`.

A session arms no check-ins, so it is woken by events, and a failing check is one.

### What a rule that PRs be up to date would cost

Counting the 84 merged PRs whose merge target was not an ancestor of their head, that is, those
that merged while behind `main`:

| PRs | Merged behind `main` |
| --- | --- |
| That write `manifest.json` or a main spec (43) | 7, among them two stack layers |
| Dependabot (12) | 6; #238, #239 and #240 merged 36 seconds apart, 7, 8 and 9 commits behind |
| Everything else (29) | 5 |

That is 18 of 84. A full CI run takes 7.2 minutes at the median, 9.1 at p90 and 11.2 at most
(68 successful PR runs), so the ruleset's strict setting would have cost about that much on
each of them.

## Proposal

**One gesture: the maintainer enables auto-merge.** It is the approval, the moment the squash
message is read, and the trigger for landing. Everything after it is the session's work and the
workflow's check; GitHub merges when the last requirement is met.

```
maintainer   enables auto-merge (reads the squash message here)
   │
   ▼
`Landed`     runs because auto-merge is set; the PR has not landed → fails → wakes the session
   │
   ▼
session      /land: rebase, archive, sync, bump, check, final code↔spec review, push
   │
   ▼
CI + `Landed` the push re-runs both; `Landed` passes → the `landed` deployment succeeds
   │
   ▼
GitHub       every requirement is met → squash-merges
```

### The gate: a required deployment

The `Protect main` ruleset gains a requirement that a deployment to the environment `landed`
succeeds. `landed.yml`'s job declares `environment: landed` and carries
`if: github.event.pull_request.auto_merge != null`. A job that the `if` skips creates no
deployment, so a PR without auto-merge has nothing to satisfy the requirement and cannot merge.
A required *check* would behave the opposite way: a skipped job passes it, which is why the check
itself stays outside the ruleset.

- Drafts cannot enable auto-merge, so the `if` covers them; no separate draft rule is needed.
- A PR that has nothing to land (dependency updates, chores, tooling) still takes the gesture.
  `check-landed.ts` passes at once for it, the deployment succeeds, and GitHub merges.
- Strict (up to date with `main`) stays off, so a run of dependency updates merges without a
  rebase and a CI rerun on each.
- The workflow's triggers gain `auto_merge_enabled`, so enabling auto-merge starts a run. It
  keeps cancelling in-progress runs per PR: a push supersedes whatever the older run would say.
- Auto-merge stays enabled across the session's push, which is made as the maintainer.

### What `check-landed.ts` checks

Today's rules, with the base changed from the event's snapshot to a fresh `origin/main`, plus:

- **The version is above `main`'s**, at least the bump the kind and paths call for.
- **A PR that has something to land contains the `main` tip** when the check runs. This is the
  freshness a strict ruleset would have given landing PRs, without charging it to the rest.

### `/land`, step by step

A skill, `.agents/skills/land/`, with the usual symlinks. A failed `Landed` on a PR with
auto-merge set wakes the session; the maintainer can also run `/land` by hand.

1. **Rebase** onto the fresh `origin/main`; push with `--force-with-lease` once, at the end. A
   conflict stops the skill and shows it, spec conflicts first.
2. **Archive** each OpenSpec change the PR opened, and **sync** its deltas into the main specs.
3. **Bump** with `npm version <minor|patch>` against the fresh `main`: a feature takes a minor,
   a fix a patch, anything else none. `npm version` writes the four files and no tag.
4. **Check** with `node scripts/check-landed.ts origin/main "<title>"`.
5. **Review** the synced specs against the implementation and the tests the `Covered by` lines
   name. A disagreement stops the skill before the push: it reports on the PR and leaves
   `Landed` red, so the PR waits with auto-merge still set. The review uses the independent-review
   skill (#337) once that exists.
6. **Push**, then report the version, the archived changes and the requirements the sync touched.

The skill never merges and never touches auto-merge. A `PreToolUse` refusal in
`scripts/agent-conventions.ts` covers `enable_pr_auto_merge`, `disable_pr_auto_merge` and
`merge_pull_request`, together with `gh pr merge`, and the steward skill's "never merge" line
says the same. Disabling is refused with enabling: allowing one and not the other would need
a rule about intent.

### What this accepts

- **A duplicate bump can still merge.** Strict is off, so two PRs landed against the same
  `main` and approved close together can both bump to the same version, and the second releases
  nothing. The window is one CI run (7 to 11 minutes) from a landing push to its merge. We accept
  the occasional missed release while the project is in active development, and there is no
  post-merge audit.
- **A stale event can block a PR.** `auto_merge` in the payload is read when the event is
  generated. A push whose payload predates the approval can skip, and cancel the run the approval
  started. No deployment follows, so the PR is blocked, not merged; the next push or a re-run
  clears it.
- **The squash message is read before the landing commits exist.** They are mechanical, and a
  custom message set when enabling auto-merge does not mention them.
- **Stacked PRs are not covered.** GitHub offers no auto-merge on them, even on the layer
  targeting `main`, so they cannot satisfy the requirement and `/land` refuses a PR whose base is
  not `main`. We do not document the ruleset's bypass as a way to land them. Branch stacking, for
  work whose code depends on another branch, stays; whether PR stacking keeps its place waits on
  how this works.

### Alternatives and what decided them

| Option | Why not |
| --- | --- |
| A lock between landings: a label as the claim, an order from its events, a lapse | The first proposal. Landing after approval shortens the window the lock guarded from a median of 12 minutes (longest 68 hours) to one CI run, and the measured collisions would each have needed the lapse to expire before the lock helped |
| Strict on for every PR | Atomic, but it would have blocked 18 of 84 merges for about 7 minutes each, 6 of 12 dependency updates among them |
| A required check in place of a deployment | A job skipped by its `if`, or by the skip race measured above, passes a required check |
| A job that cancels its own run when auto-merge is off | Ends as `cancelled`, not `neutral`; not tried |
| A job on `push` to `main` that re-evaluates PRs with auto-merge set | Covers only the minutes between a PR going green and a merge that moved `main`; with strict off and a missed release accepted, it adds a workflow and a token question for nothing |
| A post-merge audit for a feat or fix that left the version unchanged | A missed release is not a problem at this stage |
| The bump made by a workflow | A commit authored with the default token starts no workflow, so the required checks would be missing on the new head |
| A merge queue | Unavailable on a personal repository |

## Replaying the last weeks against the design

| Rule | Where it would have collided |
| --- | --- |
| Landing after approval | The window between a bump and its merge becomes one CI run. Of the 36 landing pushes (35 merged PRs and #274), two pairs fall within 11 minutes of each other: #264 and #274 (7 minutes, both to 0.14.3, a real duplicate) and #109 and #111 (11 minutes, no collision because #109 merged in between). #245 and #246 would not have collided: #246's bump would not have waited 8 hours |
| The deployment gate | None of the 8 skipped runs after a ready flip, including #226 and #317, could have let an unlanded PR merge: a skipped run creates no deployment |
| Strict off | The 18 PRs that merged behind `main` merge as they did, with no extra rebase |
| Freshness for PRs that land | #108, #122, #190, #196 and #303 merged 1 to 2 commits behind and would have been told to rebase at the landing check. #233 and #234 were stack layers and are outside the design |
| No check before approval | The 19 red runs on 9 of the 12 PRs that bumped become one red run per landing PR, after approval, which is the signal that wakes the session |
| Not stopping #75 and #81 | Both bumped 0.3.0 to 0.4.0 and merged one second apart; a version above `main`'s is checked when each lands, and the pair would still pass |

## Not measured

- That `if: github.event.pull_request.auto_merge != null` on a job that declares `environment:`
  creates no deployment when skipped, and that the ruleset's deployment requirement is then
  unmet. The maintainer has used a required deployment this way before; we did not probe it.
- That a failed check on a PR with auto-merge set wakes a subscribed session. Check results wake
  sessions in general; this case was not observed.

## What the implementation carries

- `.github/workflows/landed.yml`: `environment: landed`, the `auto_merge` condition, the
  `auto_merge_enabled` trigger, the fresh base.
- `scripts/check-landed.ts`: the fresh base, the version rule, the freshness rule for PRs that land.
- `.agents/skills/land/` and its two symlinks.
- `scripts/agent-conventions.ts`: the refusals above, with tests.
- CLAUDE.md "Change lifecycle", step 5 (the sequence becomes: enable auto-merge, `/land`, merge
  on green), the steward skill's lines on merging and on rewriting a branch, and the
  Bugfix routine's step 8 in #348.
- The ruleset change is the maintainer's, and it goes last: the requirement is added once the
  workflow is on `main`, since a PR that predates it carries the old workflow until its branch is
  updated.
