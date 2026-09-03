# Agent instructions

## Branching and PR stacks

Every change gets a branch (`feat/`, `fix/`, `chore/`), usually a worktree, and one PR that
carries both its plan and its implementation.

**Before branching, look for work already in flight.** Any open PR whose base is not `main` is
part of a stack, and new work usually belongs on top of that stack rather than off `main` — it
keeps changes from conflicting and lands them in a predictable order. Offer that; let the user
decide.

```bash
gh pr list --state open --author "@me" --json number,headRefName,baseRefName,isDraft
```

Stacks are GitHub's native stacked PRs, driven by the `gh stack` extension
(`gh extension install github/gh-stack`). A stacked PR targets the branch below it instead of
`main`, and GitHub retargets it when its parent merges — so the base is set once and never
maintained by hand.

| | |
| --- | --- |
| `gh stack view --json` | the current branch's stack, if it is in one |
| `gh stack checkout <pr>` | fetch an existing stack and switch into it |
| `gh stack init <branch>` | start a stack off the trunk |
| `gh stack add <branch>` | add a layer on top of the current stack |
| `gh stack submit` | push every layer, open or update its PRs (new ones are drafts) |
| `gh stack rebase` | cascading rebase after the trunk or a lower layer moves |
| `gh stack merge` | atomic merge of the stack up to a chosen PR |

Rebase a stacked branch with `gh stack rebase`, never plain `git rebase`: rebasing one layer by
hand leaves every layer above it on commits that no longer exist. `gh stack view` reports a
branch that needs one.

## Change lifecycle

Planning and implementation share one PR, in this order:

1. **Explore, then propose.** Even a pure proposal starts with measurement — ground the design in
   figures recorded under `docs/research/`, not in reasoning about what ought to be true.
2. **Open the draft PR** as soon as the proposal is written, describing the intended
   implementation rather than only the proposal. Review it on GitHub before writing any code.
3. **Apply.** Implement against `tasks.md`, committing checkpoints as each group closes; pushing a
   checkpoint is what runs the full e2e sweep in CI.
4. **Review at each ready point**, address the findings, and iterate until manual testing passes.
5. **Land.** Validate, sync the delta specs, archive the change, and bump the version — all on the
   branch, before merging. Then squash-merge; CI releases from `main` when `manifest.json` moves.

`npm version <patch|minor>` rewrites `manifest.json` and `versions.json` and deliberately creates
no tag: the release is cut from the squashed merge commit, which no local tag can name.

## Conventions

- **Committed prose is team voice** — "we" and "our", never "you", and never session-log phrasing
  ("as we found above"). Applies to specs, proposals, PR descriptions, `docs/`, and comments.
- **Comments explain, never advocate.** No measurements, no restating the code, no arguing for a
  choice already made.
- **No agent attribution trailers** in commit messages or PR descriptions.
- **Deferred ideas go to the parking lots** under `docs/research/`, not into new OpenSpec changes.
- **Read the relevant `docs/research/` notes before touching decorations, selection, or CM6
  extensions.** They exist so a diagnosis is not paid for twice.

## Agent files

`.agents/skills/` is the only real copy of the OpenSpec skills; `.claude/skills/` and
`.github/skills/` hold symlinks into it, because neither Claude Code nor Copilot reads
`.agents/` itself. All three are tracked, so a fresh clone — a Copilot cloud run included —
has them. Regenerate with `openspec update`, which rewrites the real tree and leaves the
symlinks alone; never edit a skill by hand. The generated slash-command files under
`.claude/commands/` and `.github/prompts/` are gitignored.

`openspec/config.yaml` carries the project context plus the rules and guidance injected into
OpenSpec's own workflows — put anything OpenSpec can reach there rather than here.
