## Why

Landing a PR (archive its change, sync the delta specs, bump the version, run `check-landed.ts`) costs
a cycle on almost every PR, repeats the same sequence in each session, and collides when PRs land
together. The `Landed` check is red by design on a ready PR that has not landed, and a race in
`landed.yml` can leave it `skipped`, which counts as passing. Issue #338, under #334, asks for landing
as a command with the deterministic steps automated. The figures are in
[`docs/research/landing-process.md`](../../../../docs/research/landing-process.md).

## What Changes

- **Enabling auto-merge is the one approval.** The maintainer enables it after reading the squash
  message. It starts landing, and GitHub merges when every requirement is met. There is no separate
  merge click and no lock between PRs.
- **A `/land` skill**, `.agents/skills/land/SKILL.md`, with symlinks from `.claude/skills/` and
  `.github/skills/`. A failed `Landed` on a PR with auto-merge set wakes the session, and the skill
  rebases onto the fresh `main`, archives, syncs, bumps, runs `check-landed.ts`, reviews the synced
  specs against the implementation, and pushes. The maintainer can also run it by hand.
- **`landed.yml` gates the merge with a deployment.** The job declares `environment: landing-zone` and runs
  only while `pull_request.auto_merge` is set. The `Protect main` ruleset requires a successful
  deployment to `landing-zone`. `Landed` itself stays outside the ruleset.
- **`check-landed.ts` reads a fresh `origin/main`** in place of the event's base snapshot, requires a
  version above `main`'s, and requires a PR that has something to land to contain the `main` tip.
- **The merge guard names `disable_pr_auto_merge`.** The guard from #352 already refuses the merge and
  enable tools; a session that finds a concern does not finish landing, and does not touch
  auto-merge.
- **AGENTS.md step 5 and the `steward` skill** describe the new sequence.

## Non-goals

- A lock, a queue or a claim between landings. The window a lock would guard is one CI run, and the
  measured collisions would each have outlasted any lapse.
- Strict ("up to date") in the ruleset. It would have blocked about one merge in five, a dependency
  update half the time, for a CI run each.
- A post-merge audit for a release that did not happen. A missed release is not a problem at this
  stage.
- Stacked PRs. GitHub offers them no auto-merge, so they cannot satisfy the gate; `/land` refuses a PR
  whose base is not `main`, and the ruleset's bypass is not documented as a way to land them.
- A workflow that makes the bump. A commit authored with the default token starts no CI.
- Changing the Bugfix routine; its next revision is #348.

## Capabilities

### New Capabilities

None. The change is to how we land work, not to what the plugin does.

### Modified Capabilities

None.

## Impact

- `.github/workflows/landed.yml`, `scripts/check-landed.ts`, `scripts/agent-conventions.ts` and its test.
- `.agents/skills/land/` and its two symlinks, `.agents/skills/steward/SKILL.md`, `AGENTS.md`.
- The `Protect main` ruleset, which only the maintainer can change, and a GitHub environment
  `landing-zone`, which the first run creates.
