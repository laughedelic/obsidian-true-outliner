---
type: "research"
description: "Moving a stack of PRs with git alone, without the `gh stack` extension: `rebase --update-refs` for a moved trunk, `--onto` with the old tip for a rewritten lower layer, the worktree case that splits a stack silently, the restack recipe run in five situations (a fresh clone, a stale local layer, a late push by another session, a rewritten layer), and pushing the moved layers atomically from a cloud session"
---

# Restacking with plain git

Whether a stack of PRs can be moved with git alone, without the `gh stack` extension, and where it
breaks. Measured on 2026-10-03 with git 2.43.0 in throwaway repositories of four branches (`main` and
layers `A`, `B`, `C` stacked in that order, one commit each), so the figures are about git's
behaviour and not about GitHub. Each row ends with the same check, run on the result: for every
adjacent pair, whether the lower is an ancestor of the upper, and how many commits each layer holds
above the one below (one each is a clean stack).

## What each case does

| Case | Command | Result |
| --- | --- | --- |
| The trunk moves | on `C`: `git rebase --update-refs main` | one command moves all three; reports `A` and `B` as updated; every pair is ancestor and above, one commit per layer |
| A lower layer gains a commit | on `C`: `git rebase --update-refs A` | `B` and `C` move onto it; clean, one commit per layer above the lower |
| A lower layer is rewritten (amended) | bottom-up, `git rebase --onto <lower> <its old tip> <layer>` with the old tip read before the rewrite | clean, one commit per layer |
| The same case, as `git rebase --update-refs A` | on `C` | `CONFLICT (add/add)`: `B` replays the old `A` commit on top of its amended copy; the pair is not an ancestor and `B` holds two commits |
| A lower layer is checked out in another worktree, the trunk moves | on `C`: `git rebase --update-refs main` | reports success and `B` updated; `A` is skipped and left on the old trunk, so `A` is not an ancestor of `B` and `B` holds three commits above `A`: the stack is split, with no error |

## What follows

- A trunk move or a lower layer's added commit is one command from the top layer, and the result is
  checked with the ancestor test above.
- A rewritten lower layer needs `--onto` and its old tip, recorded before the rewrite, bottom layer
  first. `--update-refs` replays the old commit and conflicts.
- The restack must run in a checkout where no layer is checked out elsewhere. `--update-refs` skips
  such a layer and says nothing, which is the hazard `gh stack` reported as
  `fatal: '<branch>' is already used by worktree` and `docs/pr-stacks.md` worked around with
  `scripts/stack-park.ts`. A cloud session and a fresh clone have one worktree and no such layer.

## Not measured

- Pushing the moved layers: `git push --force-with-lease` of several branches at once, from a cloud
  session. A cloud session's proxy scopes pushes
  ([`cloud-session-github-access`](cloud-session-github-access.md), "What the session proxy
  allows"), and force-pushing a layer other than the session's own branch has not been tried.
- What GitHub's stack UI shows for a layer whose head was force-pushed.
- Stacks of more than three layers, and a layer whose commits conflict with the new trunk.
