## Context

See proposal.md, "Why". #337 carries the evidence from the sessions, and
[`docs/research/independent-reviews.md`](../../../docs/research/independent-reviews.md) the survey
of the review sections in our PRs, the workspace measurements and the comparison of the two
settings. The skills this one sits beside set its form: `triage` is all reference,
`driving-obsidian` is two procedures that each end on a condition a session can check,
`presenting-examples` is how a finding about the editor is drawn, and `steward` is how a session
treats a PR's events.

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
  question the rule and the method that keeps finding exceptions to it.

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

### When a review runs

A **ready point** is a commit the author puts up for review: the plan once the draft PR holds it,
a checkpoint that closes a task group, and the head before the PR is marked ready. Each gets a
review that posts on the PR. Between ready points the author may ask for a **return-only check**
of any commit, pushed or not, which returns its findings instead of posting them.

### The skill speaks to the author; the reviewer is started with a brief and a model

The description triggers on the author's moments: a ready point, and the user asking for a review
or a second opinion. The reviewer is a `general-purpose` subagent started with the brief. The brief
names the skill's files by their path in the author's checkout, because the tree under review may
predate the skill; the skill is the reviewer's tool, not its subject. A reviewer started any other
way (another session, another harness) reads the same files.

**Deep or light is the model, chosen per call.** The Agent tool takes a `model` per call;
reasoning effort is set only in an agent definition under `.claude/agents/` or inherited from the
session (Claude Code's subagent documentation). The skill names two settings:

- **Deep**, on Opus: the first review at every ready point, and the whole-change review before
  the PR is marked ready.
- **Light**, on Sonnet: a return-only check, and a later round whose brief is limited to the diff
  of the last round's response.

Where both could apply, the first review at a ready point is deep. Both inherit the session's
effort, which the author cannot always see, so each round's record names the model and the effort
when it is known.

On one brief, the plan of this change at round 2, both settings reached nine of the same themes,
each found problems the other did not, Sonnet took about two thirds of Opus's time and slightly
fewer tokens, and no finding of either was shown wrong (`docs/research/independent-reviews.md`,
"Deep and light on one brief"). That is one run of each, in proposal mode, on a change with no
code: it supports light where light is used and does not test it on code. Task 5.1 runs both on an
implementation.

Alternatives considered:

- *An agent definition per setting*, holding the model and the effort, linked into
  `.claude/agents/` from inside the skill. Claude Code loads one through a symlink
  (`docs/research/independent-reviews.md`, "An agent definition through a symlink"). It is the
  only way to fix the effort, and it takes one file per combination of model and effort; with the
  model chosen per call, two settings need none.
- *Copilot through a custom agent* in `.github/agents/`. Copilot's code review does not use
  custom agents; it reads skills from `.github/skills` (below).
- *A skill with `context: fork`*, which runs its own content in a subagent. The author would then
  not have the author's half in its context, and the brief would have to travel as arguments.

### Copilot's review gets the checks, not the procedure

Copilot's code review reads skills from `.github/skills`, uses one when it is relevant, and does so
more often when the directory has a review-flavoured name (GitHub's Copilot code review
documentation); its own review comments offer a `.github/skills/code-review/SKILL.md` for review
instructions. That file points Copilot at `proposal.md` or `implementation.md` by what the PR
changes, and at the order and the form of a finding in `SKILL.md`, and tells it to start no agent,
create no worktree and post no second review. `.github/skills/` holds no link to
`independent-review`, whose author half would have Copilot brief a subagent.

The pointer is the one skill that is not a link into `.agents/skills/`: under `.claude/skills/` a
`code-review` directory would take the name of Claude Code's built-in skill. `AGENTS.md`'s "Agent
files" says so.

### The brief is a template of facts and claims

The template has fixed fields: the mode and round; the PR, the branch, the head SHA, the PR's
base branch and the merge base with it; the issue and the reproduction; the specs and research
notes the change touches; what the change depends on and does not touch (code, config, docs,
earlier PRs whose reviews it follows); for an implementation, the diff command; the earlier
rounds; the claims to falsify; what the reviewer must not modify; and where the findings go. It
has no field for a root cause, a suspicion or a place to look first.

**The base is the PR's own.** For a PR on `main` it is `origin/main`; for a layer of a stack it is
the layer below, which changes what a stacked layer's diff holds by two orders of magnitude
(`docs/research/independent-reviews.md`, "Stacked layers"). A whole-stack comparison against
`main` is a second reading the brief may ask for.

**The diagnosis stays out of the brief.** About half our bug issues carry the author's diagnosis
(`docs/research/independent-reviews.md`, "Diagnoses in issues"), and a plan under review carries
one by its nature. The brief names the issue and the plan; the reviewer reproduces the case,
derives the expected result from the specs and locates the cause in the code before it reads
either, and then tests their diagnosis as it tests any claim. The brief never restates the
diagnosis, even as a claim, because the brief is read first. The reproduction travels the same
way: a case file's `before` column and its keys, with no result column, since an `expected` is the
author's answer and #270's was the buggy fallback's (#337). "Depends on" names files and documents
the change relies on, not the function the author blames.

A **claim to falsify** is a sentence about what the author believes is sound, written so a
measurement could prove it false: "`structural-operations`, *X*, already requires the expected
result, so the fix type is drift", "no other caller of `f` reads the field the fix changes", "each
new test fails with `src/` taken from the merge base". It never says where the defect is: in the
last v1 Bugfix run the reviewer's top finding was the one the brief suggested (#337).

The proposal and the PR description are under review, not part of the brief.

Alternatives considered:

- *A free-form brief with a list of what to leave out.* Run 1's brief on 09-20 worked, and the
  four v1 Bugfix briefs did not; a fixed set of fields is what kept the first one clean.
- *The diagnosis as a claim to falsify.* Read first, it says where to look as a hint does.
- *No claims at all, the issue and the diff only.* The reviewer then spends its effort on what
  is easy to check rather than on what the change depends on.

### Each later round sees the earlier rounds

The brief's "Earlier rounds" field links each earlier review, whose threads hold every finding
with what was done and its evidence (the spec sentence a rejection rests on, the commit that fixed
it), and quotes the "Reviews" line of each return-only check, which lists that check's rejected
and wrong findings. A reviewer reopens a rejected finding only with a case the rejection did not
consider. #274's plan review narrowed the fix and its implementation review widened it again with
no view of the first; the earlier threads are the shared view that was missing.

### The reviewer's workspace

The reviewer fetches the PR's base branch and the branch, and adds two detached worktrees under
`.claude/worktrees/`: the commit under review, and the merge base with the PR's base. A commit the
author has not pushed is reachable the same way, since a worktree shares the checkout's objects;
uncommitted work is not reviewed. Never a local `main`, which misled two reviewers in #337's
sessions, and never the author's working tree. The worktrees are detached because a worktree
holding a branch blocks every restack of it (`docs/pr-stacks.md`, "Worktrees hold branches
hostage"), and a review that runs beside another of the same round takes a suffix.

The fetch moves the primary checkout's remote-tracking refs and the worktrees add git metadata
there; both are expected. "Do not modify" means the primary checkout's tracked files and every
branch. The reviewer removes the worktrees it made, and only those.

A worktree under `.claude/worktrees/` finds `node_modules` by walking up to the primary checkout
(`scripts/bin-path.ts`), so both trees run one install. When the change touches `package.json` or
`package-lock.json`, the reviewer runs `npm ci` in each worktree first: a shared install is a wrong
baseline then, the failure #211 recorded.

Probes go in `.scratch/` in the head worktree, which `.gitignore` covers: never under `tests/` or
anywhere tracked. It is the only place a test probe runs (`docs/research/independent-reviews.md`,
"Where a probe runs"); `/tmp` and the session's scratchpad hold notes and outputs. The suite runs
as `npx vitest run tests/`, which leaves the probes out. Everything the author needs to re-run a
finding is in the finding.

Two measured side effects are fixed in this change rather than worked around in the skill:

- `.claude/worktrees/` shows as `??` in the primary checkout's `git status`, the state a cloud
  session's stop hook reads as uncommitted work. `.gitignore` gains `/.claude/worktrees/` and
  `/.scratch/`.
- Vitest's default exclusions are `node_modules` and `.git` only, so the primary checkout's
  `npm test` collects a nested worktree's tests as well. `vitest.config.ts` adds
  `.claude/worktrees/**` to `configDefaults.exclude`.

### A finding is ranked, labelled and runnable

Each finding states the defect in one sentence, then its case, where it lives (file and line, the
spec requirement), and how the base behaves on the same case: the same, better or worse.

- **CONFIRMED**: the reviewer ran the case and saw the result. The case is in the finding: a case
  file, a probe's code and output, or a sweep's counts and one example.
- **PLAUSIBLE**: inferred from reading. The finding says what would confirm it.

Findings are ranked by what leaving them would cost, in `triage`'s terms. A finding about the plan
or the tests (a wrong fix type, a test that cannot fail) takes the rung of the defect it would let
through. An editor case is drawn as `presenting-examples` draws one, as a case file where it can
be. The report ends with what the reviewer checked and found sound, which is how the author can
say what the review covered (#245's implementation review is the example).

### The reviewer posts a GitHub review, unless the brief says to return only

The reviewer posts its findings on the PR as one review, the way Copilot's reviews arrive: each
finding that belongs to a line of the diff is an inline comment there, and the rest (a missing
gesture, a spec the change does not touch, the list of what was checked and found sound) go in
the review's body. The review is created with `commitID` set to the SHA in the brief: without it
GitHub attaches the review to the PR's current head, and inline lines resolve against a file the
reviewer never read. The comments are added to the pending review and submitted together.

GitHub still sends one event per inline comment; they arrive together, and one read takes them all
(`docs/research/independent-reviews.md`, "Posting a review from a cloud session"). So the reviewer
returns the review's URL and one line per finding, and the author reads the findings in full from
the threads. Each finding is a thread, and the thread is where its disposition lives. Each round is
a separate review on the PR's timeline, at the SHA it read.

The session posts under the maintainer's account, so the review's state is `COMMENT`: GitHub does
not let an account request changes on its own PR, and nothing here needs it to.

**Every comment a session posts carries its role.** The reviewer's comments, the author's replies,
an author's note on the PR and the maintainer's own comments all post under one account. Each
comment a session posts opens with a marker and a visible role, and carries no attribution footer
of our own (`steward`, "Comments"):

```
<!-- agent: reviewer, proposal, round 2, 658fc92 -->
**Reviewer** · proposal, round 2
```

and `<!-- agent: author -->` with **Author** for a reply or a note. A comment with no marker is the
maintainer's. `steward` gains the rule: a woken session reads a reviewer comment as a review to
answer when it is the author, an author comment as an echo when it posted it, and an unmarked one
as the maintainer's. That keeps the rule where a woken session reads it, rather than in this skill,
which a woken session has not loaded.

**Return only.** The brief has a field for where the findings go: on the PR, or returned to the
author only. A return-only check returns its findings in full. It is a round: it counts towards
the rounds below, and it gets its line in the PR description's "Reviews" section, with the findings
it rejected or showed wrong, so the next brief can quote them. A ready point always posts, because
the threads are the record the maintainer reads.

Alternatives considered:

- *Findings only in the PR description*, as #269 and #264 recorded them. The record is good to
  read and has no thread per finding, so a disposition cannot be answered or reopened where the
  finding is, and each round's list is rewritten by hand.
- *One PR comment per round.* A record, but not anchored to the lines, and nothing to resolve.
- *Markers only on review threads.* A woken session would read an author's note on the PR as the
  maintainer's words.

### The author verifies, then decides, then records

The author runs each finding's case before acting on it. A PLAUSIBLE finding is measured, which
confirms or disproves it, before it is acted on. One that cannot be measured in the session is
recorded as unmeasured only at `p2` or below; at `p0` or `p1` it is filed, so a serious unmeasured
finding never closes a round by being written down (`triage`, "Re-verify before trusting a
claim"). Each finding then takes one disposition:

- **taken**: fixed, naming the commit;
- **rejected**, with the spec sentence or the measurement it rests on;
- **filed** as an issue, with the user's go-ahead. A defect outside the change, pre-existing or
  not, is filed, as AGENTS.md's "A follow-up is an issue" requires (#245 filed #250 this way);
- **recorded**: not a defect, or one already tracked, naming the issue;
- **wrong**, with what showed it, as #273 recorded the typing claim.

The disposition is the author's reply on the finding's thread, which it then resolves. The full
exchange stays in the threads. The PR description's "Reviews" section, rewritten with
`update_pull_request` as rounds accumulate (a REST write appends a footer, AGENTS.md,
"Conventions"), is a summary across all rounds: one line per round with its link, mode, SHA,
model and effort, and the counts; what the rounds changed in the design; the lessons a later
change can use; and the threads a reader would not find on their own (a rejection, a finding shown
wrong, one left open). Trivial findings are not repeated there.

**What the maintainer is asked.** The author acts on findings itself, and brings the user only
what is theirs: an open question, a decision that could go either way, a finding that changes the
design's direction or pivots the proposal, the go-ahead to file an issue, and the step-back below.

### Rounds: one deep review, light iterations, and the author's judgement

Rounds are counted across both modes and include return-only checks.

- **A ready point opens with a deep review** of the whole change.
- **A response that changes what the change does or states** (behaviour, a mechanism, a rule, a
  spec statement, the fix type or the scope, however small the edit) is followed by a light round
  limited to that response's diff. A test for reviewed behaviour, a rename, a comment or a wording
  fix is not.
- **The author may judge a round unnecessary** and skip it, saying why in the thread it answers
  and on the round's line in "Reviews". No deterministic test separates a fix that needs another
  look from one that does not, and the maintainer reads the reason.
- **Before the PR is marked ready, a deep review reads the whole change again**, so a series of
  light rounds, each on its own diff, cannot leave the whole unreviewed since the first.
- **A round converges** when its response needs no further round, by the rule or by the author's
  stated judgement, and none of its findings is an unmeasured PLAUSIBLE one at `p0` or `p1`.

This departs from #246 and #274, which skipped a re-review after fixes that changed a mechanism
and widened the scope, on the grounds that the edits were local to reviewed code. That test is the
v2 Bugfix prompt's re-review rule, whose clauses disagree in exactly those cases and which #348
records as "bent twice". Here the default is a light round, and skipping it is a decision the
author states rather than a test it applies. #264's second round, whose cost fix added a pre-check
no reviewer read, would by default have had a light third round over the pre-check.

**Before every round from the third, the author asks about the rule.** List every earlier finding
whose fix added a condition, a special case or a narrower rule, or reversed an earlier round's
direction. When two or more patch the same rule, ask two more things:

- **Are the findings about the rule, or about constraints every candidate shares?** #267's step-back
  found the findings about lists, ids and spacing "recur under every approach, and say nothing
  against any one of them" (`docs/research/created-seam-detection.md`).
- **Do they come from cases built by hand that a generated check would settle?** #267's six
  proposals were each sunk by the next review's hand-built cases; its step-back named the method,
  not the rule, and recommended an oracle "so a review can check counts rather than build cases".

Then the author stops, updates the PR with the list and the answers, and asks the user to choose:
a rule written anew, a generated check before the next round, or another round as it stands.
Rewriting the rule alone is what #267's approaches 4 to 6 already did. Rounds 1 and 2 of #351
each patched the convergence rule; this section is the maintainer's choice at that step-back.

Alternatives considered:

- *A fixed limit*, two or three rounds. #264's second round found no defect; #269's second found
  eight things to take. No number fits both.
- *An exemption for local fixes to reviewed code*, the v2 prompt's rule, applied as a test.
  Above.
- *A rule with no room for judgement.* Every behaviour change would start a round, including
  ones the author can see need none, and a change could spend more on light rounds than on its
  work; nothing would ever look at the whole again.
- *A round converges only when it finds nothing that changes behaviour.* Every taken finding would
  start a full round; the survey has three in four implementation findings taken.
- *A step-back only before the third implementation round.* #267's loop was in proposal rounds,
  and a loop that passes the check once can keep patching after it.

### What the modes check

`proposal.md`, for a plan, a design or an OpenSpec change:

- **The expected result and the cause, before the plan's.** Reproduce the case, derive the
  expected drawing from the specs and locate the cause in the code before reading the issue and the
  plan, then compare. On #270 the issue's expected result was the output of the buggy fallback, and
  three reviews accepted it (#337).
- **The fix type**, quoting the requirement: *drift* (the specs already require the expected
  result and the code departs; no delta), *gap* (the specs are silent; the delta adds), *conflict*
  (the specs require today's behaviour or contradict each other; the delta modifies, decided by
  the issue or the maintainer). #269 moved from gap to conflict when a review read the requirement
  literally.
- **Assumptions**, about Obsidian, CodeMirror and our parse: list them, measure the cheap ones in
  the app (`driving-obsidian`, or a case file through `npm run case`), not in a bare CodeMirror,
  and name the rest. Two of #273's reviews claimed a join from bare CM6 that the app does not make.
- **The design as a whole**: every entry point that reaches the same rule (keys, commands, the
  palette, a paste, a drag, a delete), and the same defect elsewhere.
- **Each decision**, against its strongest alternative and a case where the alternative wins.
- **Blind spots** across document shapes and modes.
- **Consistency** within the change's artifacts, with every spec the change would make untrue,
  with the code's other callers, and with `AGENTS.md`'s conventions.
- **The tasks**: whether a verification can pass on a result that proves nothing, and whether each
  negative control would make its test fail.

`implementation.md`, for a partial or complete implementation:

- **The design against the code**: does the code do what the design says, and did a decision
  change on the way without the design saying so. Poke holes in both.
- **Reachability**: a defect the change calls latent or out of reach is checked through every
  gesture that reaches the code (#246's delete and drag).
- **The tests**: run them; revert `src/` to the merge base in the head worktree and see each new
  test fail; mutate the conditions the fix adds and see a test fail (#269's surviving
  mutations); check that an e2e cannot pass by timing (#273).
- **A differential sweep against the base**, where the change is in `src/*.ts`: the same inputs
  through the merge base's code and the head's, every difference counted and sorted into intended,
  regression and neutral. A sweep that finds no difference counts for nothing until it has been
  shown to find one (`docs/research/independent-reviews.md`, "The differential sweep"). For a
  change in the plugin's CodeMirror or Obsidian wiring, the same case files run in both worktrees
  instead.
- **Code and specs agree**: each statement in the delta and in the requirements the change cites
  is true of the code, and each behaviour the code changes is stated somewhere.
- **Cost**, when a hot path changed, head against base.
- **The PR description's claims**, like any other claim.

## Risks / Trade-offs

- **A review costs a fresh context per round.** A light round follows each change to behaviour
  unless the author states why not, so a change with many taken findings runs more rounds than our
  PRs have. Each is light and limited to one response's diff; task 5.3 measures what one costs.
- **The claims to falsify can steer.** A claim names what the author believes, and a reviewer may
  spend its time there. The mode file asks it to work through its whole list, of which the claims
  are one item.
- **The worktree measurements are from one cloud session.** The paths and the vitest behaviour
  are the same locally; whether a local stop hook reads `.claude/worktrees/` the way the cloud's
  does is not measured, and the ignore entry is harmless either way.
- **Fix-type words live only in the skill.** If a later change defines them in
  `openspec/config.yaml`, the skill's sentence becomes a pointer.
- **Light is supported by one run.** On one proposal brief; task 5.1 adds an implementation.
