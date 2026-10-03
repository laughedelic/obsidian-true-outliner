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

- **Proposal**: once the draft PR holds the plan, before the maintainer reviews it.
- **Implementation**: at each ready point, a checkpoint pushed for review, and before the PR is
  marked ready.
- **A check that is not a ready point** (a partial implementation before it is pushed, a question
  to settle before touching the PR): the same review, returning its findings instead of posting
  them.
- **Another round**, while the last one has not converged ("Rounds").

## 1. Push, then brief

Push first: the reviewer reads `origin` at the SHA the brief names, never the author's checkout.
Then fill every field of the brief, or write "none":

```
Independent review: <proposal | implementation>, round <n>, of #<pr>.
Read .agents/skills/independent-review/SKILL.md ("The reviewer") and
.agents/skills/independent-review/<proposal | implementation>.md, and follow them.

Head:        <branch> at <sha>
Base:        <the PR's base branch>; merge base <sha>
Diff:        git diff <merge base> <sha>
Issue:       #<n>
Reproduction: <case file path, or the drawn case>
Touches:     <specs by capability path; research notes>
Depends on:  <code, config, docs and earlier PRs the change relies on and does not touch>
Earlier rounds: <each review's link; each thread with what was done and its evidence>
Claims to falsify:
1. <a sentence the change rests on, written so a measurement could prove it false>
Do not modify: <the primary checkout at <path>, any branch>
Findings go: <on the PR | return only>
```

- **The base is the PR's own.** A layer of a stack is reviewed against the layer below, not `main`.
- **A claim is what the author believes sound**: "`structural-operations`, *X*, already requires
  the expected result, so the fix type is drift", "each new test fails with `src/` from the merge
  base". The issue's diagnosis and the plan's go here, as claims.
- **Nothing says where the defect is.** No root cause, no suspicion, no place to look first: a
  reviewer handed one finds it and stops.
- **Earlier rounds are decisions with their evidence**, so a rejected finding comes back only with
  a case its rejection did not consider.
- **From round 3**, the brief also asks the question in "Rounds".

Done when every field is filled or "none", and no line says what the author suspects.

## 2. Start the reviewer

A `general-purpose` subagent, the brief as its prompt, in the background. The setting is its
model:

- **Deep** (`model: opus`): every review at a ready point, and any round whose brief carries a
  new mechanism or rule.
- **Light** (`model: sonnet`): a return-only check, and a later round whose brief is limited to
  code the last round's response added.

## The reviewer

**Workspace.** Two detached worktrees, from `origin`:

```bash
git fetch origin <base branch> <branch>
git worktree add --detach .claude/worktrees/review-<pr>-r<round>-head <sha>
git worktree add --detach .claude/worktrees/review-<pr>-r<round>-base <merge base>
```

- Two reviews of one round can run at once (a deep and a light one): when the path exists, add a
  suffix to both names.
- They find `node_modules` through the primary checkout. When the change touches `package.json`
  or `package-lock.json`, run `npm ci` in each before running anything in it.
- **Probes go in the head worktree's `.scratch/`**, which git ignores. It is the only place a test
  probe runs: Vitest collects under its root, and nothing outside the checkout resolves the
  dependencies. `/tmp` and the session's scratchpad hold notes and outputs. Nothing goes under
  `tests/` or any tracked path.
- Run the suite as `npx vitest run tests/`; a plain run also collects the probes.
- A claim about what the app does is measured in the app, with `driving-obsidian` or a case file
  through `npm run case`, never in a bare CodeMirror.
- At the end, `git worktree remove --force` both, and leave the primary checkout as it was.

**Order.** Reproduce the case, derive the expected result from the specs, and locate the cause in
the code before reading the issue's or the plan's diagnosis. Then work through every check in the
mode file; the brief's claims are one of them.

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
3. `pull_request_review_write`, method `submit_pending`, event `COMMENT`, with the findings that
   belong to no line and the list of what was found sound in the body.

Each comment and the body open with the role, since everything posts under the maintainer's
account:

```
<!-- independent-review: reviewer, <mode>, round <n>, <sha> -->
**Reviewer** · <mode>, round <n>
```

No attribution footer of our own (`steward`, "Comments").

**Return** the review's URL and one line per finding (number, label, rung, sentence). A
return-only review returns the findings in full.

## 3. Verify, decide, answer

For each finding, in rank order:

1. **Run its case.** A PLAUSIBLE finding is measured, which confirms or disproves it, before it is
   acted on. One that cannot be measured in the session is recorded as unmeasured at `p2` or
   below, and filed at `p0` or `p1`, with the user's go-ahead.
2. **Decide one disposition**: **taken** (fixed, naming the commit), **rejected** (with the spec
   sentence or the measurement it rests on), **filed** (the issue), **recorded** (pre-existing and
   identical on the base), or **wrong** (and what showed it).
3. **Answer on the thread and resolve it.** The reply opens with
   `<!-- independent-review: author -->` and **Author** ·, disposition first. Thread ids come from
   `pull_request_read`, method `get_review_comments`; `resolve_review_thread` resolves.

The review's events are the review the author asked for, and the author's own replies come back
as one event each: echoes, which `steward` skips, and the marker is the text that tells them
apart. **The user is asked only** about an open
question, a decision that could go either way, and a finding that changes the design's direction
or pivots the proposal.

Done when every thread has its reply and is resolved, or is left open with the question to the
user named.

## 4. Record

The PR description's "Reviews" section is a summary across all rounds, rewritten as rounds
accumulate. The back and forth stays in the threads.

- One line per round: the review's link, mode, SHA, setting, the count of findings and of each
  disposition. A return-only check the author acted on gets a line too.
- What the rounds changed in the design.
- Lessons a later change can use.
- The threads a reader would not find on their own: a rejection, a finding shown wrong, one left
  open.

Trivial findings are not repeated there.

## Rounds

Rounds are counted across both modes: a proposal round and an implementation round of one change
are rounds 1 and 2. Each round is a fresh reviewer.

- **A significant change** is a response that changes a mechanism, a rule or a spec statement,
  changes the fix type or the scope, or adds code the round's reviewer did not read. A local fix
  to reviewed code, a test for reviewed behaviour, a rename or a wording fix is not, even when it
  changes behaviour.
- **A round converges** when the response to it makes no significant change and none of its
  findings is an unmeasured PLAUSIBLE one at `p0` or `p1`. Until one does, the next round runs.

**From round 3, ask about the rule first.** List every earlier finding whose fix added a
condition, a special case or a narrower rule, or reversed an earlier round's direction. When two
or more patch the same rule, they are evidence the rule is wrong, not exceptions to it: write the
rule that gives every expected result without them, take it back to proposal mode, update the PR,
and tell the user before writing more code. When they do not, run the round, and put the same
question in its brief.
