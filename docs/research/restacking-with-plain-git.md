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

## The recipe in five situations

`docs/pr-stacks.md`'s recipe, run as written in scratch repositories with a bare `origin` and a second
clone standing for another session, on stacks of three layers. Each run ends with the ancestor test
and the one-commit-per-layer count, then the push; the last column is whether the remote then equals
the local layers.

| Situation | Result |
| --- | --- |
| The trunk moves; every local layer present | whole; pushed; remote equals local |
| The trunk moves; a fresh clone holding only the top layer, as a cloud session has | whole; pushed; remote equals local. Without the first loop, `--update-refs` moves only the top layer and the push fails with `src refspec A does not match any` |
| The trunk moves, and another session pushed a commit to the bottom layer; the local layer is stale | whole, with that commit kept in the remote. Without the first loop, the fetch refreshes `origin/A`, the lease passes, and the push drops the other session's commit |
| The trunk moves, and another session pushes to the bottom layer after the fetch, before the push | `stale info`: the bottom layer is refused and `--atomic` pushes none of them; the remote is unchanged |
| Another session restacked the bottom layer and force-pushed it; the layers above sit on its old tip | whole with `--onto` and the old tip from `origin/A@{1}`; pushed |

Two things the runs changed in the recipe:

- **Order.** With the trunk moved and a lower layer gaining a commit at once, `git rebase
  --update-refs origin/main` alone leaves the layer above carrying its own copy of the old lower
  commits and the stack split. Rebasing each layer onto the one below first, bottom first, fixes it.
- **`--force-if-includes`.** Added to the push, it refused all three layers in a fresh clone, right
  after `git checkout -B <layer> origin/<layer>`: `remote ref updated since checkout`. The lease alone,
  with the layers reset to the remote after the fetch, refused the late push of the fourth row, so the
  flag is left out.

## Pushing the moved layers from a cloud session

Measured the same day from a cloud session on this repository, on throwaway branches pushed once,
rewritten locally by the rewritten-lower-layer case above, and pushed again from a checkout of a
third branch (and, the second time, from a detached HEAD), so no pushed layer was the checked-out one:

| Request | Result |
| --- | --- |
| `git push origin scratch/force-push-probe-a scratch/force-push-probe-b` (new branches, two refs) | accepted |
| `git push --force-with-lease origin scratch/force-push-probe-a scratch/force-push-probe-b` | `forced update` on both; the remote heads equal the local ones |
| `git push --atomic origin scratch/atomic-probe-a scratch/atomic-probe-b` (new branches, two refs) | accepted |
| `git push --atomic --force-with-lease origin scratch/atomic-probe-a scratch/atomic-probe-b` after rewriting both | `forced update` on both; the remote heads equal the local ones |
| `git push --force-with-lease origin chore/stacking-and-merge-rules`, the session's own branch after a rebase | `forced update` |

So a cloud session restacks a stack with git and pushes every layer in one atomic command; the push
scope in [`cloud-session-github-access`](cloud-session-github-access.md) does not limit it to the
checked-out branch. The proxy refuses a branch delete, so the throwaway branches stay on the remote until the
maintainer removes them; the first pair was gone when the second was made.

## Not measured

- What GitHub's stack UI shows for a layer whose head was force-pushed.
- Stacks of more than three layers, and a layer whose commits conflict with the new trunk.
