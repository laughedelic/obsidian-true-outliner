## Context

See proposal.md, "Why". #337 carries the evidence from the sessions, and
[`docs/research/independent-reviews.md`](../../../docs/research/independent-reviews.md) the survey
of the review sections in our PRs and the workspace measurements. The skills this one sits beside
set its form: `triage` is all reference, `driving-obsidian` is two procedures that each end on a
condition a session can check, and `presenting-examples` is how a finding about the editor is
drawn.

Three roles take part, and the skill speaks to two of them:

- **The author** is the session that owns the change. It writes the brief, starts the reviewer,
  verifies each finding, acts on it and records it in the PR.
- **The reviewer** is a fresh agent with none of the author's context, started with the brief.
  It reads the skill's reviewer section and one mode file.
- **The maintainer** reads the PR's "Reviews" section, and answers what the author cannot decide.

## Goals / Non-Goals

**Goals:**

- A session at a ready point writes a brief from a fixed template in a few minutes, and the
  brief holds nothing the reviewer could take as the answer.
- Every finding arrives with a case the author can run, and a label saying whether the reviewer
  ran it.
- The PR records every finding and what was done with it, so a later review, the maintainer and
  the next round read the same list.
- A loop of rounds ends on a stated condition, and a loop that keeps patching one rule stops to
  question the rule.

**Non-Goals:** see proposal.md.

## Decisions

### One skill, the modes behind pointers

`SKILL.md` holds what every review needs, and `proposal.md` and `implementation.md` each hold one
mode's checks. A review runs one mode, so the other is never read; and the reviewer is told which
file to read, so the pointer cannot misfire. Alternatives considered:

- *Two skills*, one per mode. Each would repeat the brief, the workspace and the findings form,
  or point at a third file for them, and the author would have two descriptions to tell apart.
- *One file.* About 250 lines, of which a reviewer needs half. The mode checks are flat lists of
  peers, and a list that long buries the author's steps above it.

### The skill speaks to the author first

The description triggers on the author's moments: a proposal or an implementation is ready, the
user asks for a review or a second opinion. The reviewer does not need the description to fire,
because the brief names the files it reads by path. A subagent's skill list is not something we
control, and a path in the brief works in any harness, Copilot's included.

### The brief is a template of facts and claims

The template has fixed fields: the mode and round; the PR, the branch, the head SHA and the
merge base with `origin/main`; the issue and its reproduction; the specs and research notes the
change touches; for an implementation, the diff command; for a later round, the earlier findings
and what was done with each; and the claims to falsify. It has no field for a root cause, a
suspicion or a place to look first.

A **claim to falsify** is a sentence the change rests on, written so a measurement could prove it
false: "`structural-operations`, *X*, already requires the expected result, so the fix type is
drift", "no other caller of `f` reads the field the fix changes", "each new test fails with
`src/` taken from the merge base". The author lists the claims, and the reviewer's job is to
break them. The difference from a hypothesis is the direction: a hypothesis tells the reviewer
where the defect is, and in the last v1 Bugfix run the reviewer's top finding was the one the
brief suggested (#337). A claim tells the reviewer what the author believes is sound.

The proposal and the PR description are under review, not part of the brief: the reviewer reads
them as the artifact and checks their claims like any other.

Alternatives considered:

- *A free-form brief with a list of what to leave out.* Run 1's brief on 09-20 worked, and the
  four v1 Bugfix briefs did not; a fixed set of fields is what kept the first one clean.
- *No claims at all, the issue and the diff only.* The reviewer then spends its effort on what
  is easy to check rather than on what the change depends on.

### Each later round sees the earlier rounds' findings

The brief for round 2 or later lists every earlier finding with what was done with it and the
evidence for that: the spec sentence a rejection rests on, the test that pins a fix. A reviewer
reopens a rejected finding only with a case the rejection did not consider. #274's plan review
narrowed the fix and the implementation review widened it again with no view of the first; a
listed rejection with its reason is the shared view that was missing. This is the one place the
brief carries the author's conclusions, and it carries them as decisions with evidence, not as
hints about where to look.

### The reviewer's workspace

The reviewer fetches `origin/main` and the branch, and adds two detached worktrees under
`.claude/worktrees/`: the branch's head, and the merge base. Never a local `main`, which misled
two reviewers in #337's sessions, and never the author's checkout, which may carry unpushed
work. The author pushes before briefing, so the reviewer reviews the SHA the brief names. The
worktrees are detached because a worktree holding a branch blocks every restack of it
(`docs/pr-stacks.md`, "Worktrees hold branches hostage").

`.claude/worktrees/` is where our worktrees already live, and a worktree there finds
`node_modules` by walking up to the primary checkout (`scripts/bin-path.ts`). We measured a probe
in one worktree importing `src/` from both, run with `npx vitest` (`independent-reviews`, "The
differential sweep"). A worktree under `/tmp` has no `node_modules` above it.

Scratch probes go in `.scratch/` in the head worktree, which `.gitignore` covers, or in the
session's scratchpad: never under `tests/` or anywhere tracked. The reviewer removes both
worktrees at the end, so everything the author needs to re-run a finding is in the finding
itself.

Two measured side effects are fixed in this change rather than worked around in the skill:

- `.claude/worktrees/` shows as `??` in the primary checkout's `git status`, the state a cloud
  session's stop hook reads as uncommitted work. `.gitignore` gains `/.claude/worktrees/` and
  `/.scratch/`.
- Vitest's default exclusions are `node_modules` and `.git` only, so the primary checkout's
  `npm test` collects a nested worktree's tests as well. `vitest.config.ts` adds
  `.claude/worktrees/**` to `configDefaults.exclude`. `tsc` and ESLint read named directories
  and are unaffected.

### A finding is ranked, labelled and runnable

Each finding states the defect in one sentence, then its case, where it lives (file and line, the
spec requirement), and how `main` behaves on the same case: the same, better or worse.

- **CONFIRMED**: the reviewer ran the case and saw the result. The case is in the finding: a case
  file, a probe's code and output, or a sweep's counts and one example.
- **PLAUSIBLE**: inferred from reading. The finding says what would confirm it.

Findings are ranked by what leaving them would cost, in `triage`'s terms, so the rungs mean the
same thing in a review as on an issue. An editor case is drawn as `presenting-examples` draws one,
as a case file where it can be. The report ends with what the reviewer checked and found sound,
which is how the author can say what the review covered (#245's implementation review is the
example).

### The reviewer posts a GitHub review

The reviewer posts its findings on the PR as one review, the way Copilot's reviews arrive: each
finding that belongs to a line of the diff is an inline comment there, and the rest (a missing
gesture, a spec the change does not touch, the list of what was checked and found sound) go in
the review's body. The review's body opens with a line naming the mode and the round, `Independent
review: implementation, round 2, at <sha>`. The reviewer also returns the same findings to the
author, so the author's next step does not wait on a notification.

Each finding is then a thread, and the thread is where its disposition lives: the author replies
with what was done and resolves it. Each round is a separate review on the PR's timeline, at
the SHA it read, so the record of the iterations is GitHub's own, and the next round's brief
lists the earlier threads rather than a copy of them.

The session posts under the maintainer's account, as the author's replies to Copilot did on
#246, so the review's state is `COMMENT`: GitHub does not let an account request changes on its
own PR, and nothing here needs it to. A reviewer that runs as another session rather than as a
subagent reaches the author through the PR's events. Where the author is woken by its own review,
it treats the event as the report it already holds, not as a new request (#335's steward rules on
echoes).

Alternatives considered:

- *Findings only in the PR description*, as #269 and #264 recorded them. The record is good to
  read and has no thread per finding, so a disposition cannot be answered or reopened where the
  finding is, and each round's list is rewritten by hand.
- *One PR comment per round.* A record, but not anchored to the lines, and nothing to resolve.

Whether resolving a thread works from a cloud session is measured in this change's first review
(tasks, group 1): `resolve_review_thread` is GraphQL behind the GitHub MCP server, and the
session's own proxy refuses GraphQL (`docs/research/cloud-session-github-access.md`).

### The author verifies, then decides, then records

The author runs each finding's case before acting on it. A PLAUSIBLE finding is measured or is
recorded as unmeasured; it is not acted on as if it were confirmed. Each finding then takes one
disposition: **taken**, **rejected** with the evidence (a spec sentence, a measurement), **filed**
as an issue with the user's go-ahead, or **recorded** as pre-existing and identical on `main`. A
finding the author later shows to be wrong is recorded as wrong, as #273 recorded the typing
claim.

The disposition is the author's reply on the finding's thread, which it then resolves; a reply
that names a fix names the commit. The PR description keeps a short "Reviews" section, one line
per round linking its review with the counts of each disposition, plus the rejections and their
reasons, since those are what the maintainer most needs to check. #269 and #264 are the model for
how a rejection reads.

### Rounds converge, and the third asks about the rule

A proposal usually takes one round, and another when its response changes the fix type, the
mechanism or the scope. An implementation takes rounds until one converges:

- **A significant finding** is CONFIRMED and changes behaviour, a spec statement or a test's
  verdict.
- **A significant change** is a response that changes a mechanism, or touches code the last
  reviewer did not read.
- A round **converges** when it brings no significant finding, and the author's response to it
  makes no significant change. A rename, a test for behaviour already reviewed or a wording fix
  is not significant, as #245, #246 and #274 reasoned when they skipped a re-review.

Each round is a fresh reviewer. Before briefing a third, the author lists every finding of the
first two that was fixed by adding a condition, a special case or a narrower rule. When two or
more of them patch the same rule, the findings are evidence the rule is wrong rather than
exceptions to it: the author writes the rule that would give every expected result without the
exceptions, takes it back to proposal mode, updates the PR and tells the user before writing more
code. When they do not, the third round runs as usual, and its brief asks the reviewer the same
question. #267's six designs over about 20 hours, each patching the last review's exceptions, are
the case this step exists for (#337).

Alternatives considered:

- *A fixed limit*, two or three rounds. #264's second round found no defect; #269's second found
  seven things to take. No number fits both.
- *Stopping when a round finds nothing*. A round that finds nothing but is answered with a new
  mechanism has not reviewed that mechanism.

### What the modes check

`proposal.md`, for a plan, a design or an OpenSpec change:

- **The expected result.** Derive the expected drawing from the specs before reading the issue's
  own, then compare. On #270 the issue's expected result was the output of the buggy fallback, and
  three reviews accepted it (#337).
- **The fix type**, quoting the requirement: *drift* (the specs already require the expected
  result and the code departs; no delta), *gap* (the specs are silent; the delta adds), *conflict*
  (the specs require today's behaviour or contradict each other; the delta modifies, decided by
  the issue or the maintainer). #269 moved from gap to conflict when a review read the requirement
  literally.
- **Assumptions**, about Obsidian, CodeMirror and our parse: list them, measure the cheap ones,
  name the rest. A claim about what the app does is measured in the app (`driving-obsidian`, or
  a case file through `npm run case`), not in a bare CodeMirror: two of #273's reviews claimed a
  join from bare CM6 that the app does not make, and four reviewer findings in the survey were
  later disproved by a measurement in the app (`independent-reviews`).
- **The design as a whole**: every entry point that reaches the same rule (keys, commands, the
  palette, a paste, a drag, a delete), and the same defect elsewhere.
- **Each decision**, against its strongest alternative and a case where the alternative wins.
- **Blind spots** across document shapes and modes (tabs, ordered runs, quotes and callouts,
  headings, frontmatter, tables, code, zoom and fold, outline mode off, mobile, undo).
- **Consistency** within the change's artifacts, with every spec the change would make untrue,
  and with the code's other callers.
- **The tasks' negative controls**: would each one make its test fail?

`implementation.md`, for a partial or complete implementation:

- **The design against the code**: does the code do what the design says, and did a decision
  change on the way without the design saying so. Poke holes in both.
- **Reachability**: a defect the change calls latent or out of reach is checked through every
  gesture that reaches the code (#246's delete and drag).
- **The tests**: run them; revert `src/` to the merge base in the head worktree and see each new
  test fail; mutate the conditions the fix adds and see a test fail (#269's surviving
  mutations); check that an e2e cannot pass by timing (#273).
- **A differential sweep against `main`**, where the change is in `src/*.ts`: the same generated
  inputs through the merge base's functions and the head's, counting where they differ and
  sorting each difference into intended, regression and neutral (#264's 236 734 operations). For
  a change in the plugin's CM6 or Obsidian wiring, the same case files run in both worktrees
  instead.
- **Code and specs agree**: each statement in the delta and in the requirements the change cites
  is true of the code, and each behaviour the code changes is stated somewhere.
- **Cost**, when a hot path changed: `finalize` on a large note, against the merge base.
- **The PR description's claims**, like any other claim.

## Risks / Trade-offs

- **A review costs a fresh context per round.** A round reads the specs and the code from
  nothing. The convergence rule bounds the count by what the rounds find rather than by a number,
  so a change that keeps producing significant findings keeps paying; the step-back after the
  second round is the check on that.
- **The claims to falsify can steer.** A claim names what the author believes, and a reviewer may
  spend its time there. The reviewer's mode file asks it to work through its whole list, of which
  the claims are one item.
- **The worktree measurements are from one cloud session.** The paths and the vitest behaviour
  are the same locally; whether a local stop hook reads `.claude/worktrees/` the way the cloud's
  does is not measured, and the ignore entry is harmless either way.
- **Fix-type words live only in the skill.** If a later change defines them in
  `openspec/config.yaml`, the skill's sentence becomes a pointer.

## Open Questions

- **Should the proposal review run before the draft PR opens, or after?** The design says after
  the proposal is written and before the maintainer reviews it, so the maintainer reads a plan
  that has already absorbed the review's findings. The PR could open first and the review land on
  it as a comment.
- **How much of the record stays in the PR description?** With the threads holding each finding,
  the description could drop the "Reviews" section to a list of links, or keep the rejections in
  full as the design says. The rejections are the part a reader checks, and the part a thread
  list makes hardest to find.
