## Context

Issue labels are the one input that agents read before choosing work, and nothing keeps them current.
The `triage` skill says what each label commits us to
([`.agents/skills/triage/SKILL.md`](../../../.agents/skills/triage/SKILL.md)), the label set is one
declaration ([`.github/labels.yml`](../../../.github/labels.yml)), and a cloud session reaches GitHub
through REST only, with no project fields
([`cloud-session-github-access`](../../../docs/research/cloud-session-github-access.md)). The dry run
of this prompt, its output and what it found wrong are in
[`triage-routine`](../../../docs/research/triage-routine.md).

## Goals / Non-Goals

**Goals:**

- A prompt the maintainer reviews as a file, copies into a routine, and revises by pull request.
- A run whose every write is a label change or a one-line comment, and whose reads are bounded by
  what changed since the last run.

**Non-Goals:**

- Anything that needs the code or the running app: reproduction, diagnosis, re-measurement. The
  routine records what an issue, a comment or a pull request already says.

## Decisions

**The prompt is a file under `.agents/routines/`, and the routine's prompt is a copy.** A change to
the policy then has a diff and a reviewer, and the Bugfix routine's v3 (#348) can put its prompt
beside it. The file opens with a short preface that is not part of the prompt, so the copy starts
after the first rule.

**State lives in the routine's own comments.** The Staleness sweep wrote nothing it could read back,
because the `Verified on` field is a project field and out of reach from a cloud session. Each triage
comment opens with `<!-- agent: triage -->`; the newest one's time opens the next window, and an
issue's earlier triage comments say what was already flagged. The marker follows the `steward`
skill's `<!-- agent: … -->` convention, where comments post under the maintainer's login and the
marker tells them apart.

**Reads follow the feed, not the issue list.** The list of open issues is read once, without bodies,
as the label audit. Bodies and comments are read for a candidate: an issue created in the window,
lacking an axis, commented on, named by a closing keyword in an open pull request, or blocked by
something that resolved. The comments feed, the pull request lists and the closed issues' timelines
each cost one paged call. A first run is the exception, since its window holds most of the issues.

**A comment per change, joined to its label change.** The issue asks for a one-line comment for each
change, so an issue with a label change and a pull request link gets two. Whether to merge them into
one line per issue is a question for review.

**Dependencies come from the native `blocked_by` relationship, read for every open issue, and from
`Blocked by` lines, and are only flagged.** The maintainer sets the relationship; the routine cannot write one, and a label for
"blocked" would have to be added to `labels.yml` first. A comment says what resolved and what still
blocks.

**A priority moves only on a recorded cause.** `triage` says an inflated rung costs more than a missed
one, so a comment that argues for a rung without recording a measurement changes nothing, and a
reported rate of recurrence on a tooling issue goes in the summary as a question.

**`dry run` in the trigger text writes nothing and prints the table.** The same prompt is the dry run
and the real one, so what the maintainer reviews is what runs.

## Risks / Trade-offs

- **A first run writes about twenty comments at once**, nine of them `Unblocked` notes on blockers that
  closed days ago. They are accurate and the routine's later runs write one or two. The maintainer may
  prefer to run the first one as a dry run and write by hand what they want.
- **The label write is unmeasured.** The prompt sends the whole resulting set so a replace and an
  add behave alike.
- **Judgement on partial evidence** is the running model's. Every rule says to leave the label then,
  and the summary lists what was left, so a missed drop costs a day and a wrong drop is one comment to
  revert.

## Open Questions

- One comment per issue per run, or one per change?
- Should a reported recurrence rate ("two of five jobs") move a tooling issue to `p1` without the
  maintainer, as the skill's recurrence test suggests, or stay a question? #327 and #328 are the
  cases.
- Should the `steward` skill name the `triage` marker? Its comments land on issues, which PR events
  do not wake a session for.
