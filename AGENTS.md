# Agent instructions

## Branching and PR stacks

Every change gets a branch (`feat/`, `fix/`, `chore/`), usually a worktree, and one PR that
carries both its plan and its implementation.

**Before branching, look for work already in flight** — any open PR whose base is not `main` is
part of a stack:

```bash
gh pr list --state open --json number,headRefName,baseRefName,isDraft
```

**Stack only what depends on the layer below.** A stack encodes a dependency order and charges
for it: every layer above a moved one is rewritten, and each layer bumps the version, so
`manifest.json`, `versions.json` and `package.json` conflict on every restack. Unrelated work
pays that toll for nothing, repeatedly. The test is mechanical, and settles it before the branch
exists:

```bash
git diff --name-only main...<candidate-base>
```

Overlapping files, or code that reads what the other branch adds, means stack it. Otherwise
branch off `main`, where it merges and releases on its own schedule. Prefer short stacks — two or
three layers that are genuinely one unit of work. Offer the reading; let the user decide.

**A session working on a layer owns one branch: commit, push, report.** Stack surgery — adopting,
restacking, parking worktrees, landing a stack — rewrites branches other sessions are sitting on,
so it happens in one place, from the primary checkout: [`docs/pr-stacks.md`](docs/pr-stacks.md).

A layer reported as *diverged from origin by N and M commits* is sitting on commits that a
restack below it replaced. The remote is authoritative there, and merging the layer below "to
update the base" destroys the linear history the stack exists to keep — which survives into
`main`, because the whole stack squash-merges.

```bash
git fetch origin && git reset --hard origin/<branch>   # no unpushed commits
```

With unpushed commits, stop and report rather than merging.

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
already runs that sweep; the local loop does not need to reprove it.

**Iterate in narrow mode, one spec file at a time:**

```bash
npm run test:e2e:narrow -- <spec> [test-name-grep]
```

`<spec>` matches a filename in `e2e/specs/` by substring (an ambiguous one lists every match
instead of guessing), the grep becomes `--mochaOpts.grep`, and `--mobile` runs the
mobile-emulation config. It builds the plugin and snapshots vault drift exactly as a full run
does — launching Obsidian once instead of once per spec file is the whole speedup, so there is
nothing to gain by skipping those steps.

`npm run test:e2e[:mobile]` runs a whole group (`--group <name>`) or the whole suite: a final
check before a checkpoint, not a per-edit loop.

Every run overwrites `.obsidian-cache/e2e-summary.json` with what failed, so finding out costs no
scrolling and no narrower re-run:

```bash
jq '.failures' .obsidian-cache/e2e-summary.json
```

Narrow mode and `run-e2e.mjs` both launch the real desktop app, so an Obsidian window pops on
macOS and Windows. `npm run test:e2e:docker [-- --group <name> | <spec> [grep]]` runs the same
specs headlessly in a Linux container instead (`e2e/docker/`), one container per invocation.
A cloud session needs its VM provisioned before any of this runs:
[`docs/cloud-sessions.md`](docs/cloud-sessions.md).

## Mobile beta builds

Mobile has no vault folder to copy a build into, so a branch reaches a phone as a GitHub
prerelease that BRAT installs. `.github/workflows/beta.yml` publishes one on every push to a
branch other than `main`, and `scripts/beta-cleanup.mjs` drops them again as the branch moves on.
The version is stamped into the built `manifest.json` only; committing it would move the file
that triggers the release workflow.

BRAT tracking "latest" takes the highest prerelease across every branch, so keep one branch at a
time on beta, or pin BRAT to a specific version.

## Conventions

- **Committed prose is team voice** — "we" and "our", never "you", and never session-log phrasing
  ("as we found above"). Applies to specs, proposals, PR descriptions, `docs/`, and comments.
- **Comments explain, never advocate.** No measurements, no restating the code, no arguing for a
  choice already made.
- **No agent attribution trailers** in commit messages or PR descriptions; `.claude/settings.json`
  enforces this for Claude Code wherever a session runs.
- **Deferred ideas go to the parking lots** under `docs/research/`, not into new OpenSpec changes.
- **Read the relevant `docs/research/` notes before touching decorations, selection, or CM6
  extensions.** They exist so a diagnosis is not paid for twice.
- **A research note is named for its subject, with no numeric prefix**, and takes exactly one row
  in `docs/research/index.md` — the file and that row are the whole of adding a note, and
  `npm run lint` checks the two agree. Cite a note by its path (`docs/research/open-questions`
  Q26), never by a number.
- **A setting is one declaration in its feature's slice** under `src/plugin/settings/` — key,
  default, options with their labels, the tab's row — plus the getter/setter pair on the plugin
  that says what a change does, and that pair's row in `WRITERS`. Everything else derives from
  `settings.ts`'s list of slices, which changes when a feature area is added, not when a setting
  is.
- **A feature's e2e helpers live beside its specs**, imported by name — `e2e/footer.ts`,
  `e2e/folding.ts`. `e2e/helpers.ts` keeps what every spec reaches for: the buffer, the caret, the
  pointer, the vault, commands, notices, keys.
- **A feature's CSS goes in its own part under `styles/`**, taking the next filename prefix; the
  root `styles.css` is a build output, so a new feature edits no shared file. Rules the editor and
  the footer share stay in `10-editor.css`, as its comments say.

## Agent files

`.agents/skills/` is the only real copy of the OpenSpec skills; `.claude/skills/` and
`.github/skills/` hold symlinks into it, because neither Claude Code nor Copilot reads
`.agents/` itself. Regenerate with `openspec update`, which rewrites the real tree and leaves the
symlinks alone, rather than editing a skill by hand.

`scripts/agent-setup.sh` is the one list of what an agent session needs — the project's
dependencies, the OpenSpec CLI, the `gh-stack` extension. The `SessionStart` hook in
`.claude/settings.json` runs it and `copilot-setup-steps.yml` runs it with `--install`, so adding
a tool means editing that script and nothing else. It installs only in a throwaway environment
and reports what is missing everywhere else; a cloud environment's own half of the provisioning
is [`docs/cloud-sessions.md`](docs/cloud-sessions.md).

`openspec/config.yaml` carries the project context plus the rules and guidance injected into
OpenSpec's own workflows — put anything OpenSpec can reach there rather than here.
