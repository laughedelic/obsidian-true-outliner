## Why

Three instructions in `AGENTS.md` (`CLAUDE.md` is a symlink to it) produced work that had to be argued
away or undone over the September sessions (#339, a sub-issue of #334):

- **The stacking test is read at the wrong granularity.** It says "overlapping files … means stack
  it". Of 13 unstacked fix PRs opened 09-20..28, 11 shared a file with a stacked or open PR and were
  branched off `main` anyway, each on a function- or hunk-level reading, and the maintainer accepted
  every one (#274 says so in its description). Several runs also ran `git merge-tree` against each
  open PR to show the merge is clean. Two open PRs today share `src/ops.ts` and `src/reencode.ts`
  (#274 and #270) and merge cleanly
  ([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md), "A stacked
  PR from a cloud session").
- **"Opening a stacked PR … wait[s] for the primary checkout" was read as "a cloud session cannot open
  a stacked PR".** Three Bugfix runs skipped the only p1 (#136) on that reading, "for the third run in
  a row". Yet #190 (base `fix/a-split-run-keeps-its-own-numbers`) and #267 (base
  `fix/promoted-paragraph-seam`) were opened from cloud sessions through the GitHub tools. The
  requirement belongs to `gh stack`, which takes a lock and keeps state in the shared git directory
  ([`docs/pr-stacks.md`](../../../docs/pr-stacks.md)).
- **Who merges is unwritten.** The maintainer has said it in two sessions ("never merge PRs unless I
  asked explicitly", 09-17; "never merge yourself. prepare for landing and leave it for me to merge",
  09-26). The lifecycle says "Then squash-merge" without a subject. The `steward` skill already says
  "Never merge", but only a session woken by a PR event reads it.

## What Changes

- **The stacking test** in "Branching and PR stacks": stack when the change reads code the other
  branch adds, or when `git merge-tree` against it conflicts; a shared file with disjoint hunks is not
  a reason. The PR still states the reading. The file list stays as the cheap first pass that picks
  which branches to merge.
- **The REST stacks API in place of `gh stack` for creating, extending and dissolving a stack**, in
  "Branching and PR stacks" and `docs/pr-stacks.md`, for cloud sessions and the primary checkout alike:
  open each layer's PR with its base on the lower layer's branch, then `POST /repos/{o}/{r}/stacks`
  through `gh api`. `gh stack` stays for `checkout`, `rebase`, `sync` and `merge`, which work on local
  git state, and restacking stays in the primary checkout. The measurement is recorded
  ([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md), "A stacked
  PR from a cloud session"): the stacks API is REST, and a stack of two open PRs was created from a
  cloud session, seen in the UI and unstacked again.
- **One line in "Change lifecycle", step 5**: agents prepare landing and never merge; the maintainer
  merges.
- **A hook that enforces it.** `scripts/agent-conventions.ts` refuses `merge_pull_request` and
  `enable_pr_auto_merge` from the GitHub MCP server, and in `Bash` `gh pr merge`, `gh stack merge` and
  `gh api` to a merge or auto-merge path. The `PreToolUse` matcher already reaches all of them.
- **The same statements wherever they repeat**: `docs/pr-stacks.md`, `docs/cloud-sessions.md`, and the
  sentence in `docs/research/cloud-session-github-access.md` that gives a cloud session "the layer's
  own work only".
- **A measured section** in `docs/research/cloud-session-github-access.md`: the stacks API from a
  cloud session, with what is still unmeasured.

## Non-goals

- **Making `gh stack` run from a cloud session.** The proxy refuses its GraphQL whatever the
  environment sets
  ([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md), "`gh stack`
  from the cloud").
- **Replacing `gh stack checkout`, `rebase`, `sync` and `merge`.** They work on local git state and the
  restack is the primary checkout's work; REST has no counterpart.
- **A skill for the stack calls.** The recipe is four calls in `docs/pr-stacks.md`.
- **A direct push to `main`.** That is branch protection's, not this hook's. Nor does the hook refuse
  `update_pull_request_branch`, which updates a PR's branch and merges nothing.
- **Re-deciding "prefer short stacks"** or who chooses to stack: the session offers its reading, the
  maintainer decides, as now.
- **The other `AGENTS.md` edits** in #334's sub-issues (#335, #340): whichever of the three lands
  second rebases.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change touches how agents work in this repository and no behaviour of the plugin, and
declares `skip_specs: true`.

## Impact

- `AGENTS.md`: the stacking test, the stack paragraphs, one lifecycle line, and the sentence describing
  `scripts/agent-conventions.ts`.
- `scripts/agent-conventions.ts`: the merge rule and its header comment.
- `docs/pr-stacks.md`, `docs/cloud-sessions.md`: the repeated statements.
- `docs/research/cloud-session-github-access.md`: the measurement, and one reworded sentence.
- No `src/` or `styles/` change, so no version bump.
