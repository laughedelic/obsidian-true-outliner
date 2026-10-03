## 1. The record on GitHub

- [x] 1.1 Run a proposal review of this change by a fresh agent, briefed by hand from the design's
      template (the skill does not exist yet), and have it post its findings as a `COMMENT` review
      on this PR with inline comments. Reply to each thread with its disposition and resolve it
      with `resolve_review_thread`. Verified by the review and its resolved threads on the PR, and
      by recording in `docs/research/independent-reviews.md` whether each step worked from a
      cloud session: creating a pending review, adding inline comments, submitting, replying,
      resolving. If resolving is refused, the design's record falls back to a reply per thread,
      and the PR says so before any skill text is written.

## 2. The worktree side effects

- [x] 2.1 Add `/.claude/worktrees/` and `/.scratch/` to `.gitignore`, with a comment saying what
      each holds, and remove the `/.claude/worktrees/` line a session added to
      `.git/info/exclude`. Verified by `git worktree add --detach .claude/worktrees/probe` at the
      branch head and a file in its `.scratch/`, after which `git check-ignore -v
      .claude/worktrees/probe` and, inside the probe, `git check-ignore -v .scratch/x` each name a
      line of `.gitignore`, and the primary checkout's `git status --porcelain` prints nothing.
      Negative control: without the first entry `git check-ignore` exits 1 and `git status` prints
      `?? .claude/worktrees/`. The check names its source, so a local exclude file cannot pass
      it.
- [x] 2.2 In `vitest.config.ts`, set `exclude` to `configDefaults.exclude` plus
      `.claude/worktrees/**`, with a comment saying why. Verified with the probe worktree above,
      at the branch head so it carries the exclude itself: `npx vitest list --filesOnly` in the
      primary checkout names no file under `.claude/worktrees/`; in the probe,
      `npx vitest run .scratch/<probe>.test.ts` runs the probe and `npx vitest list --filesOnly
      tests/` lists the 64 test files and not the probe. Negative control: without the entry the
      primary checkout lists the probe worktree's 64 test files and the probe.

## 3. The skill

- [x] 3.1 Write `.agents/skills/independent-review/SKILL.md`: the `name`, a `description` whose
      branches are the author's moments (a proposal ready, an implementation ready, a user asking
      for a review or a second opinion); when a review runs; the brief as a template with its
      fixed fields; the reviewer's section (workspace, scratch, the findings form, posting the
      review, removing the worktrees); the author's verification, dispositions and record; the
      rounds, counted across both modes, the convergence rule and the question about the rule
      before every round from the third. Verified by the
      skill appearing in a new session's skill list, and by a reading against the design: each
      decision in design.md maps to a passage, and no passage restates what a command's
      `--help` or another skill already carries.
- [x] 3.2 Write `proposal.md` and `implementation.md` beside it, each a list of checks that
      ends on what the reviewer reports, from the design's "What the modes check". The sweep
      recipe in `implementation.md` is the one measured in `docs/research/independent-reviews.md`. Verified by
      running the recipe as written, from a fresh worktree pair, on #264's merge commit against
      its parent, through an entry point that reaches #264's change (an operation that calls
      `finalize`), and getting a nonzero count of differences that the run sorts into intended,
      regression and neutral, with one example of each kind it finds. Negative control: the same
      sweep through `parse` alone gives 0, as the note records, and the recipe's own check (a
      deliberate change on one side) turns that 0 into a failure to report rather than a
      result.
- [x] 3.3 Add `.claude/skills/independent-review` as a symlink to
      `../../.agents/skills/independent-review`. Verified by `ls -L` reading `SKILL.md` through it.
- [x] 3.4 Fold proposal round 2 into the skill (design as revised for it): the brief's fields
      (no diagnosis, even as a claim; the reproduction as a case file's `before` and keys; the
      skill's files by their path in the author's checkout; "Do not modify" as tracked files and
      branches; where the findings go); "When" with ready points defined and return-only checks of
      any commit, pushed or not; deep at the first review of a ready point, light for return-only
      checks and for a round limited to the last response's diff, and the effort recorded beside
      the model; the `agent:` marker on every comment a session posts; the five dispositions, with
      a defect outside the change filed; the record written with `update_pull_request`, a
      return-only check's line included; and "Rounds" as the design now states it, once the
      maintainer has chosen at the step-back. Verified by a reading against the design, each
      decision mapped to a passage, and by `grep -c "agent:" .agents/skills/independent-review/SKILL.md`
      finding the marker in the posting and the answering steps.
- [x] 3.5 Add `.github/skills/code-review/SKILL.md`, pointing Copilot's code review at
      `proposal.md` or `implementation.md` by what the PR changes and at the order and the form
      of a finding, and telling it to start no agent, create no worktree and post no second
      review; remove the `.github/skills/independent-review` link. Verified by each of its three
      links resolving from the file's directory. Whether Copilot reads it is unmeasured while
      Copilot does not review this repository.
- [x] 3.6 Add the role markers to `.agents/skills/steward/SKILL.md`: a woken session reads a
      comment opening `<!-- agent: reviewer` as a review to answer when it is the author, one
      opening `<!-- agent: author -->` that it posted as an echo, and an unmarked one as the
      maintainer's. Verified by `grep -n "agent:" .agents/skills/steward/SKILL.md`.

## 4. The pointer

- [x] 4.1 In `AGENTS.md`, step 4 of "Change lifecycle" names the skill and says the reviews are
      done when a round converges, before manual testing; "Agent files" names the Copilot
      pointer. Verified by `grep independent-review AGENTS.md` and by `CLAUDE.md` showing it
      through the symlink.

## 5. A real review

- [x] 5.2 Run the skill's proposal mode on the plan of `independent-review` as it stood before any of the
      skill was written (`658fc92`, the last commit before group 2, the maintainer's suggestion),
      as proposal round 2, deep (Opus, posted) and light (Sonnet, returned only) from one brief.
      Verified by the brief holding only the template's fields, and by the comparison recorded in
      `docs/research/independent-reviews.md`, "Deep and light on one brief": findings, shared
      themes, findings only one setting reached, findings shown wrong, time and tokens. What the
      round found about the skill itself is task 3.4.
- [x] 5.1 Run the skill as written on #280 (the maintainer's choice) as an implementation round,
      deep (posted) and light (returned only) from one brief, after a note on #280, carrying the
      author marker, saying the review is coming and from where. Fixed before running: light holds
      for implementation mode if the Sonnet run reaches every CONFIRMED `p0`–`p2` finding of the
      Opus run that the author confirms. Verified by the brief holding only the template's fields,
      by the author's verification of every finding of both runs (confirmed, wrong, unmeasured), and
      by the result recorded in `docs/research/independent-reviews.md`; if light does not hold, the
      skill's light scenario narrows before this task closes.
- [x] 5.3 After task 3.4, run the round the convergence rule asks for: light, limited to the diff
      of the response to round 2. Verified by its findings being answered on the PR like any
      other round's, and by the round's time and tokens in the note, the first measure of what a
      limited light round costs.

## 6. Check the change as a whole

- [x] 6.1 `npm run lint` (which checks the research index), `npm test` and
      `openspec validate independent-review --strict` pass.
