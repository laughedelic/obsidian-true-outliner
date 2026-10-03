## Context

See proposal.md for the motivation. What the design rests on, with the measurements in
[`docs/research/landing-as-a-command.md`](../../../docs/research/landing-as-a-command.md):

- `Landed` is not a required check, and the ruleset's strict setting is off.
- A job skipped by its `if` counts as passing a required check, and `landed.yml` has such an `if` and
  a draft flag read from the event payload.
- A cloud session pushes and calls the API as the maintainer, so GitHub cannot tell its auto-merge
  from the maintainer's. Sessions arm no check-ins, so a failing check is what wakes one.
- GitHub offers no auto-merge on a stacked PR.

## Goals / Non-Goals

**Goals:** one gesture that approves, starts landing and merges; a gate that fails safe, so that
anything that does not run leaves the PR blocked; landing steps a session does not re-derive.

**Non-Goals:** as listed in proposal.md.

## Decisions

### The gate is a required deployment

A required check passes when its job is skipped. A required deployment does not: a job skipped by its
`if` creates no deployment, so nothing satisfies the requirement. The job therefore carries
`environment: landing-zone` and `if: github.event.pull_request.auto_merge != null`, and the ruleset
requires a successful deployment to `landing-zone`. A PR without auto-merge cannot merge; a draft cannot
enable it; a PR with nothing to land passes `check-landed.ts` at once and merges on the same gesture.

The workflow keeps its per-PR concurrency group with cancel-in-progress: a push supersedes whatever an
older run would say. The `auto_merge` field of a payload is a snapshot, so a push generated before the
approval can skip and cancel the run the approval started. The result is a blocked PR, not a merged
one, and a push or a re-run clears it. We accept that.

Alternatives rejected: a required check (a skip passes it); a job that cancels its own run when
auto-merge is off (ends `cancelled`, not tried); a job on `push` to `main` that re-evaluates PRs with
auto-merge set (covers only the minutes between green and merge, and costs a workflow and a token
question).

### What `check-landed.ts` adds

The base becomes a `origin/main` the job fetches when it runs, instead of `pull_request.base.sha`.
The version must be above `main`'s, and at least the bump the kind and paths call for. A PR with
something to land (a change to archive, a main spec to sync, a shipping `feat` or `fix`) must contain
the `main` tip when the check runs. A PR with nothing to land is not held to it, so dependency
updates and chores merge without a rebase.

### Strict stays off

Strict would have forced an update and a CI run on about one merge in five. The check's own freshness
rule covers the PRs that need it. What remains is a window of one CI run, from a landing push to its
merge, in which two PRs approved close together can both bump to the same version and the second
releases nothing. We accept it for now.

### `/land`

Rebase onto the fresh `origin/main` and push once with `--force-with-lease`; a conflict stops the
skill, spec conflicts first. Archive each change the PR opened and sync its deltas. Bump with
`npm version <minor|patch>` against the fresh `main`. Run `check-landed.ts`. Compare the synced specs
with the implementation and the tests the `Covered by` lines name, using the independent-review skill
(#351). A disagreement stops the skill before the push and is reported on the PR, which leaves
`Landed` red and the PR waiting with auto-merge still set. Push, then report the version, the
archived changes and the requirements the sync touched.

The skill never merges and never touches auto-merge. The squash message is read when the maintainer
enables auto-merge, before the landing commits exist; they are mechanical.

### The merge guard

`mcp__github__disable_pr_auto_merge` joins `MERGE_TOOLS` in `scripts/agent-conventions.ts`. Allowing a
disable and not an enable would need a rule about intent.

## Risks / Trade-offs

- **A skipped job with `environment:` leaves the ruleset requirement unmet.** The maintainer has used a
  required deployment this way. We did not probe it; the first throwaway PR checks it.
- **A failed `Landed` wakes a session.** Check results wake sessions in general; this case has not
  been observed.
- **Auto-merge survives the session's push.** Expected, since the push is made as the maintainer.
- **The ruleset change precedes nothing it depends on.** Adding the requirement before `landed.yml`
  is on `main` blocks every merge, and a PR that predates the workflow carries the old one until its
  branch is updated. The ruleset is changed last.

## Open Questions

None that change what gets built.
