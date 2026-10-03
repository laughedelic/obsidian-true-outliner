## Context

Today's test is `git diff --name-only main...<candidate-base>`: any file in common means stack. It runs
before the new branch exists, so it can only compare file lists. Files shared by two branches are
common in this codebase (`src/ops.ts` is touched by most fixes), and two unrelated fixes there merge
cleanly. For example #274 and #270 share `src/ops.ts` and `src/reencode.ts`, and
`git merge-tree --write-tree` of the two exits 0, measured 2026-10-03 on `origin/fix/empty-heading-level-shift`
against `origin/fix/verbatim-swap-tab-guard`.

## Decisions

**Two conditions replace the file test, and each can be answered.**

1. *The change reads code the other branch adds.* Answered by reading `git diff main...<other>` against
   what the change calls, imports or assumes. This is the case where the change cannot work, or cannot
   be tested, without the other branch, and it is the reading the sessions already stated in their PRs.
2. *`git merge-tree --write-tree HEAD <other>` conflicts.* It exits 1 and lists the conflicted paths.
   This is the mechanical half, and it replaces the file-level proxy for it.

A shared file with disjoint hunks passes both. The PR keeps stating the reading, as now.

**The merge-tree half runs once the change's code exists, before the PR opens, and before the version
bump.** The file test could run before the branch did; a merge cannot. A conflict then moves the branch
onto the other one (`gh stack`, from the primary checkout). The version files are the reason for the
"before the bump" part: every unstacked PR bumps `manifest.json`, `versions.json` and `package.json`
at landing, so two of them always conflict there, and that conflict is the cost of unstacked work that
the rule already accepts.

**A cloud session opens a stacked PR with `create_pull_request` and `base` set to the lower layer's
branch.** `#190` and `#267` are PRs of this shape, read back with REST on 2026-10-03: `#190`'s `base.ref`
is `fix/a-split-run-keeps-its-own-numbers` and it is recorded merged; `#267`'s is `main` now. What the
primary checkout then does with such a PR is the measurement in task 1. Both outcomes are planned for:

| `gh stack init` … | the sentence says |
| --- | --- |
| adopts the PR (the stack lists its number, and `submit` updates it) | as the issue words it: a cloud session opens it with `base` set to the lower branch; registering it with `gh stack`, restacking and landing wait for the primary checkout |
| does not (it lists the layer without the PR, or `submit` opens a second one) | what adoption needs, as measured, and whether a cloud session should open the PR at all or leave the layer for the primary checkout |

The provisional wording in the first row is not written into `AGENTS.md` until the measurement is
recorded.

**The lifecycle line names the subject, in step 5.** "Then squash-merge" becomes the maintainer
squash-merging after the agent has prepared landing. The rule is stated once there; the `steward` skill
already says "Never merge" for the PR-event path and is left as it is.

## Measurement plan (task 1)

It needs the primary checkout, where `gh stack` runs (0.1.1 and newer). It uses two throwaway branches
and two throwaway draft PRs on this repository, closed and deleted afterwards; a scratch repository is
the alternative if the maintainer prefers one. Steps:

1. Record `gh stack init --help` and `gh stack submit --help`, since the adoption flags are not
   documented in `docs/pr-stacks.md`.
2. Push `scratch/stack-lower` (off `main`) and `scratch/stack-upper` (off the lower), one file each.
   Open both PRs with `gh api` as plain PRs: the lower on `main`, the upper with `base` the lower
   branch. This is the call a cloud session makes through `create_pull_request`.
3. `gh stack init` adopting both. Record whether it accepts the branches, and what
   `gh stack view --json` lists: the PR numbers, or none.
4. `gh stack submit --auto`. Record whether it updates the two PRs or opens new ones, and what
   GitHub shows on them afterwards (the PR's own fields and its timeline).
5. Control: the same two branches with no PRs, to separate what `init` records from what adoption adds.
6. Close the PRs, delete the two branches, and remove the stack the control recorded.

Each step's command and output goes into the research note verbatim.

## Risks

- **The measurement shows something the issue did not expect.** The design has the second row of the
  table for that.
- **A merge-tree test run on a stale `<other>`.** The command starts from
  `git fetch origin <other>`, as the existing listing of open PRs implies.
