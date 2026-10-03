---
name: independent-review
description: Brief a fresh agent to review a change, then verify, answer and record what it finds. Two modes, a proposal (plan, design, OpenSpec change) and an implementation, partial or complete. Use at each ready point of a change, when the user asks for a review, a second opinion or a sub-agent review, and when a brief from this skill starts a session as the reviewer.
---

# Independent review

A reviewer that holds none of the author's reasoning checks the change's claims by running them.
This file is what every review shares, in the order the author works through it; a reviewer reads
"The reviewer" and the mode file its brief names: [proposal.md](proposal.md) for a plan, a design
or an OpenSpec change, [implementation.md](implementation.md) for code. The evidence behind each
rule is in [`docs/research/independent-reviews.md`](../../../docs/research/independent-reviews.md).

## When

- **A ready point** is a commit put up for review: the plan once the draft PR holds it, a
  checkpoint that closes a task group, and the head the author would mark ready, after manual
  testing. Its first review is **deep**, reads the whole change, and posts on the PR.
- **A response that changes what the change does or states**, a fix from manual testing included,
  is followed by a **light** round on that response's diff, which also posts ("Rounds").
- **A return-only check** reviews any commit between ready points, pushed or not, and returns its
  findings instead of posting them. It is **light**.

## 1. Brief

For a ready point, push first; the review is posted against the SHA the brief names. Fill every
field, or write "none":

```
Independent review: <proposal | implementation>, round <n>, of #<pr>.
Read <author's checkout>/.agents/skills/independent-review/SKILL.md ("The reviewer") and
<author's checkout>/.agents/skills/independent-review/<proposal | implementation>.md, and follow them.

Head:         <branch> at <sha>
Base:         <the PR's base branch>; merge base <sha>
Diff:         git diff <merge base> <sha>          (a light round: git diff <last round's sha> <sha>)
Issue:        #<n>, and the plan at <path>: read both after locating the cause yourself
Reproduction: <the case file's `before` column and keys, no result column>
Touches:      <specs by capability path; research notes>
Depends on:   <files and documents the change relies on and does not touch>
Earlier rounds: <each earlier review's link; each return-only check's line from "Reviews">
Claims to falsify:
1. <a sentence about what the author believes is sound, written so a measurement could prove it false>
Do not modify: the tracked files and branches of <author's checkout>
Findings go:  <on the PR | return only>
```

- **The skill's files are read from the author's checkout**, by absolute path: the tree under
  review may predate the skill.
- **The base is the PR's own.** A layer of a stack is reviewed against the layer below.
- **The brief never carries the diagnosis**, the issue's or the plan's, not even as a claim: the
  brief is read first. Nor a result column: an `expected` is the author's answer.
- **A claim is what the author believes sound**: "`structural-operations`, *X*, already requires
  the expected result, so the fix type is drift", "each new test fails with `src/` from the merge
  base". Never where the defect is.
- **From round 3**, the brief also asks the question in "Rounds".

Done when every field is filled or "none", and no line says what the author suspects or expects.

## 2. Start the reviewer

A `general-purpose` subagent with the brief as its prompt, in the background, with the model of
its setting: **deep** `model: opus`, **light** `model: sonnet`. Both inherit the session's effort.

## The reviewer

**Workspace.** Two detached worktrees:

```bash
git fetch origin <base branch> <branch>
git worktree add --detach .claude/worktrees/review-<pr>-r<round>-head <sha>
git worktree add --detach .claude/worktrees/review-<pr>-r<round>-base <merge base>
```

- An unpushed commit is reachable the same way: a worktree shares the checkout's objects.
- When the path exists (a second review of the same round), add a suffix to both names.
- The fetch moves the checkout's remote-tracking refs and the worktrees add git metadata; neither
  is a modification the brief forbids.
- When the change touches `package.json` or `package-lock.json`, run `npm ci` in each worktree
  before running anything in it: both otherwise share the primary checkout's install.
- **Probes go in the head worktree's `.scratch/`**, which git ignores. It is the only place a test
  probe runs. `/tmp` and the session's scratchpad hold notes and outputs. Nothing goes under
  `tests/` or any tracked path.
- Run the suite as `npx vitest run tests/`; a plain run also collects the probes.
- A claim about what the app does is measured in the app, with `driving-obsidian` or a case file
  through `npm run case`, never in a bare CodeMirror.
- At the end, `git worktree remove --force` the worktrees this review made, and only those.

**Order.** Reproduce the case, derive the expected result from the specs, and locate the cause in
the code. Then read the issue and the plan, and test their diagnosis as a claim. Then work through
every check in the mode file; the brief's claims are one of them. A light round reads the diff in
its brief and what that diff touches.

**A finding:**

```
**<n>. <CONFIRMED | PLAUSIBLE>, <p0–p3>. <the defect in one sentence>**
Case: <a case file, a probe's code and output, or a sweep's counts and one example>
Where: <file:line; the spec requirement>
Base: <same | better | worse> on the same case
```

- **CONFIRMED**: run and seen. **PLAUSIBLE**: inferred; say what would confirm it.
- **Rank by what leaving it would cost**, in `triage`'s rungs. A finding about the plan or the
  tests (a wrong fix type, a test that cannot fail) takes the rung of the defect it lets through.
- An editor case is drawn as `presenting-examples` draws one, as a case file where it can be.
- The report ends with **Checked and found sound**: what was checked and held.

**Posting**, when the findings go on the PR, as one review through the GitHub MCP tools:

1. `pull_request_review_write`, method `create`, with `commitID` set to the brief's SHA. Without
   it the review attaches to the PR's current head, and line numbers resolve against a file the
   reviewer never read.
2. `add_comment_to_pending_review` for each finding that belongs to a line of the diff (`path`,
   `line`, `startLine` for a range, side `RIGHT`, `subjectType` `LINE`).
3. `pull_request_review_write`, method `submit_pending`, event `COMMENT`. The body holds only what
   no thread holds, and repeats no inline finding:
   - the findings that belong to no line, in full;
   - one line per claim of the brief: "holds", or the finding that breaks it;
   - "Checked and found sound" and anything not checked, inside `<details>`.

Each comment and the body open with the role, since everything posts under the maintainer's
account, and carry no attribution footer (the platform appends one; `steward`, "Comments"):

```
<!-- agent: reviewer, <mode>, round <n>, <sha> -->
**Reviewer** · <mode>, round <n>
```

**Return** the review's URL and one line per finding (number, label, rung, sentence). A
return-only check returns the findings in full.

## 3. Verify, decide, answer

For each finding, in rank order:

1. **Run its case.** A PLAUSIBLE finding is measured, which confirms or disproves it, before it is
   acted on. One that cannot be measured in the session is recorded as unmeasured at `p2` or
   below, and filed at `p0` or `p1`.
2. **Decide one disposition**:
   - **taken**: fixed, naming the commit;
   - **rejected**, with the spec sentence or the measurement it rests on;
   - **filed**: an issue, with the user's go-ahead. A defect outside the change, pre-existing or
     not, is always filed (`AGENTS.md`, "A follow-up is an issue");
   - **recorded**: not a defect, or one already tracked, naming the issue;
   - **wrong**, with what showed it.
3. **Answer on the thread and resolve it**, disposition first, opening with
   `<!-- agent: author -->` and **Author** ·, no footer. Thread ids come from `pull_request_read`,
   method `get_review_comments`; `resolve_review_thread` resolves.

The review's events are the review the author asked for, and the author's own replies come back
as echoes, which `steward` skips. **The user is asked only** about an open question, a decision
that could go either way, a finding that changes the design's direction or pivots the proposal,
the go-ahead to file an issue, and the step-back in "Rounds".

Done when every thread has its reply and is resolved, or is left open with the question to the
user named.

## 4. Record

The PR description's "Reviews" section is a summary across all rounds, rewritten with
`update_pull_request` as rounds accumulate (a REST write appends a footer to the description). The
back and forth stays in the threads.

- A table, one row per round, return-only checks included: the review's link, mode, SHA, model and
  effort (where known), the count of findings and of each disposition, and why a round was skipped
  when one was. A return-only check's row lists the findings it rejected or showed wrong, since it
  has no threads to hold them.
- A step-back, when one ran, and what the user chose.
- Inside `<details>`: what the rounds changed in the design, the lessons a later change can use,
  and links to the threads a reader would not find on their own (a rejection, a finding shown
  wrong, one left open).

No finding is restated there; the threads hold them.

## Rounds

Rounds are counted across both modes, and include return-only checks. Each is a fresh reviewer.

- **A response that changes what the change does or states** (behaviour, a mechanism, a rule, a
  spec statement, the fix type or the scope, however small the edit) is followed by a light round
  on that response's diff. A test for reviewed behaviour, a rename, a comment or a wording fix is
  not.
- **The author may judge a round unnecessary** and skip it, saying why in the thread it answers
  and on the round's line in "Reviews". The default is the round; the skip is the judgement.
- **A round converges** when its response needs no further round, and none of its findings is an
  unmeasured PLAUSIBLE one at `p0` or `p1`.
- **The last ready point**, the head the author would mark ready, gets its deep review of the
  whole change whatever the light rounds read. Landing's archive, sync and version bump come
  after it and are not reviewed.

**From round 3, ask about the rule first.** List every earlier finding whose fix added a
condition, a special case or a narrower rule, or reversed an earlier round's direction. When two
or more patch the same rule, ask also:

- Are the findings about the rule, or about constraints every candidate rule shares?
- Do they come from cases built by hand that a generated check (an oracle, a sweep) would settle?

Then stop, put the list and the answers in the PR, and ask the user to choose: a rule written
anew, a generated check before the next round, or another round as it stands. Rewriting the rule
alone is what kept #267 looping. When nothing patches the same rule twice, run the round, and put
the same question in its brief.
