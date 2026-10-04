---
name: land
description: How a session lands a PR here, once the maintainer has enabled auto-merge — rebase onto main, archive the OpenSpec change and sync its specs, bump the version, run the check, review the specs against the code, push. Use when a failed `Landed` check wakes the session on a PR with auto-merge set, and when the maintainer runs /land.
---

# Land

Enabling auto-merge is the maintainer's one approval: it is where the squash message is read, and
it starts landing. The `Landed` check then runs, finds a PR that has something to land and has not
landed, and fails; that failure wakes the session. This skill is the sequence that turns it green.
GitHub merges when every requirement is met, and the session's work ends at the push.
The design and its measurements are in `openspec/changes/archive/*-land-through-auto-merge/` and
[`docs/research/landing-process.md`](../../../docs/research/landing-process.md).

## Before starting

- **The PR is open, its base is `main`, and it is not a layer of a stack.** A stacked PR cannot take
  auto-merge, so it cannot satisfy the gate; stop and say so. Stacks are moved from the primary
  checkout (`docs/pr-stacks.md`).
- **There is something to land.** `node scripts/check-landed.ts "$(git rev-parse origin/main)" "<title>"`
  prints `lands: nothing to land` for a dependency update, a chore or a tooling change. Say so and
  stop: the check passes on its own.
- **Work on the PR's own branch**, checked out, with a clean tree.

## The sequence

1. **Rebase** onto the fresh `main`: `git fetch origin main && git rebase origin/main`. A conflict
   stops the skill: show it, spec conflicts first, and ask. `/land` is the explicit ask that lets a
   session rewrite its branch; the push at the end is `--force-with-lease`, once.
2. **Archive** each OpenSpec change the PR opened, with the `openspec-archive-change` skill, which
   syncs its deltas into the main specs. A delta that does not apply cleanly stops the skill. Follow
   `openspec/config.yaml`'s archive guidance, including what to do with a follow-up the change
   found.
3. **Bump** the version against the fresh `main`, not against the branch: `npm version minor` for a
   `feat` that touches `src/` or `styles/`, `npm version patch` for a `fix` that does, nothing
   otherwise. `npm version` writes `manifest.json`, `versions.json` and the two `package` files and
   creates no tag. A head that already carries the target version is left alone.
4. **Check** with `node scripts/check-landed.ts "$(git rev-parse origin/main)" "<PR title>"` until
   it reads `landed`. Its version rule is judged against the tip it is given, and a PR that lands
   has to contain that tip.
5. **Review** the synced specs against the implementation and the tests the `Covered by` lines name,
   with the `independent-review` skill in implementation mode. A disagreement stops the skill
   **before the push**: report it on the PR in one comment and leave `Landed` red. The PR waits,
   with auto-merge still set, until the maintainer or a later session resolves it.
6. **Commit and push.** One commit, `chore(land): archive <change>, bump to <version>`; the PR is
   squashed, so the message is for the branch's own history. Push with `--force-with-lease`.
7. **Report** the version, the changes archived and the requirements the sync added, modified or
   removed. In a session the maintainer is reading, say it there; when an event woke the session,
   leave it as one PR comment.

The push re-runs CI and `Landed`. When both are green, GitHub merges.

## Never

- **Merge, or enable or disable auto-merge.** The maintainer's approval is the auto-merge click;
  `scripts/agent-conventions.ts` refuses the tools and the commands. A session that finds a concern
  does not finish landing, which holds the PR without touching auto-merge.
- **Land a PR that has nothing to land**, or land a stack layer.
- **Bump against the branch's own base.** The version is judged against the `main` fetched when the
  check runs.
- **Skip the review to turn the check green.** The check cannot read whether the specs and the code
  agree; step 5 is the only place that does.
- **Arm a check-in.** After the push the next CI result wakes the session
  ([`steward`](../steward/SKILL.md)).
