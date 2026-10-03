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
   request) is a comment with no label change.

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
   window opens seven days back, and the run is a first run: it audits every open issue's labels
   (step 3) before looking at anything else.
2. **The feed.** From the window's start, read:
   - `gh api '{r}/issues/comments?since=<start>&per_page=100'`, paged: every comment on an issue or
     a pull request since then, from which a diagnosis, a re-measurement or a decision is read;
   - `gh api '{r}/pulls?state=all&sort=updated&direction=desc&per_page=50'`, stopped once
     `updated_at` falls before the start: a pull request's number, state, draft flag, merge time and
     body;
   - `gh api '{r}/issues?state=closed&since=<start>&per_page=100'`, pull requests excluded: the
     issues that closed in the window.
3. **The list.** `list_issues` with `state: OPEN`, `fields: [number, title, labels, created_at,
   updated_at, comments]` and no `body`, paged. This is the label audit. It is cheap, and it is the
   only read made of every open issue.
4. **Per candidate.** Read an issue's body and comments (`issue_read` `get`, `get_comments`) only
   when it is a candidate:
   - created since the window opened, or lacking a `kind/`, an `area/` or a `p0`-`p3` label;
   - commented on, by anyone but this routine, since the window opened;
   - named by a closing keyword (`Fixes`, `Closes`, `Resolves`) in the body of a pull request that
     was opened, merged or closed since then;
   - carrying a `needs/` label, when its comments or a pull request give a reason to drop it;
   - blocked by an issue that closed in the window (below).

   An issue that is none of these is left unread. A run that reads most of the open issues is
   reading too much.

## What each check decides

Apply the `triage` skill's rungs and `needs/` meanings as written. Where it says to take the lower
of two arguable rungs and say why, the comment says why.

**New issue** (candidate by creation or by a missing axis). Add what is missing, so the issue ends
with one `kind/`, at least one `area/`, one of `p0`-`p3`, and a `needs/` label when something stands
between it and a start. Absent `needs/` is a judgement too: it says the next person can start. An
issue with a drawn case and no named mechanism takes `needs/diagnosis`; one with no case,
`needs/repro`. An area follows `labels.yml`'s descriptions. Priority follows what leaving the defect
alone for a month costs, from what the issue says, taking the lower rung when two are arguable.

**A `needs/` label whose question was answered.** Drop it when, and only when:
- `needs/repro`: a comment or the body holds a document, a gesture and a result;
- `needs/diagnosis`: a comment, or the body of a pull request or issue that names this one, states
  the mechanism, meaning the code or the behaviour that causes it;
- `needs/decision`: the maintainer's own comment (one without the routine's marker) states the
  choice, or a pull request carrying the choice's implementation is open for it;
- `needs/research`: a note under `docs/research/` on the default branch measures it, and the issue or
  a pull request links the note.

A reason that is only a pull request's existence is not enough for `needs/diagnosis`; the pull
request's text must say what causes the defect. When the evidence is partial, leave the label and
write no comment.

**A priority change.** Only on new evidence: a comment since the label was set that records a
re-measured severity, a narrower reach than the issue claimed, or a fix that removes the cost. Name
the comment. Never re-rank an issue from scratch, and never raise a rung without a recorded cause;
a comment that argues for a higher rung but records nothing new is left as it is.

**A pull request.** When an open pull request names the issue after a closing keyword and no
comment of the routine already links it, comment `Open PR #N (draft|ready) closes this.` When a pull
request merged into a branch other than the default one names an issue that is still open, comment
that the merge has not reached the default branch. A `Refs` or a bare mention is not a link.

**A duplicate.** For an issue created since the window opened, read the open issues' titles from the
list and, for a possible match, the match's body. Comment `Likely duplicate of #N: <the shared
cause or the shared case, in a clause>` only when both describe the same failure or the same
request; two issues in one area are not duplicates. The issue is not closed and no label is
applied.

**A dependency.** Read an issue's blockers from the `Blocked by` or `Depends on` lines of its body
and comments, and from
`gh api '{r}/issues/<n>/dependencies/blocked_by'`. For each issue that closed in the window, read
`gh api '{r}/issues/<n>/timeline?per_page=100'`, take its `cross-referenced` sources that are open
issues, and read each one's blockers. Comment:
- `Blocked by #A, #B (open).` once for an issue that has open blockers and no earlier triage comment
  naming exactly that set;
- `Unblocked: #A closed; still blocked by #B.` or `Unblocked: #A, #B closed.` when a blocker closed
  in the window.

A blocker that is a pull request is read as the pull request's state.

## Not repeating

Before any comment, read the issue's earlier triage comments. A change already made, a flag already
raised or a link already given is not made again, even when the window reaches it. A run that finds
nothing to change writes nothing and says so.

## Summary

End with one table, whatever the mode, of every change made or, on a dry run, every change that
would be:

| Issue | Change | Evidence | Comment |
| --- | --- | --- | --- |

`Change` is `+label`, `-label`, `flag` (duplicate, dependency, pull request). `Evidence` is a link
to the comment, pull request or issue the change rests on. Follow it with the counts of issues
listed, issues read as candidates and writes made, and with the issues the run left alone because
settling them needs a measurement or a decision that is not the routine's.
