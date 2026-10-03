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
2. *The merge conflicts in a path this change touches.* `git merge-tree --write-tree --name-only HEAD
   <other>` lists the conflicted paths, and only those in the change's own diff count. The bare exit code
   is not the test: against the open branches it read "conflict" for half of them because `main` had
   moved, none in a path the change touches (the research note's measurement and its control). This is
   the mechanical half, and it replaces the file-level proxy for it.

A shared file with disjoint hunks passes both. The PR keeps stating the reading, as now.

**The merge-tree half runs once the change's code exists, before the PR opens, and before the version
bump; the file list stays as the prefilter that picks which branches to merge.** The file test could run
before the branch did; a merge cannot. What it costs: the answer is a snapshot of the other branch,
which can move after the check; a conflict found late means moving the new commits onto the other
branch, not the work done twice; and a merge needs each other open head fetched, so the old
`git diff --name-only main...<other>` is kept as the cheap first pass that names the few heads worth
a `merge-tree`. A conflict puts the branch onto the other one, with the git restack below.
The version files are the reason for "before the bump": every unstacked PR bumps `manifest.json`,
`versions.json` and `package.json` at landing, so two of them always conflict there, and that conflict
is the cost of unstacked work that the rule already accepts.

**The REST stacks API replaces `gh stack` for creating, extending and dissolving a stack.**
`gh stack` cannot run in the cloud, but its stack operations are REST and the proxy allows them
([`cloud-session-github-access`](../../../../docs/research/cloud-session-github-access.md), "A stacked PR
from a cloud session"). The same calls work from any checkout, so one recipe serves the cloud and the
primary checkout:

| To | Call |
| --- | --- |
| open a layer | `create_pull_request` or `gh api`, the upper's `base` the lower layer's branch, as a draft |
| see stacks | `GET /repos/{o}/{r}/stacks`, each with its PRs bottom first |
| create one | `POST /repos/{o}/{r}/stacks`, `{"pull_requests":[<bottom>, …, <top>]}` |
| extend one | `POST /repos/{o}/{r}/stacks/{n}/add` (not measured) |
| dissolve one | `POST /repos/{o}/{r}/stacks/{n}/unstack` |

**Plain git replaces `gh stack rebase`, `sync` and `checkout`, and `scripts/stack-park.ts` goes.** The
maintainer works almost entirely from cloud sessions, so the local tooling is carried for a workflow
that is rarely run, and `gh stack`'s local tracking state is the only reason `docs/pr-stacks.md`
forbids plain `git rebase`. With no tracking, the restack is git
([`restacking-with-plain-git`](../../../../docs/research/restacking-with-plain-git.md)), in three steps
that the first review round shaped: every layer reset to its remote after the fetch (a fresh clone has
no lower layers, and a stale one would push over another session's commits), each layer rebased onto
the one below, bottom first, and `git rebase --update-refs origin/main` from the top. A lower layer
that was rewritten takes `--onto` and its old tip in place of the second step: `origin/<lower>@{1}`
for a layer another session rewrote, and the unmoved `origin/<lower>` for the layers above it. The result is checked with the ancestor test, the bottom pair against `origin/main`, and
pushed with `git push --atomic --force-with-lease`: the lease refuses a layer pushed to since the fetch
and `--atomic` then pushes none, so a stack is never left split. `--force-if-includes` is out: it
refused the push straight after the reset. The worktree hazard that `stack-park.ts` worked around is
stated once, as a condition of the restack: no layer checked out elsewhere, which a cloud session and
a fresh clone satisfy. Landing is the maintainer's, from the PR page; there is no merge recipe, since
agents do not merge. A cloud session pushes every moved layer in one atomic push, measured on
throwaway branches, so a restack needs no primary checkout; the session that runs it is the one the
maintainer asks, or the session that owns the layer that moved. No skill: the recipe is in
`docs/pr-stacks.md`, and `AGENTS.md` carries one paragraph pointing to it.

**The lifecycle line names the subject, in step 5.** "Then squash-merge" becomes the maintainer
squash-merging after the agent has prepared landing.

**An agent never merges, and a narrow hook backs the instruction.** The rule is a sentence in
`AGENTS.md`, "Change lifecycle", step 5: an agent prepares landing, reports and stops, by any route.
`scripts/agent-conventions.ts` already dispatches `PreToolUse` on `Bash|mcp__github__.*|…`, so a guard
joins it with no matcher change. It sees the direct forms only:

- the MCP tools `mcp__github__merge_pull_request` and `mcp__github__enable_pr_auto_merge`;
- in `Bash`, a simple command that holds a `gh` word (by base name, any of them, so `env`, `xargs`,
  `sudo` and the like need no list of their options) and then either `pr merge` or
  `stack merge` as the first two words that are not flags, with any flags, or `api` with a word that is
  a merge route (`repos/…/pulls/<n>/merge` or `…/ccr/auto_merge`, the number a variable or digits, a
  query string allowed) and a write; a read, and the DELETE that turns auto-merge off, pass.

The rule is unconditional. The hook cannot tell a merge the maintainer asked for from one the session
chose, as it can for `send_later` through `initiation`, and the maintainer's own line is "prepare for
landing and leave it for me to merge" (#339), so the maintainer merges from the PR page.

**The hook stays narrow, by choice.** Three review rounds found shapes it does not see, and the rule
patched itself across the first two. Parsing a shell to close them is out of proportion to a guard
behind a sentence; the step-back was answered with the narrow rule, and what the hook does not see is
one list, in the hook's comment, `design.md` and the research note: `curl` and GraphQL mutations; a
command inside `bash -c`, `eval`, backticks or `$(…)`; a variable or a script written first or piped to
a shell; a `gh` alias; a function or a `case` arm that builds the command from its arguments; a subshell
that opens the command (`(gh pr merge 1)`); and a `<<` the shell does not read as a here-document
(arithmetic, a partly quoted delimiter) followed by a line equal to its word. It also refuses what it
cannot tell apart: `gh pr merge --help`, an unquoted `echo gh pr merge`, `-X=GET` (which `gh` reads as
GET) and a field whose value ends in a full merge-route URL.

The lexer both rules share ends a command at a newline, ends a comment at its line (so an
apostrophe or a trailing backslash in one hides nothing) and ignores a line continuation, as the shell
does. It skips a here-document's body only when a delimiter line follows, so `1<<2` in arithmetic and
an unterminated here-document are read as commands, the cautious side for a rule that refuses; a
here-string's `<<<` matches no delimiter and opens no body. The decisions are
`tests/agent-conventions.test.ts`, run against mutated copies of the script for the negative controls.

## Measurement (task 1, done)

Made from the cloud session itself, on #351 and this PR, and recorded in the research note: list,
repoint, `POST /stacks`, the maintainer's look in the UI, `POST /stacks/{n}/unstack`, restore. The
stacks API was found by reading the `gh-stack` release binary, whose PR reads are GraphQL and whose
stack operations are REST. Unmeasured, and listed there: whether the bases must chain, the order the
list is read in, `/stacks/{n}/add`, `gh stack init` adopting a plain PR, and `gh stack link`.

## Risks

- **The API is undocumented.** The routes come from a release binary, not from GitHub's REST reference, so a
  later version can move them. The recipe names the `gh-stack` version it was read from, v0.2.0.
- **A restack by hand skips a step.** The ancestor test after it is the guard, and the one case that
  fails silently, a layer checked out elsewhere, is a stated condition. A script would carry both; none is
  planned until a restack is run often enough to want one.
- **A merge-tree test run on a stale `<other>`.** The command starts from
  `git fetch origin <other>`, as the existing listing of open PRs implies.
- **The merge rule refuses a merge the maintainer wanted a session to make.** Then the maintainer merges
  it; the cost is a click, and the alternative is a rule the hook cannot check.
- **A merge path the rule does not name.** A direct push to `main` lands a change without a PR; that is
  branch protection's job, not this hook's, and is a non-goal.
