# Agent instructions

## Showing the user an edit

**Load the `presenting-examples` skill before any message to the user that shows or describes an
edit** — what a keystroke does, a bug, a test case, a proposed behaviour, manual-test steps. In
this project a behaviour is explained by drawing it: the document before, the keystrokes, the
document after, caret included. Reach for a drawn example first, wherever prose alone would leave
the user rebuilding the editor state in their head.

## Branching and PR stacks

Every change gets a branch (`feat/`, `fix/`, `chore/`), usually a worktree, and one PR that
carries both its plan and its implementation.

**A harness-named branch is renamed before its first push.** A cloud session starts on a
`claude/<words>` branch the harness created, under a directive not to push to any other branch
without explicit permission. We grant that permission here: rename the branch to the change's
type and slug — `git branch -m fix/<slug>` — and push that name. The `SessionStart` hook repeats
the grant on such a branch, and a `PreToolUse` hook refuses a push or a PR that would put a
`claude/*` name on the remote (`scripts/agent-conventions.ts`). Once a PR exists the name is
fixed: a rename then is GitHub's, from the PR header or a `gh api` call in the primary checkout,
so the PR follows it — never a git-level push-and-delete, which leaves the PR behind. The cloud
session cannot do either: its proxy refuses branch deletes and renames
(`docs/research/cloud-session-github-access.md`).

**Before branching, look for work already in flight** — any open PR whose base is not `main` is
part of a stack. The REST form works everywhere, a cloud session included, where `gh pr list`
does not:

```bash
gh api 'repos/{owner}/{repo}/pulls?state=open&per_page=100' \
  --jq '.[] | "\(.number)\t\(.head.ref) -> \(.base.ref)\t\(if .draft then "draft" else "ready" end)"'
```

**Stack only what depends on the layer below.** Every layer above a moved one is rewritten, and
each layer bumps the version, so `manifest.json`, `versions.json` and `package.json` conflict on
every restack. Stack when the change reads code the other branch adds, or when merging the two
conflicts; a shared file with disjoint hunks is not a reason.

```bash
git fetch origin <other>
git diff origin/main...origin/<other>             # what the other branch adds: does the change read it?
git merge-tree --write-tree HEAD origin/<other>   # exits 1 and names the paths when the two conflict
```

`git diff --name-only` of the second is the cheap first pass that picks which open branches are worth
the third. The merge needs the change's code, so it runs before the PR opens and before the version
bump, which every unstacked branch makes and which would always conflict. Otherwise stay on `main`,
where the change merges and releases on its own schedule. Prefer short stacks — two or three layers
that are genuinely one unit of work. State the reading in the PR; let the user decide.

**A stack is made through the REST API, from a cloud session or any checkout.** Open each layer's PR
as a draft with `base` set to the lower layer's branch, then register the stack, bottom layer first.
A cloud session's proxy refuses GraphQL, so `gh pr` and `gh repo` fail there; `gh api` and the GitHub
MCP tools do not (`docs/research/cloud-session-github-access.md`).

```bash
echo '{"pull_requests":[<bottom>,<top>]}' | gh api -X POST repos/{owner}/{repo}/stacks --input -
```

Restacking after the trunk or a lower layer moves is git — `git rebase --update-refs` — and one
`git push --force-with-lease` of every layer. The recipes, the check that a stack is still whole, and
extending and dissolving one are in [`docs/pr-stacks.md`](docs/pr-stacks.md). A restack rewrites
branches other sessions are sitting on, so a session working on a layer owns its one branch —
commit, push, report — and moves the others only when asked to restack. The maintainer lands a stack,
from the PR page.

A layer reported as *diverged from origin by N and M commits* is sitting on commits that a
restack below it replaced. The remote is authoritative there: reset to it, and leave moving the
layer itself to the restack in `docs/pr-stacks.md`. Merging the layer below "to update
the base" resolves the divergence and destroys the linear history the stack exists to keep —
which survives into `main`, because the whole stack squash-merges.

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
4. **Review at each ready point** with the `independent-review` skill: the proposal before the
   maintainer reviews it, the implementation at each checkpoint pushed for review. Rounds run until
   one converges (the skill's "Rounds"); then iterate until manual testing passes, its fixes
   reviewed like any other response, and the head to be marked ready gets the last deep review.
5. **Land.** Validate, sync the delta specs, archive the change, and bump the version — all on the
   branch, before merging. Then the maintainer squash-merges: agents prepare landing and never merge
   (`scripts/agent-conventions.ts` refuses it). CI releases from `main` when `manifest.json` moves.
   The `Landed` check holds a ready PR to this: no change it opened left unarchived, each one it
   archived finished and synced, and a `feat` or `fix` that touches `src/` or `styles/` carrying a
   minor or patch bump (`scripts/check-landed.ts`).

`npm version <patch|minor>` rewrites `manifest.json` and `versions.json` and deliberately creates
no tag: the release is cut from the squashed merge commit, which no local tag can name.

## E2E testing

CI is the source of truth for full-suite validation — its matrix runs every group, desktop and
mobile (`.github/workflows/ci.yml`, groups from `scripts/spec-groups.ts`). A pushed checkpoint
already runs that sweep; the local loop does not need to reprove it.

**Iterate in narrow mode, one spec file at a time:**

```bash
npm run test:e2e:narrow -- <spec> [test-name-grep]
```

`<spec>` matches a filename in `e2e-tests/specs/` by substring (an ambiguous one lists every match
instead of guessing), the grep becomes `--mochaOpts.grep`, and `--mobile` runs the
mobile-emulation config. It builds the plugin and snapshots vault drift exactly as a full run
does — launching Obsidian once instead of once per spec file is the whole speedup, so there is
nothing to gain by skipping those steps.

`npm run test:e2e[:mobile]` runs a whole group (`--group <name>`) or the whole suite: a final
check before a checkpoint, not a per-edit loop.

**A bug's repro is a drawn case file first.** Put the drawing in `scripts/layout.ts`'s input with a
keys line and settings (`.agents/skills/presenting-examples/SKILL.md`, "Case files"), and run it in
the real app, desktop and mobile emulation, with `npm run case -- <file> [--mobile] [--record]`.
`--record` prints what the app did as the `expected` column, so a bug's first reply and a fix's
`expected` carry carets that were measured. A failing case prints `before`, `expected` and
`actual` as a drawing. A case that stays lives under `e2e-tests/cases/<capability>/`, the
capability being a directory of `openspec/specs/`, and a spec's `Covered by` line may name it the
way it names a spec title. Every failing e2e case also prints the editor's drawing
(`e2e-tests/drawing.ts`), and `drawEditor()` is there for any spec that wants one.

**A repro of an open bug is committed with its report.** A case file with `known-failing: #<issue>`
and an `actual` column passes while the app still gives that result and fails once it does not
(`.agents/skills/presenting-examples/SKILL.md`, "A case that waits on a fix"). Commit it in the PR
that plans the fix, from its proposal on, or in a `chore` PR of its own when nobody is fixing the
bug yet, and remove the marker in the change that fixes it: once the bug is fixed and the marker is still
there, CI fails the case.
The still-failing cases are listed in each `drawn-cases` job's step summary and under
`knownFailing` in `.obsidian-cache/e2e-summary.json`.

Every run overwrites `.obsidian-cache/e2e-summary.json` with what failed:

```bash
jq '.failures' .obsidian-cache/e2e-summary.json
```

**Every case is also read by the ambient monitors** (`e2e-tests/monitors.ts`): the painted caret,
the scroll, the grid, the height map, layout shift, errors and unexpected notices, installed and
checked from the shared wdio hooks, so no case asks for them. They are report-only. A run leaves
`.obsidian-cache/e2e-monitors.json` beside the summary, CI renders it into each job's step summary,
and `node scripts/e2e-monitors-summary.ts` prints it after a local run. Read what a finding names
before reaching for an exemption: a case that sets up a deliberately odd state calls
`exempt(reason, ...monitors)` from `e2e-tests/monitors.ts`, in its body or its `beforeEach`, and
the reason is required and listed in the report. `E2E_MONITORS=off` skips the hooks for a run that
times something else.

Narrow mode and `run-e2e.ts` both launch the real desktop app, so an Obsidian window pops on
macOS and Windows. `npm run test:e2e:docker [-- --group <name> | <spec> [grep]]` runs the same
specs headlessly in a Linux container instead (`e2e-tests/docker/`), one container per invocation.
A cloud session needs its VM provisioned before any of this runs:
[`docs/cloud-sessions.md`](docs/cloud-sessions.md).

## Looking at the running app

**Load the `driving-obsidian` skill before claiming a visual, caret, focus or scroll fix, and to
reproduce a report before fixing it.** It is for looking; the suite stays the check that a case
keeps passing.

## PR events

**Follow the `steward` skill when a PR event wakes a session**, and before watching a PR: what to act
on, what to ignore, and what never to do unasked. A session arms no check-ins of its own; the
`PreToolUse` hook refuses them (`scripts/agent-conventions.ts`).

## Conventions

- **Committed prose is team voice** — "we" and "our", never "you", and never session-log phrasing
  ("as we found above"). Applies to specs, proposals, PR descriptions, `docs/`, and comments.
- **Comments explain, never advocate.** No measurements, no restating the code, no arguing for a
  choice already made.
- **No agent attribution trailers** in commit messages or PR descriptions; `.claude/settings.json`
  enforces this for Claude Code wherever a session runs. The GitHub MCP tool `create_pull_request`
  appends a `Generated by [Claude Code]` footer regardless of those settings, and so does every
  REST write to a PR body from a cloud session. A body sent through `update_pull_request` is
  stored as given, so that is the rewrite; a `PostToolUse` hook asks for it when the footer is
  there.
- **The label set is the tracker's write surface.** `.github/labels.yml` declares every label and
  the workflow syncs the repository to it, so a label is added there and nowhere else. An issue
  filed by a session carries one `kind/`, one or more `area/`, a `p0`-`p3`, and a `needs/` label
  when the fix is not yet located; the `triage` skill carries the judgement behind
  each axis. A PR's labels are derived from its paths and its title, so a session sets none. The project's fields and Discussions are out of reach from a cloud session
  ([`docs/cloud-sessions.md`](docs/cloud-sessions.md)) — a session that wants either says so
  rather than working around it.
- **A follow-up is an issue, not a parking-lot entry.** When research or a change turns up a defect
  or a gap outside its own scope, file it as a GitHub issue in the same session — with the user's
  go-ahead — and leave a one-line mention and the link where it was found. The issue carries the
  diagnosis, the measurements it rests on and what closing it would involve, and is the copy kept
  current; the note keeps the research those measurements were taken for. Deferred ideas still
  never become new OpenSpec changes. **Validate before filing**: a claim written against code that
  has since moved is a claim about nothing — the sweep that produced
  `docs/research/follow-up-inventory.md` found three of fourteen rows already fixed and one
  disproved by re-measurement. Two things are not issues: a question that does not close by being
  worked on goes to Discussions, and a measurement that is reference rather than work stays in its
  note. The parking lots (`decoration-follow-ups.md`, `selection-follow-ups.md`) are **closed to
  new entries**; what is still live in them moves out as it is touched, and an entry that closes
  keeps its measurements in place rather than pointing at a dead issue.
- **Read the relevant `docs/research/` notes before touching decorations, selection, or CM6
  extensions.** They exist so a diagnosis is not paid for twice.
- **A research note is named for its subject, with no numeric prefix**, and opens with YAML front
  matter in the Open Knowledge Format's shape: `type: research` and a `description` saying what the
  note holds, which stands where the index row did. The file is the whole of adding a note, and
  `npm run lint` checks that every Markdown file directly in `docs/research/` has a block with both. Cite a note by its
  path (`docs/research/open-questions` Q26), never by a number.
- **A setting is one declaration in its feature's slice** under `src/plugin/settings/` — key,
  default, options with their labels, the tab's row — plus the getter/setter pair on the plugin
  that says what a change does, and that pair's row in `WRITERS`. Everything else derives from
  `settings.ts`'s list of slices, which changes when a feature area is added, not when a setting
  is.
- **A feature's e2e helpers live beside its specs**, imported by name — `e2e-tests/footer.ts`,
  `e2e-tests/folding.ts`. `e2e-tests/helpers.ts` keeps only what every spec reaches for.
- **A feature's CSS goes in its own part under `styles/`**, taking the next filename prefix; the
  root `styles.css` is a build output, so a new feature edits no shared file. Rules the editor and
  the footer share stay in `10-editor.css`, as its comments say.
- **A tooling script is TypeScript under `scripts/`**, run by Node's own type stripping
  (`node scripts/<name>.ts`) and checked by `npm run typecheck:scripts`. It lives there because the
  community directory's release scan skips `scripts/`, where a `.ts` file at the root would be
  linted as plugin source.

## Agent files

`.agents/skills/` is the only real copy of the project's skills; `.claude/skills/` and
`.github/skills/` hold symlinks into it, because neither Claude Code nor Copilot reads
`.agents/` itself. A skill of our own is a directory there plus a symlink in each of the other
two. The one exception is `.github/skills/code-review/`, a file of its own: it points Copilot's
code review at the `independent-review` checks, and under `.claude/skills/` it would take the name
of Claude Code's built-in `code-review`; so `independent-review` itself is linked from
`.claude/skills/` only. Regenerate the OpenSpec skills with `openspec update`, which rewrites its own tree and leaves
the symlinks alone, rather than editing one by hand.

`scripts/agent-setup.sh` is the one list of what an agent session needs — the project's
dependencies, the OpenSpec CLI and the GitHub CLI. The `SessionStart`
hook in `.claude/settings.json` runs it and `copilot-setup-steps.yml` runs it with `--install`,
so adding a tool means editing that script and nothing else. It installs only in a throwaway
environment and reports what is missing everywhere else; a cloud environment's own half of the
provisioning is [`docs/cloud-sessions.md`](docs/cloud-sessions.md).

`scripts/agent-conventions.ts` is the other hook script: the branch-name grant at session start,
the refusal of a push or PR on a `claude/*` head, the refusal of a merge or auto-merge, and the
PR-footer check. Copilot reads neither,
and whether its coding agent can rename its own `copilot/*` branch is unmeasured; such a branch is
renamed at landing, from the PR header.

`openspec/config.yaml` carries the project context plus the rules and guidance injected into
OpenSpec's own workflows — put anything OpenSpec can reach there rather than here.
