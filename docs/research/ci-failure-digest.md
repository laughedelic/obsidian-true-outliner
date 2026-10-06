---
type: "research"
description: "Where a failing e2e job's evidence can be read from a session: the check run's `output` is empty for an Actions job and `get_check_run` returns no annotations, so a job summary never reaches it; what the harness already records of a failure and what it prints only to stdout; the size of the raw logs; and the head-SHA detail a check run needs"
---

# Where a failing e2e job's evidence can be read

Issue #341 asks for a failure digest in each failing e2e job's summary that a session reads with
one `get_check_run` call. This note records what the check-run API returns for an Actions job
and what the harness holds of a failure, so the digest is put where a session can read it.
Measured on 2026-10-03 in a cloud session on this repository, against runs of `CI` on #351 and
`main`.

## What `get_check_run` returns for an Actions job

The GitHub MCP tool `get_check_run` on `desktop (folding)` of run 37096975521 (green):

| Field | Value |
| --- | --- |
| `output.title`, `output.summary`, `output.text` | all empty strings |
| annotations | not in the result |

The same check run through REST (`gh api repos/{o}/{r}/check-runs/{id}`):

| Field | Value |
| --- | --- |
| `output.title`, `output.summary`, `output.text` | `null` |
| `output.annotations_count` | 1, a runner-image notice on `.github` line 1 |
| `GET …/check-runs/{id}/annotations` | 200, readable through the session's proxy |

So two things the issue assumes do not hold. A step summary (`$GITHUB_STEP_SUMMARY`) is not
check-run output: the job wrote one (the platform row, the monitors, the known-failing list) and
the check run carries none of it. And `get_check_run` returns `output` only, never the
annotations, so an `::error` annotation would be readable through REST and invisible to the tool
the issue names. The one place `get_check_run` reads from is `output.summary` and
`output.text` of a check run that something created through the Checks API, with
`checks: write`. The tool's own description pages `output.text` in windows of 4096 bytes by
default and 8192 at most.

`pull_request_read` with `get_check_runs` lists the check runs of the PR's current head with their
ids, which is how a session finds one; its rows hold no `head_sha`, `run_attempt` or job
conclusion beyond `conclusion`, so a digest has to state those in its own body.

A check run's id is also its job's id: the `html_url` of `desktop (folding)`, check run
111128807077, ends in `/job/111128807077`. So `get_job_logs` takes a check run's id as `job_id`, and
the reviewer of #358 measured the tail of a failed job's log (job 109268990573): 39 lines of
post-job cleanup follow the last step.

## What the harness holds of a failure

| Piece | Where | Reaches the summary file |
| --- | --- | --- |
| spec, suite, test, hook, error message, stack, duration | the JSON reporter's per-worker dump | yes, `failures` of `.obsidian-cache/e2e-summary.json` |
| a drawn case's `before` / `expected` / `actual` | the thrown error's message (`e2e-tests/case-report.ts`) | yes, inside `error` |
| the editor's drawing at the failure of any other case | `drawOnFailure` in `e2e-tests/wdio.shared.mts`, `console.log` | no: stdout only |
| a known-failing case's drawing | its own record (`e2e-tests/known-failing.ts`) | yes, `knownFailing` |
| a screenshot | `.obsidian-cache/failure-screenshots/`, uploaded on failure | an artifact, not text |

`error` is the whole message, drawing included, so the digest's first error line is the first line
of it and a drawn case needs no new record. A case that is not a drawn one has its drawing only in
the job log until `drawOnFailure` records it.

## What the raw logs cost

The run-level log of the `main` push run 37097804973, through `gh api …/actions/runs/{id}/logs`:

| Reading | Value |
| --- | --- |
| response | 200, a zip of 1.2 MB |
| files | 289, 4.8 MB uncompressed |
| the largest job log | about 123 KB (`mobile (decorations)`), 108 KB of it the e2e step |

The issue records the REST `…/logs` endpoint as blocked by the cloud proxy. From this session it
is not: the endpoint answers and the archive downloads. The MCP job-log tool also works, per the
issue. Neither is the digest's competitor on access; the cost is size: a session reads up to 123 KB
of one job's log, or downloads the whole run, to find a failure the summary file already names in
a few lines. `…/actions/permissions/workflow` is refused, so what the repository's default token
permission is cannot be read from a session.

## What a check run for a pull request has to say about its commit

A `pull_request` run's `GITHUB_SHA` is the merge commit with the base, which is not the PR's head.
A check run created with it lands on a commit the PR does not show, and `get_check_runs` on the PR
would not list it. The head is `github.event.pull_request.head.sha`, empty on `push` and
`workflow_dispatch`. This is the SHA the `ci-triage` skill compares first, so the digest names it.

## What is not measured here

- The check-run output limits (the Checks API documents 65,535 characters each for `summary` and
  `text`, and whether that counts bytes), whether the `GITHUB_TOKEN` of this repository's runs may
  create a check run, whether `job.check_run_id` reaches a composite action, and whether a step's
  patch of the job's own check run output survives the job's completion. Task 1.1 measures all
  four on a scratch branch.
- Whether a `neutral` check run wakes a session subscribed to the PR, and where a check run made
  by `GITHUB_TOKEN` shows in the PR's checks list.
- A Dependabot or fork PR's token, which GitHub makes read-only. The digest step is written to
  fail without failing the job; the Dependabot case is read on #332 or #333 once the change lands.
- What a digest for a failing job looks like at its largest, for a run with many failures.

## A digest, drawn

The harness prints a drawn case's failure as this (here, `⇥` did nothing):

```
 before    expected ⇥    actual ⇥
┆- a      ┆- a          ┆- a
┆- b┃     ┆→ - b┃       ┆- b┃
```

That block, with the failing test's name and the first line of its error, is what a session reads.
