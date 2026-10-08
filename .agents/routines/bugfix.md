<!--
The Bugfix trigger's prompt points here: "Follow .agents/routines/bugfix.md from the checkout."
A run on one chosen issue adds a line "Target: #<n>". A change to this file is a change to the
routine, reviewed on its PR like any other.
-->

# Bugfix routine

A run starts in a fresh cloud session, unattended. It takes one bug from its report to a PR that
waits only on the maintainer's manual pass, and then ends. `AGENTS.md`'s change lifecycle and
branching rules apply throughout; this file adds what a run picks, where it stops, and what it
leaves behind.

When the trigger's prompt names a target (`Target: #<n>`), the run skips step 1 and works on that
issue, whatever its labels; every other step holds.

## 1. Select

- List the open PRs (`AGENTS.md`'s REST listing) and the open `kind/bug` issues. A bug is available
  when no open PR addresses it and it carries neither `needs/decision` nor `needs/research`.
- Rank by priority. Where the latest re-validation or triage comment on an issue disagrees with its
  label, the comment wins.
- Take the highest-ranked available bug. Stacking is never a reason to pass one over: a stacked PR
  can be opened from this session. Apply `AGENTS.md`'s stacking test (code the change reads, or a
  merge conflict in a path it touches) and state the reading in the PR.

## 2. Confirm

- Re-verify the report against current `main` (`triage`).
- Reproduce it as a drawn case file (`presenting-examples`, "Case files"), run in the real app on
  desktop and under `--mobile` with `npm run case -- <file> --record`. The recorded column is the
  `actual`; an issue's drawing is not a measurement. A cloud session provisions the app first
  (`docs/cloud-sessions.md`).
- Only when no gesture reaches the bug does a unit probe stand in for the case, and the PR says
  why.
- When it does not reproduce: comment on the issue with what was run, drawn, label it `needs/repro`,
  and end the run.

## 3. Classify

Against the specs in `openspec/specs/` and the research notes the bug touches:

- **Drift**: the specs already describe the right behaviour and the code departs from it. The fix
  brings the code back. It may add one scenario that pins the regression, and changes no other
  spec text.
- **Gap**: the specs are silent or ambiguous where the bug hits, and the right behaviour follows
  from what they already say. The fix clarifies or adds the scenario.
- **Conflict**: the specs require the buggy behaviour, or contradict each other. A scenario that
  mandates today's result is a conflict, however wrong that result looks.

An issue's drawn expected result is a claim to check against the specs, not a decision. Spec
changes are for what the bug revealed, not for completeness.

## 4. Plan

- A throwaway prototype may inform the plan. It stays out of the branch (`.scratch/`, which git
  ignores); no part of the fix is committed before the plan review.
- Assess the fix the issue suggests, if any, against the reproduction, and propose a better one when
  there is one.
- For drift, the plan is the PR description: the case, the scenario the code violates, the intended
  fix and its test. For a gap or a conflict, it is an OpenSpec change (`openspec-propose`) scoped
  to the scenarios in question.
- Commit the case file with `known-failing: #<n>` and the plan, push, and open the draft PR. Then
  subscribe to it (`steward`).

## 5. Review the plan, then gate

- Review with `independent-review` in proposal mode, round after round until one converges.
- Stop when:
  - the fix is a conflict, unless the maintainer has decided the new behaviour in writing on the
    issue;
  - the plan leaves an open question, or settles behaviour that neither the maintainer nor the specs
    settle;
  - the skill's step-back from round 3 applies.

  To stop, post the question on the PR, drawn (`presenting-examples`), and end the run.

## 6. Implement

- Work through `tasks.md` when there is an OpenSpec change. Commit and push a checkpoint as each
  piece closes; the push runs the full e2e sweep.
- The fix removes the case's `known-failing` marker.
- Fix CI failures on the current head as they come (`steward`).

## 7. Review the implementation, then gate

Review with `independent-review` in implementation mode at each checkpoint pushed for review, round
after round until one converges. Step 5's stops apply here too, read against the implementation.

## 8. Hand over

When only the manual pass and landing remain:

- put the manual-test steps in the PR (`presenting-examples`);
- mark the PR ready for review;
- end the run.

The manual pass, its fixes and their reviews happen in a new session the maintainer starts from the
PR. Landing follows the `land` skill once the maintainer enables auto-merge; the run neither bumps
the version nor lands.

## Waiting

End the turn while CI or a background reviewer runs and nothing else is left to do: the PR event or
the reviewer's notification wakes the session. Never wait with `sleep` or a polling loop.

Any other turn that ends without a tool call stops the run. Don't end a turn on a summary that
announces the next step, an offer to continue, or decisions that do not block the rest of the work.

## Ending

A run ends only at step 2's no-repro stop, a gate in step 5 or 7, step 8, or a blocker this
session cannot clear. Every ending, an early one included:

1. **Hand-off.** When a PR exists, write or replace its `## State` section (`spin-off`).
2. **Retrospective.** Post it as a comment on #<tracking>, opening with
   `<!-- agent: bugfix -->` and the PR or issue link. It is about this routine, not the bug:
   - Where did the run stall, stop or loop, and which instruction, or missing one, caused it?
   - Which review findings were real, which were nits, and did the rounds converge when they
     should have?
   - Was the fix type right, and did anything here push against the right call?

   Each point names a moment in this run, and a suggestion is a change to this file's wording.
   "No suggestions" is a valid answer.
3. **Unsubscribe** from the PR (`steward`, "Ending").
4. **The final message** leads with the PR or issue link and what the run needs from the
   maintainer, then links the retrospective comment.
