---
name: spin-off
description: How work moves between sessions here — the brief that starts a new session on a piece of work, and the hand-off a session leaves in its PR before it goes idle. Use when starting work in a new session, when one session queues work for others, and at the end of a working phase on a PR.
---

# Spin-off

A session that starts from a written brief needs few corrections and costs little; one that starts
without a brief, or that is resumed after a long idle spell to write one, pays to rebuild or
re-read its whole context. So a brief is written by the session that already holds the context,
while it still holds it, and a session leaves its state in its PR before it goes idle. The
evidence is on #343.

## The brief

A brief is the first message of the new session, or, when the work is queued for later, a comment
on its issue. It is written for a reader that knows nothing of the session that wrote it. Fill
every field, or write "none":

```
<One sentence: the work, and the issue it closes or advances (#<n>).>

Read first: <files, research notes, issues and PRs, each with what to take from it>
Scope:      in: <what this session changes>
            out: <what it leaves alone, and who has it if anyone does>
Files owned: <the files this session may edit>
Branch:     <feat|fix|chore>/<slug>, from <base>
Review gate: <where the session stops for the maintainer's review, e.g. "open the draft PR with
            the plan and stop; no code until the maintainer has reviewed it">
Done when:  <what is true when the session is finished: a PR state, a check, a note>
```

- **Read first** carries the facts the reader would otherwise rediscover: a failing seed and its
  repro steps, a decision the maintainer already made, a constraint ("don't loosen the test"). A
  link without a reason to read it is left out.
- **Look at what is in flight before writing Scope and Files owned.** List the open PRs and their
  files, and the PRs merged since the issue was written, so the brief neither proposes work
  already done nor hands out a file another session is editing:

  ```bash
  gh api 'repos/{owner}/{repo}/pulls?state=open&per_page=100' --jq '.[] | "\(.number)\t\(.head.ref)\t\(.title)"'
  gh api 'repos/{owner}/{repo}/pulls/<n>/files' --jq '.[].filename'
  gh api 'repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30' \
    --jq '.[] | select(.merged_at) | "\(.number)\t\(.merged_at)\t\(.title)"'
  ```

  When two briefs would edit one shared file, one owns it and the other takes a file of its own,
  and both briefs say so.
- **The review gate is written out every time**, even where it is the default of `AGENTS.md`'s
  "Change lifecycle". A brief that lists the steps "explore, propose, open the draft PR, apply,
  validate" without the stop reads as permission to go straight to code.
- **Several briefs from one session** each get their own fields. Decisions the maintainer makes
  on one of them later do not reach the others by themselves: the maintainer, or the session that
  wrote the briefs, passes them on.

## The hand-off

The hand-off is written at the end of a working phase, before the session goes idle: when the
plan is up for review, at a checkpoint, when the session waits on the maintainer. Writing it later
by resuming the idle session re-reads the whole context to produce it, so it saves nothing.

It goes in the PR description, in a section of its own, and replaces the previous one rather than
growing below it:

```markdown
## State

- **Done:** <what the branch holds, with the commits that matter>
- **Open:** <what is left, in order, and what each item waits on>
- **Decided:** <each decision, why, and who made it (the maintainer, a review round)>
- **Evidence:** <where the measurements, case files, review threads and notes are>
```

A session that picks the work up later starts from the PR description and the links in it, not
from a summary of the previous session's conversation.
