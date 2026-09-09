# Agent instructions

## Branching and PR stacks

Every change gets a branch (`feat/`, `fix/`, `chore/`), usually a worktree, and one PR that
carries both its plan and its implementation.

**Before branching, look for work already in flight.** Any open PR whose base is not `main` is
part of a stack.

```bash
gh pr list --state open --json number,headRefName,baseRefName,isDraft
```

**Stack only what depends on the layer below.** A stack encodes a dependency order, and it
charges for that order: every layer above a moved one is rewritten, and the bottom layer cannot
merge and release without a restack of everything on top. Unrelated work pays that toll for
nothing, and pays it repeatedly — each layer bumps the version, so `manifest.json`,
`versions.json` and `package.json` conflict on every single restack. The test is mechanical,
and settles it before the branch exists:

```bash
git diff --name-only main...<candidate-base>
```

Overlapping files, or code that reads what the other branch adds, means stack it. Otherwise
branch off `main`, where it merges and releases on its own schedule. Prefer short stacks — two
or three layers that are genuinely one unit of work. Offer the reading; let the user decide.

Stacks are GitHub's native stacked PRs, driven by the `gh stack` extension
(`gh extension install github/gh-stack`). A stacked PR targets the branch below it instead of
`main`, and GitHub retargets it when its parent merges — so the base is set once and never
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

**A session working on a layer runs none of these.** It owns one branch: commit, push, report.
Stack surgery happens in one place, from the primary checkout, because these commands rewrite
branches other sessions are sitting on and take a lock in the shared git directory.

**Never merge another branch into a layer.** After a restack below it, a layer sits on commits
that no longer exist and git reports it as *diverged from origin by N and M commits*. Merging
the layer below "to update the base" resolves that and destroys the linear history the stack
exists to keep — it also survives into `main`, because the whole stack squash-merges. The
remote is authoritative there:

```bash
git fetch origin && git reset --hard origin/<branch>   # no unpushed commits
```

With unpushed commits, stop and report rather than merging. Rebase a layer with
`gh stack rebase`, never plain `git rebase`: rebasing one layer by hand leaves every layer
above it on commits that no longer exist — `gh stack view` reports a branch needing one.

**Worktrees hold branches hostage.** Git refuses to check out or rebase a branch that another
worktree has checked out (`fatal: '<branch>' is already used by worktree at …`), which is every
`gh stack` command that moves HEAD — `rebase`, `sync`, `switch`, `up`, `down`, `checkout`.
`gh stack init` is the exception: it only records the topology, so a stack can be adopted with
every layer live in its own worktree, and nothing needs setting up before sessions start.
Detach the other worktrees around the restack instead:

```bash
node scripts/stack-park.mjs park     # one stack only; refuses while any is dirty
gh stack sync
node scripts/stack-park.mjs unpark
```

It parks the stack the current branch belongs to, and takes a stack number when
standing on the trunk with more than one recorded. `unpark` refuses in turn if a
parked worktree has picked up changes or commits meanwhile — those sit on a
detached HEAD, and restoring over them would strand them.

**Land a stack whole.** `gh stack merge --yes --squash` squash-merges every layer in one
all-or-nothing operation, so nothing is restacked between merges. Merging the bottom layer
alone to release it is what a stack of independent work forces, and it costs a restack of every
layer above — one more reason such work does not belong in a stack.

Only `gh stack submit --auto` opens drafts; its interactive editor defaults to ready for review.
`--auto` also auto-generates titles, so write the real title and description afterwards with
`gh pr edit`.

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

## E2E testing

CI is the source of truth for full-suite validation — its matrix runs every group, desktop and
mobile (`.github/workflows/ci.yml`, groups from `scripts/spec-groups.mjs`). A pushed checkpoint
already runs the full sweep there; the local loop does not need to reprove that before every
push.

**Default to narrow mode while iterating on one test:**

```bash
npm run test:e2e:narrow -- <spec> [test-name-grep]
# e.g.
npm run test:e2e:narrow -- 77-footer-controls "renders the footer"
```

`<spec>` matches a filename in `e2e/specs/` by substring (an ambiguous one lists every match
instead of guessing); the grep becomes `--mochaOpts.grep`. This still builds the plugin,
regenerates the backlink hub, and snapshots/restores vault drift like `run-e2e.mjs` does —
measured at under half a second combined, so skipping them buys nothing. What actually made the
whole-group loop slow was Obsidian launching once per spec FILE (up to ten in a group); targeting
one file directly is the entire speedup, taking an iteration from minutes to ~10-30s. `--mobile`
runs it under the mobile-emulation config.

`npm run test:e2e[:mobile]` (`run-e2e.mjs`) still exists for a whole group (`--group <name>`) or
the whole suite — reserve it for a final check before a checkpoint, not per-edit iteration.
Outside CI, it prints a one-line reminder toward narrow mode whenever more than a couple of spec
files are in scope — not a block, just a nudge at the moment the slow path is actually taken.

**Every run — narrow, grouped, or full, desktop or mobile — writes
`.obsidian-cache/e2e-summary.json`**, a small file naming what failed without needing to scroll
past a whole group's stdout or re-run narrower to find out:

```bash
cat .obsidian-cache/e2e-summary.json | jq '.failures'
```

It carries `{ specs, passed, failed, skipped, failures: [{ spec, suite, test, error, stack,
durationMs }] }` and is overwritten (not appended) at the start of each invocation.

**The Obsidian window still pops on macOS/Windows** — narrow mode and `run-e2e.mjs` both launch
the real desktop app. To run headlessly instead (nothing appears on the host, whatever OS it is):

```bash
npm run test:e2e:docker [-- --group <name> | <spec> [grep]]
```

This runs inside a Linux container under Xvfb (`e2e/docker/`) — one container per invocation,
covering however many specs are in scope (the whole suite by default, or one group), never one
container per file. `E2E_MAX_INSTANCES` defaults to 2 there (override via env) since the
container shares the Docker Desktop/OrbStack VM's CPU with the rest of the host, unlike a
dedicated CI runner. It deliberately does not fan out multiple containers to race CI's
per-group matrix — CI already gives that; this path exists for a headless run, not a faster one.

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
