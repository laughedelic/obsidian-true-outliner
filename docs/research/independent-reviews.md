# Independent reviews: what our PRs record, and the reviewer's workspace

A review by a fresh agent, with none of the author's context, has run on most fix PRs since
September. Each session wrote its own brief. Issue #337 carries the evidence from about 20
sessions, drawn from the maintainer's retrospective of about 175, which is private. This note
records what can be read from the repository itself: the review sections of our PRs, and the
measurements of where a reviewer can work. The `independent-review` skill rests on both.

Measured on 2026-10-03 in a cloud session, against `main` at `5b41621`.

## The review sections of our PRs

Of the repository's 198 PRs, 46 have a description with a heading that names a review. In 20 of
them the heading is a note to the reviewer and reports nothing, and #164 records its three review
rounds in `heading-level-markers.md` rather than in its description. The other 25 report 216 findings,
201 of them one by one; #64 ("a review found seven defects") and #300 ("fixed here or kept as
documented limits") give counts without a line per finding. Each finding was sorted by the review
that produced it, by kind, and by what the PR says was done with it: taken, rejected, filed or
left out of scope, recorded only, or left open.

| Review | Findings | Taken | Rejected | Filed or out of scope | Recorded or open |
| --- | --- | --- | --- | --- | --- |
| Plan or proposal | 55 | 42 | 8 | 4 | 1 |
| Implementation | 120 | 89 | 15 | 7 | 9 |
| Copilot | 15 | 15 | 0 | 0 | 0 |
| Unattributed (a sweep, "review rounds") | 26 | 19 | 1 | 5 | 1 |

| Kind | Plan | Implementation | Copilot | Unattributed |
| --- | --- | --- | --- | --- |
| A test that could not fail, missed a stated behaviour, survived a mutation or passed by timing | 6 | 22 | 4 | 4 |
| The change or a spec contradicts a spec, or the fix type was wrong | 6 | 22 | 1 | 1 |
| A concrete failing input, or a "latent" case shown reachable | 6 | 10 | 4 | 9 |
| A defect in the change's own code or design, without a failing input | 5 | 17 | 1 | 3 |
| A pre-existing defect found in passing | 3 | 11 | 0 | 5 |
| A claim in the plan, the PR or a note that was false | 6 | 7 | 2 | 2 |
| A different mechanism or scope proposed | 15 | 8 | 0 | 1 |
| Worse than `main` | 2 | 6 | 2 | 0 |
| Wording, cleanup, landing steps, cost | 6 | 17 | 1 | 1 |

- **Rejections** are mostly of requests for more: of 24, 7 asked for more tests, 6 for a spec delta
  or another fix type, and 5 for a different mechanism. Each rejection in #264 and #269 cites the
  spec sentence or the measurement it rests on.
- **Re-reviews.** Nine PRs say whether a further round ran, and why. #264, #269 and #270 ran one
  because the first round's fixes changed a rule or the delta's shape; #245, #246, #247 and #274
  did not, because the later edits were local to code a reviewer had read.
- **Reviews that reversed each other**, in five PRs. #274: the plan review narrowed the fix and the
  implementation review widened it again. #273: two reviews asked for a spec delta and the third
  found drift defensible, left open. #270: the fix type went from drift to gap to conflict across
  three reviews. #269: gap to conflict, then "partly a fact-extraction defect". #251: a drag
  exception added at a plan review and dropped with the drag scope.
- **Reviewer findings later shown wrong**, in four PRs, each by a measurement in the app: #122's
  frontmatter report (identical on `main`, and Obsidian's metadata cache reads the note the same
  way), #256's "rewrites are still renumbered", #273's typing claim made "from bare CM6", and
  #280's alternative (46 of 9 471 runs lost the document's unit).
- **Measured findings.** Seven PRs report a reviewer's sweep or probe with counts, among them #246
  (a gesture sweep over about 600k operation results), #247 (2 failures in 3M generated runs) and
  #264 (236 734 operations, with `main`'s losses beside the branch's). #245's, #273's and
  #274's reviewers argued from reading, and the session measured afterwards.
- **Briefing problems named in a PR.** #211: the first probe loaded the root's mocha 12 rather
  than the mocha 10.8.2 the e2e runs, a wrong baseline. #273: two reviews reasoned from bare
  CodeMirror where the app behaves differently. No review section mentions scratch files or a
  hook; #337 reports those from the session transcripts.
- **Copilot** reviewed 16 of the 20 PRs whose review heading reports nothing, and reviews of 7 PRs
  hold Copilot comments their descriptions do not mention. Every Copilot finding a description
  does report was taken.

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
runs the reviewer's probes, and the author's checkout carries an untracked directory. A cloud
session's stop hook acts on it: with the first proposal review of #351 running in
`.claude/worktrees/review-337-head`, the author's turn ended on "There are untracked files in the
repository. Please commit and push these changes to the remote branch", and `git status
--porcelain` held only `?? .claude/worktrees/`. An entry for the path in `.git/info/exclude`
cleared it. ESLint is run on `src` and `tests`
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

## Where a probe runs

A probe at `<session scratchpad>/probe/sp.test.ts` that imports `src/parse`, run with
`npx vitest run <path>` from the primary checkout, prints `No test files found, exiting with code
1`: Vitest collects only under its root. The first proposal review of #351 found the same from a
worktree, and that outside the tree `fast-check` does not resolve and `src/parse.ts` fails on its
extensionless imports under Node's type stripping. So a test probe runs only inside a checkout or a
worktree, and `.scratch/` there is the place for it; `/tmp` and the session's scratchpad hold notes
and outputs. Inside a worktree, a `.scratch/*.test.ts` probe is collected by a plain
`npx vitest run` as well (65 files: the 64 tests and the probe), so the suite is run as
`npx vitest run tests/`.

## Stacked layers

A brief that names "the merge base with `origin/main`" is wrong for a layer of a stack. For #91
(`chore/readme-landing`, whose base is `chore/website-demo`), on 2026-10-03:

| Diff | Files |
| --- | --- |
| `git diff --name-only $(git merge-base origin/main origin/chore/readme-landing) origin/chore/readme-landing` | 739 |
| `git diff --name-only origin/chore/website-demo...origin/chore/readme-landing` | 2 |

## Diagnoses in issues

Of the 72 issues labelled `kind/bug`, 37 have a heading named mechanism, diagnosis or cause, or a
root-cause passage (`gh api` over `issues?labels=kind/bug&state=all`, matched case-insensitively).
A brief that hands over the issue hands over that diagnosis.

## Posting a review from a cloud session

The first proposal review of #351 posted its findings through the GitHub MCP tools:
`pull_request_review_write` with `create` and a `commitID`, 16 calls to
`add_comment_to_pending_review` (single lines and ranges, side `RIGHT`), and `submit_pending` with
`COMMENT`. Each step succeeded, and reading the review back gave state `COMMENTED` at the
`commitID` given, with one `Generated by` footer per comment, the one the reviewer wrote. The
author pushed a commit while the review ran; without the `commitID` the review would have attached
to the new head and resolved its line numbers against a file the reviewer never read. The author's
session was woken once, and one read returned 17 events: the review at 01:12:50 and its 16
inline comments at 01:12:51 and 01:12:52. The comments were submitted as one review, and GitHub
still sends an event per comment.

The author's half worked the same way. `pull_request_read` with `get_review_comments` returned
the 16 threads with their `PRRT_` node ids, `add_reply_to_pull_request_comment` posted a reply on
each, and `resolve_review_thread` resolved all 16. The session's own proxy refuses GraphQL
(`cloud-session-github-access`), and the MCP server's thread reads and resolutions went through.
Each of the 16 replies came back to the author's session as an event of its own; a reply to an
existing thread is a single REST call, with no batched form.

## Not measured

- Whether a local session has a hook that reads either.
- A sweep through an operation (`finalize` and the ops that call it), which is what #264's own
  review ran; the recipe is the same with a different entry point and generator.
