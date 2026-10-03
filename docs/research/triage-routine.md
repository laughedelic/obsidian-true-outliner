---
type: "research"
description: "A dry run of the triage routine's prompt over the 90 open issues of 2026-10-03: what it reads, the 22 comments and one label change it would make, what it leaves to the maintainer, the ambiguities the run found in the prompt, and the REST reads a cloud session can make for it"
---

# The triage routine, dry-run on the open issues

The routine (#344) reads issues, comments and pull requests and writes only labels and one-line
comments, so its prompt can be checked before it is scheduled: a session follows the prompt
([`.agents/routines/triage.md`](../../.agents/routines/triage.md)) with the trigger text `dry run`,
which turns every write into a row of a table. Measured on 2026-10-03, against `main` at `90d0d56`
and the issues and pull requests open that day. Nothing was written to GitHub.

## What the open issues look like

| | |
| --- | --- |
| Open issues | 90 |
| Missing a `kind/`, an `area/` or a `p0`-`p3` label, or carrying two `needs/` labels | 0 |
| `needs/decision` | 28 |
| `needs/diagnosis` | 8 |
| `needs/research` | 8 |
| `needs/repro` | 2 |
| Open pull requests | 23 (4 of them stacked on a branch other than `main`) |
| Created in the seven days before the run | 54 |

The label sets are complete. What the routine finds on this repository is drift in time: a `needs/`
label or a dependency that something since has answered, and pull requests nobody has linked to the
issue they close.

## How the prompt was run

A fresh Sonnet session was given the file, the trigger text `dry run`, and a bar on every write tool
and on any `gh api` call that is not a GET. It was asked to list each place where the prompt left it
guessing. It ran twice. The first run found eleven ambiguities, the prompt was revised, and the
second run, on the revised wording, found thirteen more; the small ones were settled in a further
revision that the table below was not re-run on. The one visible effect on the table is the verb in
`Unblocked: #208 merged.`

| | Run 1 | Run 2 |
| --- | --- | --- |
| Tool calls | 25 | 33 |
| Tokens (subagent total) | 159k | 181k |
| Wall time | 5.5 min | 7.6 min |
| `gh api` GETs | about 250 | about 405 |
| Candidates read | 60 | 67 |

The dollar cost of a run was not measured. #344 estimates about $1 on Sonnet from the Staleness
sweep. A first run reads more than later ones: 54 of the 90 issues are new inside its window, and
the second run read 87 issues and comment lists. A steady-state run's window is a day or two.

## What the second run would write

Every comment opens with `<!-- agent: triage -->`. `R` is this repository's URL.

**A label change and its comment**

| Issue | Change | Evidence | Comment |
| --- | --- | --- | --- |
| #257 | `-needs/diagnosis` | R/pull/274, "Diagnosis" | Dropped needs/diagnosis: #274 locates the cause in Obsidian's tag suggester, which opens after the level shift leaves a bare `#` and takes the arrow keys. |

**An open pull request that closes the issue** (comment `Open PR #N (draft|ready) closes this.`)

| Issue | Pull request | |
| --- | --- | --- |
| #257 | #274 | ready |
| #244 | #270 | ready |
| #250 | #273 | draft |
| #292 | #318 | draft |
| #308 | #311 | draft; the closing keyword is on the body's last line, a `Refs` on its first |
| #320 | #280 | draft |
| #339 | #352 | draft |
| #217 | #95 | draft |
| #219 | #205 | draft |
| #220 | #93 | draft |
| #221 | #88 | draft |

**A dependency** (read from the issue's `blocked_by` endpoint and its `Blocked by` lines)

| Issue | Comment | Resolved by |
| --- | --- | --- |
| #152 | Unblocked: #153 closed. | 09-26 |
| #209 | Unblocked: #208 merged. | 09-27, a merged pull request; the endpoint is empty and the body says `Depends on #208` |
| #284 | Unblocked: #287 closed. | 09-29; missing from run 2's own table, see below |
| #292 | Unblocked: #289 closed. | 09-29 |
| #293 | Unblocked: #289, #290 closed. | 09-29 |
| #294 | Unblocked: #288, #315 closed. | 09-29 |
| #296 | Blocked by #292 (open). | |
| #316 | Unblocked: #315 closed; still blocked by #312, #313. | 09-29 |
| #347 | Unblocked: #340 closed. | 10-03 |
| #348 | Unblocked: #335, #336, #337 closed; still blocked by #297, #338. | 10-03 |

Run 2's first report omitted #284, and its reply to a follow-up question supplied the row. The
prompt found blocked issues only through the timelines of items that closed in the window, and
#287's timeline does not cite #284; it never said to read `blocked_by` on an issue itself. Run 1 had
found #284 by another route. A `blocked_by` read of all 90 open issues, made outside the run after
this, returns nine issues with blockers: #152, #284, #292, #293, #294, #296, #316, #347 and #348. They
are nine of the ten rows above, and #209 is the one named only in text. The prompt now reads the
endpoint for every open issue and keeps the timelines for text-only dependencies. With #284 the
totals are 22 comments and one label change, none written.

Spot checks against GitHub, read-only: #274's body has `Closes #257.` and a "Diagnosis" section
naming the suggester; `blocked_by` returns the states shown for #152, #284, #292, #293, #294, #296,
#316, #347 and #348; #316's body reads "Blocked by #315, #312 and #313"; #209's reads "Depends on #208",
and #208 merged on 09-27; the eleven closing keywords above are the whole set in open pull
requests, and the label audit recomputed outside the run matches its 90 and its zero.

## What it leaves alone

Each of these is a case the prompt's rules do not settle, and the run left the label as it is.

- **#327, #328** (`needs/repro`, p2). Both bodies hold a case, and both say it was not reproduced
  locally. #327's comment reports two of five desktop `selection` jobs failing on the newest
  installer, which the `triage` skill's recurrence test places at `p1`; #304's reports about half the
  group runs. The prompt lists a reported rate as a question and does not move the rung.
- **#308, #338** (`needs/decision`). Their pull requests carry a proposal and no code.
- **#121, #261** (`needs/decision`, `needs/research`). A maintainer comment narrows the question and
  leaves it open.
- **#200, #346** (`needs/decision`). A lean toward one option, and three options with none chosen.
- **#312, #313, #321, #325, #330, #355** (`needs/diagnosis`). Pull requests mention them and state
  no mechanism.
- **#136** (p1) and **#215, #329** (p2, p3). Comments narrow or widen the reach; whether that moves
  a rung is a judgement the prompt does not make.
- **#250 and #275, #313 and #321, #278 and #279.** One cause or one area, different gestures: not
  flagged as duplicates.

## What the run found wrong in the prompt

Settled in the prompt:

- The first-run window had no clock time (now 00:00Z seven days back), and the comments feed's
  `since` filters on update time.
- The prompt said a run reading most open issues reads too much, and a first run must.
- Pull request links were bounded by the window; they now cover every open pull request, which added
  #217, #219, #220 and #221.
- A merged pull request as a blocker was not covered, and neither was a stacked pull request, a
  prose line naming no number, a line blocking only part of an issue, an umbrella's checklist, or a
  comment with an `<!-- agent: author -->` marker.
- `needs/` issues were candidates only "when something gives a reason", which is circular; they are
  now matched by number against the feed and the pull requests already read.
- Two bulk reads were larger than needed: a REST listing prints every body, and `--paginate` follows
  a link the proxy refuses.

Known limits, left as they are:

- A dependency written only in an issue's text is found through the timeline of the item that closed,
  so one whose blocker closed outside the window, or whose line the issue's author wrote loosely, is
  not.
- "New evidence" for a priority is judged against the window and a comment's text; the date a label
  was set is not in the comments or the listing.
- Whether a comment's evidence is enough (a pull request that "locates" a cause, a note that
  "answers" a question) is the running model's reading of the text. The rules say to leave the label
  when it is partial.

## What a cloud session can read for it

Probed on 2026-10-03 from a cloud session, GET only.

| Request | Result |
| --- | --- |
| `repos/{o}/{r}/issues/comments?sort=created&direction=desc` and `?since=` | 200; the window's start comes from here |
| `repos/{o}/{r}/issues/{n}/dependencies/blocked_by` | 200; the native relationship, set by the maintainer; ninety calls for the open issues |
| `repos/{o}/{r}/issues/{n}/timeline` | 200; `cross-referenced` events name the issues that cite `n` |
| `repos/{o}/{r}/pulls?state=open`, `?state=closed&sort=updated` | 200 |
| `search/issues` | 403, "sessions are bound to their configured repositories" |
| `--paginate` on `repos/.../issues` | 403, the follow-up request goes to `repositories/{id}/...` |

## Not measured

- **A label write.** `issue_write` takes `labels` as the labels to apply; whether it replaces the set
  is assumed from the GitHub API and unmeasured, since no run wrote. The prompt sends the whole
  resulting set either way.
- **A real run.** The dry run was started from an interactive session. A routine fires in a fresh
  session whose proxy and tool set have not been compared with this one.
- **Cost per run in dollars**, and the size of a steady-state run.
