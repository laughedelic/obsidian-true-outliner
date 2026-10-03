# Independent reviews: what our PRs record, and the reviewer's workspace

A review by a fresh agent, with none of the author's context, has run on most fix PRs since
September. Each session wrote its own brief. Issue #337 carries the evidence from about 20
sessions, drawn from the maintainer's retrospective of about 175, which is private. This note
records what can be read from the repository itself: the review sections of our PRs, and the
measurements of where a reviewer can work. The `independent-review` skill rests on both.

Measured on 2026-10-03 in a cloud session, against `main` at `5b41621`.

## The review sections of our PRs

Pending: the tabulation of the 46 PRs whose description has a review section.

## The reviewer's worktree

Our worktrees live under `.claude/worktrees/<name>/` and find `node_modules` by walking up to the
primary checkout (`scripts/bin-path.ts`). Two side effects of a worktree there, each measured by
adding `git worktree add --detach .claude/worktrees/probe origin/main` and a probe test in its
`.scratch/`:

| Reading | Result |
| --- | --- |
| `git status --porcelain` in the primary checkout | `?? .claude/worktrees/`. `.gitignore` covers neither path |
| `git status --porcelain` in the probe worktree | `?? .scratch/` |
| `npx vitest list` in the primary checkout | 64 test files under `tests/`, the same 64 under `.claude/worktrees/probe/tests/`, and the probe |
| `tsc --noEmit --listFilesOnly` in the primary checkout | no file under `.claude/worktrees/`; `tsconfig.json` includes `src/**` and `tests/**` only |
| Vitest's `configDefaults.exclude` | `**/node_modules/**`, `**/.git/**` |

So while a reviewer's worktree exists, the author's `npm test` runs every unit test twice and
runs the reviewer's probes, and the author's checkout carries an untracked directory, which is
the state #337 reports a cloud session's stop hook acting on. ESLint is run on `src` and `tests`
by name and is unaffected.

A worktree under `/tmp` has no `node_modules` above it, so neither `npx vitest` nor an import of
`fast-check` resolves there.

## The differential sweep

A sweep runs the same generated inputs through the merge base's code and the head's, and counts
where they differ. Two detached worktrees under `.claude/worktrees/`, `review-base` at #264's
parent (`d89279b~1`) and `review-head` at #264 (`d89279b`), and one probe in
`review-head/.scratch/sweep.test.ts` that imports `parse` from `../src/parse` and from
`../../review-base/src/parse` and runs `tests/generators.ts`'s `arbMarkdownText` through both:

| Run | Result |
| --- | --- |
| `npx vitest run .scratch/sweep.test.ts` in `review-head`, 20 000 inputs | 0 trees differ, 1.9 s wall time |
| The same, with `review-base`'s `parse` made to append a line to its input | 20 000 of 20 000 differ |

The imports resolve to the two trees separately, and `fast-check` and the test helpers resolve
through the primary checkout's `node_modules`. The first row also shows how a sweep can mislead:
#264 changed `src/parse.ts`, and a top-level `parse` over `arbMarkdownText` never reaches the
changed path, which runs inside an operation's re-parse. A sweep that finds no difference says
nothing until it has been shown to find one, by a deliberate change on one side as in the second
row, or by inputs that reach the changed lines.

## Not measured

- Whether a cloud session's stop hook reads `.claude/worktrees/` as uncommitted work. #337 reports
  it acting on untracked files under `tests/`; a directory was not tried.
- Whether a local session has a hook that reads either.
- A sweep through an operation (`finalize` and the ops that call it), which is what #264's own
  review ran; the recipe is the same with a different entry point and generator.
