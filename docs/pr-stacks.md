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

A restack puts every layer back on the one below it after the trunk or a lower layer has moved.
Run it in a checkout where no layer of the stack is checked out in another worktree:
`--update-refs` skips such a layer without an error, and the stack comes out split. A cloud session
and a fresh clone have one worktree, so they qualify. Name the layers bottom first.

```bash
git fetch origin
git checkout -B <layer> origin/<layer>        # each layer, bottom first: no unpushed work on it, or stop and report
git rebase <lower> <layer>                    # each layer above the bottom, bottom first: onto the layer below
git rebase --update-refs origin/main          # from the top layer: onto the trunk
```

The first loop puts every layer on its remote, which a fresh clone lacks and a stale local branch
gets wrong: another session may have pushed to a lower layer, and a push from a stale branch would
drop its commits. The second keeps a lower layer's new commits, and is a no-op for one that did not
gain any. The third is a no-op when the trunk did not move.

A lower layer that was rewritten, by its own restack or by a force-push, is the one case these
miss: the layers above still hold its old commits, and `git rebase <lower> <layer>` replays them.
Git skips a commit identical to one it has applied, but a rewrite that changed content conflicts. Give
`--onto` the lower layer's old tip, bottom layer first, in place of the second line:

```bash
git rebase --onto <lower> <the lower's old tip> <layer>
```

The old tip is the commit the layer above was built on. For a layer another session rewrote and
force-pushed, it is `origin/<lower>@{1}` right after the fetch that moved it; confirm that
`git merge-base --is-ancestor <old tip> origin/<layer>` holds, since a second fetch moves `@{1}`. For
the layer above that one, which the loop above has just rewritten, it is `origin/<lower>`: the remote
ref has not moved, and has no `@{1}`.

Then check that the stack is whole, and push every layer in one command:

```bash
git merge-base --is-ancestor origin/main <bottom>   # and each adjacent pair: <lower> <upper>
git rev-list --count <lower>..<upper>               # the layer's own commits
git push --atomic --force-with-lease origin <bottom> … <top>
```

The lease refuses a layer another session has pushed to since the fetch, and `--atomic` then pushes
none of them, so a stack is never left split on the remote. A cloud session pushes this way,
whichever branch it has checked out. `--force-if-includes` is left out: it refused the push straight
after the first loop. A layer reported as diverged from origin after a restack below it is reset to
the remote (`AGENTS.md`, "Branching and PR stacks"); merging the layer below to update the base
destroys the linear history the stack exists to keep.

## Landing

The maintainer lands a stack, from the PR page, and the whole stack squash-merges so the linear
history survives into `main`. An agent prepares landing and stops; `scripts/agent-conventions.ts`
refuses a merge. Landing the bottom layer alone to release it costs a restack of every layer above
it — one more reason independent work does not belong in a stack.
