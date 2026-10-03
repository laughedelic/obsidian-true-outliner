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
bump; the file list stays as the prefilter that picks which branches to merge.** The file test could run
before the branch did; a merge cannot. What it costs: the answer is a snapshot of the other branch,
which can move after the check; a conflict found late means moving the new commits onto the other
branch, not the work done twice; and a merge needs each other open head fetched, so the old
`git diff --name-only main...<other>` is kept as the cheap first pass that names the few heads worth
a `merge-tree`. A conflict puts the branch onto the other one (`gh stack`, from the primary checkout).
The version files are the reason for "before the bump": every unstacked PR bumps `manifest.json`,
`versions.json` and `package.json` at landing, so two of them always conflict there, and that conflict
is the cost of unstacked work that the rule already accepts.

**The REST stacks API is the way to create, extend and dissolve a stack, locally and in the cloud.**
`gh stack` cannot run in the cloud, but its stack operations are REST and the proxy allows them
([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md), "A stacked PR
from a cloud session"). The same calls work from the primary checkout, since the extension makes them
too, so one recipe replaces the `gh stack init`, `add` and `submit` rows and the sentence about
cloud sessions:

| To | Call |
| --- | --- |
| open a layer | `create_pull_request` or `gh api`, the upper's `base` the lower layer's branch, as a draft |
| see stacks | `GET /repos/{o}/{r}/stacks`, each with its PRs bottom first |
| create one | `POST /repos/{o}/{r}/stacks`, `{"pull_requests":[<bottom>, …, <top>]}` |
| extend one | `POST /repos/{o}/{r}/stacks/{n}/add` (not measured) |
| dissolve one | `POST /repos/{o}/{r}/stacks/{n}/unstack` |

`gh stack` stays for what REST does not do: `checkout`, `rebase`, `sync` and `merge` work on local git
state, which `scripts/stack-park.ts` also reads, and a restack rewrites layers other sessions sit on,
so it stays in the primary checkout. `docs/pr-stacks.md` splits its table in two on that line. No
skill: the recipe is four calls, kept where the stack operations are already listed, and `AGENTS.md`
carries one paragraph pointing to it. Unmeasured, and stated as such in the recipe: whether the API
checks that the bases chain, the order it expects (bottom to top as measured), and whether
`gh stack checkout` takes up a stack that was created by hand.

**The lifecycle line names the subject, in step 5.** "Then squash-merge" becomes the maintainer
squash-merging after the agent has prepared landing.

**A hook refuses an agent's merge.** `scripts/agent-conventions.ts` already dispatches `PreToolUse`
on `Bash|mcp__github__.*|…`, so the rule joins it with no matcher change. It refuses:

- the MCP tools `mcp__github__merge_pull_request` and `mcp__github__enable_pr_auto_merge`, since
  auto-merge is a merge the platform makes later;
- in `Bash`, by the same shell lexer the push rule uses: `gh pr merge`, `gh stack merge`, and `gh api`
  to a `…/pulls/{n}/merge` or `…/auto_merge` path, the CCR auto-merge route included.

The rule is unconditional. The hook cannot tell a merge the maintainer asked for from one the session
chose, as it can for `send_later` through `initiation`, and the maintainer's own line is "prepare for
landing and leave it for me to merge" (#339), so the maintainer merges from the PR page. The refusal
names the rule and says what to do: prepare landing, report, stop. Like the push rule it does not
expand `$(…)`, so a merge assembled inside one passes; that is a session working against its own hook.

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
- **The merge rule refuses a merge the maintainer wanted a session to make.** Then the maintainer merges
  it; the cost is a click, and the alternative is a rule the hook cannot check.
- **A merge path the rule does not name.** A direct push to `main` lands a change without a PR; that is
  branch protection's job, not this hook's, and is a non-goal.
