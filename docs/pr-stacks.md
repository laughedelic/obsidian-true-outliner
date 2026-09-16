# Stack surgery

Reference for the operations that move a stack. They rewrite branches other sessions are sitting
on and take a lock in the shared git directory, so they run from the primary checkout rather than
from a session working on a layer.

Stacks are GitHub's native stacked PRs, driven by the `gh stack` extension
(`gh extension install github/gh-stack`). A stacked PR targets the branch below it instead of
`main`, and GitHub retargets it when its parent merges — the base is set once and never
maintained by hand.

| | |
| --- | --- |
| `gh stack view --json` | the current branch's stack, if it is in one |
| `gh stack checkout <pr>` | fetch an existing stack and switch into it |
| `gh stack init <branch>` | start a stack off the trunk, or adopt existing branches into one |
| `gh stack add <branch>` | add a layer on top of the current stack |
| `gh stack submit --auto` | push every layer and open or update its PRs, as drafts |
| `gh stack rebase` | cascading rebase after the trunk or a lower layer moves |
| `gh stack sync` | fetch, cascade-rebase and atomically force-push the whole stack |
| `gh stack merge` | atomic merge of the stack up to a chosen PR |

Rebase a layer with `gh stack rebase`, never plain `git rebase`: rebasing one layer by hand
leaves every layer above it on commits that no longer exist, which `gh stack view` then reports
as a branch needing one.

## Worktrees hold branches hostage

Git refuses to check out or rebase a branch that another worktree has checked out
(`fatal: '<branch>' is already used by worktree at …`), which is every `gh stack` command that
moves HEAD — `rebase`, `sync`, `switch`, `up`, `down`, `checkout`. `gh stack init` is the
exception: it only records the topology, so a stack can be adopted with every layer live in its
own worktree, and nothing needs setting up before sessions start.

Detach the other worktrees around the restack instead:

```bash
node scripts/stack-park.mjs park     # one stack only; refuses while any is dirty
gh stack sync
node scripts/stack-park.mjs unpark
```

`park` takes the stack the current branch belongs to, and takes a stack number when standing on
the trunk with more than one recorded. `unpark` refuses in turn if a parked worktree has picked
up changes or commits meanwhile — those sit on a detached HEAD, and restoring over them would
strand them.

## Opening the PRs

Only `gh stack submit --auto` opens drafts; the interactive editor defaults to ready for review.
`--auto` also auto-generates titles, so the real title and description follow with `gh pr edit`.

## Landing

`gh stack merge --yes --squash` squash-merges every layer in one all-or-nothing operation, so
nothing is restacked between merges. Merging the bottom layer alone to release it costs a restack
of every layer above — one more reason independent work does not belong in a stack.
