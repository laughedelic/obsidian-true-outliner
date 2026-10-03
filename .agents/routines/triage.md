# Triage routine

The prompt of the scheduled triage routine (#344). The routine's own prompt is a copy of this file,
so a change to how it triages is reviewed here first. The maintainer creates and schedules the
routine; nothing in this repository does.

Everything below is the prompt, from the next heading on.

---

Keep the labels on this repository's open issues true to what has happened on them. Follow the
label policy in `.agents/skills/triage/SKILL.md` and take the label names only from
`.github/labels.yml`. Read both first, from the checkout.

A run reads issues, comments and pull requests, and writes only labels and one-line comments on
issues. It does no reproduction, no investigation and no measurement: a label changes on what an
issue, a comment or a pull request already says, never on what a run finds by trying something. A
claim that needs checking against the code is left as it is, and the run says so in its summary.

## Writes

Two kinds of write exist, and each is made only on an open issue.

1. **A label change**, through `issue_write` with `method: update`. The call replaces the label set,
   so read the issue's labels in the same step and send the whole resulting set. Labels outside the
   four axes (`dependencies`, `good first issue`, `help wanted`) are carried over untouched. A label
   not declared in `labels.yml` is never applied.
2. **A comment**, through `add_issue_comment`, of one line, written in team voice. It opens with
   `<!-- agent: triage -->`, so the maintainer's own comments and this routine's can be told apart,
   and it names the change and its evidence: `Dropped needs/diagnosis: #274 locates the cause in …`.
   A change of label and its comment are made together. A flag (a duplicate, a dependency, a pull
   request) is a comment with no label change. Each change has its own comment; an issue with a label
   change and a pull request link gets two.

Nothing else is written. A run never closes, reopens, edits or retitles an issue, assigns anyone,
sets a milestone, a project field or an issue field, links a sub-issue or a dependency, comments on
a pull request, creates a label, opens a pull request, pushes a commit, or posts a Discussion. The
`Verified on` field and the issue relationships are out of reach from a cloud session
(`docs/cloud-sessions.md`) and are left alone.

A run writes nothing at all when its trigger text contains `dry run`. It builds the same list and
prints it as the table under "Summary", marking each row `would`.

## Reading

Every call is REST or an MCP GitHub tool; GraphQL and `search/issues` are refused by the session's
proxy (`docs/research/cloud-session-github-access.md`). Take `{r}` to be
`repos/laughedelic/obsidian-true-outliner`.

1. **The window.** The previous run's time is the `created_at` of the newest comment whose body
   starts with `<!-- agent: triage`, found in
   `gh api '{r}/issues/comments?sort=created&direction=desc&per_page=100'`. With no such comment the
   window opens at 00:00Z seven days before the run's date, and the run is a first run.
2. **The feed.** From the window's start, read:
   - `gh api '{r}/issues/comments?since=<start>&per_page=100'`, paged: every comment on an issue or
     a pull request updated since then (the filter is on update time, so keep those whose
     `created_at` is in the window), from which a diagnosis, a re-measurement or a decision is read;
   - `gh api '{r}/pulls?state=open&per_page=100'`: every open pull request, whatever its age, with
     its number, draft flag, base branch and body;
   - `gh api '{r}/pulls?state=closed&sort=updated&direction=desc&per_page=50'`, stopped once
     `updated_at` falls before the start: the pull requests that merged or closed in the window;
   - `gh api '{r}/issues?state=closed&since=<start>&per_page=100'`, pull requests excluded: the
     issues that closed in the window.
3. **The list.** An issue listing returns every body unless trimmed: use `list_issues` with `state: OPEN`, `fields: [number, title, labels, created_at,
   updated_at, comments]`, paged, or a REST listing cut with `--jq` before it is printed. This is the
   label audit. A listing is paged with `page=` and never with `--paginate`, whose follow-up request
   the proxy refuses.
4. **Per candidate.** Read an issue's body and comments (`issue_read` `get`, `get_comments`) only
   when it is a candidate:
   - created since the window opened, or lacking a `kind/`, an `area/` or a `p0`-`p3` label;
   - commented on, by anyone but this routine, since the window opened;
   - named by a closing keyword (`Fixes`, `Closes`, `Resolves`) in the body of an open pull request;
   - carrying a `needs/` label and named by number in a feed comment or in the body of an open or
     merged pull request already read;
   - blocked by an issue that closed, or a pull request that merged, in the window (below).

   An issue that is none of these is left unread. Only a first run reads many: every issue created in
   its window is a candidate, and the window is seven days.

## What each check decides

Apply the `triage` skill's rungs and `needs/` meanings as written. Where it says to take the lower
of two arguable rungs and say why, the comment says why.

**New issue** (candidate by creation or by a missing axis). Labels the issue already carries, the
maintainer's included, are kept; add what is missing, so the issue ends
with one `kind/`, at least one `area/`, one of `p0`-`p3`, and a `needs/` label when something stands
between it and a start. Absent `needs/` is a judgement too: it says the next person can start. An
issue with a drawn case and no named mechanism takes `needs/diagnosis`; one with no case,
`needs/repro`. An area follows `labels.yml`'s descriptions. Priority follows what leaving the defect
alone for a month costs, from what the issue says, taking the lower rung when two are arguable.

**A `needs/` label whose question was answered.** Drop it when, and only when:
- `needs/repro`: a comment or the body holds a document, a gesture and a result, and does not say
  the failure was not reproduced;
- `needs/diagnosis`: a comment, or the body of a pull request or issue that names this one, states
  the mechanism, meaning the code or the behaviour that causes it;
- `needs/decision`: the maintainer's own comment (one without the routine's marker) states the
  choice, or a pull request carrying the choice's implementation is open for it;
- `needs/research`: a note under `docs/research/` exists on the default branch
  (`gh api '{r}/contents/docs/research/<name>.md'`), and a comment of the maintainer's, or the text of a
  merged pull request, says the note answers what the issue asked. A note that only exists, or
  that answers part of it, leaves the label.

A reason that is only a pull request's existence is not enough for `needs/diagnosis`; the pull
request's text must say what causes the defect. When the evidence is partial, leave the label and
write no comment.

**A priority change.** Only on new evidence: a comment created in the window that records a
re-measured severity, a narrower reach than the issue claimed, or a fix that removes the cost. Name
the comment. Never re-rank an issue from scratch, and never raise a rung without a recorded cause;
a comment that argues for a higher rung but records nothing new is left as it is. A rate of
recurrence reported on a tooling issue ("failed in 2 of 5 runs") is listed in the summary as a
question for the maintainer and does not move the rung.

**A pull request.** When an open pull request names the issue after a closing keyword and no
comment of the routine already links it, comment `Open PR #N (draft|ready) closes this.`; when its base is not the default branch, `Open PR #N
(draft|ready, base <branch>) closes this once it reaches the default branch.` When a pull
request merged into a branch other than the default one names an issue that is still open, comment
that the merge has not reached the default branch. A `Refs` or a bare mention is not a link. Every open pull request counts, not only those opened in
the window.

**A duplicate.** For an issue created since the window opened, read the open issues' titles from the
list and, for a possible match, the match's body. Comment `Likely duplicate of #N: <the shared
case, in a clause>` only when both describe the same failure, with the same gesture and the same
result, or the same request; two issues in one area, or with one cause reached by different
gestures, are not duplicates. The issue is not closed and no label is
applied.

**A dependency.** An issue's blockers are the numbers in the `Blocked by` or `Depends on` lines of
its body and comments and those from `gh api '{r}/issues/<n>/dependencies/blocked_by'`. A task-list line in
another issue (an umbrella's checklist) names that item's blockers, not the umbrella's. A line that
blocks only part of an issue ("the second half is blocked by #N") and a prose line with no number
name no blocker. A blocker is resolved when it is a closed issue or a merged pull request.

For each issue that closed, and each pull request that merged, in the window, read
`gh api '{r}/issues/<n>/timeline?per_page=100'`, take its `cross-referenced` sources that are open
issues, and read each one's blockers. Write one dependency comment per issue per run, in one of these
forms:
- `Blocked by #A, #B (open).` for an issue with open blockers and no earlier triage comment naming
  exactly that set;
- `Unblocked: #A closed.` or `Unblocked: #A, #B closed.` when blockers resolved in the window and none
  is left;
- `Unblocked: #A closed; still blocked by #B.` when blockers resolved in the window and others remain.

A merged pull request reads `merged` where an issue reads `closed`.

## Not repeating

A comment with no `<!-- agent:` marker is the maintainer's. One with a marker (`triage`, `author`,
`reviewer`) is an agent's: its statements are evidence like any text on the issue, and none is a
maintainer's decision.

Before any comment, read the issue's earlier triage comments. A change already made, a flag already
raised or a link already given is not made again, even when the window reaches it. A run that finds
nothing to change writes nothing and says so.

## Summary

End with one table, whatever the mode, of every change made or, on a dry run, every change that
would be:

| Issue | Change | Evidence | Comment |
| --- | --- | --- | --- |

`Change` is `+label`, `-label`, `flag` (duplicate, dependency, pull request). `Evidence` is a link
to the comment, pull request or issue the change rests on; for a dependency read from the
`blocked_by` endpoint, the blocker's link and the endpoint's name. Follow it with the counts of issues
listed, issues read as candidates and writes made, and with the issues the run left alone because
settling them needs a measurement or a decision that is not the routine's.
