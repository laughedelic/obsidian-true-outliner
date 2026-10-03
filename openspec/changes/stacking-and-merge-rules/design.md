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

**A cloud session creates a stack itself, through the REST stacks API.** `gh stack` cannot run in the
cloud, but its stack operations are REST and the proxy allows them
([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md), "A stacked PR
from a cloud session"). The wording, in the cloud-session paragraph: open each layer's PR with
`create_pull_request`, the upper's `base` the lower layer's branch, then
`POST /repos/{o}/{r}/stacks` with `{"pull_requests":[<bottom>, …, <top>]}` through `gh api`;
restacking and landing wait for the primary checkout, since a restack rewrites layers other sessions
sit on and `docs/pr-stacks.md` runs it there. The recipe itself, with the unstack call, goes in
`docs/pr-stacks.md`, which is where the stack operations are listed. The measurement closed the issue's
question differently from its two expected outcomes: there is no adoption step, because the request
names the PRs.

What the measurement left open stays out of the wording: whether the API checks that the bases chain,
and the PR order it expects, are stated as "as measured: bottom to top, bases chained first".

**The lifecycle line names the subject, in step 5.** "Then squash-merge" becomes the maintainer
squash-merging after the agent has prepared landing. The rule is stated once there; the `steward` skill
already says "Never merge" for the PR-event path and is left as it is.

## Measurement (task 1, done)

Made from the cloud session itself, on #351 and this PR, and recorded in the research note: list,
repoint, `POST /stacks`, the maintainer's look in the UI, `POST /stacks/{n}/unstack`, restore. The
stacks API was found by reading the `gh-stack` release binary, whose PR reads are GraphQL and whose
stack operations are REST. Unmeasured, and listed there: whether the bases must chain, the order the
list is read in, `/stacks/{n}/add`, `gh stack init` adopting a plain PR, and `gh stack link`.

## Risks

- **The API is undocumented.** The routes come from a release binary, not from GitHub's REST reference, so a
  later version can move them. The recipe names the `gh-stack` version it was read from, v0.2.0.
- **A merge-tree test run on a stale `<other>`.** The command starts from
  `git fetch origin <other>`, as the existing listing of open PRs implies.
