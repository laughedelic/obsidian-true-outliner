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

The template has fixed fields: the mode and round; the PR, the branch, the head SHA, the PR's
base branch and the merge base with it; the issue and its reproduction; the specs and research
notes the change touches; what the change depends on and does not touch (code, config, docs,
earlier PRs whose reviews it follows); for an implementation, the diff command; for a later round,
the earlier review threads; the claims to falsify; and what the reviewer must not modify. It has
no field for a root cause, a suspicion or a place to look first.

**The base is the PR's own.** For a PR on `main` it is `origin/main`. For a layer of a stack it
is the layer below: #91's diff is 2 files against its own base and 739 against its merge base with
`main` (`independent-reviews`, "Stacked layers"), so a review against `main` would credit the
layer with everything below it. A whole-stack comparison against `main` is a second reading the
brief may ask for, not the default.

**The issue's diagnosis is read last.** Of our 72 `kind/bug` issues, 37 carry a `## Mechanism` or
root-cause passage (`independent-reviews`, "Diagnoses in issues"), so handing over the issue hands
over a diagnosis. The reviewer reproduces the case, derives the expected result from the specs and
locates the cause in the code first, and only then reads the issue's and the plan's diagnosis,
which the brief lists among the claims to falsify. The same order applies in proposal mode, where
the plan under review carries the author's diagnosis.

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

The reviewer fetches the PR's base branch and the branch from `origin`, and adds two detached
worktrees under `.claude/worktrees/`: the branch's head, and the merge base with the PR's base.
Never a local `main`, which misled two reviewers in #337's sessions, and never the author's
checkout, which may carry unpushed work. The author pushes before briefing, so the reviewer
reviews the SHA the brief names, and the author may push again while the review runs (this
change's own first review saw that). The worktrees are detached because a worktree holding a
branch blocks every restack of it (`docs/pr-stacks.md`, "Worktrees hold branches hostage").

`.claude/worktrees/` is where our worktrees already live, and a worktree there finds
`node_modules` by walking up to the primary checkout (`scripts/bin-path.ts`). We measured a probe
in one worktree importing `src/` from both, run with `npx vitest` (`independent-reviews`, "The
differential sweep"). A worktree under `/tmp` has no `node_modules` above it.

Both worktrees resolve dependencies from the primary checkout's one `node_modules`. That is right
while the base and the head have the same lockfile, and a wrong baseline otherwise, the failure
#211 recorded (mocha 12 against 10.8.2). When the change touches `package.json` or
`package-lock.json`, the reviewer runs `npm ci` in each worktree before running anything in it.

Probes go in `.scratch/` in the head worktree, which `.gitignore` covers: never under `tests/` or
anywhere tracked. It is the only place a probe runs. Vitest collects only under its root, nothing
above the session's scratchpad has a `node_modules`, and `src/`'s extensionless imports do not
resolve under Node's type stripping, so the scratchpad holds notes and outputs only
(`independent-reviews`, "Where a probe runs"). A `.scratch/*.test.ts` probe is collected by a
plain `npx vitest run` in that worktree, so the reviewer runs the suite as `npx vitest run tests/`.
The reviewer removes both worktrees at the end, so everything the author needs to re-run a finding
is in the finding itself.

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
same thing in a review as on an issue. A finding about the plan or the tests (a wrong fix type, a
test that cannot fail) takes the rung of the defect it would let through. An editor case is drawn as `presenting-examples` draws one,
as a case file where it can be. The report ends with what the reviewer checked and found sound,
which is how the author can say what the review covered (#245's implementation review is the
example).

### The reviewer posts a GitHub review

The reviewer posts its findings on the PR as one review, the way Copilot's reviews arrive: each
finding that belongs to a line of the diff is an inline comment there, and the rest (a missing
gesture, a spec the change does not touch, the list of what was checked and found sound) go in
the review's body. The review's body opens with a line naming the mode and the round, `Independent
review: implementation, round 2, at <sha>`. The review is created with `commitID` set to the SHA
in the brief: without it GitHub attaches the review to the PR's current head, and inline lines
resolve against a file the reviewer never read. The reviewer also returns the same findings to
the author, so the author's next step does not wait on a notification.

Each finding is then a thread, and the thread is where its disposition lives: the author replies
with what was done and resolves it. Each round is a separate review on the PR's timeline, at
the SHA it read, so the record of the iterations is GitHub's own, and the next round's brief
lists the earlier threads rather than a copy of them.

The session posts under the maintainer's account, as the author's replies to Copilot did on
#246, so the review's state is `COMMENT`: GitHub does not let an account request changes on its
own PR, and nothing here needs it to. A reviewer that runs as another session rather than as a
subagent reaches the author through the PR's events. The review's events wake the author once per
comment (this change's first review woke it 17 times); the author acts on the report its reviewer
returned and reads those events as that report, not as new requests.

Alternatives considered:

- *Findings only in the PR description*, as #269 and #264 recorded them. The record is good to
  read and has no thread per finding, so a disposition cannot be answered or reopened where the
  finding is, and each round's list is rewritten by hand.
- *One PR comment per round.* A record, but not anchored to the lines, and nothing to resolve.

Every step worked from a cloud session through the GitHub MCP tools, in this change's first
review: creating, commenting on and submitting the review, reading its threads, replying and
resolving (`independent-reviews`, "Posting a review from a cloud session"). The session's own proxy
refuses GraphQL, and the MCP server's thread operations are not affected by that.

### The author verifies, then decides, then records

The author runs each finding's case before acting on it. A PLAUSIBLE finding is measured, which
confirms or disproves it, before it is acted on. One that cannot be measured in the session is
recorded as unmeasured only at `p2` or below; at `p0` or `p1` it is filed, with the user's
go-ahead, so a serious unmeasured finding never closes a round by being written down (`triage`,
"Re-verify before trusting a claim"). Each finding then takes one
disposition: **taken**, **rejected** with the evidence (a spec sentence, a measurement), **filed**
as an issue with the user's go-ahead, or **recorded** as pre-existing and identical on `main`. A
finding the author later shows to be wrong is recorded as wrong, as #273 recorded the typing
claim.

The disposition is the author's reply on the finding's thread, which it then resolves; a reply
that names a fix names the commit. The PR description keeps a short "Reviews" section, one line
per round linking its review with the counts of each disposition, plus the rejections and their
reasons, since those are what the maintainer most needs to check. #269 and #264 are the model for
how a rejection reads.

### Rounds converge, and every round from the third asks about the rule

The rule writes down the test our PRs already apply when they skip a re-review: the edits after
a review are local to code a reviewer has read (#245, #246 and #274 say so in those words). A
review's findings may be taken and fixed without another round, as long as the fixes stay local.

- **A significant change** is a response to a round that changes a mechanism, a rule or a spec
  statement, changes the fix type or the scope, or adds code the round's reviewer did not read.
  A local fix to reviewed code, a test for reviewed behaviour, a rename or a wording fix is not
  significant, even when it changes behaviour.
- A round **converges** when the author's response to it makes no significant change, and none of
  its findings is an unmeasured PLAUSIBLE one at `p0` or `p1` (see above).
- A round that does not converge is followed by another, from a fresh reviewer.

Both modes follow the rule, and the rounds are counted across them: a proposal round and an
implementation round of the same change are rounds one and two. Under this rule #264's second
round would not have converged, because its cost fix added a pre-check the reviewer had not read;
a third round would have read the pre-check and nothing else.

**From the third round on, every round first asks about the rule.** Before briefing it, the
author lists every finding of the earlier rounds whose fix added a condition, a special case or
a narrower rule, or reversed an earlier round's direction. When two or more of them patch the same
rule, the findings are evidence the rule is wrong rather than exceptions to it: the author writes
the rule that would give every expected result without the exceptions, takes it back to proposal
mode, updates the PR and tells the user before writing more code. When they do not, the round runs,
and its brief asks the reviewer the same question. #267 went through six proposals over about
20 hours, each patching the last review's exceptions (#267; `docs/research/created-seam-detection.md`),
and the check would have run before its third.

Alternatives considered:

- *A fixed limit*, two or three rounds. #264's second round found no defect; #269's second found
  eight things to take. No number fits both.
- *A round converges only when it finds nothing that changes behaviour.* This change's first draft
  said so. By it, #246, #264 and #274 each needed another round, and with 89 of 120 implementation
  findings taken in the survey nearly every round would need another.
- *A step-back only before the third implementation round.* #267's loop was in proposal rounds,
  and a loop that passes the check once can keep patching after it.

### What the modes check

`proposal.md`, for a plan, a design or an OpenSpec change:

- **The expected result and the cause, before the plan's.** Reproduce the case, derive the
  expected drawing from the specs and locate the cause in the code before reading the issue's
  and the plan's own, then compare. On #270 the issue's expected result was the output of the buggy fallback, and
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
- **The tests**: run them (`npx vitest run tests/`, which leaves the probes out); revert `src/`
  to the merge base in the head worktree and see each new test fail; mutate the conditions the
  fix adds and see a test fail (#269's surviving mutations); check that an e2e cannot pass by
  timing (#273).
- **A differential sweep against the base**, where the change is in `src/*.ts`: the same
  generated inputs through the merge base's functions and the head's, counting where they differ
  and sorting each difference into intended, regression and neutral (#264's 236 734 operations).
  A sweep that finds no difference counts for nothing until it has been shown to find one: a
  deliberate change on one side, or inputs that reach the changed lines (`independent-reviews`,
  "The differential sweep"). For a change in the plugin's CM6 or Obsidian wiring, the same case
  files run in both worktrees instead.
- **Code and specs agree**: each statement in the delta and in the requirements the change cites
  is true of the code, and each behaviour the code changes is stated somewhere.
- **Cost**, when a hot path changed: `finalize` on a large note, against the merge base.
- **The PR description's claims**, like any other claim.

## Risks / Trade-offs

- **A review costs a fresh context per round.** A round reads the specs and the code from
  nothing. The convergence rule bounds the count by what the responses change rather than by a
  number, so a change whose fixes keep reaching past reviewed code keeps paying; the question about
  the rule before every round from the third is the check on that.
- **The claims to falsify can steer.** A claim names what the author believes, and a reviewer may
  spend its time there. The reviewer's mode file asks it to work through its whole list, of which
  the claims are one item.
- **The worktree measurements are from one cloud session.** The paths and the vitest behaviour
  are the same locally; whether a local stop hook reads `.claude/worktrees/` the way the cloud's
  does is not measured, and the ignore entry is harmless either way.
- **Fix-type words live only in the skill.** If a later change defines them in
  `openspec/config.yaml`, the skill's sentence becomes a pointer.

## Open Questions

- **Should the proposal review run before the maintainer reviews the plan, or after?** The design
  runs it once the draft PR is open (AGENTS.md, step 2) and before the maintainer reviews, so the
  maintainer reads a plan that has already absorbed the review's findings. Running it after would
  let the maintainer's review steer what the agent review checks.
- **How much of the record stays in the PR description?** With the threads holding each finding,
  the description could drop the "Reviews" section to a list of links, or keep the rejections in
  full as the design says. The rejections are the part a reader checks, and the part a thread
  list makes hardest to find.
