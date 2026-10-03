# Stacks

Reference for stacked PRs here: making one, restacking it, and what stays the maintainer's. A stack
is GitHub's native stacked PRs: each layer is a PR whose base is the branch below it, registered as
a stack so GitHub shows and lands the layers together. We register it through the REST API and move
it with plain git. The `gh stack` extension is not used: its PR reads are GraphQL, which a cloud
session's proxy refuses, and what it does to a stack is one of the calls below or one git command
([`research/cloud-session-github-access.md`](research/cloud-session-github-access.md), "A stacked PR
from a cloud session"; [`research/restacking-with-plain-git.md`](research/restacking-with-plain-git.md)).

## Making a stack

| To | Call |
| --- | --- |
| open a layer | `create_pull_request` or `gh api`, as a draft, with `base` set to the lower layer's branch; the bottom layer's is `main` |
| see the stacks | `gh api repos/{owner}/{repo}/stacks`: each stack with its PRs, bottom first |
| create one | `echo '{"pull_requests":[<bottom>, …, <top>]}' \| gh api -X POST repos/{owner}/{repo}/stacks --input -` |
| extend one | `POST repos/{owner}/{repo}/stacks/{n}/add` (not measured: the body is unknown) |
| dissolve one | `gh api -X POST repos/{owner}/{repo}/stacks/{n}/unstack`: 204, and the PRs stay open with their bases unchanged |

Measured: the PRs listed bottom to top, each already open as a plain PR, the upper's base already on
the lower's branch. Not measured: whether the request refuses PRs whose bases do not chain. The
routes are not in GitHub's REST reference; they were read from the `gh-stack` v0.2.0 release binary,
whose `internal/github` package is where to look if one moves.

## Restacking

A restack puts every layer back on the one below it after the trunk or a lower layer has moved. Run
it in a checkout where no layer of the stack is checked out in another worktree: `--update-refs`
skips such a layer without an error, and the stack comes out split. A cloud session and a fresh clone
have one worktree, so they qualify.

| What moved | Command |
| --- | --- |
| the trunk | from the top layer: `git fetch origin && git rebase --update-refs origin/main` |
| a lower layer gained commits | from the top layer: `git rebase --update-refs <lower>` |
| a lower layer was rewritten | bottom layer first, for each layer above it: `git rebase --onto <lower> <the lower's old tip> <layer>` |

The old tip is read before the lower layer moves (`git rev-parse <lower>`, or its `origin/` ref before
the fetch). `--update-refs` on a rewritten lower layer replays its old commit and conflicts.

Then check that the stack is whole, and push every layer in one command:

```bash
git merge-base --is-ancestor <lower> <upper>   # for each adjacent pair
git rev-list --count <lower>..<upper>          # the layer's own commits
git push --force-with-lease origin <bottom> … <top>
```

A cloud session pushes the moved layers this way, whichever branch it has checked out. A layer
reported as diverged from origin after a restack below it is reset to the remote
(`AGENTS.md`, "Branching and PR stacks"); merging the layer below to update the base destroys the
linear history the stack exists to keep.

## Landing

The maintainer lands a stack, from the PR page, and the whole stack squash-merges so the linear
history survives into `main`. An agent prepares landing and stops; `scripts/agent-conventions.ts`
refuses a merge. Landing the bottom layer alone to release it costs a restack of every layer above
it — one more reason independent work does not belong in a stack.
